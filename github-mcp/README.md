# GitHub MCP Server (Vertex-safe)

OpenCode/Vertex/Gemini에서 사용할 수 있는 GitHub MCP 서버. 툴 스키마를 **anyOf/oneOf 없이** `type: "object"` + `properties` + `required`만 사용해 Vertex/Gemini 호환을 맞춤.

## 툴 목록

- `github_list_pull_requests` — PR 목록
- `github_get_pull_request` — PR 상세
- `github_get_pull_request_diff` — PR diff
- `github_create_comment` — 이슈/PR 코멘트 작성
- `github_create_pull_request` — PR 생성
- `github_list_issues` — 이슈 목록
- `github_create_issue` — 이슈 생성
- `github_get_file_contents` — 파일 내용 조회
- `github_create_or_update_file` — 파일 생성/수정

## 토큰 설정

GitHub API 호출을 위해 **Personal Access Token**이 필요합니다.

- 발급: [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) (Classic 또는 Fine-grained)
- 필요한 scope 예: `repo`, 이슈/PR 검색 시 `read:org` 등

### 로컬

**방법 1 — `.env` 파일 (권장)**  
프로젝트 루트에 `.env`를 만들고:

```bash
cp .env.example .env
# .env 편집: GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
```

`.env`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

**방법 2 — 환경변수**

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
npm run build && npm start
```

### 서버 (배포 후)

systemd override로 토큰 설정:

```bash
sudo mkdir -p /etc/systemd/system/github-mcp.service.d
sudo tee /etc/systemd/system/github-mcp.service.d/env.conf << 'EOF'
[Service]
Environment=GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
EOF
sudo systemctl daemon-reload
sudo systemctl restart github-mcp
```

실제 토큰 값으로 `ghp_xxxxxxxxxxxx`를 바꾸세요.

## 실행

```bash
npm ci && npm run build && npm start
```

- `GET /health` → `{ "ok": true }`
- `POST /mcp` → JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`)

## 배포 (헤드리스 서버)

레포 루트에서:

```bash
./scripts/deploy_github_mcp_server.sh
```

서버에 `GITHUB_PERSONAL_ACCESS_TOKEN`을 설정해야 함.  
`/etc/systemd/system/github-mcp.service` 또는 override에서 `Environment=GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...` 설정.

## OpenCode 연동

`~/.config/opencode/opencode.json` (또는 프로젝트 설정)의 `mcp`에:

```json
"github": {
  "type": "remote",
  "url": "http://127.0.0.1:5050/mcp"
}
```

추가 후 `opencode serve` 재시작. `opencode mcp list`로 툴 목록 확인.
