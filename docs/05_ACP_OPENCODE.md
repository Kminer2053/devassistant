# OpenClaw ACP로 OpenCode 제어

## 스킬 방식 (현재 운영)

이 레포는 **스킬 기반**으로만 운영합니다. "계획해줘", "구현해줘" 등 자연어만 보내면 김빌드가 **exec + process + JSON-RPC**로 OpenCode를 제어합니다. /acp·/focus는 사용하지 않습니다.

- **워크스페이스 경로(서버)**: `/home/devassistant/.openclaw/workspace`
- **상세 절차**: [openclaw/workplace/OPENCODE_ACP_WORKFLOW.md](../openclaw/workplace/OPENCODE_ACP_WORKFLOW.md) 참고 (exec `opencode acp --port 0`, process.write/poll, session/new·session/prompt 등).

---

## 레거시 acpx 방식 (참고용)

아래 내용은 **acpx/디스코드 바인딩** 사용 시 참고용입니다. DevBridge/PTY는 사용하지 않습니다.

### 1. 요구 사항

- OpenClaw 설치 및 게이트웨이 동작
- **OpenCode CLI** 설치 (`opencode acp` 명령 사용). OpenCode serve(4096)는 ACP stdio 모드에서는 선택 사항
- **@openclaw/acpx** 플러그인 설치

### 2. acpx 플러그인

- **OpenClaw 2026.3.x 이상**: acpx는 **스톡 플러그인**(내장)으로 포함되어 있어 별도 설치가 필요 없습니다. `openclaw plugins list`에서 "ACPX Runtime | acpx | loaded | stock:acpx" 로 보이면 됩니다.
- **그 이전 버전** 또는 스톡에 없을 때: `openclaw plugins install @openclaw/acpx` 로 설치한 뒤 `openclaw.json`에서 acpx를 활성화하고, ACP 블록을 추가합니다.

### 3. openclaw.json 설정

`~/.openclaw/openclaw.json`에 다음을 반영합니다. 템플릿: `infra/templates/openclaw.json`.

### 3.1 ACP 블록

```json
{
  "acp": {
    "enabled": true,
    "dispatch": { "enabled": true },
    "backend": "acpx",
    "defaultAgent": "opencode",
    "allowedAgents": ["opencode"],
    "maxConcurrentSessions": 8,
    "stream": {
      "coalesceIdleMs": 300,
      "maxChunkChars": 1200
    },
    "runtime": {
      "ttlMinutes": 120
    }
  }
}
```

### 3.2 도구 정책

- **tools.deny**에 `sessions_spawn`을 넣지 않습니다. 김빌드가 ACP로 OpenCode를 부리려면 `sessions_spawn` 호출이 허용되어야 합니다.
- 예: `"deny": ["group:automation", "sessions_send"]` (sessions_spawn은 제외)

### 3.3 플러그인

```json
{
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true,
        "config": {
          "permissionMode": "approve-all",
          "nonInteractivePermissions": "deny"
        }
      }
    }
  }
}
```

- **permissionMode**: `approve-all`(전부 허용), `approve-reads`(읽기만), `deny-all`(전부 거절)
- **nonInteractivePermissions**: `fail`(권한 프롬프트 시 세션 중단), `deny`(거절하고 계속)

ACP 세션은 비대화형이라 텔레그램에서 건별 승인/거절은 불가합니다. 설정으로만 제어됩니다.

### 4. 김빌드(에이전트) 사용 방식

- **계획/구현 요청**: **sessions_spawn** 도구 호출. `runtime: "acp"`, `agentId: "opencode"`, `task: "[대표님 지시 요약]"`
- **세션 열기**: `/acp spawn opencode --mode persistent --thread auto` (채널이 스레드 바인딩 지원 시)
- **상태/진행**: `/acp status` 결과를 요약해 보고
- **추가 지시**: `/acp steer <지시>`
- **세션 종료**: `/acp close`

