#!/usr/bin/env bash
# E2E: 자연어 한 문장 → POST /v1/execute → 응답 검증
# 사용: DEVBRIDGE_TOKEN=<token> DEVBRIDGE_URL=http://127.0.0.1:8080 ./scripts/e2e-execute.sh
# 선택: E2E_CHANNEL_KEY=e2e:test, DEVBRIDGE_OPENCODE_BACKEND=pty|opencode
# DevBridge 서버가 떠 있어야 함. OpenCode가 없어도 의도 분류·status 등은 동작함.

set -e
BASE_URL="${DEVBRIDGE_URL:-http://127.0.0.1:8080}"
TOKEN="${DEVBRIDGE_TOKEN:-}"
CHANNEL="${E2E_CHANNEL_KEY:-e2e:test}"
BACKEND="${DEVBRIDGE_OPENCODE_BACKEND:-pty}"

if [ -z "$TOKEN" ]; then
  echo "DEVBRIDGE_TOKEN이 비어 있습니다. export DEVBRIDGE_TOKEN=<token> 후 다시 실행하세요."
  exit 1
fi

run() {
  local nl="$1"
  local expect_status="${2:-200}"
  echo "--- naturalLanguage: $nl (expect $expect_status)"
  res=$(curl -s -w "\n%{http_code}" -X POST \
    -H "X-DevBridge-Token: $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channelKey\":\"$CHANNEL\",\"naturalLanguage\":\"$nl\"}" \
    "$BASE_URL/v1/execute")
  body=$(echo "$res" | head -n -1)
  code=$(echo "$res" | tail -n 1)
  if [ "$code" != "$expect_status" ]; then
    echo "FAIL: expected HTTP $expect_status, got $code"
    echo "$body" | head -20
    return 1
  fi
  echo "OK (HTTP $code)"
  echo "$body" | head -5
  return 0
}

run_and_capture_body() {
  local nl="$1"
  local expect_status="${2:-200}"
  echo "--- naturalLanguage: $nl (expect $expect_status)"
  res=$(curl -s -w "\n%{http_code}" -X POST \
    -H "X-DevBridge-Token: $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channelKey\":\"$CHANNEL\",\"naturalLanguage\":\"$nl\"}" \
    "$BASE_URL/v1/execute")
  body=$(echo "$res" | head -n -1)
  code=$(echo "$res" | tail -n 1)
  if [ "$code" != "$expect_status" ]; then
    echo "FAIL: expected HTTP $expect_status, got $code"
    echo "$body" | head -20
    return 1
  fi
  echo "OK (HTTP $code)"
  echo "$body"
  return 0
}

echo "=== 1) 의도 불명 → 400 ==="
run "아무말아무말xyz123" 400

echo ""
echo "=== 2) 상태 요청 → 200 (status payload) ==="
run "상태 알려줘" 200

echo ""
echo "=== 3) help → 200 ==="
run "뭘 할 수 있어" 200

echo ""
echo "=== 4) 진행 상황 → 200 (activity payload) ==="
run "진행 상황 알려줘" 200

echo ""
echo "=== 5) 세션 리셋 → 200 ==="
run "리셋해줘" 200

echo ""
echo "=== 6) 프로젝트 목록 → 200 ==="
run "프로젝트 목록 알려줘" 200

echo ""
echo "=== 7) plan → 200, PTY 모드면 sessionId pty: 접두어 ==="
PLAN_BODY=$(run_and_capture_body "플랜 테스트" 200 | tail -n +2)
if ! echo "$PLAN_BODY" | jq -e '.sessionId' >/dev/null 2>&1; then
  echo "FAIL: plan response missing sessionId"
  exit 1
fi
if [ "$(echo "$BACKEND" | tr '[:upper:]' '[:lower:]')" = "pty" ]; then
  if ! echo "$PLAN_BODY" | jq -e '.sessionId | startswith("pty:")' >/dev/null 2>&1; then
    echo "FAIL: PTY backend expected sessionId to start with pty:, got: $(echo "$PLAN_BODY" | jq -r '.sessionId')"
    exit 1
  fi
  echo "OK (sessionId has pty: prefix)"
fi

echo ""
echo "=== E2E execute 시나리오 완료 ==="
