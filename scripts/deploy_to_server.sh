#!/usr/bin/env bash
# OpenClaw 플러그인 + 워크스페이스 코드를 서버에 반영한 뒤 OpenClaw만 재시작.
# C안: DevBridge/ACP(acpx) 미사용. OpenCode는 스킬 워크플로(exec+process+JSON-RPC)로 제어.
# 사용: 레포 루트에서 ./scripts/deploy_to_server.sh
# 환경변수: SSH_KEY (기본 ~/.ssh/github-actions-oracle), SERVER (기본 devassistant@46.250.254.159)

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"
REMOTE_BASE="${REMOTE_BASE:-/srv/devassistant}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키가 없습니다: $SSH_KEY"
  echo "SSH_KEY=경로 SERVER=user@host ./scripts/deploy_to_server.sh"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -i "$SSH_KEY")

echo "=== 1) 서버로 코드 동기화 ==="
rsync -avz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude=node_modules \
  --exclude=.git \
  openclaw-plugin-devbridge/ "$SERVER:$REMOTE_BASE/openclaw-plugin-devbridge/"

rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  scripts/server_hard_restart.sh "$SERVER:$REMOTE_BASE/scripts/"

echo "=== 2) 워크스페이스(AGENTS.md, TOOLS.md 등) 서버 동기화 ==="
rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  --exclude='.git' --exclude='.openclaw' --exclude='.pi' \
  openclaw/workplace/ "$SERVER:~/.openclaw/workspace/"

echo "=== 3) 서버 OpenClaw tools/plugins 패치 (스킬 기반: ACP 비활성화, sessions_spawn deny) ==="
"$REPO_DIR/scripts/patch_openclaw_tools_allow_on_server.sh" || true

echo "=== 4) OpenClaw 강제 재시작 ==="
ssh "${SSH_OPTS[@]}" "$SERVER" "bash $REMOTE_BASE/scripts/server_hard_restart.sh openclaw"

echo ""
echo "=== 배포 완료 ==="
echo "※ 워크스페이스(AGENTS.md) 또는 플러그인을 수정했다면: 텔레그램에서 /new 또는 /reset 을 보내서"
echo "   새 세션을 시작해야 새 규칙·도구 설명이 적용됩니다."
