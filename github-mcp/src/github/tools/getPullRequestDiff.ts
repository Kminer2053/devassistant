import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; pull_number: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, pull_number } = args;
  const path = `/repos/${owner}/${repo}/pulls/${pull_number}`;
  const { status, text } = await client.getRaw(path, "application/vnd.github.diff");
  if (status !== 200) {
    const code = normalizeError(status, text);
    throw new Error(`${code}: ${text || status}`);
  }
  return { content: [{ type: "text", text: text || "(no diff)" }] };
}