워크스페이스 `TOOLS.md`, `AGENTS.md`에 상세 규칙이 있습니다.

### 5. 슬래시 명령 요약

| 명령 | 설명 |
|------|------|
| `/acp spawn opencode` | OpenCode ACP 세션 시작 (--mode persistent \| oneshot, --thread auto \| here \| off) |
| `/acp status` | 세션 상태·런타임 옵션 |
| `/acp steer <지시>` | 기존 세션에 지시 전달 |
| `/acp close` | 세션 종료 및 바인딩 해제 |
| `/acp cancel` | 현재 턴만 중단 |
| `/acp doctor` | acpx 백엔드 상태 점검 |

### 6. 텔레그램에서 ACP 사용법 (사용자 안내)

**스킬 방식**에서는 `/acp`·`/focus` 없이 **자연어만** 사용합니다. "계획해줘", "구현해줘" 등만 보내면 김빌드가 OpenCode를 실행하고 결과를 요약해 전달합니다. 아래는 **레거시 acpx 방식** 사용 시 안내입니다.

---

텔레그램에서 김빌드(OpenClaw)와 **OpenCode로 계획/구현**을 하려면(acpx 사용 시), 먼저 **ACP 세션**을 연 뒤 지시를 줍니다. 일반 채팅 세션과 ACP 세션은 다르므로, `/acp` 명령은 **ACP 세션을 연 상태**에서만 사용할 수 있습니다.

### 6.1 처음 사용할 때 (필수 1단계)

1. **ACP 세션 열기**  
   텔레그램 채팅창에 아래 중 하나를 입력합니다.
   - **권장:**  
     `/acp spawn opencode --mode persistent --thread auto`  
     → OpenCode ACP 세션을 만들고, 가능하면 현재 대화에 바인딩합니다.
   - 한 번만 실행하고 끝내려면:  
     `/acp spawn opencode --mode oneshot --thread off`

2. 김빌드가 세션을 열었다고 안내하면 **이제 이 대화는 ACP 세션**입니다. 같은 대화에서 계획/구현 요청을 하면 됩니다.

### 6.2 이어서 사용하기

- **계획·구현 요청**  
  그냥 말로 요청하면 됩니다.  
  예: *"이 리포지터리 기준으로 로그인 API 개선 계획만 세워줘"*, *"테스트로 계획만 세워줘"*
- **상태 확인**  
  `/acp status`  
  → 현재 ACP 세션 상태·런타임 옵션을 요약해서 보여줍니다.
- **같은 세션에 추가 지시**  
  `/acp steer <지시>`  
  예: `/acp steer 로그 레벨을 INFO로만 제한해줘`
- **세션 종료**  
  `/acp close`  
  → ACP 세션과 바인딩을 해제합니다. 다시 쓰려면 6.1부터 반복합니다.

### 6.3 "Session is not ACP-enabled" / ACP 에러가 날 때

다음과 같은 메시지가 나오면:

- **`ACP error (ACP_SESSION_INIT_FAILED): Session is not ACP-enabled: agent:main:telegram:direct:...`**
- **`next: If this session is stale, recreate it with /acp spawn and rebind the thread.`**

**의미:** 지금 대화는 **일반 채팅 세션**(예: `agent:main:telegram:direct:773457829`)입니다. `/acp status`, `/acp cwd`, `/acp steer` 같은 명령은 **“이 대화가 어떤 ACP 세션에 붙어 있다”**고 인식될 때만 동작합니다. 아직 ACP 세션을 안 열었거나, 이 채팅이 그 세션에 **붙지 않은** 상태라서 에러가 납니다.

**해결 (순서대로 시도)**

1. **이 대화에서 ACP 세션 열기**  
   `/acp spawn opencode --mode persistent --thread auto`  
   → 일부 채널(예: Discord 스레드)에서는 스레드가 자동으로 새 ACP 세션에 바인딩됩니다.

