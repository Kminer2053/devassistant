import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { errorToMessage } from "../errorMessage.js";
import { createSession, sendMessage } from "../opencode.js";
import { formatFreeHandoff } from "../handoff.js";
import { isPtyBackend } from "../pty/backend.js";
import { writeToPty } from "../pty/opencodePty.js";
import { handoffBody } from "../schemas/index.js";

const PTY_SESSION_PREFIX = "pty:";

function oneLineForPty(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

const DEFAULT_HANDOFF_SYSTEM =
  "You are the OpenCode team. The message is from the project manager (김빌드). Respond in natural language; follow the request and report back concisely.";

export type HandoffParams = { channelKey: string; text: string; system?: string; agent?: string; model?: string };
export type HandoffResult =
  | { ok: true; sessionId: string; summary: string }
  | { error: string; details: string; sessionId?: string };

export async function runHandoff(params: HandoffParams): Promise<HandoffResult> {
  const { channelKey, text, system, agent, model } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number; opencode_session_id?: string }
    | undefined;

  if (isPtyBackend()) {
    const sessionId = PTY_SESSION_PREFIX + channelKey;
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(channelKey, ctx?.selected_project_id ?? null, sessionId);
    try {
      const messageToOpenCode = formatFreeHandoff(text);
      writeToPty(channelKey, "/handoff " + oneLineForPty(messageToOpenCode));
      return { ok: true, sessionId, summary: "전달됨(PTY). 진행은 /activity에서 확인하세요." };
    } catch (err) {
      const msg = errorToMessage(err);
      return { error: "OpenCode(PTY)에 지시 전달 실패", details: msg, sessionId };
    }
  }

  let sessionId = ctx?.opencode_session_id;
  if (!sessionId) {
    const s = await createSession(`handoff-${channelKey}`);
    sessionId = s.id;
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(channelKey, ctx?.selected_project_id ?? null, sessionId);
  }

  try {
    const messageToOpenCode = formatFreeHandoff(text);
    const result = await sendMessage(sessionId, {
      parts: [{ type: "text", text: messageToOpenCode }],
      system: system ?? DEFAULT_HANDOFF_SYSTEM,
      ...(agent != null && { agent }),
      ...(model != null && { model }),
    });

    const textParts = (result.parts as Array<{ type?: string; text?: string }>)
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n");

    return {
      ok: true,
      sessionId,
      summary: textParts || "(OpenCode responded with no text.)",
    };
  } catch (err) {
    const msg = errorToMessage(err);
    return { error: "OpenCode에 지시 전달 실패", details: msg, sessionId };
  }
}

export async function handoffRoutes(app: FastifyInstance) {
  /** 김빌드 → OpenCode 자유 형식 자연어 전달. plan/build와 별개로 말을 건넬 때 사용 */
  app.post<{ Body: unknown }>("/v1/handoff", async (req, reply) => {
    const parsed = handoffBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey and text required", details: parsed.error.flatten() });
    }
    const result = await runHandoff(parsed.data);
    if ("error" in result) return reply.status(502).send(result);
    return reply.send(result);
  });
}
