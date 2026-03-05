import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { errorToMessage } from "../errorMessage.js";
import { createSession, sendMessageAsync } from "../opencode.js";
import { formatBuildHandoff } from "../handoff.js";
import { buildBody } from "../schemas/index.js";
import { isPtyBackend } from "../pty/backend.js";
import { runBuildViaPty } from "../pty/planBuildPty.js";

const BUILD_SYSTEM =
  "You are the OpenCode team receiving a brief from the project manager (김빌드). Implement as requested. When edit or bash permissions are needed, STOP and request approval; do not proceed until approved.";

export type BuildParams = { channelKey: string; text?: string; agent?: string; model?: string };
export type BuildResult =
  | { ok: true; runId: number; sessionId: string; summary: string }
  | { error: string; details: string; sessionId?: string; runId?: number };

export async function runBuild(params: BuildParams): Promise<BuildResult> {
  if (isPtyBackend()) {
    return runBuildViaPty({ channelKey: params.channelKey, text: params.text });
  }
  const { channelKey, text, agent, model } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number; opencode_session_id?: string }
    | undefined;

  let sessionId = ctx?.opencode_session_id;

  if (!sessionId) {
    const s = await createSession(`build-${channelKey}`);
    sessionId = s.id;
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(channelKey, ctx?.selected_project_id ?? null, sessionId);
  }

  const run = db
    .prepare("INSERT INTO runs (channel_key, project_id, mode, prompt, status) VALUES (?, ?, ?, ?, ?)")
    .run(channelKey, ctx?.selected_project_id ?? null, "build", text ?? "", "running");

  try {
    const messageToOpenCode = formatBuildHandoff(text ?? "");
    await sendMessageAsync(sessionId, {
      parts: [{ type: "text", text: messageToOpenCode }],
      system: BUILD_SYSTEM,
      ...(agent != null && { agent }),
      ...(model != null && { model }),
    });

    db.prepare("UPDATE runs SET summary = ? WHERE id = ?").run(
      "Build 요청 접수. 진행 상황은 /devstatus 또는 /activity에서 확인해 주세요.",
      run.lastInsertRowid
    );

    return {
      ok: true,
      runId: run.lastInsertRowid as number,
      sessionId,
      summary: "Build 요청을 OpenCode에 전달했습니다. 진행 상황은 /activity에서 확인해 주세요.",
    };
  } catch (err) {
    const msg = errorToMessage(err);
    const summaryTruncated = (msg || "오류 원인을 기록하지 못했습니다.").slice(0, 500);
    db.prepare("UPDATE runs SET status = ?, summary = ? WHERE id = ?").run("failed", summaryTruncated, run.lastInsertRowid);
    return {
      error: "OpenCode에 지시 전달 실패",
      details: msg,
      sessionId,
      runId: run.lastInsertRowid as number,
    };
  }
}

export async function buildRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>("/v1/build", async (req, reply) => {
    const parsed = buildBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const result = await runBuild(parsed.data);
    if ("error" in result) {
      req.log.error({ err: result.details, sessionId: result.sessionId, runId: result.runId }, "build: OpenCode 지시 전달 실패");
      return reply.status(502).send(result);
    }
    return reply.send(result);
  });
}
