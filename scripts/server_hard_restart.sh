#!/usr/bin/env bash
# 배포 후 변경 반영용: OpenClaw 서비스 강제 재시작.
# ACP 전환: DevBridge는 사용하지 않음. devbridge 인자는 무시됨.
# 사용: 서버에서 실행. 예: bash scripts/server_hard_restart.sh openclaw

set -e
SVC="${1:-openclaw}"

do_openclaw() {
  echo "=== OpenClaw 강제 재시작 ==="
  sudo systemctl stop openclaw || true
  sleep 2
  pkill -u "$(whoami)" -f openclaw-gateway 2>/dev/null || true
  pkill -u "$(whoami)" -f "openclaw gateway" 2>/dev/null || true
  sleep 2
  sudo systemctl start openclaw
  sleep 3
  sudo systemctl is-active openclaw && echo "OpenClaw active" || exit 1
}

case "$SVC" in
  openclaw)  do_openclaw ;;
  devbridge) echo "DevBridge is no longer used (ACP). Restarting OpenClaw only."; do_openclaw ;;
  both)      do_openclaw ;;
  *)
    echo "Usage: $0 openclaw|both"
    echo "  (devbridge is deprecated; both restarts OpenClaw only)"
    exit 1
    ;;
esac
