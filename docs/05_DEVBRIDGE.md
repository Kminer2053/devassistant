# DevBridge API

**현재 설계**: OpenCode 제어는 **스킬(OPENCODE_ACP_WORKFLOW)**만 사용합니다. 아래 DevBridge API·execute_natural_command·PTY 내용은 **레거시/참고용**입니다.

**ACP 전환(레거시)**: 이전에는 OpenClaw 공식 ACP + acpx로 OpenCode를 제어했으며, 현재는 스킬 방식으로 전환했습니다. ACP 설정 참고는 [05_ACP_OPENCODE.md](05_ACP_OPENCODE.md) 상단(스킬) 및 본문(레거시 acpx)을 참고하세요.

---

DevBridge는 (레거시) OpenClaw와 OpenCode 사이의 통제/세션/승인/로그를 담당하는 API 서버입니다.

## 개요

- **바인딩**: 127.0.0.1:8080
- **인증**: `X-DevBridge-Token` 헤더 (환경변수 `DEVBRIDGE_TOKEN`).  
  **OpenClaw와 동일한 토큰**을 쓰려면: OpenClaw `gateway.auth.token` 값을 그대로 `DEVBRIDGE_TOKEN`으로 두면 되고, OpenClaw 플러그인은 `devbridgeToken`을 넣지 않으면 자동으로 `gateway.auth.token`을 사용한다.
- **OpenCode 연동**: 기본값은 **PTY** 백엔드(`opencode attach`). HTTP API 사용 시 `DEVBRIDGE_OPENCODE_BACKEND=opencode` 및 OpenCode serve(127.0.0.1:4096, Basic Auth) 필요.

## 엔드포인트 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | /health | 서비스 상태 |
| GET | /v1/projects | 프로젝트 목록 |
| POST | /v1/projects | 프로젝트 생성 |
| POST | /v1/projects/:id/select | 채널에 프로젝트 선택 |
| POST | /v1/plan | 계획 수립 |
| POST | /v1/build | 수정 진행 |
| GET | /v1/status | 상태 조회 |
| GET | /v1/diff | 변경 요약 |
| GET | /v1/approvals | 승인 대기 목록 |
| POST | /v1/approvals/:approvalId | 승인/거절 |
| POST | /v1/apply | 커밋/푸시/PR 적용 |
| **POST** | **/v1/execute** | **자연어 한 문장 → 의도 분류 후 해당 명령 실행(plan/build/status/activity 등)** |
| POST | /v1/opencode/session-reset | 채널용 OpenCode 세션 새로 생성 |
| POST | /v1/opencode/session-abort | 현재 채널 OpenCode 세션 실행 중단 |
| GET | /v1/opencode/session-activity | 이 채널 세션 진행 상황(메시지·TODO·최근 이벤트) |
| GET | /v1/opencode/session-status | **PTY 전용**: 현재 TUI 상태(inferredTab, lastSentMode). 김빌드가 상황 파악 후 적절한 키입력 결정용 |
| GET | /v1/opencode/pty-screen | **PTY 전용**: TUI 화면(버퍼) 최근 N줄. `format=image` 시 PNG base64 반환(이미지 스크린샷) |
| GET | /v1/opencode/pending-user-input | 이 채널의 OpenCode가 사용자 입력 대기 중인지·마지막 assistant 메시지 조회(김빌드용) |
| GET | /v1/opencode/session-events | 이 채널 세션 최근 이벤트(TUI 수준, 세션별 버퍼) |
| GET | /v1/opencode/live | OpenCode 실시간 이벤트 스트림(SSE) 프록시 |
| **GET** | **/v1/opencode/tui/next** | **TUI 드라이버: 다음 TUI 요청(승인·프롬프트 등) 가져오기. query: directory(optional)** |
| **POST** | **/v1/opencode/tui/response** | **TUI 드라이버: TUI 요청에 대한 응답 제출. body: { response, directory? }** |
| POST | /v1/handoff | 김빌드→OpenCode 자유 형식 자연어 전달 |

---

## DevBridge 사양 (역할·에러·자연어 매핑)

### 담당 역할

- **채널↔세션**: `channelKey` 단위로 OpenCode 세션을 연결·유지. `channel_context` 테이블에 `opencode_session_id` 저장.
- **실행**: `/v1/plan`, `/v1/build`, `/v1/handoff` 등으로 OpenCode에 메시지 전달. OpenCode SDK(`@opencode-ai/sdk`)로 세션 생성·메시지·에이전트·승인·shell 호출.
- **승인**: OpenCode 권한 요청 시 `approvals` 테이블에 기록. `/v1/approvals`, `/v1/approvals/:id`로 조회·승인/거절 후 OpenCode `session/permissions/:id` 응답.
- **로그**: `runs` 테이블에 plan/build 실행·상태·실패 시 `summary`에 에러 요약 저장. `/v1/status`에서 최근 실행·실패 요약 노출.

