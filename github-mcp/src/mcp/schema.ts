/**
 * MCP tool schema (Vertex/Gemini-safe: no anyOf/oneOf).
 */

export interface McpJsonSchema {
  type: "object";
  properties: Record<
    string,
    { type: string; description?: string }
  >;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: McpJsonSchema;
}

export const tools: McpToolDefinition[] = [
  {
    name: "github_list_pull_requests",
    description: "List pull requests for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: { type: "string", description: "open, closed, or all" },
        per_page: { type: "string", description: "Max items (default 30)" }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_get_pull_request",
    description: "Get a single pull request by number.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "string", description: "PR number" }
      },
      required: ["owner", "repo", "pull_number"]
    }
  },
  {
    name: "github_get_pull_request_diff",
    description: "Get the diff of a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        pull_number: { type: "string", description: "PR number" }
      },
      required: ["owner", "repo", "pull_number"]
    }
  },
  {
    name: "github_create_comment",
    description: "Create a comment on an issue or PR.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        issue_number: { type: "string", description: "Issue or PR number" },
        body: { type: "string", description: "Comment body" }
      },
      required: ["owner", "repo", "issue_number", "body"]
    }
  },
  {
    name: "github_create_pull_request",
    description: "Create a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "PR title" },
        head: { type: "string", description: "Head branch" },
        base: { type: "string", description: "Base branch" },
        body: { type: "string", description: "PR body" }
      },
      required: ["owner", "repo", "title", "head", "base"]
    }
  },
  {
    name: "github_list_issues",
    description: "List issues for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: { type: "string", description: "open, closed, or all" },
        per_page: { type: "string", description: "Max items" }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_issue",
    description: "Create an issue.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue body" },
        labels: { type: "string", description: "Comma-separated labels" }
      },
      required: ["owner", "repo", "title"]
    }
  },
  {
    name: "github_get_file_contents",
    description: "Get file contents from a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path" },
        ref: { type: "string", description: "Branch, tag, or commit SHA" }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "github_create_or_update_file",
    description: "Create or update a file in a repository. Content must be base64-encoded.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Base64-encoded file content" },
        message: { type: "string", description: "Commit message" },
        branch: { type: "string", description: "Branch name (default: default branch)" }
      },
      required: ["owner", "repo", "path", "content", "message"]
    }
  }
];