2. **텔레그램 DM인 경우**  
   Discord는 “스레드 바인딩”으로 스레드 안에서 spawn 하면 자동으로 그 스레드가 ACP 세션에 붙지만, **텔레그램 DM은 그렇게 자동으로 붙지 않을 수 있습니다.**  
   - spawn 후 봇이 **세션 키**를 알려주면(예: `agent:opencode:acp:...`)  
   - 같은 채팅에서 **`/focus <세션키>`** 를 입력해 이 대화를 그 ACP 세션에 붙입니다.  
   - 예: `/focus agent:opencode:acp:abc123-def456`  
   이후부터 이 채팅에서 `/acp status`, `/acp cwd`, `/acp steer` 등이 그 ACP 세션에 적용됩니다.

3. **세션이 오래됐거나 이상할 때**  
   `/acp close` 후 1번(spawn)부터 다시 하고, 필요하면 2번(/focus)까지 반복합니다.

**`/focus`는 디스코드 전용이 아닙니다.**  
- **/focus** (및 /unfocus)는 “지금 이 대화를 어떤 세션에 붙일지” 지정하는 **공용 명령**입니다. ACP 세션 키도 인자로 쓸 수 있습니다.  
- **Discord “스레드 바인딩”**은 “스레드 안에서 spawn 하면 그 스레드가 자동으로 ACP 세션에 붙는” 채널 쪽 기능이고, 텔레그램에서는 spawn 후 수동으로 **/focus &lt;세션키&gt;** 로 이 대화를 ACP 세션에 붙이는 방식이 필요할 수 있습니다.

### 6.4 텔레그램 DM 흐름 요약

| 순서 | 사용자 입력 | 설명 |
|------|-------------|------|
| 1 | `/acp spawn opencode --mode persistent --thread auto` | ACP 세션 열기 |
| 2 | (봇이 세션 키를 알려주면) `/focus <세션키>` | 이 대화를 해당 ACP 세션에 붙임 (텔레그램 DM에서 필요 시) |
| 3 | *"OOO 기능 계획만 세워줘"* 등 | 계획·구현 요청 (자연어) |
| 4 | `/acp status`, `/acp steer <지시>` 등 | 같은 세션에 상태 확인·추가 지시 |
| 5 | `/acp close` | 작업 끝나면 세션 종료 |

`/acp doctor`는 **ACP 세션이 없어도** 채팅에서 실행 가능합니다. acpx 백엔드 준비 여부 확인용입니다.

### 6.5 ACP 슬래시 명령 전체 (참고)

OpenClaw 내장 ACP 명령 일부입니다. 위 흐름에서 **이 대화가 ACP 세션에 붙은 뒤**에만 `/acp status`, `/acp cwd` 등이 동작합니다.

```
/acp spawn [agentId] [--mode persistent|oneshot] [--thread auto|here|off] [--cwd <path>] [--label <label>]
/acp cancel [session-key|session-id|session-label]
/acp steer [--session <...>] <instruction>
/acp close [session-key|session-id|session-label]
/acp status [session-key|session-id|session-label]
/acp set-mode <mode> [session-key|...]
/acp set <key> <value> [session-key|...]
/acp cwd <path> [session-key|...]
/acp permissions <profile> [session-key|...]
/acp timeout <seconds> [session-key|...]
/acp model <model-id> [session-key|...]
/acp reset-options [session-key|...]
/acp doctor
/acp install
/acp sessions
```

- **/focus**, **/unfocus**: ACP 세션 키와 함께 사용 가능. 현재 대화를 해당 세션에 붙이거나 뗍니다. Discord 전용이 아님.
- `acp.dispatch.enabled`가 true이면, 스레드에 바인딩된 ACP 세션이 있을 때 일반 메시지도 그 세션으로 디스패치됩니다.

### 7. 검증