### OpenCode API 대응

| DevBridge 동작 | OpenCode API(SDK) |
|----------------|-------------------|
| 세션 생성 | `session.create` |
| 메시지 전송(plan/build/handoff) | `session.prompt` / `session.prompt_async` (body: parts, system, model: { providerID, modelID }) |
| 세션 조회/목록/상태/메시지/TODO | `session.get`, `session.list`, `session.status`, `session.messages`, `session.todo` |
| 세션 중단 | `session.abort` |
| diff | `session.diff` |
| shell | `session.shell` |
| 승인 응답 | `postSessionIdPermissionsPermissionId` (body: response: "once" \| "always" \| "reject") |
| 에이전트 목록 | `app.agents` |
| health | `GET /global/health` (SDK에 없어 직접 fetch) |
| 이벤트 스트림 | `GET /event` (getEventStreamOptions()로 URL·Basic Auth 헤더 반환) |
| TUI 제어(다음 요청/응답) | `GET /tui/control/next`, `POST /tui/control/response` (OpenCode serve 내장) |

### TUI 드라이버 모드 (방안 A)

김빌드(오픈클로)가 OpenCode TUI를 **직접 보고 제어**하는 구조로 확장하기 위해, OpenCode serve에 이미 있는 TUI 제어 API를 DevBridge·플러그인을 통해 노출한다.

- **역할 구분**:
  - **기존 DevBridge API**: 세션·메시지·승인·plan/build 트리거. 채널↔세션 매핑, `approvals` DB 경유 승인.
  - **TUI 드라이버**: `GET /v1/opencode/tui/next` → 다음 TUI 요청(승인·프롬프트 등) 가져오기. `POST /v1/opencode/tui/response` → 김빌드가 결정한 응답 제출.
- **이벤트/상태 연계**: `GET /v1/opencode/session-activity` 응답에 `tuiRequest` 필드를 포함. 세션 진행 상황과 TUI 대기 요청을 함께 조회 가능.
- **김빌드 도구**: `opencode_tui_get_next`, `opencode_tui_submit_response` (플러그인에 등록). 김빌드가 TUI 요청을 감지하고, 사용자 확인 후 응답을 제출하는 흐름에 사용.

OpenCode serve 유지, 기존 배포·인증 구조 재사용. "보기"는 이벤트·메시지 기반 요약이며, 실제 TUI 픽셀/ANSI는 아니다.

### PTY 백엔드 (기본값, 방안 B)

- **환경변수**: `DEVBRIDGE_OPENCODE_BACKEND=pty`(기본) | `opencode`(HTTP API)
- **pty(기본)**: 채널별로 `opencode attach <OPENCODE_BASE_URL>` PTY를 띄우고, `/plan`·`/build`·handoff·session-reset/abort·apply 등은 PTY에 한 줄 입력으로 전달. status/activity/approvals는 PTY 출력 버퍼 파싱으로 제공. **OpenCode serve는 선택**이며, attach 대상 URL(`OPENCODE_BASE_URL`, 기본 127.0.0.1:4096)이 있으면 해당 서버에 붙고, 없으면 로컬 `opencode` CLI만 사용하는 구성도 가능.
- **opencode**: 기존처럼 OpenCode HTTP API(세션·메시지·승인·shell 등) 사용. 이때만 OpenCode serve(127.0.0.1:4096) 필수.
- PTY 모드에서는 OpenCode 이벤트 스트림(SSE) 구독을 하지 않으며, `/v1/opencode/session-events`는 PTY 버퍼를 이벤트 형태로 반환한다.

#### TUI 작동 확인

1. **전제**: OpenCode serve(127.0.0.1:4096), DevBridge(8080) 실행 중, `DEVBRIDGE_TOKEN`(또는 OpenClaw `gateway.auth.token`) 설정됨.
2. **API 연결만 확인**:  
   `GET /v1/opencode/tui/next` 에 `X-DevBridge-Token` 헤더로 요청 → **200** + `{ "request": null }` 이면 정상(대기 중인 TUI 요청 없음).  
   스크립트: `DEVBRIDGE_TOKEN=<토큰> ./scripts/verify_tui_api.sh`
