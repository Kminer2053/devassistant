import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; pull_number: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, pull_number } = args;
  const path = `/repos/${owner}/${repo}/pulls/${pull_number}`;
  const { status, data } = await client.get(path);
  if (status !== 200) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const pr = data as { number: number; title: string; state: string; body: string | null; html_url?: string };
  const text = `#${pr.number} ${pr.title}\nState: ${pr.state}\nURL: ${pr.html_url ?? ""}\n\n${pr.body ?? ""}`;
  return { content: [{ type: "text", text }] };
}
