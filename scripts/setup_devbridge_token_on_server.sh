#!/usr/bin/env bash
# OpenClaw와 DevBridge를 같은 토큰으로 쓰도록 서버 설정.
# - openclaw.json에서 devbridgeToken 제거 → 플러그인이 gateway.auth.token 사용
# - DEVBRIDGE_TOKEN은 서버에서 gateway.auth.token과 동일한 값으로 설정 필요(안내 출력)
#
# 사용법:
#   로컬에서: ./scripts/setup_devbridge_token_on_server.sh
#   또는 서버에 SSH 붙어서: ./scripts/setup_devbridge_token_on_server.sh --local

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"

run_on_server() {
  if [[ "${1:-}" == "--local" ]]; then
    shift
    bash -s "$@"
  else
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "bash -s" -- "$@"
  fi
}

# 서버(또는 로컬)에서 실행할 인라인 스크립트
REMOTE_SCRIPT='
set -e
OPENCLAW_JSON="${HOME}/.openclaw/openclaw.json"
if [[ ! -f "$OPENCLAW_JSON" ]]; then
  echo "없음: $OPENCLAW_JSON — OpenClaw 설정 후 다시 실행하세요."
  exit 1
fi

# devbridgeToken 제거(플러그인이 gateway.auth.token 사용하도록)
python3 << PY
import json, os
path = os.path.expanduser("~/.openclaw/openclaw.json")
with open(path) as f:
    c = json.load(f)
plug = c.get("plugins", {}).get("entries", {}).get("devbridge", {})
cfg = plug.get("config") or {}
if "devbridgeToken" in cfg:
    del cfg["devbridgeToken"]
    with open(path, "w") as f:
        json.dump(c, f, indent=2)
    print("OK: devbridgeToken 제거함. 이제 gateway.auth.token 을 사용합니다.")
else:
    print("OK: devbridgeToken 없음. 이미 gateway 토큰 사용 중.")
PY

GW_TOKEN=$(python3 -c "
import json, os
with open(os.path.expanduser(\"~/.openclaw/openclaw.json\")) as f:
    c = json.load(f)
print(c.get(\"gateway\", {}).get(\"auth\", {}).get(\"token\", \"\"))
" 2>/dev/null || true)

if [[ -n "$GW_TOKEN" ]]; then
  echo "---"
  echo "서버에서 DevBridge 가 이 토큰을 쓰게 하세요:"
  echo "  DEVBRIDGE_TOKEN 과 gateway.auth.token 이 동일해야 합니다."
  echo "  systemd 사용 시: /etc/systemd/system/devbridge.service.d/env.conf 에"
  echo "    Environment=DEVBRIDGE_TOKEN=<gateway.auth.token 과 동일한 값>"
  echo "  설정 후: sudo systemctl daemon-reload && sudo systemctl restart devbridge"
  echo "---"
else
  echo "gateway.auth.token 을 읽지 못했습니다. openclaw.json 을 확인하세요."
fi

# OpenClaw 재시작(설정 리로드)
systemctl --user restart openclaw 2>/dev/null || true
echo "OpenClaw 재시작 시도 완료 (--user). systemd 사용 시 서비스명에 맞게 restart 하세요."
'

if [[ "${1:-}" == "--local" ]]; then
  echo "=== 로컬에서 실행 (서버가 이 머신인 경우) ==="
  cd "$REPO_DIR" && eval "$REMOTE_SCRIPT"
else
  echo "=== 서버 $SERVER 에서 설정 적용 ==="
  run_on_server "$REMOTE_SCRIPT"
fi

echo ""
echo "끝. 김빌드에게 /devstatus 로 확인하세요."