3. **TUI 요청이 생기게 하려면**:  
   plan 또는 build를 실행한 뒤, **권한 요청**이 나오는 작업을 하면 된다. 예: "터미널에서 `ls` 실행해줘"처럼 shell 실행이 필요한 지시를 보내면 OpenCode가 permission을 요청하고, 그때 `GET /v1/opencode/tui/next`를 다시 호출하면 `request`에 `path`/`body`가 채워진 객체가 온다.
4. **응답 제출**:  
   `POST /v1/opencode/tui/response` Body: `{ "response": "once" }` (또는 요청 타입에 맞는 값). 승인 시 `"once"` / `"always"`, 거절 시 `"reject"` 등.

### POST /v1/execute (자연어 단일 진입점)

- **Body**: `{ "channelKey": string, "naturalLanguage": string }`
- **동작**: 서버에서 키워드 기반 의도 분류(`intent.ts`의 `matchIntent`) 후 plan / build / status / activity / diff / apply / handoff / session-reset / session-abort / approvals / project / help 중 하나로 라우팅하여, 해당 내부 로직(기존 `/v1/plan`, `/v1/build` 등과 동일) 실행. **approve/deny**는 execute로 호출 시 실제 승인/거절을 수행하지 않고, status와 함께 "승인 ID를 지정해 /approve·/deny로 호출하라"는 안내만 반환한다.
- **성공**: 200, 본문은 라우팅된 명령의 응답 형태(예: plan이면 `{ ok, sessionId, summary, nextAction }`, status면 `/v1/status`와 동일한 payload).  
  - plan/build 는 OpenCode에 **비동기 메시지를 등록**하고, summary에는 \"요청을 접수했고 /activity 에서 진행 상황을 보라\"는 안내 문구가 들어간다.
- **의도 불명**: 400, `{ "error": "의도를 알 수 없습니다.", "message": "...", "hint": "..." }`
- **실행 실패**: 502, `{ "error": "...", "details": "...", "intent"?: "..." }`

### 자연어 → 명령 매핑 규칙

의도 매칭 키워드(플러그인 `commands.ts`와 동일하게 `devbridge/src/intent.ts`에 정의):

- **plan**: 계획, 플랜, plan, 설계, 기획, 할 일 정리
- **build**: 구현, 빌드, build, 다음 단계, 시작해, 진행해, 일 시켜, 실행해, 플랜대로, 계획대로, …
- **status**: 상태, status, 연결, 에이전트, 뭐 해, 뭐하냐, 오픈코드 상태, devbridge, 확인해, 알려줘, …
- **activity**: 진행, activity, todo, 메시지, 작업 중, 진행 상황, …
- **diff**: 변경, diff, 수정된 파일, 뭐 바뀌었, 차이
- **handoff**: 전달, handoff, 오픈코드한테, 팀에 말해, 이렇게 해줘
- **session-reset**: 세션 새로, 리셋, reset, 다시 시작, 새 세션
- **session-abort**: 중단, abort, 그만, 취소, 멈춰
- **approvals / approve / deny / project / help**: 해당 키워드로 매칭 후 동일 명령 실행 또는 안내 응답.

### 에러·상태 규칙 (일관 적용)

- **실패 시**  
  - **상태 저장**: plan/build 등 `runs`를 쓰는 엔드포인트는 실패 시 `runs.status = 'failed'`, `runs.summary = 에러 메시지(최대 500자)` 저장.  
  - **로깅**: `req.log.error({ err, context })` 로 서버 로그에 기록.  
  - **클라이언트 응답**: 502(또는 404) + JSON `{ "error": "한 줄 요약", "details": "상세 메시지", ... }`.
- **모든 엔드포인트**: 예외 발생 시 위 패턴(상태 저장 가능 시 저장 + 로그 + 5xx/4xx + JSON body)을 따르도록 유지.

### E2E 시나리오 테스트

자연어 한 문장 → `POST /v1/execute` → 응답 검증 스크립트:

```bash
# DevBridge 서버 기동 후
cd devbridge
export DEVBRIDGE_TOKEN=<토큰>
./scripts/e2e-execute.sh
```

- 의도 불명 문장 → 400
- "상태 알려줘" → 200 + status payload
- "뭘 할 수 있어" → 200 + help 메시지
- "진행 상황 알려줘" → 200 (activity), "리셋해줘" → 200 (session-reset), "프로젝트 목록 알려줘" → 200 (project)
- plan 호출 시 PTY 백엔드면 `sessionId`가 `pty:` 접두어인지 검사

