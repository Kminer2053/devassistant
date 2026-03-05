#!/usr/bin/env bash
# 서버의 ~/.config/opencode/opencode.json 에 permission: allow 를 설정하여
# ACP/헤드리스 모드에서 권한 승인 대기로 멈추는 현상을 방지합니다.
# (OpenCode 문서: headless에서 permission이 ask면 승인 UI가 없어 무한 대기됨)
# 사용: 레포 루트에서 ./scripts/patch_opencode_permission_allow_on_server.sh

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키가 없습니다: $SSH_KEY"
  exit 1
fi

echo "=== 서버 OpenCode permission allow 패치 ==="
ssh -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" "$SERVER" 'bash -s' << 'ENDSSH'
python3 << 'PY'
import json, os
path = os.path.expanduser("~/.config/opencode/opencode.json")
if not os.path.isfile(path):
    print("SKIP: opencode.json 없음:", path)
    exit(0)
with open(path) as f:
    c = json.load(f)
if c.get("permission") == "allow":
    print("OK: 이미 permission = allow")
    exit(0)
c["permission"] = "allow"
with open(path, "w") as f:
    json.dump(c, f, indent=2)
print("OK: permission = allow 로 설정 (ACP/헤드리스에서 승인 대기 방지)")
PY
ENDSSH

echo "패치 완료. 새로 띄우는 opencode acp 세션부터 적용됩니다."
echo "참고: opencode serve 는 재시작 시 적용됩니다 (sudo systemctl restart opencode)."
