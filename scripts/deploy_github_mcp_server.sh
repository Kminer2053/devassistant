#!/usr/bin/env bash
# GitHub MCP 서버를 빌드한 뒤 서버에 동기화하고 systemd 서비스로 재시작.
# 사용: 레포 루트에서 ./scripts/deploy_github_mcp_server.sh
# 환경변수: SSH_KEY (기본 ~/.ssh/github-actions-oracle), SERVER (기본 devassistant@46.250.254.159)
# 서버에서 GITHUB_PERSONAL_ACCESS_TOKEN은 systemd 유닛 또는 환경파일로 설정 필요.

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"
REMOTE_BASE="${REMOTE_BASE:-/srv/devassistant}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키가 없습니다: $SSH_KEY"
  echo "SSH_KEY=경로 SERVER=user@host ./scripts/deploy_github_mcp_server.sh"
  exit 1
fi

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -i "$SSH_KEY")

echo "=== 1) 로컬 빌드 ==="
cd "$REPO_DIR/github-mcp"
npm ci
./node_modules/.bin/tsc
cd "$REPO_DIR"

echo "=== 2) 서버로 동기화 ==="
rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.env \
  github-mcp/ "$SERVER:$REMOTE_BASE/github-mcp/"

rsync -avz -e "ssh ${SSH_OPTS[*]}" \
  infra/systemd/github-mcp.service "$SERVER:$REMOTE_BASE/github-mcp/github-mcp.service"

echo "=== 3) 서버에서 의존성 설치 및 서비스 재시작 ==="
ssh "${SSH_OPTS[@]}" "$SERVER" "REMOTE_BASE=$REMOTE_BASE bash -s" << 'REMOTE'
set -e
REMOTE_BASE="${REMOTE_BASE:-/srv/devassistant}"
cd "$REMOTE_BASE/github-mcp"
npm ci --omit=dev
sudo cp "$REMOTE_BASE/github-mcp/github-mcp.service" /etc/systemd/system/github-mcp.service
sudo systemctl daemon-reload
sudo systemctl restart github-mcp
sudo systemctl status github-mcp --no-pager
REMOTE

echo ""
echo "=== 배포 완료 ==="
echo "GitHub MCP: http://127.0.0.1:5050/mcp (서버 내부). GITHUB_PERSONAL_ACCESS_TOKEN을 서버에서 설정했는지 확인하세요."
echo "OpenCode 연동: opencode.json 의 mcp.github 를 type: remote, url: http://127.0.0.1:5050/mcp 로 설정 후 opencode serve 재시작."
echo ""
