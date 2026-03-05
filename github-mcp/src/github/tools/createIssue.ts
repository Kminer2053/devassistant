import { GitHubClient, normalizeError } from "../client.js";

export async function run(
  client: GitHubClient,
  args: { owner: string; repo: string; title: string; body?: string; labels?: string }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { owner, repo, title, body, labels } = args;
  const path = `/repos/${owner}/${repo}/issues`;
  const payload: { title: string; body?: string; labels?: string[] } = { title };
  if (body) payload.body = body;
  if (labels) payload.labels = labels.split(",").map((s) => s.trim()).filter(Boolean);
  const { status, data } = await client.post(path, payload);
  if (status !== 201) {
    const code = normalizeError(status, data);
    const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message: string }).message) : "";
    throw new Error(`${code}: ${msg || status}`);
  }
  const issue = data as { number: number; html_url?: string };
  return { content: [{ type: "text", text: `Issue #${issue.number} created. ${issue.html_url ?? ""}` }] };
}
