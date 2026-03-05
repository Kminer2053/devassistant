import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { respondPermission } from "../opencode.js";
import { writeToPty } from "../pty/opencodePty.js";
import { approvalsQuery, approvalBody } from "../schemas/index.js";

export async function approvalsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: unknown }>("/v1/approvals", async (req, reply) => {
    const parsed = approvalsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "channelKey required", details: parsed.error.flatten() });
    }
    const { channelKey } = parsed.data;

    const run = db
      .prepare(
        "SELECT r.id FROM runs r WHERE r.channel_key = ? AND r.status = 'awaiting_approval' ORDER BY r.id DESC LIMIT 1"
      )
      .get(channelKey) as { id: number } | undefined;

    if (!run) {
      return reply.send({ channelKey, approvals: [] });
    }

    const approvals = db
      .prepare(
        "SELECT * FROM approvals WHERE run_id = ? AND status = 'pending' ORDER BY id"
      )
      .all(run.id) as Array<Record<string, unknown>>;

    return reply.send({ channelKey, approvals });
  });

  app.post<{ Params: { approvalId: string }; Body: unknown }>(
    "/v1/approvals/:approvalId",
    async (req, reply) => {
      const id = parseInt(req.params.approvalId, 10);
      if (isNaN(id)) return reply.status(400).send({ error: "Invalid approval id" });

      const parsed = approvalBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const { decision, remember } = parsed.data;

      const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
        | { opencode_session_id: string; opencode_permission_id: string; run_id: number }
        | undefined;

      if (!row) return reply.status(404).send({ error: "Approval not found" });

      const isPtySession = row.opencode_session_id.startsWith("pty:");
      if (isPtySession) {
        const channelKey = row.opencode_session_id.slice(4);
        writeToPty(channelKey, decision === "approve" ? "y" : "n");
      } else {
        const ok = await respondPermission(
          row.opencode_session_id,
          row.opencode_permission_id,
          decision,
          remember
        );
        if (!ok) {
          return reply.status(502).send({ error: "Failed to respond to OpenCode permission" });
        }
      }

      db.prepare("UPDATE approvals SET status = ? WHERE id = ?").run(
        decision === "approve" ? "approved" : "denied",
        id
      );
      db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(
        decision === "approve" ? "running" : "denied",
        row.run_id
      );

      return reply.send({ ok: true, decision });
    }
  );
}
