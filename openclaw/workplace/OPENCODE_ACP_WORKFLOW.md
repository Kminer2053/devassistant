# OpenCode ACP 워크플로 (스킬 기반)

김빌드가 OpenCode를 **exec**(백그라운드) + **process**(write/poll)로 JSON-RPC 2.0 전송하여 제어하는 절차. sessions_spawn·/acp 사용 금지.

**워크스페이스 경로(서버)**: `/home/devassistant/.openclaw/workspace`

## 요약

| 동작 | 방법 |
|------|------|
| OpenCode 시작 | `exec` 로 **래퍼 명령**(아래 1단계) **background: true**, workdir: `/home/devassistant/.openclaw/workspace`. 반환 `sessionId` 저장. **바로 이어서** initialize(2단계) 전송. (stdin EOF 시 acp가 1~2초 내 종료되므로 래퍼로 stdin 유지, EOF 금지) |
| 메시지 전송 | `process.write(sessionId, data: "<json-rpc>\n")` |
| 응답 읽기 | `process.poll(sessionId)` — 2초 간격 반복 |
| 종료 | `process.kill(sessionId)` |
| 세션 목록 | `exec`: **`/home/devassistant/.opencode/bin/opencode session list`**, workdir: 위 경로 |
| 세션 재개 | 목록 확인 후 `session/load` JSON-RPC |

## 프로토콜

- **JSON-RPC 2.0**, 메시지 끝에 `\n` 필수.
- 요청마다 **message id** 0부터 순차 증가.

## 단계별 절차

### 1. OpenCode 시작

**사용할 명령(래퍼 — stdin 유지용):**

```
exec(command: "sh -c 'cat | /home/devassistant/.opencode/bin/opencode acp --port 0'", background: true, workdir: "/home/devassistant/.openclaw/workspace")
```

- **래퍼가 필요한 이유**: `opencode acp`는 stdio로 JSON-RPC를 받는다. 백그라운드 exec만 쓰면 자식 프로세스 stdin이 곧바로 닫혀 EOF가 가고, 1~2초 안에 "disposing instance"로 종료된다. **`cat | opencode acp`** 로 실행하면 process.write가 쓴 내용이 cat을 거쳐 opencode stdin으로 가고, **stdin을 닫지 않는 한** 프로세스가 유지된다.
- **절대 경로 필수**: `opencode`가 아닌 **`/home/devassistant/.opencode/bin/opencode`** 를 쓴다. OpenClaw가 systemd 등으로 기동되면 PATH에 `~/.opencode/bin`이 없을 수 있어, 경로를 생략하면 "command not found"가 난다.
- **`background: true` 필수**: exec 호출 시 **반드시** `background: true`를 포함한다.
- **process 도구**: OpenClaw 문서상, process 도구가 허용되지 않으면 exec는 background를 무시한다. `tools.deny`에 `process` 또는 `group:runtime`이 있으면 안 된다.
- **`--port 0`**: 서버에 `opencode serve`가 이미 4096을 쓰고 있어도 ACP가 별도 포트를 써서 실행되므로, "스킬로 확인/지시"가 가능하다.
- **즉시 initialize**: exec 반환 직후 **가능한 한 빨리** 2단계 initialize JSON을 `process.write(sessionId, data)`로 보낸다. 지연되면 opencode가 EOF로 착각해 종료할 수 있다.
- **EOF 금지**: 작업이 끝날 때까지 **process.write에 eof: true를 넣지 않는다.** 종료는 **process.kill(sessionId)** 로만 한다.

반환된 `sessionId`(프로세스 세션 ID)를 저장. 이후 모든 process.write/poll에 사용.

### 2. 초기화

