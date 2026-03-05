import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; title: string; head: string; base: string; body?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, title, head, base, body } = args;
  const path = `/repos/${owner}/${repo}/pulls`;
  const { status, data } = await client.post(path, { title, head, base, body: body ?? "" });
  if (status !== 201) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const pr = data as { number: number; html_url?: string };
  return { content: [{ type: "text", text: `PR #${pr.number} created. ${pr.html_url ?? ""}` }] };
}
