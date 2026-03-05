#!/usr/bin/env bash
# E2E: PTY 백엔드 전용 API 검증 (GET status/activity/session-events, POST plan, execute status 등)
# 사용: DEVBRIDGE_TOKEN=<token> DEVBRIDGE_URL=http://127.0.0.1:8080 ./scripts/e2e-pty-api.sh
# 전제: DevBridge 기동, DEVBRIDGE_OPENCODE_BACKEND=pty 또는 미설정. opencode CLI는 PATH에 있으면 /plan 동작.

set -e
BASE_URL="${DEVBRIDGE_URL:-http://127.0.0.1:8080}"
TOKEN="${DEVBRIDGE_TOKEN:-}"
CHANNEL="${E2E_CHANNEL_KEY:-e2e:pty}"

if [ -z "$TOKEN" ]; then
  echo "DEVBRIDGE_TOKEN이 비어 있습니다. export DEVBRIDGE_TOKEN=<token> 후 다시 실행하세요."
  exit 1
fi

FAIL=0

check_get() {
  local name="$1"
  local path="$2"
  local expect_status="${3:-200}"
  res=$(curl -s -w "\n%{http_code}" -H "X-DevBridge-Token: $TOKEN" "$BASE_URL$path")
  body=$(echo "$res" | head -n -1)
  code=$(echo "$res" | tail -n 1)
  if [ "$code" != "$expect_status" ]; then
    echo "  $name: FAIL (HTTP $code, expected $expect_status)" >&2
    echo "$body" | head -5 >&2
    FAIL=1
    echo ""
    return 1
  fi
  echo "  $name: OK (HTTP $code)" >&2
  echo "$body"
  return 0
}

check_jq() {
  local json="$1"
  local jq_expr="$2"
  local desc="$3"
  if ! echo "$json" | jq -e "$jq_expr" >/dev/null 2>&1; then
    echo "  FAIL: $desc (jq $jq_expr)"
    FAIL=1
    return 1
  fi
  return 0
}

echo "=== 1) GET /v1/status ==="
STATUS_BODY=$(check_get "GET /v1/status" "/v1/status?channelKey=$CHANNEL")
check_jq "$STATUS_BODY" ".channelKey" "status has channelKey"
check_jq "$STATUS_BODY" ".recentRuns" "status has recentRuns"

echo ""
echo "=== 2) GET /v1/opencode/session-activity (세션 없을 수 있음) ==="
ACTIVITY_BODY=$(check_get "GET /v1/opencode/session-activity" "/v1/opencode/session-activity?channelKey=$CHANNEL")
check_jq "$ACTIVITY_BODY" ".channelKey" "activity has channelKey"

echo ""
echo "=== 3) GET /v1/opencode/session-events ==="
EVENTS_BODY=$(check_get "GET /v1/opencode/session-events" "/v1/opencode/session-events?channelKey=$CHANNEL&limit=10")
check_jq "$EVENTS_BODY" ".channelKey" "session-events has channelKey"
check_jq "$EVENTS_BODY" ".events" "session-events has events array"

echo ""
echo "=== 4) POST /v1/plan ==="
echo -n "  POST /v1/plan: "
PLAN_RES=$(curl -s -w "\n%{http_code}" -X POST \
  -H "X-DevBridge-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channelKey\":\"$CHANNEL\",\"text\":\"e2e pty plan\"}" \
  "$BASE_URL/v1/plan")
PLAN_BODY=$(echo "$PLAN_RES" | head -n -1)
PLAN_CODE=$(echo "$PLAN_RES" | tail -n 1)
if [ "$PLAN_CODE" != "200" ]; then
  echo "FAIL (HTTP $PLAN_CODE)"
  echo "$PLAN_BODY" | head -5
  FAIL=1
else
  echo "OK (HTTP 200)"
  check_jq "$PLAN_BODY" ".sessionId" "plan has sessionId"
  check_jq "$PLAN_BODY" ".sessionId | type == \"string\"" "plan sessionId is string"
fi

echo ""
echo "=== 5) GET /v1/status after plan ==="
STATUS2_BODY=$(check_get "GET /v1/status" "/v1/status?channelKey=$CHANNEL")
check_jq "$STATUS2_BODY" ".recentRuns | length >= 0" "status has recentRuns array"

echo ""
echo "=== 6) GET /v1/approvals ==="
APPROVALS_BODY=$(check_get "GET /v1/approvals" "/v1/approvals?channelKey=$CHANNEL")
check_jq "$APPROVALS_BODY" ".channelKey" "approvals has channelKey"
check_jq "$APPROVALS_BODY" ".approvals" "approvals has approvals array"

echo ""
echo "=== 7) POST /v1/execute (상태 알려줘) ==="
echo -n "  POST /v1/execute (status): "
EXEC_RES=$(curl -s -w "\n%{http_code}" -X POST \
  -H "X-DevBridge-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channelKey\":\"$CHANNEL\",\"naturalLanguage\":\"상태 알려줘\"}" \
  "$BASE_URL/v1/execute")
EXEC_BODY=$(echo "$EXEC_RES" | head -n -1)
EXEC_CODE=$(echo "$EXEC_RES" | tail -n 1)
if [ "$EXEC_CODE" != "200" ]; then
  echo "FAIL (HTTP $EXEC_CODE)"
  echo "$EXEC_BODY" | head -5
  FAIL=1
else
  echo "OK (HTTP 200)"
  check_jq "$EXEC_BODY" ".channelKey" "execute status response has channelKey"
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo "=== E2E PTY API 시나리오 완료 (모두 통과) ==="
else
  echo "=== E2E PTY API 시나리오 완료 (일부 실패) ==="
  exit 1
fi
