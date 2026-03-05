export interface AppConfig {
  port: number;
  githubToken: string;
  githubBaseUrl: string;
}

export function loadConfig(): AppConfig {
  const port = parseInt(process.env.GITHUB_MCP_PORT ?? "5050", 10);
  const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const githubBaseUrl =
    process.env.GITHUB_BASE_URL ?? "https://api.github.com";

  if (!githubToken) {
    // Skeleton 단계에서는 강하게 실패 대신 경고만 출력하고 진행한다.
    // 실제 GitHub 연동 구현 시에는 여기에서 오류를 던지는 쪽으로 바꿀 수 있다.
    // eslint-disable-next-line no-console
    console.warn(
      "[github-mcp] GITHUB_PERSONAL_ACCESS_TOKEN is not set. GitHub calls will fail until it is configured."
    );
  }

  return {
    port,
    githubToken: githubToken ?? "",
    githubBaseUrl
  };
}

