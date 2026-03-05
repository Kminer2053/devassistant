# OpenClaw 역할·정체성·업무 준수사항 설정

에이전트의 **역할**, **정체성**, **업무 규칙**은 서버의 **워크스페이스**에 있는 bootstrap 파일들로 설정합니다. OpenClaw가 세션마다 이 파일들을 시스템 프롬프트에 넣어 줍니다.

## 1. 워크스페이스 위치

- **서버 경로**: `~/.openclaw/workspace` (실제: `/home/devassistant/.openclaw/workspace`)
- **설정 변경**: `openclaw.json`의 `agents.defaults.workspace`로 다른 경로 지정 가능
- **레포 소스(권장)**: 이 레포의 `openclaw/workplace/`에서 설정을 편집한 뒤, 아래 명령으로 서버에 반영한다.

```bash
# 프로젝트 루트에서
rsync -avz --exclude='.git' --exclude='.openclaw' --exclude='.pi' \
  -e "ssh -i ~/.ssh/github-actions-oracle" \
  openclaw/workplace/ devassistant@46.250.254.159:~/.openclaw/workspace/
```

현재 서버에는 이미 다음 파일들이 있습니다.

```
~/.openclaw/workspace/
├── .openclaw/      # 내부용
├── .pi/            # 내부용
├── AGENTS.md       # 운영 규칙, 메모리, 금지/권장 행동
├── BOOTSTRAP.md    # 최초 1회 실행용 (후 삭제 가능)
├── HEARTBEAT.md    # 주기 점검 체크리스트
├── IDENTITY.md     # 이름, 느낌, 이모지
├── SOUL.md         # 페르소나, 톤, 경계
├── TOOLS.md        # 로컬 도구·규칙
└── USER.md         # 사용자 정보·호칭
```

## 2. 파일별 역할

| 파일 | 용도 |
|------|------|
| **IDENTITY.md** | 에이전트 이름, 크리처(로봇/유령 등), vibe(날카로운/따뜻한 등), 이모지, 아바타 경로 |
| **SOUL.md** | “누구인가”: 페르소나, 톤, 경계(비공개 유지, 외부 행동 전 확인 등). 에이전트의 성격·원칙 |
| **AGENTS.md** | 매 세션 읽는 운영 규칙: SOUL/USER/메모리 읽기, 메모리 사용법, 금지 사항, 그룹채팅 시 행동, HEARTBEAT 활용 |
| **USER.md** | 사용자 정보, 호칭, 선호사항. “누구를 돕는가” |
| **TOOLS.md** | OpenCode 제어(OPENCODE_ACP_WORKFLOW, exec·process·session/prompt), 포맷 규칙, SSH 정보 |
| **HEARTBEAT.md** | 주기 폴링 시 할 일 체크리스트(이메일/캘린더 확인 등). 짧게 유지해 토큰 절약 |
| **BOOTSTRAP.md** | 최초 1회만 따르는 “출생 증명”. 완료 후 삭제해도 됨 |

