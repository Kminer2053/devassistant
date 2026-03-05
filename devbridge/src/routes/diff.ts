import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { getDiff } from "../opencode.js";
import { isPtyBackend } from "../pty/backend.js";
import { diffQuery } from "../schemas/index.js";

const RISKY_PATTERNS = [
  /password|secret|api[_-]?key|token|credential|auth/i,
  /\.env|\.pem|\.key$/i,
  /config.*sensitive/i,
];

function isRisky(path: string, content?: string): boolean {
  if (RISKY_PATTERNS.some((r) => r.test(path))) return true;
  if (content && RISKY_PATTERNS.some((r) => r.test(content))) return true;
  return false;
}

export async function getDiffResponse(
  channelKey: string
): Promise<
  | { channelKey: string; sessionId: string; fileCount: number; files: Array<{ path?: string; risky: boolean }>; riskyFiles: Array<{ path?: string; risky: boolean }> }
  | { error: string; notFound: true }
> {
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string }
    | undefined;

  if (!ctx?.opencode_session_id) {
    return { error: "No session for channel. Run /plan or /build first.", notFound: true };
  }

  if (isPtyBackend()) {
    return {
      channelKey,
      sessionId: ctx.opencode_session_id,
      fileCount: 0,
      files: [],
      riskyFiles: [],
    };
  }

  const diffs = await getDiff(ctx.opencode_session_id);
  const files = (diffs as Array<{ path?: string; content?: string }>).map((d) => ({
    path: d.path,
    risky: isRisky(d.path ?? "", d.content),
  }));

  return {
    channelKey,
    sessionId: ctx.opencode_session_id,
    fileCount: files.length,
    files,
    riskyFiles: files.filter((f) => f.risky),
  };
}

export async function diffRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>("/v1/diff", async (req, reply) => {
    const parsed = diffQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const result = await getDiffResponse(parsed.data.channelKey);
    if ("notFound" in result) return reply.status(404).send({ error: result.error });
    return reply.send(result);
  });
}
