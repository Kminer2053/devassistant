import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { errorToMessage } from "../errorMessage.js";
import { runShell } from "../opencode.js";
import { isPtyBackend } from "../pty/backend.js";
import { writeToPty } from "../pty/opencodePty.js";
import { applyBody } from "../schemas/index.js";

function oneLineForPty(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

export type ApplyMode = "commit" | "push" | "pr";

export async function runApply(params: {
  channelKey: string;
  mode: ApplyMode;
  message?: string;
}): Promise<
  | { ok: true; mode: string; message: string }
  | { error: string; message?: string }
> {
  const { channelKey, mode, message } = params;
  const ctx = db.prepare("SELECT * FROM channel_context WHERE channel_key = ?").get(channelKey) as
    | { opencode_session_id?: string; selected_project_id?: number }
    | undefined;

  if (!ctx?.opencode_session_id) {
    return { error: "No session for channel. Run /plan or /build first." };
  }

  if (isPtyBackend()) {
    const line =
      mode === "commit"
        ? "/apply commit " + oneLineForPty(message || "DevBridge apply")
        : mode === "push"
          ? "/apply push"
          : "/apply pr";
    writeToPty(channelKey, line);
    return { ok: true, mode, message: "요청 전달됨(PTY). 결과는 /activity에서 확인하세요." };
  }

  const project = ctx.selected_project_id
    ? (db.prepare("SELECT * FROM projects WHERE id = ?").get(ctx.selected_project_id) as { local_path: string } | undefined)
    : undefined;
  const workDir = project?.local_path ?? "/srv/repos";
  const commitMsg = message || "DevBridge apply";

  try {
    if (mode === "commit") {
      const r = await runShell(ctx.opencode_session_id, `cd ${workDir} && git add -A && git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      const textParts = (r.parts as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n");
      return { ok: true, mode: "commit", message: textParts || "Commit completed." };
    }
    if (mode === "push" || mode === "pr") {
      const r = await runShell(ctx.opencode_session_id, `cd ${workDir} && git push`);
      const textParts = (r.parts as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n");
      return { ok: true, mode, message: textParts || `${mode} completed.` };
    }
    return { error: "Unknown mode" };
  } catch (err) {
    const msg = errorToMessage(err);
    return {
      error: "Apply failed",
      message: msg.includes("OpenCode") ? "OpenCode unavailable. Check opencode serve." : msg,
    };
  }
}

export async function applyRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>("/v1/apply", async (req, reply) => {
    const parsed = applyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const result = await runApply(parsed.data);
    if ("error" in result) {
      const status = result.error === "No session for channel. Run /plan or /build first." ? 404 : 502;
      return reply.status(status).send(result);
    }
    return reply.send(result);
  });
}
