import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import {
  getAgents,
  getSession,
  healthCheck,
  getSessionMessages,
  getSessionTodo,
  getSessionStatus,
} from "../opencode.js";
import { isPtyBackend } from "../pty/backend.js";
import { getStatusPayloadViaPty } from "../pty/statusActivityPty.js";
import { statusQuery } from "../schemas/index.js";

/** OpenCode 에이전트 model(객체 또는 문자열) → 실제 설정된 모델 표기 (예: openai/gpt-5.3-codex) */
function agentModelString(m: unknown): string {
  if (m == null) return "기본";
  if (typeof m === "string") return m.trim() || "기본";
  if (typeof m === "object") {
    const o = m as Record<string, unknown>;
    // OpenCode API: model: { providerID, modelID } (또는 providerId, modelId)
    const providerID = o.providerID ?? o.providerId ?? o.provider;
    const modelID = o.modelID ?? o.modelId ?? o.name ?? o.model;
    if (typeof modelID === "string" && modelID.trim()) {
      if (typeof providerID === "string" && providerID.trim()) return `${providerID}/${modelID}`;
      return modelID;
    }
    if (typeof o.name === "string") return o.name;
    if (typeof o.model === "string") return o.model;
    const parts = [providerID, modelID].filter(Boolean).map(String);
    if (parts.length) return parts.join("/");
  }
  return "기본";
}

/** /v1/status 응답용으로 에이전트 목록 정규화 (model 문자열화, id/name 통일) */
function normalizeAgentsForStatus(
  agents: Array<{ id?: string; name?: string; model?: unknown; mode?: string; description?: string }>
): Array<{ id: string; model: string; mode?: string; description?: string }> {
  return agents.map((a) => ({
    id: (a.id && String(a.id).trim()) || (a.name && String(a.name).trim()) || "?",
    model: agentModelString(a.model),
    mode: a.mode,
    description: a.description,
  }));
}

export type StatusPayload = Awaited<ReturnType<typeof getStatusPayload>>;

export async function getStatusPayload(channelKey: string) {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | Record<string, unknown> & { opencode_session_id?: string }
    | undefined;

  const pendingApprovals = (() => {
    const run = db
      .prepare(
        "SELECT id FROM runs WHERE channel_key = ? AND status = 'awaiting_approval' ORDER BY id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;
    if (!run) return [];
    return db.prepare("SELECT * FROM approvals WHERE run_id = ? AND status = 'pending' ORDER BY id").all(run.id) as Array<Record<string, unknown>>;
  })();

  let opencodeHealth: { healthy: boolean; version?: string } | null = null;
  let opencodeAgents: Awaited<ReturnType<typeof getAgents>> | null = null;
  let opencodeSession: Awaited<ReturnType<typeof getSession>> = null;
  let opencodeSessionMessages: Awaited<ReturnType<typeof getSessionMessages>> | null = null;
  let opencodeSessionTodo: Awaited<ReturnType<typeof getSessionTodo>> | null = null;
  let opencodeSessionRunning: boolean | null = null;
  try {
    opencodeHealth = await healthCheck();
    opencodeAgents = await getAgents();
    if (ctx?.opencode_session_id) {
      const sid = String(ctx.opencode_session_id);
      opencodeSession = await getSession(sid);
      const [messages, todo, statusMap] = await Promise.all([
        getSessionMessages(sid, 5),
        getSessionTodo(sid),
        getSessionStatus(),
      ]);
      opencodeSessionMessages = messages;
      opencodeSessionTodo = todo;
      opencodeSessionRunning = statusMap[sid]?.running ?? null;
    }
  } catch {
    // OpenCode 미연결 시 무시
  }

  // 보정: OpenCode 세션이 idle인데 DevBridge runs에 running인 run이 있으면 completed로 갱신
  if (ctx?.opencode_session_id && opencodeSessionRunning === false) {
    try {
      const runningRun = db
        .prepare("SELECT id FROM runs WHERE channel_key = ? AND status = 'running' ORDER BY id DESC LIMIT 1")
        .get(channelKey) as { id: number } | undefined;
      if (runningRun) {
        db.prepare(
          "UPDATE runs SET status = 'completed', summary = COALESCE(summary, 'OpenCode 세션 idle로 완료(상태 보정)') WHERE id = ?"
        ).run(runningRun.id);
      }
    } catch {
      // 보정 실패 시 무시
    }
  }

  const recentRuns = db
    .prepare("SELECT * FROM runs WHERE channel_key = ? ORDER BY id DESC LIMIT 10")
    .all(channelKey) as Array<Record<string, unknown>>;

  return {
    channelKey,
    context: ctx ?? null,
    recentRuns,
    pendingApprovals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
    opencodeHealth: opencodeHealth ?? undefined,
    opencodeAgents:
      opencodeAgents && opencodeAgents.length > 0
        ? normalizeAgentsForStatus(opencodeAgents as Array<{ id?: string; name?: string; model?: unknown; mode?: string; description?: string }>)
        : undefined,
    opencodeSession: opencodeSession ?? undefined,
    opencodeSessionMessages: opencodeSessionMessages ?? undefined,
    opencodeSessionTodo: opencodeSessionTodo ?? undefined,
    opencodeSessionRunning: opencodeSessionRunning ?? undefined,
  };
}

export async function statusRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>("/v1/status", async (req, reply) => {
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const payload = isPtyBackend()
      ? await getStatusPayloadViaPty(parsed.data.channelKey)
      : await getStatusPayload(parsed.data.channelKey);
    return reply.send(payload);
  });
}
