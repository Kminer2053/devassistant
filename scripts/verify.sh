#!/bin/bash
# ACP 전환: DevBridge 검증 제거. OpenClaw 게이트웨이 및 (선택) ACP 상태만 확인.
set -e

echo "=== DevAssistant Verification (ACP) ==="
FAIL=0

# 1. OpenClaw gateway (local)
echo -n "1. OpenClaw gateway: "
if curl -sf http://127.0.0.1:18789/ >/dev/null 2>&1 || curl -sf http://127.0.0.1:18789/api/health >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL or not running (use SSH tunnel: ssh -L 18789:127.0.0.1:18789 user@host)"
  FAIL=1
fi

# 2. ACP/acpx 검증은 채팅에서 /acp doctor 실행 또는 openclaw doctor 로 확인
echo "2. ACP: 채팅에서 /acp doctor 또는 서버에서 'openclaw doctor' 실행으로 확인"

if [ $FAIL -eq 0 ]; then
  echo "=== Critical checks passed ==="
else
  echo "=== Some checks failed ==="
  exit 1
fi
