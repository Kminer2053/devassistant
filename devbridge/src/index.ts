import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { projectsRoutes } from "./routes/projects.js";
import { planRoutes } from "./routes/plan.js";
import { buildRoutes } from "./routes/build.js";
import { statusRoutes } from "./routes/status.js";
import { diffRoutes } from "./routes/diff.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { applyRoutes } from "./routes/apply.js";
import { opencodeRoutes } from "./routes/opencode.js";
import { handoffRoutes } from "./routes/handoff.js";
import { executeRoutes } from "./routes/execute.js";
import { requireToken } from "./middleware/auth.js";
import { startEventSubscriber } from "./eventBuffer.js";
import { isPtyBackend } from "./pty/backend.js";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = Fastify({ logger: { level: "info" } });

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  await requireToken(request as never, reply);
});

app.register(healthRoutes);
app.register(projectsRoutes);
app.register(planRoutes);
app.register(buildRoutes);
app.register(statusRoutes);
app.register(diffRoutes);
app.register(approvalsRoutes);
app.register(applyRoutes);
app.register(opencodeRoutes);
app.register(handoffRoutes);
app.register(executeRoutes);

app.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`DevBridge listening on http://${HOST}:${PORT}`);
  if (!isPtyBackend()) startEventSubscriber();
});
