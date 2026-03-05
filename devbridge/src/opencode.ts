import { createOpencodeClient } from "@opencode-ai/sdk";

const BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
const USERNAME = process.env.OPENCODE_USERNAME ?? "opencode";
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? "";

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`;
}

/** Custom fetch that adds Basic Auth to all requests. */
function createAuthenticatedFetch(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const auth = basicAuthHeader();
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", auth);
    return fetch(input, { ...init, headers });
  };
}

const client = createOpencodeClient({
  baseUrl: BASE_URL,
  fetch: createAuthenticatedFetch(),
  responseStyle: "data",
  throwOnError: true,
});

/** 상태/진행 조회용 OpenCode 호출 타임아웃(초). 이 시간 안에 응답 없으면 실패하여 부분 응답으로 전달 */
const OPENCODE_READ_TIMEOUT_MS = 8_000;

function withTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OpenCode read timeout")), ms)
    ),
  ]);
}

/** SDK가 responseStyle "data"여도 타입이 복합인 경우가 있어, 실제 데이터만 반환하는 헬퍼 */
function asData<T>(raw: unknown): T {
  if (raw != null && typeof raw === "object" && "data" in raw && (raw as { data?: unknown }).data !== undefined) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

/** Live 이벤트 스트림(SSE) 프록시용. GET /event 호출 옵션 */
export function getEventStreamOptions(): { url: string; headers: Record<string, string> } {
  return {
    url: `${BASE_URL}/event`,
    headers: {
      Accept: "text/event-stream",
      Authorization: basicAuthHeader(),
    },
  };
}

/** SDK에 global/health가 없어 동일 baseUrl + auth로 직접 호출. 상태 조회용 타임아웃 적용 */
export async function healthCheck(): Promise<{ healthy: boolean; version?: string }> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), OPENCODE_READ_TIMEOUT_MS);
  try {
    const res = await createAuthenticatedFetch()(`${BASE_URL}/global/health`, { signal: ac.signal });
    clearTimeout(id);
    if (!res.ok) return { healthy: false };
    const json = (await res.json()) as { healthy?: boolean; version?: string };
    return { healthy: json.healthy ?? false, version: json.version };
  } catch {
    clearTimeout(id);
    return { healthy: false };
  }
}

export async function createSession(title?: string): Promise<{ id: string }> {
  const session = await client.session.create({
    body: { title: title ?? "DevBridge session" },
  });
  const data = session as { id?: string };
  if (!data?.id) throw new Error("OpenCode session missing id");
  return { id: data.id };
}

export async function sendMessage(
  sessionId: string,
  params: {
    parts?: Array<{ type: string; text?: string }>;
    system?: string;
    noReply?: boolean;
    agent?: string;
    model?: string;
  }
): Promise<{ info: unknown; parts: unknown[] }> {
  const rawParts = (params.parts ?? []).map((p) =>
    p.type === "text" && p.text != null ? { type: "text" as const, text: p.text } : { type: "text" as const, text: "" }
  );
  // OpenCode API requires parts to be a non-empty array; ensure we never send undefined or []
  const parts: Array<{ type: "text"; text: string }> =
    rawParts.length > 0 ? rawParts : [{ type: "text", text: "" }];

  const body: { parts: Array<{ type: "text"; text: string }>; noReply: boolean; system?: string; agent?: string; model?: { providerID: string; modelID: string } } = {
    parts,
    noReply: params.noReply ?? false,
  };
  if (params.system != null) body.system = params.system;
  if (params.agent != null) body.agent = params.agent;
  if (params.model != null) {
    const s = params.model.trim();
    const [providerID, modelID] = s.includes("/") ? s.split("/") : ["openai", s];
    body.model = { providerID: (providerID ?? "openai").trim(), modelID: (modelID ?? s).trim() };
  }
  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    body.parts = [{ type: "text", text: (params.parts?.[0] as { text?: string } | undefined)?.text ?? "" }];
  }

  // SDK가 body.parts를 서버에 전달하지 않는 이슈가 있어, OpenCode 메시지 API를 직접 호출
  const url = `${BASE_URL}/session/${encodeURIComponent(sessionId)}/message`;
  const fetchFn = createAuthenticatedFetch();
  const OPENCODE_MESSAGE_TIMEOUT_MS = 300_000; // 5분 (AI 응답 대기)
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), OPENCODE_MESSAGE_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.text();
      let err: unknown = errBody;
      try {
        err = JSON.parse(errBody);
      } catch {
        /* keep as text */
      }
      throw err;
    }
    const out = (await res.json()) as { info?: unknown; parts?: unknown[] };
    return { info: out?.info, parts: Array.isArray(out?.parts) ? out.parts : [] };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("OpenCode 응답 시간 초과(5분). 서버 부하 또는 작업이 길 때 발생할 수 있습니다.", { cause: e });
    }
    if (e instanceof Error && e.message === "fetch failed") {
      throw new Error("OpenCode에 연결할 수 없습니다. opencode serve 상태와 네트워크를 확인하세요.", { cause: e.cause ?? e });
    }
    throw e;
  }
}

export type SendMessageAsyncResult = { ok: true; messageId?: string };

/** OpenCode에 메시지를 비동기로 등록만 하는 호출(응답은 나중에 /activity 등으로 조회) */
export async function sendMessageAsync(
  sessionId: string,
  params: {
    parts?: Array<{ type: string; text?: string }>;
    system?: string;
    noReply?: boolean;
    agent?: string;
    model?: string;
  }
): Promise<SendMessageAsyncResult> {
  const rawParts = (params.parts ?? []).map((p) =>
    p.type === "text" && p.text != null ? { type: "text" as const, text: p.text } : { type: "text" as const, text: "" }
  );
  const parts: Array<{ type: "text"; text: string }> =
    rawParts.length > 0 ? rawParts : [{ type: "text", text: "" }];

  const body: {
    parts: Array<{ type: "text"; text: string }>;
    noReply: boolean;
    system?: string;
    agent?: string;
    model?: { providerID: string; modelID: string };
  } = {
    parts,
    noReply: params.noReply ?? false,
  };
  if (params.system != null) body.system = params.system;
  if (params.agent != null) body.agent = params.agent;
  if (params.model != null) {
    const s = params.model.trim();
    const [providerID, modelID] = s.includes("/") ? s.split("/") : ["openai", s];
    body.model = { providerID: (providerID ?? "openai").trim(), modelID: (modelID ?? s).trim() };
  }
  // OpenCode API는 parts를 필수 배열로 검증함. 직렬화 직전에 한 번 더 보장.
  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    body.parts = [{ type: "text", text: (params.parts?.[0] as { text?: string } | undefined)?.text ?? "" }];
  }

  const url = `${BASE_URL}/session/${encodeURIComponent(sessionId)}/prompt_async`;
  const fetchFn = createAuthenticatedFetch();
  const OPENCODE_ASYNC_TIMEOUT_MS = 30_000;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), OPENCODE_ASYNC_TIMEOUT_MS);
  const bodyJson = JSON.stringify(body);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyJson,
      signal: ac.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errBody = await res.text();
      let err: unknown = errBody;
      try {
        err = JSON.parse(errBody);
      } catch {
        /* keep as text */
      }
      throw err;
    }
    let messageId: string | undefined;
    try {
      const out = (await res.json()) as { messageId?: unknown } | undefined;
      if (out && typeof out.messageId === "string" && out.messageId.trim()) {
        messageId = out.messageId.trim();
      }
    } catch {
      /* ignore body parse errors for async */
    }
    return { ok: true, messageId };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("OpenCode 비동기 요청이 시간 초과되었습니다(30초). 서버 상태를 확인해 주세요.", { cause: e });
    }
    if (e instanceof Error && e.message === "fetch failed") {
      throw new Error("OpenCode에 연결할 수 없습니다. opencode serve 상태와 네트워크를 확인하세요.", { cause: e.cause ?? e });
    }
    throw e;
  }
}

/** OpenCode 에이전트 목록(이름·모델 등). 김빌드가 "내부 요원 명부" 확인용 */
export async function getAgents(): Promise<{ id?: string; model?: string; mode?: string; description?: string }[]> {
  try {
    const raw = await withTimeout(OPENCODE_READ_TIMEOUT_MS, client.app.agents());
    const list = asData<unknown>(raw);
    return Array.isArray(list) ? (list as { id?: string; model?: string; mode?: string; description?: string }[]) : [];
  } catch {
    return [];
  }
}

/** OpenCode 세션 상세. 진행 상태·현재 에이전트 등 확인용 */
export async function getSession(
  sessionId: string
): Promise<{ id?: string; title?: string; updatedAt?: string; [k: string]: unknown } | null> {
  try {
    const session = await withTimeout(
      OPENCODE_READ_TIMEOUT_MS,
      client.session.get({ path: { id: sessionId } })
    );
    return session as { id?: string; title?: string; updatedAt?: string; [k: string]: unknown };
  } catch {
    return null;
  }
}

/** OpenCode 세션 목록. 김빌드 모니터링용 */
export async function listSessions(): Promise<{ id?: string; title?: string; updatedAt?: string }[]> {
  try {
    const list = await client.session.list();
    return Array.isArray(list) ? (list as { id?: string; title?: string; updatedAt?: string }[]) : [];
  } catch {
    return [];
  }
}

/** OpenCode 전 세션 상태. sessionID -> 상태 */
export async function getSessionStatus(): Promise<Record<string, { running?: boolean; [k: string]: unknown }>> {
  try {
    const raw = await withTimeout(OPENCODE_READ_TIMEOUT_MS, client.session.status());
    const status = asData<Record<string, { running?: boolean; [k: string]: unknown }>>(raw);
    return status ?? {};
  } catch {
    return {};
  }
}

/** 세션 메시지 목록(최근 N개). 김빌드 대화 흐름 확인용 */
export async function getSessionMessages(
  sessionId: string,
  limit = 10
): Promise<Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }>> {
  try {
    const list = await withTimeout(
      OPENCODE_READ_TIMEOUT_MS,
      client.session.messages({ path: { id: sessionId }, query: { limit } })
    );
    return Array.isArray(list) ? (list as Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }>) : [];
  } catch {
    return [];
  }
}

/** 세션 TODO 목록. 김빌드 진행 상황 확인용 */
export async function getSessionTodo(sessionId: string): Promise<Array<{ id?: string; content?: string; status?: string }>> {
  try {
    const list = await withTimeout(OPENCODE_READ_TIMEOUT_MS, client.session.todo({ path: { id: sessionId } }));
    return Array.isArray(list) ? (list as Array<{ id?: string; content?: string; status?: string }>) : [];
  } catch {
    return [];
  }
}

/** 세션 실행 중단. 김빌드 제어용 */
export async function abortSession(sessionId: string): Promise<boolean> {
  try {
    await client.session.abort({ path: { id: sessionId } });
    return true;
  } catch {
    return false;
  }
}

export async function getDiff(sessionId: string, messageId?: string): Promise<unknown[]> {
  const result = await client.session.diff({
    path: { id: sessionId },
    query: messageId ? { messageID: messageId } : undefined,
  });
  const arr = asData<unknown[]>(result);
  return Array.isArray(arr) ? arr : [];
}

export async function respondPermission(
  sessionId: string,
  permissionId: string,
  response: "approve" | "deny",
  remember?: boolean
): Promise<boolean> {
  const sdkResponse = response === "approve" ? (remember ? "always" : "once") : "reject";
  try {
    await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response: sdkResponse },
    });
    return true;
  } catch {
    return false;
  }
}

export async function runShell(sessionId: string, command: string): Promise<{ info: unknown; parts: unknown[] }> {
  const result = await client.session.shell({
    path: { id: sessionId },
    body: { agent: "default", command },
  });
  const out = asData<{ info?: unknown; parts?: unknown[] }>(result);
  return { info: out?.info, parts: Array.isArray(out?.parts) ? out.parts : [] };
}

/** OpenCode TUI 제어: 다음 TUI 요청(승인·프롬프트 등) 가져오기. 김빌드가 "TUI를 직접 보고 제어"할 때 사용. */
export async function getTuiControlNext(directory?: string): Promise<{ path?: string; body?: unknown } | null> {
  try {
    const tuiControl = (client as { tui?: { control?: { next: (opts?: { query?: { directory?: string } }) => Promise<unknown> } } }).tui?.control;
    if (!tuiControl?.next) return null;
    const raw = await withTimeout(
      OPENCODE_READ_TIMEOUT_MS,
      tuiControl.next(directory != null ? { query: { directory } } : undefined)
    );
    const data = asData<{ path?: string; body?: unknown }>(raw);
    if (data == null || (data.path === undefined && data.body === undefined)) return null;
    return data;
  } catch {
    return null;
  }
}

/** OpenCode TUI 제어: TUI 요청에 대한 응답 제출. 김빌드가 승인/거절·프롬프트 텍스트 등을 보낼 때 사용. */
export async function submitTuiControlResponse(body: unknown, directory?: string): Promise<boolean> {
  try {
    const tuiControl = (client as { tui?: { control?: { response: (opts?: { query?: { directory?: string }; body?: unknown }) => Promise<unknown> } } }).tui?.control;
    if (!tuiControl?.response) return false;
    await tuiControl.response({ ...(directory != null ? { query: { directory } } : {}), body });
    return true;
  } catch {
    return false;
  }
}
