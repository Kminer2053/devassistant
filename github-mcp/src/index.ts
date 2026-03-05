import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./github/client.js";
import { handleRequest } from "./mcp/handler.js";

const config = loadConfig();
const app = express();
app.use(express.json({ limit: "1mb" }));

let client: GitHubClient | null = null;

function getClient(): GitHubClient {
  if (!client) {
    client = new GitHubClient({
      token: config.githubToken,
      baseUrl: config.githubBaseUrl
    });
  }
  return client;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/mcp", async (req, res) => {
  const body = req.body as Parameters<typeof handleRequest>[0];
  if (!body || typeof body !== "object") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" }
    });
    return;
  }
  try {
    const response = await handleRequest(body, getClient);
    res.json(response);
  } catch (err) {
    res.status(500).json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err)
      }
    });
  }
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[github-mcp] listening on port ${config.port}`);
});
