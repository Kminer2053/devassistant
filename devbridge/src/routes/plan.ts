import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { errorToMessage } from "../errorMessage.js";
import { createSession, sendMessageAsync } from "../opencode.js";
import { formatPlanHandoff } from "../handoff.js";
import { planBody } from "../schemas/index.js";
import { isPtyBackend } from "../pty/backend.js";
import { runPlanViaPty } from "../pty/planBuildPty.js";

const PLAN_SYSTEM =
  "You are the OpenCode team receiving a brief from the project manager (김빌드). Respond in a natural, collaborative way. Plan-only: do NOT edit code or run shell. Describe steps, approach, and risks.";

export type PlanParams = { channelKey: string; projectId?: number; text: string; agent?: string; model?: string };
export type PlanResult = { ok: true; sessionId: string; summary: string; nextAction: string } | { error: string; details: string; sessionId?: string };

export async function runPlan(params: PlanParams): Promise<PlanResult> {
  if (isPtyBackend()) {
    return runPlanViaPty({ channelKey: params.channelKey, projectId: params.projectId, text: params.text });
  }
  const { channelKey, projectId, text, agent, model } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number; opencode_session_id?: string }
    | undefined;

  let sessionId = ctx?.opencode_session_id;
  const selProjectId = projectId ?? ctx?.selected_project_id;

  if (!sessionId) {
    const s = await createSession(`plan-${channelKey}`);
    sessionId = s.id;
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(channelKey, selProjectId ?? null, sessionId);
  }

  const run = db
    .prepare("INSERT INTO runs (channel_key, project_id, mode, prompt, status) VALUES (?, ?, ?, ?, ?)")
    .run(channelKey, selProjectId ?? null, "plan", text, "running");

  const messageToOpenCode = formatPlanHandoff(text);
  try {
    await sendMessageAsync(sessionId, {
      parts: [{ type: "text", text: messageToOpenCode }],
      system: PLAN_SYSTEM,
      ...(agent != null && { agent }),
      ...(model != null && { model }),
    });
    db.prepare("UPDATE runs SET summary = ? WHERE id = ?").run(
      "Plan 요청 전달됨. 권한 요청 시 /approvals에서 확인 후 /approve 또는 /deny 하세요. 진행은 /activity에서 확인해 주세요.",
      run.lastInsertRowid
    );
    return {
      ok: true,
      sessionId,
      summary: "Plan 요청을 OpenCode에 전달했습니다. 권한 요청이 있으면 /approvals 후 /approve 또는 /deny로 처리하세요. 진행은 /activity에서 확인해 주세요.",
      nextAction: "권한 요청 시 /approvals → /approve 또는 /deny. 잠시 후 /activity로 계획 진행을 확인해 주세요.",
    };
  } catch (err) {
    const msg = errorToMessage(err);
    const summaryTruncated = (msg || "오류 기록 실패").slice(0, 500);
    db.prepare("UPDATE runs SET status = ?, summary = ? WHERE id = ?").run("failed", summaryTruncated, run.lastInsertRowid);
    return { error: "OpenCode에 지시 전달 실패", details: msg, sessionId };
  }
}

export async function planRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>("/v1/plan", async (req, reply) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const result = await runPlan(parsed.data);
    if ("error" in result) return reply.status(502).send(result);
    return reply.send(result);
  });
}