OpenCode가 떠 있지 않아도 의도 분류·status·help 등은 동작한다. plan/build 비동기 플로우까지 검증하려면 OpenCode를 띄운 뒤 `"arcade-game-center의 Phase 1 진단 고도화를 진행해줘"` 같은 문장으로 호출한 다음, 같은 `channelKey`에 대해 `/devstatus`·`/activity`를 호출해 최근 실행 요약과 진행 타임라인이 의도대로 표시되는지 확인하면 된다.

### 테스트 및 검증

**자동 스크립트**

| 스크립트 | 위치 | 용도 |
|----------|------|------|
| e2e-execute.sh | devbridge/scripts/e2e-execute.sh | 자연어 → /v1/execute 의도별 200 검증 (status, help, activity, session-reset, project, plan). `E2E_CHANNEL_KEY`, `DEVBRIDGE_OPENCODE_BACKEND` 선택 가능. |
| e2e-pty-api.sh | devbridge/scripts/e2e-pty-api.sh | PTY 백엔드 전용: GET /v1/status, /v1/opencode/session-activity, /v1/opencode/session-events, POST /v1/plan, /v1/approvals, POST /v1/execute(상태). |
| verify.sh | scripts/verify.sh | 전체 연동 검증: DevBridge health, OpenClaw gateway, /plan, /diff. **PTY 모드**(`DEVBRIDGE_OPENCODE_BACKEND=pty` 또는 미설정)일 때 OpenCode health는 스킵. **HTTP 모드**(`DEVBRIDGE_OPENCODE_BACKEND=opencode`)일 때 OpenCode health 필수. |

실행 예:

```bash
export DEVBRIDGE_TOKEN=<토큰>
# execute E2E (기본 PTY 백엔드)
./devbridge/scripts/e2e-execute.sh
# PTY API 전용
./devbridge/scripts/e2e-pty-api.sh
# 전체 검증 (PTY면 OpenCode health 스킵)
./scripts/verify.sh
# HTTP 백엔드로 검증 시
DEVBRIDGE_OPENCODE_BACKEND=opencode ./scripts/verify.sh
```

**수동 시나리오 체크리스트**

1. **PTY 기본값**: DevBridge만 `npm run start` (백엔드 미설정) → 기동 시 event subscriber 미기동(로그에 OpenCode SSE 구독 없음).
2. **/plan → /activity**: 같은 channelKey로 POST /v1/plan → GET /v1/opencode/session-activity → 200, `sessionId`가 `pty:...`, `messages` 또는 `recentEvents`에 PTY 출력 반영.
3. **session-events**: GET /v1/opencode/session-events?channelKey=... → `events` 배열, type `pty-line`, summary에 한 줄 텍스트.
4. **승인 플로우**: /build로 권한 필요한 작업 유도 → GET /v1/approvals → POST /v1/approvals/:id (decision approve/deny) → pending 1건 조회 및 처리.
5. **session-reset / abort**: POST /v1/opencode/session-reset, POST /v1/opencode/session-abort → 200, PTY 프로세스 정리.
6. **HTTP 모드**: `DEVBRIDGE_OPENCODE_BACKEND=opencode`로 기동, OpenCode serve 필수 → verify.sh 전체 통과, /plan 시 HTTP 세션 ID 형태.

---

## 예시 요청/응답

### GET /health

```bash
curl -H "X-DevBridge-Token: <token>" http://127.0.0.1:8080/health
```

```json
{"ok":true,"opencodeConnected":true}
```

### POST /v1/projects

```bash
curl -X POST -H "X-DevBridge-Token: <token>" -H "Content-Type: application/json" \
  -d '{"name":"my-app","localPath":"/srv/repos/my-app","repoUrl":"https://github.com/user/repo.git","defaultBranch":"main"}' \
  http://127.0.0.1:8080/v1/projects
```

### POST /v1/plan

```bash
curl -X POST -H "X-DevBridge-Token: <token>" -H "Content-Type: application/json" \
  -d '{"channelKey":"tg:user123","projectId":"1","text":"로그인 기능 추가"}' \
  http://127.0.0.1:8080/v1/plan
```

- **현재 동작**: OpenCode에 plan 요청을 **비동기**로 등록하고, 즉시 `{ ok, sessionId, summary, nextAction }` 을 반환한다.  
  - summary: \"Plan 요청을 OpenCode에 전달했습니다. /activity에서 진행 상황을 확인해 주세요.\"  
  - 실제 계획 내용과 후속 메시지는 OpenCode 세션에 쌓이며, `/devstatus`·`/activity` 로 확인한다.