참고: [OpenClaw 템플릿](https://docs.openclaw.ai/reference/templates/) (IDENTITY.md, SOUL.md, AGENTS.md 등)

## 3. “나만의 개발 비서” 예시

### 3.1 IDENTITY.md 예시

```markdown
# IDENTITY.md - Who Am I?

* **Name:** DevAssistant (또는 원하는 이름)
* **Creature:** 개발 비서 AI
* **Vibe:** 정확하고, 간결하고, 실용적. 불필요한 수다 없음.
* **Emoji:** 🛠️
* **Avatar:** (선택) avatars/devassistant.png
```

### 3.2 SOUL.md 예시 (개발 비서용)

- **Core**: 코드/인프라 질문에 바로 답하고, "계획해줘", "구현해줘" 등 자연어 지시를 OPENCODE_ACP_WORKFLOW로 OpenCode에 전달. “도움이 되겠네요!” 같은 말 줄이기.
- **Boundaries**: 사용자 레포/서버만 건드림. 외부 API 호출·배포는 확인 후. 비밀/키는 절대 로그·메모리에 평문 저장 금지.
- **Vibe**: 전문적·친절하되 짧게. 이모지 과하지 않게.

### 3.3 AGENTS.md에서 강조할 규칙 예시

- 매 세션: `SOUL.md`, `USER.md`, 오늘/어제 `memory/YYYY-MM-DD.md` 읽기.
- OpenCode 제어 규칙(OPENCODE_ACP_WORKFLOW)은 `TOOLS.md`에 두고 준수.
- 위험한 명령(`rm -rf`, DB 삭제 등) 전에는 반드시 확인.
- 그룹채팅에서는 멘션/질문 있을 때만 응답, 채팅을 지배하지 않기.

### 3.4 USER.md 예시

```markdown
# USER.md
- **호칭:** (본인이 원하는 호칭)
- **주요 레포/프로젝트:** (경로나 이름)
- **선호:** 한국어 응답, 코드는 영어 주석 가능
```

### 3.5 TOOLS.md 예시 (스킬 방식)

- OpenCode: OPENCODE_ACP_WORKFLOW 기반(exec·process·session/prompt). 워크스페이스 경로, `opencode acp --port 0` 사용.
- SSH/서버 정보(호스트, 사용자, 키 경로 등) — 비밀은 환경변수/시크릿으로.

## 4. 수정 방법

### 4.1 서버에서 직접 편집

```bash
ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159
cd ~/.openclaw/workspace
nano IDENTITY.md   # 또는 vim
# 수정 후 저장
```

OpenClaw는 다음 세션부터 새 내용을 읽습니다. daemon 재시작은 필요 없을 수 있으나, 변경이 안 보이면 `openclaw` 서비스 재시작.

### 4.2 로컬에서 관리 후 서버로 반영

로컬에 `workspace/` 복사본을 두고 수정한 뒤 rsync로 올리는 방법:

```bash
# 로컬 예: devassistant/workspace/
rsync -avz -e "ssh -i ~/.ssh/github-actions-oracle" \
  ./workspace/ devassistant@46.250.254.159:~/.openclaw/workspace/
```

서버에 이미 있는 `memory/`, `.openclaw/`, `.pi/` 등은 덮어쓰지 않도록 경로를 맞추거나, 필요한 파일만 선택해서 올리면 됩니다.

## 5. openclaw.json identity (선택)

대시보드/클라이언트에서 보이는 이름·테마·이모지는 `openclaw.json`의 `identity`로도 줄 수 있습니다.

```json
{
  "identity": {
    "name": "DevAssistant",
    "theme": "min-dark",
    "emoji": "🛠️"
  }
}
```

실제 “누구인가/무슨 규칙을 따르는가”는 워크스페이스의 SOUL.md·AGENTS.md가 우선입니다.

## 6. 백업

워크스페이스 전체를 백업하면 역할·정체성·규칙이 함께 보존됩니다.

```bash
# 서버에서
tar -czf ~/workspace_backup_$(date +%Y%m%d).tar.gz -C ~/.openclaw workspace
```

운영 가이드의 백업 항목(`06_OPERATIONS.md`)에 `~/.openclaw/workspace`를 포함해 두는 것을 권장합니다.

## 7. 요약

| 목적 | 설정 위치 |
|------|------------|
| 이름·느낌·이모지 | `IDENTITY.md` (및 선택적으로 `openclaw.json` identity) |
| 페르소나·톤·경계 | `SOUL.md` |
| 업무 규칙·메모리·금지 사항 | `AGENTS.md` |
| 사용자 호칭·선호 | `USER.md` |
| 도구·워크플로 규칙 | `TOOLS.md` |
| 주기 점검 할 일 | `HEARTBEAT.md` |

초기 셋업은 **서버의 `~/.openclaw/workspace`** 에서 위 파일들을 채우거나 수정하면 되고, 이후에는 필요할 때만 해당 파일을 고치면 됩니다.

---

## 8. 워크스페이스 변경 후 적용 시점 (세션·재시작)

- **워크스페이스 파일**(SOUL.md, BOOTSTRAP.md, AGENTS.md, TOOLS.md, USER.md 등)은 **세션을 시작할 때** 디스크에서 읽혀 시스템 프롬프트에 주입됩니다. daemon 재시작과는 무관합니다.
- **텔레그램**: 한 채팅(대화) = 한 세션입니다. 같은 채팅에서 계속 대화하면 **같은 세션**이라, 이미 읽힌 워크스페이스 내용이 유지됩니다.
- **변경 내용을 적용하려면** **새 세션**이 필요합니다. 방법은 두 가지입니다.
  1. **같은 채팅에서 `/new` 또는 `/reset` 입력**  
     OpenClaw가 **새 sessionId**를 만들고, 그때 **워크스페이스 파일을 다시 읽어** bootstrap을 적용합니다. **채팅창을 새로 만들 필요 없음.**
  2. (선택) 새 채팅을 열거나 OpenClaw를 재시작해 세션을 끊는 방법도 새 세션을 만들 수 있으나, 일반적으로는 **`/new` 또는 `/reset`** 만 보내면 됩니다.
- 참고: OpenClaw 문서 [Session Management](https://openclaw.im/docs/concepts/session) — reset triggers에 `/new`, `/reset`이 있으며, "start a fresh session id" 시 bootstrap이 로드됩니다.

**구분**: **`/new`, `/reset`** 은 OpenClaw 대화 세션을 새로 만드는 것이고(워크스페이스·규칙 재로드). **`/devreset`** 은 레거시(DevBridge 사용 시) 플러그인 명령으로, 같은 채널의 OpenCode 세션만 새로 만듭니다. 스킬 방식에서는 사용하지 않습니다.
