import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import {
  createSession,
  abortSession,
  getSession,
  getSessionMessages,
  getSessionTodo,
  getSessionStatus,
  getEventStreamOptions,
  getTuiControlNext,
  submitTuiControlResponse,
} from "../opencode.js";
import { isPtyBackend } from "../pty/backend.js";
import { getActivityPayloadViaPty } from "../pty/statusActivityPty.js";
import { destroyPty, getBuffer, getSessionStatus as getPtySessionStatus, writeToPty, getChannelKeysWithPty } from "../pty/opencodePty.js";
import { bufferToPngBase64 } from "../pty/screenToImage.js";
import { opencodeChannelBody, statusQuery, sessionEventsQuery } from "../schemas/index.js";
import { getRecentEvents } from "../eventBuffer.js";

export async function getActivityPayload(channelKey: string) {
  if (isPtyBackend()) return getActivityPayloadViaPty(channelKey);
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string }
    | undefined;
  if (!ctx?.opencode_session_id) {
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
  const sessionId = ctx.opencode_session_id;
  try {
    const [session, messages, todo, statusMap, tuiRequest] = await Promise.all([
      getSession(sessionId),
      // 진행 요약을 풍부하게 하기 위해 최근 메시지 개수를 충분히 확보
      getSessionMessages(sessionId, 60),
      getSessionTodo(sessionId),
      getSessionStatus(),
      getTuiControlNext(),
    ]);
    const running = statusMap[sessionId]?.running ?? false;
    const recentEvents = getRecentEvents(sessionId, 30);
    return {
      channelKey,
      sessionId,
      session: session ?? undefined,
      running,
      messages,
      todo,
      recentEvents,
      tuiRequest,
    };
  } catch (e) {
    return {
      channelKey,
      sessionId,
      error: String(e),
      messages: [] as unknown[],
      todo: [] as unknown[],
      running: false,
      recentEvents: [] as unknown[],
      tuiRequest: null as { path?: string; body?: unknown } | null,
    };
  }
}

const PTY_SESSION_PREFIX = "pty:";

export async function doSessionReset(channelKey: string): Promise<{ ok: true; sessionId: string; message: string }> {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number }
    | undefined;
  if (isPtyBackend()) {
    destroyPty(channelKey);
    const sessionId = PTY_SESSION_PREFIX + channelKey;
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(channelKey, ctx?.selected_project_id ?? null, sessionId);
    return { ok: true, sessionId, message: "PTY 세션을 초기화했습니다. 다음 /plan 또는 /build 시 새 PTY가 연결됩니다." };
  }
  const s = await createSession(`build-${channelKey}`);
  db.prepare(
    "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(channelKey, ctx?.selected_project_id ?? null, s.id);
  return { ok: true, sessionId: s.id, message: "New OpenCode session created for this channel." };
}

export async function doSessionAbort(
  channelKey: string
): Promise<{ ok: true; message: string } | { error: string } | { notFound: true }> {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string }
    | undefined;
  if (!ctx?.opencode_session_id) {
    return { notFound: true };
  }
  if (isPtyBackend() && ctx.opencode_session_id.startsWith(PTY_SESSION_PREFIX)) {
    destroyPty(channelKey);
    return { ok: true, message: "PTY 세션을 중단했습니다." };
  }
  const ok = await abortSession(ctx.opencode_session_id);
  if (!ok) return { error: "OpenCode abort failed." };
  return { ok: true, message: "Session abort requested." };
}

export type PendingUserInputPayload =
  | { hasPending: false; sessionId: string | null; running?: boolean }
  | {
      hasPending: true;
      sessionId: string;
      lastAssistantMessage: { id: string | undefined; text: string };
    };