- 서버에서: `openclaw doctor`
- 채팅에서: `/acp doctor` 로 acpx 백엔드 준비 여부 확인
- "테스트로 계획만 세워줘" 요청 → 김빌드가 sessions_spawn(acp, opencode, task: "...") 호출하는지 확인

### 8. DevBridge 비활성화

ACP 전환 후 DevBridge 서비스는 사용하지 않습니다. 서버에서:

```bash
sudo systemctl stop devbridge
sudo systemctl disable devbridge
```

(선택) 유닛 파일은 그대로 두어도 됩니다.

### 9. 트러블슈팅

### 9.1 서버에서 "Unrecognized key: acp"

서버에서 `openclaw plugins install @openclaw/acpx` 실행 시 **Config invalid / Unrecognized key: acp** 가 나오면, 해당 서버의 OpenClaw 버전이 루트 수준 `acp` 설정을 지원하지 않는 구버전일 수 있습니다.

**조치:**

1. OpenClaw를 ACP를 지원하는 버전으로 업그레이드한 뒤, 다시 `openclaw plugins install @openclaw/acpx` 실행.
2. 또는 `openclaw doctor --fix`를 실행하면 인식하지 못하는 키가 제거되어 설정은 유효해지지만, **acp 블록이 삭제**되므로 ACP 기능은 사용할 수 없습니다. ACP를 쓰려면 업그레이드 후 acp 블록을 다시 넣고 acpx를 설치해야 합니다.

### 9.2 "Session is not ACP-enabled" (텔레그램 채팅에서)

에러 메시지: `ACP error (ACP_SESSION_INIT_FAILED): Session is not ACP-enabled: agent:main:telegram:direct:...`

**원인:** 현재 대화가 일반 채팅 세션이라, `/acp status`·`/acp cwd` 등이 적용될 ACP 세션에 이 대화가 붙어 있지 않음.

**조치:** [§6.3](#63-session-is-not-acp-enabled--acp-에러가-날-때) 참고.  
1) `/acp spawn opencode --mode persistent --thread auto` 로 ACP 세션 생성.  
2) **텔레그램 DM**이면 봇이 알려준 세션 키로 **`/focus <세션키>`** 를 입력해 이 대화를 그 ACP 세션에 붙인 뒤 `/acp` 명령 사용.

### 9.3 "acpx exited with code 4" (ACP_TURN_FAILED)

에러 메시지: `ACP error (ACP_TURN_FAILED): acpx exited with code 4`

**의미:** acpx CLI에서 exit code 4는 **"No session found"** 이다. acpx는 자체 세션 저장소(`~/.acpx/sessions`)에서 (agentCommand, cwd)로 세션을 찾는데, Gateway는 세션 키만 만들고 acpx 로컬 세션은 만들지 않는다. 따라서 `/acp steer` 시 acpx가 해당 cwd용 세션을 찾지 못해 4로 종료한다.

**조치 (레거시 acpx 사용 시에만 해당):**

1. **수동 1회 실행**: 서버에서 `acpx opencode sessions ensure --cwd ~/.openclaw/workspace` 실행(PATH에 opencode 포함, acpx는 OpenClaw 스톡 경로 또는 npm global).
2. `~/.acpx/config.json` 에 `agents.opencode.command` 로 로컬 opencode 바이너리(`~/.opencode/bin/opencode acp`)가 설정돼 있으면 동일한 agentCommand로 세션이 생성·조회된다.
3. **포트 4096 충돌**: 서버에서 `opencode serve`가 이미 4096을 사용 중이면, `agents.opencode.command`에 **`--port 0`**을 넣어 별도 포트를 쓰도록 한다.
4. 수정 반영 후 **기존에 exit 4가 났던 세션**은 OpenClaw에만 있고 acpx에는 없을 수 있다. 그런 경우 해당 세션은 닫고 **새로 `/acp spawn opencode --mode persistent --thread auto`** 한 뒤, 새 세션으로 `/acp steer`를 사용한다.