### GET /v1/status

채널별 DevBridge·OpenCode 상태를 한 번에 반환한다. 김빌드(OpenClaw) 모니터링용.

- **channelKey**, **context**, **recentRuns**
- **pendingApprovals**: 승인 대기 목록(있을 때만)
- **opencodeHealth**: OpenCode 연결 여부·버전
- **opencodeAgents**: 에이전트 명부(역할·모델)
- **opencodeSession**: 현재 세션 요약
- **opencodeSessionRunning**: 세션 실행 중 여부
- **opencodeSessionMessages**: 최근 메시지(최대 5)
- **opencodeSessionTodo**: 세션 TODO 목록

```bash
curl -H "X-DevBridge-Token: <token>" "http://127.0.0.1:8080/v1/status?channelKey=tg:user123"
```

### POST /v1/opencode/session-reset

Body: `{ "channelKey": "tg:user123" }`. 해당 채널에 새 OpenCode 세션을 생성해 연결한다.

### POST /v1/opencode/session-abort

Body: `{ "channelKey": "tg:user123" }`. 해당 채널의 OpenCode 세션에서 실행 중인 작업을 중단한다(세션 자체는 유지).

### OpenCode 진행 상황 보기 (서버에 붙어서 보기)

OpenCode가 뭘 하고 있는지 보고 싶을 때 사용한다.

**`/devstatus`·`/activity`는 슬래시 명령이 아님**: 이 문자열들은 플러그인에서 슬래시로 등록되지 않고, **김빌드(에이전트)에게 전달되는 사용자 메시지**이다. 김빌드는 동일한 DevBridge API(GET /v1/status, GET /v1/opencode/session-activity)를 호출해 **전체 데이터**를 받은 뒤, 텔레그램 허용 분량(3500자) 이내로 **이해 기반 요약**을 작성해 응답한다.

1. **김빌드에게 물어보기**  
   - **`/devstatus`** (또는 "상태 알려줘" 등): 김빌드가 `devbridge_status` 도구로 GET /v1/status를 호출하고, 받은 전체 내용을 바탕으로 **요약**해 보여 준다.
   - **`/activity`** (또는 "진행 상황 알려줘" 등): 김빌드가 `opencode_activity` 도구로 GET /v1/opencode/session-activity를 호출하고, 받은 전체 내용을 바탕으로 **요약**해 보여 준다.

2. **API로 폴링**  
   `GET /v1/opencode/session-activity?channelKey=...` (헤더에 `X-DevBridge-Token` 필요).  
   응답: `sessionId`, `session`(title, updatedAt 등), `running`, `messages`(최근 60개), `todo`, `recentEvents`(최근 30개, session.status, session.error, todo.updated 등 TUI에서 보이는 이벤트). 주기적으로 호출하면 진행 상황을 확인할 수 있다.

   `GET /v1/opencode/session-events?channelKey=...&limit=50`  
   이벤트만 조회할 때 사용. DevBridge가 OpenCode `GET /event`를 구독해 세션별로 버퍼링한 최근 이벤트를 반환한다. `limit`(기본 50, 최대 200)로 조회 개수 지정.

3. **실시간 이벤트 스트림(SSE)**  
   서버에 SSH 접속한 뒤, 같은 서버에서:
   ```bash
   curl -N -H "X-DevBridge-Token: <token>" \
     "http://127.0.0.1:8080/v1/opencode/live?channelKey=<채널키>"
   ```
   OpenCode 서버의 이벤트 스트림이 그대로 넘어온다. 터미널에 실시간으로 이벤트가 찍힌다. (연결을 유지하려면 `-N` 옵션 필수.)

4. **서버 로그로 보기**  
   OpenCode가 systemd로 돌아가는 서버라면:
   ```bash
   ssh user@server
   journalctl -u opencode -f
   ```
   로 실시간 로그를 본다. LLM 호출·에러·권한 요청 등이 찍힌다.

5. **OpenCode 실행 화면(TUI)으로 보기**  
   서버에 SSH로 붙어서 **이미 떠 있는** `opencode serve`에 TUI를 **attach** 하면 실행 화면을 볼 수 있다.
   ```bash
   ssh user@server
   opencode attach http://127.0.0.1:4096
   ```
   - `opencode attach` 가 기존 서버에 붙는 명령이다. (`--hostname`/`--port` 는 TUI가 자기 서버를 listen 할 때 쓰는 옵션이라, 기동 중인 serve 에 붙을 때는 쓰지 않는다.)
   - **서버에 비밀번호를 설정해 두었다면** attach 할 때도 같은 비밀번호가 필요하다: `OPENCODE_SERVER_PASSWORD='<비밀번호>' opencode attach http://127.0.0.1:4096`  
     (비밀번호 없이 실행하면 연결만 시도하다가 아무 출력 없이 멈춰 보일 수 있음.)
   - 포트는 실제 `opencode serve` 가 쓰는 값(기본 4096)으로 맞추면 된다.

