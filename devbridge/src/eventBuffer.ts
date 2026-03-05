import { db } from "./db.js";
import { getEventStreamOptions } from "./opencode.js";

const MAX_EVENTS_PER_SESSION = 100;
const RECONNECT_DELAY_MS = 5000;

export type BufferedEvent = {
  type: string;
  sessionID: string;
  timestamp: number;
  summary: string;
};

const buffer = new Map<string, BufferedEvent[]>();

function getSessionIdFromEvent(ev: unknown): string | undefined {
  if (ev != null && typeof ev === "object" && "properties" in ev) {
    const props = (ev as { properties?: { sessionID?: string } }).properties;
    if (props && typeof props.sessionID === "string" && props.sessionID.trim()) {
      return props.sessionID.trim();
    }
  }
  return undefined;
}

function eventToSummary(ev: unknown): string {
  if (ev == null || typeof ev !== "object") return "unknown";
  const type = (ev as { type?: string }).type;
  const props = (ev as { properties?: Record<string, unknown> }).properties;
  const p = props ?? {};

  switch (type) {
    case "session.error": {
      const err = p.error as { message?: string } | undefined;
      const msg = err?.message ?? (err ? JSON.stringify(err) : "unknown");
      return `session.error: ${String(msg).slice(0, 200)}`;
    }
    case "session.status": {
      const status = p.status as { type?: string } | undefined;
      return `session.status: ${String(status?.type ?? "?")}`;
    }
    case "session.idle":
      return "session.idle";
    case "todo.updated": {
      const todos = p.todos as unknown[] | undefined;
      const n = Array.isArray(todos) ? todos.length : 0;
      return `todo.updated (${n} items)`;
    }
    case "message.part.delta": {
      const field = p.field as string | undefined;
      return `message.part.delta (${String(field ?? "text")})`;
    }
    case "message.updated":
      return "message.updated";
    case "permission.asked": {
      const perm = (p.permission as string | undefined) ?? "?";
      const pats = p.patterns as string[] | undefined;
      const pathStr = Array.isArray(pats) && pats.length > 0 ? pats[0] : "";
      const display = pathStr ? `${perm} ${pathStr}` : perm;
      return `Permission required: ${display}`;
    }
    case "command.executed":
      return "command.executed";
    default:
      return type ?? "unknown";
  }
}

function getChannelKeyForSession(sessionID: string): string | undefined {
  const ctx = db.prepare("SELECT channel_key FROM channel_context WHERE opencode_session_id = ?").get(sessionID) as
    | { channel_key: string }
    | undefined;
  return ctx?.channel_key;
}

