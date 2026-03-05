#!/usr/bin/env bash
# Stitch MCP 스키마 호환 패치(infra/stitch-mcp/stitch_mcp.py)를 서버 ~/stitch-mcp/에 배포 후 OpenCode 재시작.
# 사용: 레포 루트에서 ./scripts/deploy_stitch_mcp_patch.sh
# 환경변수: SSH_KEY (기본 ~/.ssh/github-actions-oracle), SERVER (기본 devassistant@46.250.254.159)

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키가 없습니다: $SSH_KEY"
  exit 1
fi

echo "=== Stitch MCP 패치 배포 ==="
rsync -avz -e "ssh -o StrictHostKeyChecking=accept-new -i $SSH_KEY" \
  infra/stitch-mcp/stitch_mcp.py "$SERVER:~/stitch-mcp/stitch_mcp.py"

echo "=== 서버에서 문법 검사 및 OpenCode 재시작 ==="
ssh -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" "$SERVER" \
  "/home/devassistant/stitch-mcp/.venv/bin/python -m py_compile /home/devassistant/stitch-mcp/stitch_mcp.py && sudo systemctl restart opencode"

echo "완료. 새 OpenCode 세션부터 적용됩니다."
