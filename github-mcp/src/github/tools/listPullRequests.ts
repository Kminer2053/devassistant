import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; state?: string; per_page?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, state = "open", per_page = "30" } = args;
  const path = `/repos/${owner}/${repo}/pulls?state=${encodeURIComponent(state)}&per_page=${encodeURIComponent(per_page)}`;
  const { status, data } = await client.get(path);
  if (status !== 200) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const list = Array.isArray(data) ? data : [];
  const summary = list.map((pr: { number: number; title: string; state: string; html_url?: string }) =>
    `#${pr.number} ${pr.title} (${pr.state}) ${pr.html_url ?? ""}`
  ).join("\n");
  return { content: [{ type: "text", text: summary || "No pull requests." }] };
}
