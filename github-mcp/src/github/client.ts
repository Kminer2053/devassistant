import { request } from "undici";

const DEFAULT_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "vertex-safe-github-mcp/0.1.0"
};

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
}

export class GitHubClient {
  private token: string;
  private baseUrl: string;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  private async req(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`;
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Authorization: this.token ? `Bearer ${this.token}` : ""
    };
    const opts: { method: "GET" | "POST" | "PUT" | "PATCH"; headers: Record<string, string>; body?: string } = {
      method,
      headers
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await request(url, opts);
    const text = await res.body.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.statusCode, data };
  }

  async get(path: string): Promise<{ status: number; data: unknown }> {
    return this.req("GET", path);
  }

  async post(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return this.req("POST", path, body);
  }

  async put(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return this.req("PUT", path, body);
  }

  async patch(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return this.req("PATCH", path, body);
  }

  /** GET with custom Accept and return raw text (e.g. for diff). */
  async getRaw(path: string, accept?: string): Promise<{ status: number; text: string }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`;
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Authorization: this.token ? `Bearer ${this.token}` : ""
    };
    if (accept) headers.Accept = accept;
    const res = await request(url, { method: "GET", headers });
    const text = await res.body.text();
    return { status: res.statusCode, text };
  }
}

export function normalizeError(status: number, data: unknown): string {
  if (status === 404) return "not_found";
  if (status === 403) return "rate_limit_exceeded";
  if (status >= 400 && status < 500) return "validation_failed";
  if (status >= 500) return "server_error";
  return "unknown_error";
}