### 자연어 매칭·명령어 안내 (OpenClaw 플러그인)

DevBridge는 **슬래시 명령**(/plan, /build, /approvals 등)과 **김빌드 경유**(/devstatus, /activity는 슬래시 미등록 → 김빌드에게 메시지로 전달)를 함께 쓴다. "오픈코드 지금 뭐 해?" 같은 자연어는 **김빌드(LLM)** 로 가고, LLM이 도구를 호출해 답을 만든다. 아래처럼 쓰면 자연어와 명령을 잘 이어줄 수 있다.

1. **자연어 → 명령 제안 → 확인 → 실행**  
   - 사용자가 슬래시가 아닌 **자연어**로 입력하면, 플러그인 도구 `suggest_command`로 명령 정의(commands.ts)를 뒤져 의도에 맞는 명령을 제안한다.  
   - 김빌드가 "이런 말씀이신가요? **/devstatus** — … 맞으면 **예** 라고 보내 주세요."처럼 보여 주고, 사용자가 **예**라고 하면 `execute_devbridge_command`로 해당 명령을 실행한다. 아니면 다시 자연어로 받는다.  
   - 흐름: 자연어 입력 → suggest_command → 제안+확인 요청 → (예) execute_devbridge_command / (아니오) 1번으로.

2. **에이전트 도구(상태/진행·실행)**  
   플러그인은 아래 **에이전트 도구**를 optional 로 등록한다.  
   - **execute_natural_command** (권장): 자연어 한 문장을 그대로 DevBridge `POST /v1/execute`에 보내 의도 분류·실행을 한 번에 수행. 확인 단계 없이 한 번 호출로 완료.
   - `suggest_command`, `execute_devbridge_command`: 슬래시·확인 흐름용(제안 → 사용자 "예" → 실행).
   - `devbridge_status`, `opencode_activity`: 상태/진행 상황 조회.  
   - `opencode_tui_get_next`, `opencode_tui_submit_response`: TUI 드라이버 — OpenCode TUI 요청(승인·프롬프트 등) 조회·응답 제출.  
   **활성화**: OpenClaw 설정 `~/.openclaw/openclaw.json` 에서 에이전트가 이 도구를 쓸 수 있도록 allow 추가.
   ```json
   "tools": {
     "allow": ["execute_natural_command", "suggest_command", "execute_devbridge_command", "devbridge_status", "opencode_activity", "opencode_pending_user_input", "opencode_tui_get_next", "opencode_tui_submit_response"]
   }
   ```
   (이미 `tools.profile` 이 "coding" 이고 allow 리스트가 있다면, 위 이름들을 allow에 추가하면 된다.)

3. **/help, /명령어**  
   슬래시 명령 **/help** 또는 **/명령어** 를 쓰면 DevBridge/OpenCode 관련 명령 목록을 바로 볼 수 있다.  
   "뭘 할 수 있어?", "명령어 알려줘"라고 했을 때 LLM이 안내해 줄 수도 있고, 직접 **/명령어** 를 쳐서 확인하는 편이 확실하다.

4. **2분 넘게 응답 없을 때 (타이핑만 뜨다 끄기는 경우)**  
   OpenClaw는 응답이 2분 안에 나오지 않으면 **타이핑 표시만 끄고** 별도 메시지는 보내지 않는다.  
   이때 사용자가 할 수 있는 것:
   - **/명령어** 또는 **/help** 로 명령 목록 확인
   - **/devstatus**, **/activity** 로 상태·진행 상황 직접 조회  
   향후 OpenClaw 쪽에서 "타이핑 TTL(2분) 도달 시 안내 문구 자동 전송"(예: "잘 모르겠어요. /help 로 명령어를 확인해 보세요.")을 지원하면, 그 메시지에 위 명령어 안내를 넣을 수 있다.

### POST /v1/handoff (자연어 전달)

Body: `{ "channelKey": "tg:user123", "text": "자연어 메시지", "system?: "...", "agent?: "...", "model?: "..." }`.  
김빌드가 OpenCode 팀에 전할 말을 **자연어 그대로** 보낸다. `text`는 「김빌드 과장 전달」 접두어가 붙어 OpenCode에 전달되며, 응답 요약이 반환된다. plan/build와 별개로 질문·추가 지시·상태 요청 등에 사용.

