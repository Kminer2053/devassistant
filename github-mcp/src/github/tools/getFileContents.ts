import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; path: string; ref?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, path: filePath, ref } = args;
  let path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  if (ref) path += `?ref=${encodeURIComponent(ref)}`;
  const { status, data } = await client.get(path);
  if (status !== 200) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const content = data as { content?: string; encoding?: string };
  if (!content.content) {
    return { content: [{ type: "text", text: "(empty file)" }] };
  }
  const decoded = content.encoding === "base64"
    ? Buffer.from(content.content, "base64").toString("utf8")
    : content.content;
  return { content: [{ type: "text", text: decoded }] };
}
