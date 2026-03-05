#!/usr/bin/env bash
# OpenClaw OpenAI Codex OAuth 인증을 로컬에서 완료한 뒤, 서버로 복사하는 스크립트.
# 사용법:
#   1. 로컬 Mac에서: openclaw models auth login --provider openai-codex  (브라우저 로그인 완료)
#   2. 이 스크립트 실행: ./scripts/copy_codex_auth_to_server.sh

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"

OPENCLAW_STATE="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
AUTH_PROFILES="$OPENCLAW_STATE/agents/default/agent/auth-profiles.json"
OAUTH_LEGACY="$OPENCLAW_STATE/credentials/oauth.json"

if [[ ! -f "$AUTH_PROFILES" && ! -f "$OAUTH_LEGACY" ]]; then
  echo "로컬에 OpenClaw Codex 인증이 없습니다."
  echo "먼저 로컬에서 실행하세요: openclaw models auth login --provider openai-codex"
  echo "브라우저에서 ChatGPT 로그인까지 완료한 뒤 이 스크립트를 다시 실행하세요."
  exit 1
fi

echo "=== 서버로 Codex 인증 복사 ==="
mkdir -p "$OPENCLAW_STATE/credentials" "$OPENCLAW_STATE/agents/default/agent"

if [[ -f "$AUTH_PROFILES" ]]; then
  echo "auth-profiles.json 복사 중..."
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$AUTH_PROFILES" "$SERVER:~/.openclaw/agents/default/agent/auth-profiles.json"
fi
if [[ -f "$OAUTH_LEGACY" ]]; then
  echo "credentials/oauth.json 복사 중..."
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$OAUTH_LEGACY" "$SERVER:~/.openclaw/credentials/oauth.json"
fi

echo "=== 서버에서 openclaw 재시작 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "systemctl --user restart openclaw 2>/dev/null || true"
echo "완료. 서버에서 확인: ssh -i $SSH_KEY $SERVER 'export PATH=\"\$HOME/.npm-global/bin:\$PATH\"; openclaw models status'"