export async function getPendingUserInputPayload(channelKey: string): Promise<PendingUserInputPayload> {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string }
    | undefined;
  if (!ctx?.opencode_session_id) {
    return { hasPending: false, sessionId: null };
  }
  const sessionId = ctx.opencode_session_id;
  try {
    const [statusMap, messages] = await Promise.all([
      getSessionStatus(),
      getSessionMessages(sessionId, 15),
    ]);
    const running = statusMap[sessionId]?.running ?? false;
    if (running) {
      return { hasPending: false, sessionId, running: true };
    }
    if (!messages.length) {
      return { hasPending: false, sessionId };
    }
    const lastMessage = messages[messages.length - 1] as {
      info?: { id?: string; role?: string };
      parts?: Array<{ text?: string }>;
    };
    const role = (lastMessage.info?.role ?? "").toLowerCase();
    if (role !== "assistant") {
      return { hasPending: false, sessionId };
    }
    const text = (lastMessage.parts ?? [])
      .map((p) => p.text ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      hasPending: true,
      sessionId,
      lastAssistantMessage: {
        id: lastMessage.info?.id,
        text: text || "(empty)",
      },
    };
  } catch {
    return { hasPending: false, sessionId };
  }
}

export async function opencodeRoutes(app: FastifyInstance) {
  /** 이 채널의 OpenCode 세션 최근 이벤트 (TUI 수준). sessionID별 버퍼에서 조회 */
  app.get<{ Querystring: unknown }>("/v1/opencode/session-events", async (req, reply) => {
    const parsed = sessionEventsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(parsed.data.channelKey) as
      | { opencode_session_id?: string }
      | undefined;
    if (!ctx?.opencode_session_id) {
      return reply.send({
        channelKey: parsed.data.channelKey,
        sessionId: null,
        message: "No OpenCode session for this channel. Run /plan or /build first.",
        events: [],
      });
    }
    const limit = typeof parsed.data.limit === "number" ? parsed.data.limit : 50;
    let events: Array<{ type: string; sessionID: string; timestamp: number; summary: string }>;
    const sessionId = ctx.opencode_session_id;
    if (isPtyBackend() && sessionId.startsWith(PTY_SESSION_PREFIX)) {
      const channelKey = sessionId.slice(PTY_SESSION_PREFIX.length);
      const lines = getBuffer(channelKey, limit);
      events = lines.map((line, i) => ({
        type: "pty-line",
        sessionID: sessionId,
        timestamp: Date.now() - (lines.length - 1 - i) * 1000,
        summary: line.slice(0, 200),
      }));
    } else {
      events = getRecentEvents(sessionId, limit);
    }
    return reply.send({ channelKey: parsed.data.channelKey, sessionId, events });
  });

  /** PTY 전용: 엔터 한 번 전송. 입력창에 이미 텍스트가 있을 때 제출용 */
  app.post<{ Body: unknown }>("/v1/opencode/pty-send-enter", async (req, reply) => {
    if (!isPtyBackend()) {
      return reply.status(400).send({ error: "pty-send-enter is only available with PTY backend" });
    }
    const parsed = opencodeChannelBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    writeToPty(parsed.data.channelKey, "\r", { appendEnter: false });
    return reply.send({ ok: true, sent: "enter" });
  });

  /** PTY 전용: 현재 TUI 상태(inferredTab, lastSentMode 등). 김빌드가 상황 파악 후 적절한 키입력 결정에 사용 */
  app.get<{ Querystring: unknown }>("/v1/opencode/session-status", async (req, reply) => {
    if (!isPtyBackend()) {
      return reply.status(400).send({ error: "session-status is only available with PTY backend" });
    }
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const status = getPtySessionStatus(parsed.data.channelKey);
    return reply.send(status);
  });

  /** PTY 전용: PTY가 붙어 있는 채널 키 목록. channel_key 미전달 시 폴백용 */
  app.get<{ Querystring: unknown }>("/v1/opencode/pty-channels", async (req, reply) => {
    if (!isPtyBackend()) {
      return reply.status(400).send({ error: "pty-channels is only available with PTY backend" });
    }
    const channelKeys = getChannelKeysWithPty();
    return reply.send({ channelKeys });
  });

  /** PTY 전용: TUI 화면(버퍼) 최근 N줄 반환. format=image면 PNG base64로 이미지 스크린샷 반환 */
  app.get<{ Querystring: unknown }>("/v1/opencode/pty-screen", async (req, reply) => {
    if (!isPtyBackend()) {
      return reply.status(400).send({ error: "pty-screen is only available with PTY backend" });
    }
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const channelKey = parsed.data.channelKey;
    const q = req.query as { lines?: string; format?: string };
    const linesParam = typeof q.lines === "string" ? q.lines : undefined;
    const maxLines = Math.min(100, Math.max(10, parseInt(linesParam ?? "40", 10) || 40));
    const lines = getBuffer(channelKey, maxLines);
    const sessionId = "pty:" + channelKey;

    if (q.format === "image") {
      const imageBase64 = await bufferToPngBase64(lines.length ? lines : ["(버퍼 비어 있음)"]);
      if (!imageBase64) {
        return reply.status(500).send({ error: "Image generation failed (sharp unavailable?)" });
      }
      return reply.send({ channelKey, sessionId, imageBase64, mimeType: "image/png" });
    }

    return reply.send({ channelKey, sessionId, lines });
  });

  /** 이 채널의 OpenCode 세션 진행 상황(최근 메시지·TODO·최근 이벤트). 서버에 붙어서 볼 때 폴링용 */
  app.get<{ Querystring: unknown }>("/v1/opencode/session-activity", async (req, reply) => {
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const payload = await getActivityPayload(parsed.data.channelKey);
    return reply.send(payload);
  });

  /** 이 채널의 OpenCode가 사용자 입력을 기다리는지·마지막 assistant 메시지 조회. 김빌드가 사용자에게 선택지 전달용 */
  app.get<{ Querystring: unknown }>("/v1/opencode/pending-user-input", async (req, reply) => {
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const payload = await getPendingUserInputPayload(parsed.data.channelKey);
    return reply.send(payload);
  });

  /** OpenCode 서버 실시간 이벤트 스트림(SSE) 프록시. 서버에 붙어서 진행 상황 보기용 */
  app.get<{ Querystring: unknown }>("/v1/opencode/live", async (req, reply) => {
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const { url, headers } = getEventStreamOptions();
    const res = await fetch(url, { headers });
    if (!res.ok || !res.body) {
      return reply.status(502).send({
        error: "OpenCode event stream unavailable",
        status: res.status,
      });
    }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const reader = res.body.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        reply.raw.end();
        return;
      }
      if (value && !reply.raw.writableEnded) reply.raw.write(Buffer.from(value));
      return pump();
    };
    req.raw.on("close", () => {
      reader.cancel().catch(() => {});
    });
    pump().catch((err) => {
      if (!reply.raw.writableEnded) reply.raw.destroy(err);
    });
  });

  /** 이 채널의 OpenCode 세션을 새로 만든 뒤 채널에 연결. 기존 세션은 유지되나 이 채널은 새 세션 사용 */
  app.post<{ Body: unknown }>("/v1/opencode/session-reset", async (req, reply) => {
    const parsed = opencodeChannelBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const result = await doSessionReset(parsed.data.channelKey);
    return reply.send(result);
  });

  /** 현재 채널의 OpenCode 세션 실행 중단(abort). 세션 자체는 유지 */
  app.post<{ Body: unknown }>("/v1/opencode/session-abort", async (req, reply) => {
    const parsed = opencodeChannelBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const result = await doSessionAbort(parsed.data.channelKey);
    if ("notFound" in result) return reply.status(404).send({ error: "No OpenCode session for this channel." });
    if ("error" in result) return reply.status(502).send({ error: result.error });
    return reply.send(result);
  });

  /** TUI 드라이버: 다음 TUI 요청(승인·프롬프트 등) 가져오기. 김빌드가 "TUI를 직접 보고 제어"할 때 폴링. */
  app.get<{ Querystring: { directory?: string } }>("/v1/opencode/tui/next", async (req, reply) => {
    const directory = typeof req.query?.directory === "string" ? req.query.directory : undefined;
    const request = await getTuiControlNext(directory);
    return reply.send({ request });
  });

  /** TUI 드라이버: TUI 요청에 대한 응답 제출(승인/거절·프롬프트 텍스트 등). */
  app.post<{ Body: { response: unknown; directory?: string } }>("/v1/opencode/tui/response", async (req, reply) => {
    const body = req.body as { response?: unknown; directory?: string } | undefined;
    const response = body?.response;
    const directory = typeof body?.directory === "string" ? body.directory : undefined;
    const ok = await submitTuiControlResponse(response, directory);
    if (!ok) return reply.status(502).send({ error: "OpenCode TUI response failed." });
    return reply.send({ ok: true });
  });
}