### POST /v1/approvals/:approvalId

```bash
curl -X POST -H "X-DevBridge-Token: <token>" -H "Content-Type: application/json" \
  -d '{"decision":"approve","remember":false}' \
  http://127.0.0.1:8080/v1/approvals/123
```

### POST /v1/execute (자연어 단일 진입점)

Body: `{ "channelKey": "tg:user123", "naturalLanguage": "방금 계획한 Phase 1부터 진행해줘" }`.  
의도가 "build"로 분류되면 내부적으로 `/v1/build`와 동일한 로직 실행 후 `{ ok, runId, sessionId, summary }` 형태로 반환.

```bash
curl -X POST -H "X-DevBridge-Token: <token>" -H "Content-Type: application/json" \
  -d '{"channelKey":"tg:user123","naturalLanguage":"상태 알려줘"}' \
  http://127.0.0.1:8080/v1/execute
```
(의도가 "status"면 200 + GET /v1/status와 동일한 JSON)

### GET /v1/opencode/pending-user-input

- **Query**: `channelKey` (필수). 기존 status/activity와 동일.
- **목적**: 김빌드가 "OpenCode가 사용자 입력을 기다리는지" 및 그때의 **마지막 assistant 메시지**를 조회할 때 사용. (예: "다음으로 원하시면 1. 2. 3." 같은 선택지가 뜬 상태.)
- **응답**:
  - `hasPending: false`: 세션 없음 / 에이전트 실행 중(`running: true`) / 마지막 메시지가 user인 경우. `sessionId`만 있거나 `null`.
  - `hasPending: true`: `sessionId`, `lastAssistantMessage: { id?, text }`. `text`는 해당 메시지 본문(전체). 김빌드가 이 내용을 사용자에게 보여 주고, 사용자 답변을 `execute_natural_command` 또는 handoff로 OpenCode에 전달하면 됨.

## OpenCode 권한 요청(approval) 흐름 및 검증

OpenCode가 edit/bash 등 권한을 요청하면 `permission.asked` 이벤트가 발생하고, DevBridge가 이를 받아 승인 대기 목록에 넣는다. 사용자(또는 김빌드)가 `/approve`/`/deny`로 응답하면 DevBridge가 OpenCode에 전달한다.

### 구현 흐름

1. **OpenCode** → 권한 요청 시 `permission.asked` 이벤트 발생. DevBridge는 OpenCode `GET /event` SSE를 구독해 수신.
2. **eventBuffer** (`devbridge/src/eventBuffer.ts`): `permission.asked` 수신 시 해당 세션의 `channel_key`와 현재 `running` run을 조회한 뒤, `approvals` 테이블에 INSERT, 해당 run의 `status`를 `'awaiting_approval'`로 UPDATE.
3. **GET /v1/status**: `pendingApprovals`에 승인 대기 목록이 포함됨. 김빌드/사용자가 "승인 대기 N건"을 볼 수 있음.
4. **GET /v1/approvals**: 해당 채널의 `awaiting_approval` run에 대한 pending approval 목록(id, kind 등) 반환.
5. **POST /v1/approvals/:approvalId**: `decision: approve | deny` 수신 시 `respondPermission(sessionId, permissionId, decision)` 호출 → OpenCode SDK `postSessionIdPermissionsPermissionId`로 승인/거절 전달. 이후 `approvals.status` 및 run의 `status`(approve 시 `running`, deny 시 `denied`) 업데이트.

### 확인 및 테스트 절차

1. **준비**: 동일 채널(예: telegram:USER_ID)에서 OpenCode 세션이 있고, build가 "running"인 상태.
2. **트리거**: edit 또는 bash 권한이 필요한 작업을 OpenCode가 수행하도록 해서 `permission.asked`가 발생하게 함. (예: /build로 "파일 하나 수정해줘" 요청)
3. **확인 1**: 김빌드에게 "상태 알려줘" 또는 GET /v1/status로 조회 시 "승인 대기 N건"이 보이는지 확인.
4. **확인 2**: `/approvals`(또는 GET /v1/approvals?channelKey=...)로 pending approval id 확인.
5. **확인 3**: `/approve <id>`(또는 POST /v1/approvals/:id with body `{"decision":"approve","remember":false}`) 호출 후, run 상태가 다시 running으로 바뀌고 OpenCode가 해당 권한으로 진행하는지 확인.
6. **확인 4**: (선택) 동일하게 권한 요청이 뜬 뒤 `/deny <id>`로 거절 시 run이 denied로 바뀌는지 확인.

