import type { FastifyInstance } from "fastify";
import { healthCheck } from "../opencode.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    try {
      const h = await healthCheck();
      return reply.send({ ok: true, opencodeConnected: h.healthy });
    } catch {
      return reply.send({ ok: true, opencodeConnected: false });
    }
  });
}
