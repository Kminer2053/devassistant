/**
 * PTY-based OpenCode driver (Option B).
 * Per-channel PTY running `opencode attach`, output buffering, ANSI strip, simple parsing, write.
 */

import * as pty from "node-pty";
import stripAnsi from "strip-ansi";

const OPENCODE_ATTACH_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? "";
const OPENCODE_BIN = process.env.OPENCODE_BIN ?? "opencode";
const MAX_BUFFER_LINES = 500;
const MAX_LINE_LENGTH = 2000;

export type ParsedState = {
  running: boolean;
  awaitingApproval: boolean;
  error: string | null;
  lastLines: string[];
  rawTail: string;
  /** PTY 버퍼에서 추정한 현재 TUI 탭. plan/build 전송 시 Tab 전환 여부 결정에 사용 */
  inferredTab: "plan" | "build" | "unknown";
};

type ChannelPty = {
  pty: pty.IPty;
  process: pty.IPty;
  buffer: string[];
  lastParsed: ParsedState;
  createdAt: number;
};

const channelPtys = new Map<string, ChannelPty>();
/** plan/build 탭 전환용. PTY 종료 시 초기화. */
const lastSentModeByChannel = new Map<string, "plan" | "build">();

function spawnAttach(channelKey: string): ChannelPty {
  const env = { ...process.env };
  if (OPENCODE_PASSWORD) env.OPENCODE_SERVER_PASSWORD = OPENCODE_PASSWORD;

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(OPENCODE_BIN, ["attach", OPENCODE_ATTACH_URL], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: process.env.HOME ?? "/",
      env,
    });
  } catch (e) {
    throw new Error(
      `PTY spawn failed (opencode attach). OPENCODE_BIN=${OPENCODE_BIN}, url=${OPENCODE_ATTACH_URL}. ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const buffer: string[] = [];
  const lastParsed: ParsedState = {
    running: false,
    awaitingApproval: false,
    error: null,
    lastLines: [],
    rawTail: "",
    inferredTab: "unknown",
  };

  const appendLine = (line: string) => {
    const stripped = stripAnsi(line).trimEnd();
    if (stripped.length > MAX_LINE_LENGTH) buffer.push(stripped.slice(0, MAX_LINE_LENGTH) + "…");
    else if (stripped.length) buffer.push(stripped);
    while (buffer.length > MAX_BUFFER_LINES) buffer.shift();
  };

  let lineAccum = "";
  ptyProcess.onData((data: string) => {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        if (lineAccum.trimEnd().length) appendLine(lineAccum);
        lineAccum = "";
      } else {
        lineAccum += ch;
      }
    }
    if (lineAccum.length > MAX_LINE_LENGTH) {
      appendLine(lineAccum);
      lineAccum = "";
    }
  });

  ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
    lastSentModeByChannel.delete(channelKey);
    channelPtys.delete(channelKey);
    console.error(
      `[DevBridge PTY] attach exited channelKey=${channelKey} exitCode=${e.exitCode} signal=${e.signal ?? "none"}`
    );
  });

  const channelPty: ChannelPty = {
    pty: ptyProcess,
    process: ptyProcess,
    buffer,
    lastParsed,
    createdAt: Date.now(),
  };
  channelPtys.set(channelKey, channelPty);
  console.error(`[DevBridge PTY] spawn attach channelKey=${channelKey} pid=${ptyProcess.pid}`);
  return channelPty;
}

function inferTabFromRaw(rawTail: string): "plan" | "build" | "unknown" {
  const tail = rawTail.slice(-2000).toLowerCase();
  const lastBuild = tail.lastIndexOf("build");
  const lastPlan = tail.lastIndexOf("plan");
  if (lastPlan > lastBuild && lastPlan >= 0) return "plan";
  if (lastBuild >= 0) return "build";
  return "unknown";
}

function parseBuffer(buffer: string[]): ParsedState {
  const lastLines = buffer.slice(-50);
  const rawTail = lastLines.join("\n").slice(-4000);
  const lower = rawTail.toLowerCase();
  const awaitingApproval =
    lower.includes("approve") ||
    lower.includes("permission") ||
    lower.includes("allow?") ||
    lower.includes("(y/n)") ||
    lower.includes("y/n");
  const running =
    lower.includes("plan") ||
    lower.includes("build") ||
    lower.includes("running") ||
    lower.includes("working");
  let error: string | null = null;
  if (lower.includes("error") || lower.includes("failed") || lower.includes("econnrefused")) {
    const errLine = lastLines.find((l) => /error|failed|econnrefused/i.test(l));
    if (errLine) error = errLine.slice(0, 300);
  }
  const inferredTab = inferTabFromRaw(rawTail);
  return { running: running && !awaitingApproval, awaitingApproval, error, lastLines, rawTail, inferredTab };
}

export function getOrCreatePty(channelKey: string): ChannelPty {
  let cp = channelPtys.get(channelKey);
  if (!cp) cp = spawnAttach(channelKey);
  cp.lastParsed = parseBuffer(cp.buffer);
  return cp;
}

/** 키/텍스트 전송. appendEnter true면 끝에 \\r(엔터) 추가. Tab 등 키만 보낼 땐 false */
export function writeToPty(channelKey: string, text: string, options?: { appendEnter?: boolean }): void {
  const cp = getOrCreatePty(channelKey);
  const appendEnter = options?.appendEnter !== false;
  cp.pty.write(appendEnter ? text + "\r" : text);
}

export function getBuffer(channelKey: string, maxLines = 100): string[] {
  const cp = channelPtys.get(channelKey);
  if (!cp) return [];
  return cp.buffer.slice(-maxLines);
}

export function getParsedState(channelKey: string): ParsedState | null {
  const cp = channelPtys.get(channelKey);
  if (!cp) return null;
  cp.lastParsed = parseBuffer(cp.buffer);
  return cp.lastParsed;
}

export function destroyPty(channelKey: string): boolean {
  const cp = channelPtys.get(channelKey);
  if (!cp) return false;
  try {
    cp.pty.kill();
  } catch {
    /* ignore */
  }
  lastSentModeByChannel.delete(channelKey);
  channelPtys.delete(channelKey);
  return true;
}

export function hasPty(channelKey: string): boolean {
  return channelPtys.has(channelKey);
}

/** PTY가 있는 채널 키 목록. channel_key 미전달 시 폴백으로 사용 */
export function getChannelKeysWithPty(): string[] {
  return Array.from(channelPtys.keys());
}

export function getLastSentMode(channelKey: string): "plan" | "build" | undefined {
  return lastSentModeByChannel.get(channelKey);
}

export function setLastSentMode(channelKey: string, mode: "plan" | "build"): void {
  lastSentModeByChannel.set(channelKey, mode);
}

/** session-status: 김빌드/플러그인이 상황 파악 후 적절한 키입력 결정에 사용 */
export type SessionStatus = {
  channelKey: string;
  hasPty: boolean;
  inferredTab: "plan" | "build" | "unknown";
  lastSentMode: "plan" | "build" | undefined;
  awaitingApproval: boolean;
  running: boolean;
  error: string | null;
};

export function getSessionStatus(channelKey: string): SessionStatus {
  const hasPty = channelPtys.has(channelKey);
  const parsed = getParsedState(channelKey);
  return {
    channelKey,
    hasPty,
    inferredTab: parsed?.inferredTab ?? "unknown",
    lastSentMode: lastSentModeByChannel.get(channelKey),
    awaitingApproval: parsed?.awaitingApproval ?? false,
    running: parsed?.running ?? false,
    error: parsed?.error ?? null,
  };
}