한 줄 JSON 전송 후 poll로 응답 확인.

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true},"clientInfo":{"name":"clawdbot","title":"Clawdbot","version":"1.0.0"}}}
```

`result.protocolVersion: 1` 확인.

### 3. 세션 생성

```json
{"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":"/home/devassistant/.openclaw/workspace","mcpServers":[]}}
```

poll 후 `result.sessionId`(OpenCode 세션 ID, 예: `sess_abc123`) 저장.

### 4. 프롬프트 전송 (계획/구현 지시)

```json
{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"<위에서 받은 sessionId>","prompt":[{"type":"text","text":"계획 수립: <대표님 지시 요약>. 스펙/작업단위/리스크/검증 방법을 정리해줘."}]}}
```

또는 구현 지시:

```json
{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"<sessionId>","prompt":[{"type":"text","text":"구현: <대표님 지시 요약>"}]}}
```

### 5. 응답 수집

- `process.poll(sessionId)` 를 **2초 간격**으로 반복.
- 각 줄을 JSON 파싱: `method: "session/update"` 인 알림은 내용 수집.
- `id`가 요청과 같은 응답에서 `result.stopReason` 이 나오면 종료.
- **최대 5분**(150회 poll) 대기 후 타임아웃 시 process.kill 후 재시작 고려.

### 6. 취소 (필요 시)

```json
{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"<opencode sessionId>"}}
```

알림이므로 응답 기대하지 않음.

### 7. 종료

작업이 끝나면 `process.kill(sessionId)` 로 opencode acp 프로세스 종료.

## 상태 추적

- **processSessionId**: exec 반환 sessionId (process.write/poll/kill에 사용).
- **opencodeSessionId**: session/new 응답의 result.sessionId (session/prompt, session/load 등에 사용).
- **messageId**: 요청마다 1씩 증가 (0, 1, 2, ...).

## stopReason

| stopReason | 의미 |
|------------|------|
| end_turn | 에이전트 응답 완료 |
| cancelled | 취소됨 |
| max_tokens | 토큰 한도 도달 |

## 에러 처리

| 상황 | 조치 |
|------|------|
| **4096 포트 충돌** (opencode serve 사용 중) | 워크플로 1단계에서 **`--port 0`** 사용. 명령은 **`/home/devassistant/.opencode/bin/opencode acp --port 0`** 로 통일. |
| **command not found** (opencode) | exec 명령에 **절대 경로** 사용: **`/home/devassistant/.opencode/bin/opencode`**. PATH에 의존하지 않음. |
| **백그라운드 실행 안 됨** (동기 실행 → 즉시 종료, sessionId 없음) | 1) exec 호출에 **`background: true`** 포함했는지 확인. 2) 서버 `tools.deny`에 `process`·`group:runtime`이 있으면 **background execution is disabled**가 난다. 레포 루트에서 **`./scripts/patch_openclaw_tools_allow_on_server.sh`** 실행 후 OpenClaw 재시작. (패치가 deny에서 process/group:runtime 제거) |
| **실행 후 1~2초 내 종료** ("disposing instance", "No active session found") | **래퍼 명령** 사용: **`sh -c 'cat \| /home/devassistant/.opencode/bin/opencode acp --port 0'`**. exec 직후 **즉시** initialize(2단계)를 process.write로 보낸다. process.write에 **eof: true 사용 금지** — 종료는 process.kill만 사용. |
| **텍스트 응답 없이 멈춤** (usage/stopReason만 오고 Plan·메시지 없음) | ACP는 헤드리스라 승인 UI가 없음. 서버 OpenCode가 **permission: ask**이면 권한 요청 시 무한 대기. 레포 루트에서 **`./scripts/patch_opencode_permission_allow_on_server.sh`** 실행 → 서버 `~/.config/opencode/opencode.json`에 **permission: allow** 설정. 이후 새로 띄우는 acp 세션부터 적용. |
| **authMethods/opencode auth login 나오고 MCP 응답 없음** | TUI와 ACP는 같은 mcp-auth.json 사용. 서버에서 **`opencode mcp list`** 로 vercel이 **connected**이면 인증은 된 상태. 응답 없음은 (1) 프롬프트에 **"Vercel MCP의 ○○ 도구를 반드시 사용해 …"** 처럼 도구·동작을 구체적으로 명시, (2) permission allow 적용 여부 확인. |
| poll 빈 응답 | 계속 폴링 (에이전트 처리 중) |
| 파싱 오류 | 해당 줄 스킵 후 계속 |
| 프로세스 종료 | OpenCode 재시작(exec 다시 실행, 절대 경로 + `--port 0` 포함) |
| 5분 내 응답 없음 | process.kill 후 필요 시 새로 시작 |

## 세션 재개

1. `exec`: **`/home/devassistant/.opencode/bin/opencode session list`**, workdir: `/home/devassistant/.openclaw/workspace` 로 목록 확인.
2. OpenCode 시작(1단계) → 초기화(2단계).
3. `session/load` 전송:

```json
{"jsonrpc":"2.0","id":1,"method":"session/load","params":{"sessionId":"<선택한 ses_...>","cwd":"/home/devassistant/.openclaw/workspace","mcpServers":[]}}
```

이후 기존 대화 이어서 session/prompt 사용.

## 출력 규칙

- process.poll로 수집한 내용을 **요약**하여 대표님께 전달. 전문 붙여넣기·과도한 코드 덤프 금지. 텔레그램 약 3500자 이내.

## ACP/헤드리스 — 권한을 묻지 않고 모두 허용

OpenCode는 도구(edit, bash, MCP 등) 사용 전에 **permission** 설정에 따라 승인을 요청할 수 있다. **ACP는 터미널/UI가 없어** `ask`이면 승인할 곳이 없으므로 **멈춘 것처럼 보이고**, usage/stopReason만 오고 실제 텍스트 응답이 안 나온다.

- **해결**: 서버 전역 설정에서 **모든 권한을 승인 없이 허용**하도록 둔다.  
  `~/.config/opencode/opencode.json`에 **`"permission": "allow"`** 를 넣으면 된다.  
  레포에서 한 번 실행: **`./scripts/patch_opencode_permission_allow_on_server.sh`**  
  (기존 mcp·provider·model 등은 유지하고 permission만 allow로 덮어씀.)

## MCP 인증 — TUI는 되는데 ACP만 안 될 때 / 매번 인증?

- **같은 인증 사용**: TUI(attach to serve)와 ACP(exec로 띄운 `opencode acp`)는 **같은 사용자(devassistant)** 로 같은 전역 설정(`~/.config/opencode/opencode.json`)과 **같은 MCP 인증 파일**(`~/.local/share/opencode/mcp-auth.json`)을 씁니다. 따라서 **TUI에서 Vercel MCP가 동작하면 ACP에서도 같은 토큰이 적용됩니다.**
- **Vercel MCP는 매번 인증할 필요 없음**: OAuth 토큰은 **만료될 때만** 재인증하면 됩니다. 만료 시 서버에서 `opencode mcp auth vercel`(SSH 포트 포워딩 19876 후 브라우저에서 승인) 또는 로컬에서 인증 후 `mcp-auth.json`을 서버로 복사.
- **initialize의 authMethods**: ACP initialize 응답에 `authMethods`로 "opencode auth login"이 나와도, 이는 **지원하는 인증 방식 안내**일 수 있습니다. 실제로 미인증인지 확인하려면 **서버에서** `opencode mcp list`를 실행해 vercel이 **connected**인지 보세요. connected이면 이미 인증된 상태입니다.
- **ACP에서 도구 응답이 안 나오는 다른 원인**: (1) **모델이 도구를 호출하지 않음** — session/prompt에 "**Vercel MCP**의 프로젝트/배포 조회 도구(예: get_project, deployment 목록)를 **반드시 사용해서** 최신 배포 URL·상태를 조회한 뒤 결과만 요약해 줘"처럼 **도구 이름·동작을 구체적으로** 적기. (2) permission이 ask면 권한 대기에서 멈춤 → 위 "ACP/헤드리스 — 권한 허용" 대로 `permission: allow` 적용.

## MCP 사용 — "말을 못 알아듣는" 이유와 대응

- **OpenCode 제어 경로**: OpenCode에는 **session/prompt**로 보내는 텍스트만 전달된다. 사용하는 도구는 exec·process(write/poll/kill)·curl 등이다.
- **MCP는 설정에서 로드됨**: OpenCode가 `opencode.json`(전역/프로젝트)의 `mcp` 블록으로 Vercel 등 MCP를 연결해 두었다면, ACP 세션에서도 해당 도구는 사용 가능하다. 다만 모델이 **어떤 도구를 쓸지** 프롬프트만 보고 추론해야 하므로, 지시가 모호하면 도구를 호출하지 않을 수 있다.
- **김빌드가 할 것**: 대표님이 "Vercel MCP 써서 배포해라" 등 **특정 MCP 사용**을 요청한 경우, session/prompt 텍스트에 **반드시** 다음을 포함한다.
  - 사용할 MCP/도구 이름을 명시: 예) "**Vercel MCP**의 배포 관련 도구를 사용해 …"
  - 수행할 동작을 구체적으로: 예) "현재 프로젝트를 Vercel에 배포하고, 배포 완료 후 배포 URL을 보고해라."
  - 예시 문장: "구현: Vercel MCP를 사용해 이 프로젝트를 Vercel에 배포해라. 배포가 끝나면 배포 URL과 상태를 요약해서 보고해라."
- 이렇게 하면 OpenCode가 프롬프트에서 MCP 도구 사용을 인식하고, 연결된 Vercel MCP를 실제로 호출할 가능성이 높아진다.

### GitHub MCP (Vertex-safe)

- **연결**: OpenCode `opencode.json`의 `mcp.github`가 `type: "remote", url: "http://127.0.0.1:5050/mcp"` 로 설정되어 있으면, PR·이슈·파일 조회/생성 등 GitHub 도구를 쓸 수 있다.
- **김빌드가 할 것**: 대표님이 "GitHub PR 목록 조회해줘", "이 레포 이슈 만들어줘" 등 **GitHub 관련** 요청을 했으면, session/prompt에 **GitHub MCP와 동작을 명시**한다.
  - 예: "**GitHub MCP**의 `github_list_pull_requests` 도구를 사용해 owner=○○, repo=○○ 저장소의 열린 PR 목록을 조회한 뒤 결과만 요약해 줘."
  - 예: "**GitHub MCP**를 사용해 devassistant 레포에 '작업 정리' 제목으로 이슈 하나 생성해 줘."
- 툴 이름: `github_list_pull_requests`, `github_get_pull_request`, `github_get_pull_request_diff`, `github_create_comment`, `github_create_pull_request`, `github_list_issues`, `github_create_issue`, `github_get_file_contents`, `github_create_or_update_file`.
