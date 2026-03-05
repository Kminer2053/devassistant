/**
 * OpenCode backend selection: PTY vs HTTP (SDK).
 * DEVBRIDGE_OPENCODE_BACKEND=pty | opencode (default: pty)
 * - pty: 채널별 opencode attach PTY로 /plan, /build, status, approvals 등 처리. OpenCode serve 불필요.
 * - opencode: 기존 HTTP API(SDK) 사용. OpenCode serve(127.0.0.1:4096) 필요.
 */

export function isPtyBackend(): boolean {
  return (process.env.DEVBRIDGE_OPENCODE_BACKEND ?? "pty").toLowerCase() === "pty";
}
