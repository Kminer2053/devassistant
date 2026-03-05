/**
 * PTY-based status and activity payloads.
 * Returns same shape as HTTP getStatusPayload / getActivityPayload for plugin compatibility.
 */

import { db } from "../db.js";
import { getParsedState, getBuffer, hasPty } from "./opencodePty.js";
import { healthCheck } from "../opencode.js";

const PTY_SESSION_PREFIX = "pty:";

/** Ensure one pending approval row for PTY when awaitingApproval, so GET /approvals and POST work. */
function ensurePtyApprovalRow(channelKey: string): void {
  const run = db
    .prepare(
      "SELECT id FROM runs WHERE channel_key = ? AND status = 'awaiting_approval' ORDER BY id DESC LIMIT 1"
    )
    .get(channelKey) as { id: number } | undefined;
  if (run) {
    const existing = db.prepare("SELECT id FROM approvals WHERE run_id = ? AND status = 'pending' LIMIT 1").get(run.id);
    if (existing) return;
  }
  const runningRun = db
    .prepare("SELECT id FROM runs WHERE channel_key = ? AND status = 'running' ORDER BY id DESC LIMIT 1")
    .get(channelKey) as { id: number } | undefined;
  const runId = run?.id ?? runningRun?.id;
  if (runId) {
    db.prepare("UPDATE runs SET status = 'awaiting_approval' WHERE id = ?").run(runId);
    const sessionId = PTY_SESSION_PREFIX + channelKey;
    db.prepare(
      "INSERT INTO approvals (run_id, opencode_session_id, opencode_permission_id, kind, status) VALUES (?, ?, 'pty', 'approval', 'pending')"
    ).run(runId, sessionId);
  }
}

export async function getStatusPayloadViaPty(channelKey: string) {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | (Record<string, unknown> & { opencode_session_id?: string })
    | undefined;

  let opencodeHealth: { healthy: boolean; version?: string } | null = null;
  try {
    opencodeHealth = await healthCheck();
  } catch {
    /* ignore */
  }

  const parsed = hasPty(channelKey) ? getParsedState(channelKey) : null;
  if (parsed?.awaitingApproval) ensurePtyApprovalRow(channelKey);

  const pendingApprovals = (() => {
    const run = db
      .prepare(
        "SELECT id FROM runs WHERE channel_key = ? AND status = 'awaiting_approval' ORDER BY id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;
    if (!run) return [];
    return db.prepare("SELECT * FROM approvals WHERE run_id = ? AND status = 'pending' ORDER BY id").all(run.id) as Array<Record<string, unknown>>;
  })();

  const recentRuns = db
    .prepare("SELECT * FROM runs WHERE channel_key = ? ORDER BY id DESC LIMIT 10")
    .all(channelKey) as Array<Record<string, unknown>>;

  const sessionId = ctx?.opencode_session_id ?? (hasPty(channelKey) ? PTY_SESSION_PREFIX + channelKey : undefined);

  return {
    channelKey,
    context: ctx ?? (sessionId ? { channel_key: channelKey, opencode_session_id: sessionId } : null),
    recentRuns,
    pendingApprovals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
    opencodeHealth: opencodeHealth ?? undefined,
    opencodeAgents: undefined,
    opencodeSession: sessionId ? { id: sessionId, title: "PTY", updatedAt: undefined } : undefined,
    opencodeSessionMessages: undefined,
    opencodeSessionTodo: undefined,
    opencodeSessionRunning: parsed?.running ?? undefined,
  };
}

export async function getActivityPayloadViaPty(channelKey: string) {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string }
    | undefined;
  const sessionId = ctx?.opencode_session_id ?? (hasPty(channelKey) ? PTY_SESSION_PREFIX + channelKey : null);

  if (!sessionId) {
    return {
      channelKey,
      sessionId: null,
      message: "이 채널에는 아직 OpenCode 세션이 없습니다. /plan 또는 /build를 먼저 실행해 주세요.",
      messages: [] as unknown[],
      todo: [] as unknown[],
      running: false,
      recentEvents: [] as unknown[],
      tuiRequest: null as { path?: string; body?: unknown } | null,
    };
  }

  const parsed = getParsedState(channelKey);
  const buffer = getBuffer(channelKey, 60);
  const recentEvents = buffer.slice(-30).map((line, i) => ({
    type: "pty-line",
    sessionID: sessionId,
    timestamp: Date.now() - (30 - i) * 1000,
    summary: line.slice(0, 200),
  }));

  const messages = buffer.slice(-20).map((text) => ({
    info: { role: "assistant" as const },
    parts: [{ type: "text" as const, text }],
  }));

  return {
    channelKey,
    sessionId,
    session: { id: sessionId, title: "PTY", updatedAt: undefined },
    running: parsed?.running ?? false,
    messages,
    todo: [],
    recentEvents,
    tuiRequest: parsed?.awaitingApproval
      ? ({ path: "/tui/approval", body: { message: parsed.rawTail.slice(-500) } } as { path?: string; body?: unknown })
      : null,
  };
}
