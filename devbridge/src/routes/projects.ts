import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { projectCreate, projectSelect } from "../schemas/index.js";

const ALLOWED_PREFIX = "/srv/repos/";

function validateLocalPath(path: string): boolean {
  const normalized = path.replace(/\/+/g, "/");
  return normalized.startsWith(ALLOWED_PREFIX);
}

export async function projectsRoutes(app: FastifyInstance) {
  app.get("/v1/projects", async (_req, reply) => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY id").all();
    return reply.send(rows);
  });

  app.post<{ Body: unknown }>("/v1/projects", async (req, reply) => {
    const parsed = projectCreate.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const { name, localPath, repoUrl, defaultBranch } = parsed.data;
    if (!validateLocalPath(localPath)) {
      return reply.status(400).send({
        error: "localPath must be under /srv/repos/",
      });
    }
    const stmt = db.prepare(
      "INSERT INTO projects (name, local_path, repo_url, default_branch) VALUES (?, ?, ?, ?)"
    );
    const r = stmt.run(name, localPath, repoUrl ?? null, defaultBranch ?? "main");
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(r.lastInsertRowid) as Record<string, unknown>;
    return reply.status(201).send(row);
  });

  app.post<{ Params: { id: string }; Body: unknown }>("/v1/projects/:id/select", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid project id" });
    const parsed = projectSelect.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    const { channelKey } = parsed.data;
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    db.prepare(
      "INSERT OR REPLACE INTO channel_context (channel_key, selected_project_id, updated_at) VALUES (?, ?, datetime('now'))"
    ).run(channelKey, id);
    return reply.send({ ok: true, selectedProjectId: id });
  });
}
