#!/usr/bin/env bash
# Vercel 프로젝트의 최근 배포 목록 조회 (당장 결과만 필요할 때)
# 사용: 레포 루트에서 .env 에 VERCEL_TOKEN 이 있으면 자동 사용.
#   ./scripts/vercel_list_deployments.sh
#   ./scripts/vercel_list_deployments.sh arcade-game-center
# 토큰 발급: https://vercel.com/account/tokens

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$REPO_DIR/.env" ] && set -a && . "$REPO_DIR/.env" && set +a
PROJECT="${1:-arcade-game-center}"
TOKEN="${VERCEL_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "VERCEL_TOKEN이 없습니다. https://vercel.com/account/tokens 에서 발급 후"
  echo "  VERCEL_TOKEN=xxx $0 $PROJECT"
  exit 1
fi

echo "=== $PROJECT 최근 배포 (최대 5건) ==="
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=$PROJECT&limit=5" | \
  jq -r '.deployments[]? | "\(.state) | \(.url // "—") | \(.createdAt) | \(.meta?.githubCommitMessage // "-")"' 2>/dev/null || \
  curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=$PROJECT&limit=5"
