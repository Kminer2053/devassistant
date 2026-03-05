#!/usr/bin/env bash
# TUI API 연결·응답 형식 확인. 대기 중인 TUI 요청이 없으면 request: null 이 나오는 것이 정상.
# 사용: DEVBRIDGE_TOKEN=<토큰> [DEVBRIDGE_URL=http://127.0.0.1:8080] ./scripts/verify_tui_api.sh
# 서버에서: SSH로 들어가서 동일하게 실행하거나, 로컬에서 SSH로 원격 curl 실행.

set -e
BASE="${DEVBRIDGE_URL:-http://127.0.0.1:8080}"
TOKEN="${DEVBRIDGE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "DEVBRIDGE_TOKEN이 비어 있습니다. export DEVBRIDGE_TOKEN=<토큰> 후 다시 실행하세요."
  echo "서버 OpenClaw gateway.auth.token 값과 동일한 토큰을 사용하세요."
  exit 1
fi

echo "=== TUI API 확인 ($BASE) ==="
echo "1. GET /v1/opencode/tui/next (타임아웃 5초)"
RESP=$(curl -s -m 5 -H "X-DevBridge-Token: $TOKEN" "$BASE/v1/opencode/tui/next" || true)
if [ -z "$RESP" ]; then
  echo "   응답 없음 (타임아웃 또는 OpenCode TUI 쪽 지연). OpenCode serve가 떠 있는지 확인하세요."
  exit 1
fi

if echo "$RESP" | jq -e '.request == null' >/dev/null 2>&1; then
  echo "   OK: 200, 대기 중인 TUI 요청 없음 (정상)."
  echo "   TUI 요청을 만들려면: plan/build 실행 후 권한 요청이 나오는 작업(예: 터미널 명령 실행)을 하세요."
elif echo "$RESP" | jq -e '.request' >/dev/null 2>&1; then
  echo "   OK: 200, TUI 요청 있음:"
  echo "$RESP" | jq '.request'
  echo "   응답 제출: curl -X POST -H \"X-DevBridge-Token: \$TOKEN\" -H \"Content-Type: application/json\" -d '{\"response\": \"once\"}' $BASE/v1/opencode/tui/response"
else
  echo "   응답: $RESP"
  if echo "$RESP" | jq -e '.error' >/dev/null 2>&1; then
    echo "   오류 응답입니다. DevBridge/OpenCode 로그를 확인하세요."
    exit 1
  fi
fi
echo "완료."
