import type { FastifyRequest, FastifyReply } from "fastify";

const EXPECTED = process.env.DEVBRIDGE_TOKEN ?? "";

export async function requireToken(
  request: FastifyRequest<{ Headers: { "x-devbridge-token"?: string } }>,
  reply: FastifyReply
) {
  const token = request.headers["x-devbridge-token"];
  if (!EXPECTED || !token || token !== EXPECTED) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}
