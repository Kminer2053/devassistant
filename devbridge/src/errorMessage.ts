/** 예외/객체를 사용자·로그용 한 줄 문자열로 변환. "[object Object]" 방지 */
export function errorToMessage(err: unknown): string {
  if (err == null) return "Unknown error";
  if (err instanceof Error) {
    let msg = err.message;
    if (err.cause != null) {
      const causeStr = err.cause instanceof Error ? err.cause.message : String(err.cause);
      if (causeStr && !msg.includes(causeStr)) msg += ` (${causeStr})`;
    }
    return msg;
  }
  if (typeof err === "string") return err;
  const o = err as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  if (typeof o.error === "string" && o.error.trim()) return o.error;
  if (typeof o.details === "string" && o.details.trim()) return o.details;
  // OpenCode API validation errors: { error: [{ message, path, ... }], success: false }
  if (Array.isArray(o.error) && o.error.length > 0) {
    const first = o.error[0] as Record<string, unknown> | undefined;
    const msg =
      typeof first?.message === "string" && first.message.trim()
        ? first.message
        : typeof first?.path === "object" && Array.isArray(first?.path)
          ? `Invalid input at ${(first.path as unknown[]).join(".")}`
          : undefined;
    if (msg) return msg;
  }
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}" && !/^\[object \w+\]$/.test(s)) return s;
  } catch {
    /* circular ref - fallback */
  }
  const parts: string[] = [];
  if (typeof o.message === "string") parts.push(o.message);
  if (typeof o.error === "string") parts.push(o.error);
  if (typeof o.details === "string") parts.push(o.details);
  if (parts.length > 0) return parts.join(" | ");
  // 객체가 그대로 String()된 경우 [object Object] 대신 요약 반환
  if (typeof err === "object" && err !== null) {
    const keys = Object.keys(err).slice(0, 5).join(", ");
    return keys ? `Error(${keys})` : "Unknown error (object)";
  }
  const str = String(err);
  return str === "[object Object]" ? "Unknown error" : str;
}
