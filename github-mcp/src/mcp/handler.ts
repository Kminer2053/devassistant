import { tools } from "./schema.js";
import { GitHubClient } from "../github/client.js";
import * as listPullRequests from "../github/tools/listPullRequests.js";
import * as getPullRequest from "../github/tools/getPullRequest.js";
import * as getPullRequestDiff from "../github/tools/getPullRequestDiff.js";
import * as createComment from "../github/tools/createComment.js";
import * as createPullRequest from "../github/tools/createPullRequest.js";
import * as listIssues from "../github/tools/listIssues.js";
import * as createIssue from "../github/tools/createIssue.js";
import * as getFileContents from "../github/tools/getFileContents.js";
import * as createOrUpdateFile from "../github/tools/createOrUpdateFile.js";

const TOOL_RUNNERS: Record<string, (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>> = {
  github_list_pull_requests: listPullRequests.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_get_pull_request: getPullRequest.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_get_pull_request_diff: getPullRequestDiff.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_create_comment: createComment.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_create_pull_request: createPullRequest.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_list_issues: listIssues.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_create_issue: createIssue.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_get_file_contents: getFileContents.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  github_create_or_update_file: createOrUpdateFile.run as (client: GitHubClient, args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>
};

export function listTools(): { name: string; description: string; inputSchema: unknown }[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}

export async function callTool(
  client: GitHubClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const run = TOOL_RUNNERS[name];
  if (!run) throw new Error(`Unknown tool: ${name}`);
  return run(client, args);
}

export interface McpJsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export async function handleRequest(
  body: McpJsonRpcRequest,
  getClient: () => GitHubClient
): Promise<McpJsonRpcResponse> {
  const id = body.id ?? null;
  const method = body.method ?? "";
  const params = (body.params ?? {}) as Record<string, unknown>;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "github-mcp", version: "0.1.0" }
      }
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: listTools() }
    };
  }

  if (method === "tools/call") {
    const name = params.name as string | undefined;
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    if (!name) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } };
    }
    try {
      const client = getClient();
      const result = await callTool(client, name, args);
      return { jsonrpc: "2.0", id, result: { content: result.content } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { jsonrpc: "2.0", id, error: { code: -32603, message } };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}
