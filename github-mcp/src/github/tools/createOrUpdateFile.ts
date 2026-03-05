import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; path: string; content: string; message: string; branch?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, path: filePath, content: contentB64, message, branch } = args;
  const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const payload: { message: string; content: string; branch?: string } = { message, content: contentB64 };
  if (branch) payload.branch = branch;
  const { status, data } = await client.put(path, payload);
  if (status !== 200 && status !== 201) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const result = data as { content?: { sha?: string } };
  return { content: [{ type: "text", text: `File created or updated. sha: ${result.content?.sha ?? "ok"}` }] };
}
