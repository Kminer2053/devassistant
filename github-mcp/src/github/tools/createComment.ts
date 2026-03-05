import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; issue_number: string; body: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, issue_number, body } = args;
  const path = `/repos/${owner}/${repo}/issues/${issue_number}/comments`;
  const { status, data } = await client.post(path, { body });
  if (status !== 201) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const c = data as { html_url?: string };
  return { content: [{ type: "text", text: `Comment created. ${c.html_url ?? ""}` }] };
}