단위 확인이 필요하면: DevBridge 로그에서 `permission.asked` 수신 시점, DB에서 `approvals` 행 추가·`runs.status` 변경 여부를 확인하면 된다.

## 장애 대응

### OpenCode 연결 실패

- 증상: `opencodeConnected: false` 또는 503
- 조치:
  1. `systemctl status opencode` 확인
  2. `curl -u opencode:<pw> http://127.0.0.1:4096/global/health` 확인
  3. `journalctl -u opencode -n 50` 로그 확인

### 인증 실패 (401)

- `X-DevBridge-Token` 값이 환경변수 `DEVBRIDGE_TOKEN`과 일치하는지 확인
- OpenClaw 플러그인 config의 `devbridgeToken`과 동일한지 확인

### "DevBridge token not configured" (OpenClaw에서 /devstatus 등 호출 시)

김빌드(OpenClaw)가 DevBridge를 부를 때 **토큰이 없어서** 나는 메시지다.

1. **DevBridge 서버**에서 사용할 토큰 정하기  
   예: `openssl rand -hex 24` 로 생성. 이 값을 **DevBridge** 쪽에 넣고, **OpenClaw** 쪽에도 똑같이 넣어야 한다.
2. **DevBridge**가 이 토큰을 쓰도록 설정  
   - systemd로 띄운 경우: unit 또는 override에 `Environment=DEVBRIDGE_TOKEN=<위에서_정한_값>`  
   - 직접 실행 시: `DEVBRIDGE_TOKEN=<값> node ...` 또는 `.env` 에 `DEVBRIDGE_TOKEN=...`
3. **OpenClaw** 플러그인에 같은 토큰 넣기  
   **방법 A (권장)**  
   OpenClaw **게이트웨이 토큰**(`gateway.auth.token`)과 DevBridge `DEVBRIDGE_TOKEN`을 **동일한 값**으로 두고, `plugins.entries.devbridge.config` 에는 **`devbridgeToken`을 넣지 않는다**.  
   플러그인이 자동으로 `gateway.auth.token`을 사용한다.  
   **방법 B**  
   OpenClaw가 돌아가는 서버의 **`~/.openclaw/openclaw.json`** 에서 `devbridgeToken`을 2번과 동일한 값으로 명시:
   ```json
   "plugins": {
     "entries": {
       "devbridge": {
         "enabled": true,
         "config": {
           "devbridgeUrl": "http://127.0.0.1:8080",
           "devbridgeToken": "<2번과_동일한_값>"
         }
       }
     }
   }
   ```
   저장 후 OpenClaw 재시작(또는 설정 리로드). 이후 `/devstatus` 등이 동작해야 한다.

### 세션 없음 / 프로젝트 없음

- 해당 `channelKey`로 `POST /v1/projects/:id/select`를 먼저 호출했는지 확인
- `/plan` 또는 `/build` 전에 프로젝트 선택 필수

### 권한 요청 대기

- `/build` 실행 중 edit/bash 권한 요청 시 `runs`의 `status`가 `awaiting_approval`
- `GET /v1/approvals?channelKey=...`로 대기 중인 항목 확인
- `POST /v1/approvals/:id`로 approve/deny 처리

### /build 실패 (runs 상태가 failed)

- **원인 확인**: 배포된 DevBridge는 실패 시 `runs.summary`에 에러 메시지를 저장하고, `/devstatus` 최근 실행에 `→ 에러 요약`이 붙어 나온다. 서버에서 `journalctl -u devbridge -n 50`으로 `build: OpenCode 지시 전달 실패` 로그를 보면 상세 원인을 확인할 수 있다.
- **흔한 원인**  
  - **OpenCode 400 (Invalid input)**: 예전에는 `model`을 문자열로 보내서 실패. 현재는 객체 `{ providerID, modelID }`로 보내도록 수정됨.  
  - **타임아웃**: OpenCode가 build 요청 처리에 오래 걸리면 클라이언트/프록시 타임아웃으로 실패할 수 있음.  
  - **OpenCode 프로젝트/워크스페이스 미설정**: serve 모드에서 작업 디렉터리·프로젝트가 없으면 에이전트가 파일 접근 시 실패할 수 있음.  
  - **권한 거절/미처리**: edit·bash 권한을 요청했는데 승인하지 않으면 진행이 막혀 실패처럼 보일 수 있음. `/approvals`로 대기 건 확인.
