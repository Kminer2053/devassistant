/**
 * PTY-backed implementation of plan and build.
 * OpenCode TUI에는 /plan·/build 슬래시 명령이 없으므로, 탭으로 에이전트 전환 후 입력창에 지시문 + 엔터로 전달.
 * - plan: Tab(Plan 탭으로) + 지시문 + Enter
 * - build: 지시문 + Enter (기본 탭이 Build라고 가정)
 */

import { db } from "../db.js";
import { writeToPty, getSessionStatus, setLastSentMode } from "./opencodePty.js";
import { formatPlanHandoff, formatBuildHandoff } from "../handoff.js";

const PTY_SESSION_PREFIX = "pty:";

function oneLineForPty(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

/** session-status 기반 현재 탭: inferredTab 우선, unknown이면 lastSentMode, 없으면 build(기본) */
function currentTab(status: ReturnType<typeof getSessionStatus>): "plan" | "build" {
  if (status.inferredTab !== "unknown") return status.inferredTab;
  return status.lastSentMode ?? "build";
}

/** plan: Tab(엔터 없이) → 지시문 + Enter */
function sendPlanToPty(channelKey: string, line: string): void {
  const status = getSessionStatus(channelKey);
  if (currentTab(status) !== "plan") writeToPty(channelKey, "\t", { appendEnter: false });
  writeToPty(channelKey, line);
  setLastSentMode(channelKey, "plan");
}

/** build: Tab(엔터 없이) 필요 시 → 지시문 + Enter */
function sendBuildToPty(channelKey: string, line: string): void {
  const status = getSessionStatus(channelKey);
  if (currentTab(status) !== "build") writeToPty(channelKey, "\t", { appendEnter: false });
  writeToPty(channelKey, line);
  setLastSentMode(channelKey, "build");
}

export type PlanResult = { ok: true; sessionId: string; summary: string; nextAction: string } | { error: string; details: string; sessionId?: string };
export type BuildResult =
  | { ok: true; runId: number; sessionId: string; summary: string }
  | { error: string; details: string; sessionId?: string; runId?: number };

export function runPlanViaPty(params: {
  channelKey: string;
  projectId?: number;
  text: string;
}): PlanResult {
  const { channelKey, projectId, text } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number }
    | undefined;
  const selProjectId = projectId ?? ctx?.selected_project_id;
  const sessionId = PTY_SESSION_PREFIX + channelKey;
  db.prepare(
    "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(channelKey, selProjectId ?? null, sessionId);

  const run = db
    .prepare("INSERT INTO runs (channel_key, project_id, mode, prompt, status) VALUES (?, ?, ?, ?, ?)")
    .run(channelKey, selProjectId ?? null, "plan", text, "running");

  try {
    const messageToOpenCode = formatPlanHandoff(text);
    const line = oneLineForPty(messageToOpenCode);
    sendPlanToPty(channelKey, line);
    db.prepare("UPDATE runs SET summary = ? WHERE id = ?").run(
      "Plan 요청 전달됨(PTY). 권한 요청 시 /approvals 후 /approve 또는 /deny 하세요. 진행은 /activity에서 확인해 주세요.",
      run.lastInsertRowid
    );
    return {
      ok: true,
      sessionId,
      summary: "Plan 요청을 OpenCode(PTY)에 전달했습니다. 권한 요청이 있으면 /approvals 후 /approve 또는 /deny로 처리하세요. 진행은 /activity에서 확인해 주세요.",
      nextAction: "권한 요청 시 /approvals → /approve 또는 /deny. 잠시 후 /activity로 계획 진행을 확인해 주세요.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const summaryTruncated = msg.slice(0, 500);
    db.prepare("UPDATE runs SET status = ?, summary = ? WHERE id = ?").run("failed", summaryTruncated, run.lastInsertRowid);
    return { error: "OpenCode(PTY)에 지시 전달 실패", details: msg, sessionId };
  }
}

export function runBuildViaPty(params: { channelKey: string; text?: string }): BuildResult {
  const { channelKey, text } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { selected_project_id?: number }
    | undefined;
  const sessionId = PTY_SESSION_PREFIX + channelKey;
  db.prepare(
    "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, opencode_session_id, updated_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(channelKey, ctx?.selected_project_id ?? null, sessionId);

  const run = db
    .prepare("INSERT INTO runs (channel_key, project_id, mode, prompt, status) VALUES (?, ?, ?, ?, ?)")
    .run(channelKey, ctx?.selected_project_id ?? null, "build", text ?? "", "running");

  try {
    const messageToOpenCode = formatBuildHandoff(text ?? "");
    const line = oneLineForPty(messageToOpenCode);
    sendBuildToPty(channelKey, line);
    db.prepare("UPDATE runs SET summary = ? WHERE id = ?").run(
      "Build 요청 접수(PTY). 진행 상황은 /devstatus 또는 /activity에서 확인해 주세요.",
      run.lastInsertRowid
    );
    return {
      ok: true,
      runId: run.lastInsertRowid as number,
      sessionId,
      summary: "Build 요청을 OpenCode(PTY)에 전달했습니다. 진행 상황은 /activity에서 확인해 주세요.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const summaryTruncated = msg.slice(0, 500);
    db.prepare("UPDATE runs SET status = ?, summary = ? WHERE id = ?").run("failed", summaryTruncated, run.lastInsertRowid);
    return {
      error: "OpenCode(PTY)에 지시 전달 실패",
      details: msg,
      sessionId,
      runId: run.lastInsertRowid as number,
    };
  }
}