/** session.idle 또는 session.status(status.type=idle) 수신 시: 해당 채널의 running run을 completed로 갱신 */
function handleSessionIdle(ev: unknown): void {
  if (ev == null || typeof ev !== "object" || !("properties" in ev)) return;
  const p = (ev as { properties?: Record<string, unknown> }).properties;
  if (!p || typeof p !== "object") return;
  const sessionID = typeof p.sessionID === "string" ? p.sessionID.trim() : "";
  if (!sessionID) return;
  if ("status" in p && p.status != null && typeof p.status === "object") {
    const st = p.status as { type?: string };
    if (st.type !== "idle") return;
  }
  try {
    const channelKey = getChannelKeyForSession(sessionID);
    if (!channelKey) return;
    const run = db
      .prepare(
        "SELECT id FROM runs WHERE channel_key = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;
    if (!run) return;
    db.prepare("UPDATE runs SET status = 'completed', summary = COALESCE(summary, 'OpenCode 세션 idle로 완료') WHERE id = ?").run(run.id);
  } catch (e) {
    console.error("[eventBuffer] session.idle handler error:", e);
  }
}

/** session.error 수신 시: 해당 채널의 running run을 failed로 갱신하고 summary에 에러 메시지 저장 */
function handleSessionError(ev: unknown): void {
  if (ev == null || typeof ev !== "object" || !("properties" in ev)) return;
  const p = (ev as { properties?: Record<string, unknown> }).properties;
  if (!p || typeof p !== "object") return;
  const sessionID = typeof p.sessionID === "string" ? p.sessionID.trim() : "";
  if (!sessionID) return;
  let errMsg = "OpenCode session error";
  if (p.error != null) {
    if (typeof p.error === "string") errMsg = p.error.slice(0, 500);
    else if (typeof (p.error as { message?: string }).message === "string") errMsg = (p.error as { message: string }).message.slice(0, 500);
    else errMsg = String(JSON.stringify(p.error)).slice(0, 500);
  }
  try {
    const channelKey = getChannelKeyForSession(sessionID);
    if (!channelKey) return;
    const run = db
      .prepare(
        "SELECT id FROM runs WHERE channel_key = ? AND status IN ('running', 'awaiting_approval') ORDER BY id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;
    if (!run) return;
    db.prepare("UPDATE runs SET status = 'failed', summary = ? WHERE id = ?").run(errMsg, run.id);
  } catch (e) {
    console.error("[eventBuffer] session.error handler error:", e);
  }
}

function handlePermissionAsked(ev: unknown): void {
  if (ev == null || typeof ev !== "object" || !("properties" in ev)) return;
  const p = (ev as { properties?: Record<string, unknown> }).properties;
  if (!p || typeof p !== "object") return;
  const sessionID = typeof p.sessionID === "string" ? p.sessionID.trim() : "";
  const permissionId = typeof p.id === "string" ? p.id.trim() : "";
  const kind = typeof p.permission === "string" ? String(p.permission) : "unknown";
  if (!sessionID || !permissionId) return;
  try {
    const channelKey = getChannelKeyForSession(sessionID);
    if (!channelKey) return;
    const run = db
      .prepare(
        "SELECT id FROM runs WHERE channel_key = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;
    if (!run) return;
    db.prepare(
      "INSERT INTO approvals (run_id, opencode_session_id, opencode_permission_id, kind, status) VALUES (?, ?, ?, ?, 'pending')"
    ).run(run.id, sessionID, permissionId, kind);
    db.prepare("UPDATE runs SET status = 'awaiting_approval' WHERE id = ?").run(run.id);
  } catch (e) {
    console.error("[eventBuffer] permission.asked handler error:", e);
  }
}

function appendEvent(sessionID: string, ev: unknown): void {
  const type = (ev != null && typeof ev === "object" && "type" in ev)
    ? String((ev as { type: unknown }).type)
    : "unknown";
  if (type === "permission.asked") handlePermissionAsked(ev);
  else if (type === "session.error") handleSessionError(ev);
  else if (type === "session.idle") handleSessionIdle(ev);
  else if (type === "session.status") {
    const p = (ev != null && typeof ev === "object" && "properties" in ev) ? (ev as { properties?: { status?: { type?: string } } }).properties : undefined;
    if (p?.status?.type === "idle") handleSessionIdle(ev);
  }
  const summary = eventToSummary(ev);
  const entry: BufferedEvent = {
    type,
    sessionID,
    timestamp: Date.now(),
    summary,
  };
  let list = buffer.get(sessionID);
  if (!list) {
    list = [];
    buffer.set(sessionID, list);
  }
  list.unshift(entry);
  if (list.length > MAX_EVENTS_PER_SESSION) list.length = MAX_EVENTS_PER_SESSION;
}

async function runSubscriber(): Promise<void> {
  const { url, headers } = getEventStreamOptions();
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) {
    console.error(`[eventBuffer] OpenCode event stream failed: ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      leftover += decoder.decode(value, { stream: true });
      const lines = leftover.split(/\r?\n/);
      leftover = lines.pop() ?? "";

      let dataAccum: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload === "[DONE]" || payload === "") continue;
          dataAccum.push(payload);
        } else if (line.trim() === "" && dataAccum.length > 0) {
          const raw = dataAccum.join("\n");
          dataAccum = [];
          try {
            const parsed = JSON.parse(raw) as unknown;
            const ev = typeof parsed === "object" && parsed != null && "payload" in parsed
              ? (parsed as { payload: unknown }).payload
              : parsed;
            const sessionID = getSessionIdFromEvent(ev);
            if (sessionID) appendEvent(sessionID, ev);
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  } catch (e) {
    console.error("[eventBuffer] SSE read error:", e);
  } finally {
    reader.releaseLock();
  }
}

async function subscribeLoop(): Promise<void> {
  while (true) {
    try {
      await runSubscriber();
    } catch (e) {
      console.error("[eventBuffer] Subscriber error:", e);
    }
    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
  }
}

/** 서버 기동 시 호출. OpenCode 이벤트 스트림 구독 시작. 재연결은 자동. */
export function startEventSubscriber(): void {
  subscribeLoop().catch((e) => console.error("[eventBuffer] Fatal:", e));
}

/** 세션의 최근 이벤트 반환 (최신순). limit 미지정 시 50. */
export function getRecentEvents(sessionId: string, limit = 50): BufferedEvent[] {
  const list = buffer.get(sessionId);
  if (!list) return [];
  return list.slice(0, limit);
}
