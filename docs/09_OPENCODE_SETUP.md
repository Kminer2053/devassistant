# OpenCode 설정 (LLM·권한·서버)

OpenCode는 **실제 코딩/빌드**를 수행하는 쪽입니다. 김빌드가 **OPENCODE_ACP_WORKFLOW**(exec·process·session/prompt)로 지시를 전달하고, OpenCode는 **자체 LLM**으로 plan/build를 실행합니다.  
설치·기본 서비스는 [03_INSTALL_OPENCODE.md](03_INSTALL_OPENCODE.md)를 참고하고, 이 문서는 **LLM 연결**과 **설정 정리**를 다룹니다.

## DevBridge는? (레거시/참고)

**현재 스킬 방식에서는 OpenCode 제어에 DevBridge를 사용하지 않습니다.** 아래는 레거시/참고용입니다.

- 포트 `127.0.0.1:8080`
- `X-DevBridge-Token` = `DEVBRIDGE_TOKEN` 환경변수
- downstream = OpenCode `127.0.0.1:4096` (Basic Auth)
- OpenClaw 플러그인의 `devbridgeToken`만 위 토큰과 맞으면 됨

추가로 바꿀 것은 없습니다.

### TUI 드라이버 모드 (레거시: 김빌드가 TUI 직접 보고 제어)

DevBridge 방식(HTTP API 중계)은 승인·TUI 프롬프트 등을 **간접** 처리한다. 김빌드가 OpenCode TUI를 **직접 보고 제어**하는 구조(레거시)로 확장하기 위해:

- **DevBridge TUI API**: `GET /v1/opencode/tui/next`, `POST /v1/opencode/tui/response` — OpenCode serve 내장 TUI 제어 엔드포인트(`/tui/control/next`, `/tui/control/response`)를 프록시.
- **김빌드 도구**: `opencode_tui_get_next`, `opencode_tui_submit_response` — 플러그인에 등록. 김빌드가 TUI 요청(승인·프롬프트 등)을 감지하고, 사용자 확인 후 응답 제출.
- **이벤트 연계**: `GET /v1/opencode/session-activity` 응답에 `tuiRequest` 필드 포함. 세션 진행 상황과 TUI 대기 요청을 함께 조회.

역할 구분은 [05_DEVBRIDGE.md § TUI 드라이버 모드](05_DEVBRIDGE.md) 참고. **DevBridge 기본은 PTY 백엔드**이며, HTTP API를 쓰려면 `DEVBRIDGE_OPENCODE_BACKEND=opencode` 설정 시 OpenCode serve가 필요하다([05_DEVBRIDGE.md § PTY 백엔드](05_DEVBRIDGE.md)).

---

## OpenCode에서 설정할 것 요약

| 항목 | 설명 | 참고 |
|------|------|------|
| **설치·서비스** | `opencode serve` 127.0.0.1:4096, systemd | [03_INSTALL_OPENCODE.md](03_INSTALL_OPENCODE.md) |
| **서버 비밀번호** | `OPENCODE_SERVER_PASSWORD` | systemd `Environment=` |
| **권한(permission)** | edit/bash/external_directory | `opencode.json` |
| **LLM(provider)** | Anthropic / OpenAI / OpenRouter 등 | API 키 + config |
| **모델(model)** | 기본·소형 모델 지정 | `opencode.json` |
| **전역 설정 경로** | 서버에서는 `~/.config/opencode/opencode.json` | 또는 `OPENCODE_CONFIG` |
| **MCP** | Stitch(UI)·Vercel·GitHub 등 | [§2.5 개발 관련 MCP](#25-개발-관련-mcp-stitch-vercel-github) |

---

## 1. 설정 파일 위치 (서버)

- **전역**: `~/.config/opencode/opencode.json` (사용자: `devassistant`)
- **경로 지정**: systemd 또는 서비스에서 `Environment=OPENCODE_CONFIG=/path/to/opencode.json` 로 덮을 수 있음

설정은 **병합**됩니다. 전역에 공통, 프로젝트 루트 `opencode.json`에 프로젝트별 설정을 둘 수 있습니다.

---

## 2. LLM 연결

OpenCode는 **API 키** 방식과 **OAuth(구독)** 방식 둘 다 쓸 수 있습니다.  
서버는 headless라 브라우저 로그인이 불가하므로, **OAuth는 로컬에서 완료한 뒤 인증 파일을 서버로 복사**하는 방식으로 씁니다.

### 2.0 OAuth(구독) 연결 — API 과금 없이 쓰기

**지원하는 OAuth(브라우저 로그인)**  
- **OpenAI**: ChatGPT Plus/Pro — `/connect`에서 "ChatGPT Plus/Pro" 선택 시 브라우저에서 로그인  
- **Anthropic (Claude Pro/Max)**: **2026년 1월부터 Anthropic이 서드파티 도구(OpenCode, OpenClaw 등)에서 구독(OAuth) 토큰 사용을 차단했습니다.** Claude를 OpenCode에서 쓰려면 **일반 API 키**(`sk-ant-api03-*`, [Console](https://console.anthropic.com/)에서 발급)만 사용 가능합니다. OAuth/구독 토큰은 공식 Claude Code에서만 동작합니다.

인증 정보는 `~/.local/share/opencode/auth.json`에 저장됩니다.  
**서버에는 TUI가 없으므로**, OAuth는 **로컬(맥 등)**에서 한 번 하고, 생성된 `auth.json`을 서버로 복사하면 됩니다.

**절차 요약**

1. **로컬에서 OpenCode 설치 후** TUI 실행: `opencode` (또는 `opencode auth login` 등으로 provider 선택).
2. `/connect` → **OpenAI** 선택 → **ChatGPT Plus/Pro** 선택 → 브라우저에서 로그인 완료.  
   (Claude Pro/Max OAuth는 Anthropic 정책으로 OpenCode에서 **차단됨** — Claude는 API 키만 사용.)
3. 로컬의 `~/.local/share/opencode/auth.json`을 서버 `devassistant` 사용자 홈으로 복사:
   ```bash
   scp -i ~/.ssh/github-actions-oracle \
     ~/.local/share/opencode/auth.json \
     devassistant@46.250.254.159:~/.local/share/opencode/auth.json
   ```
   서버에 `~/.local/share/opencode/` 디렉터리가 없으면 먼저 만들기:  
   `ssh ... "mkdir -p ~/.local/share/opencode"`.
4. 서버의 `~/.config/opencode/opencode.json`에는 **API 키 없이** provider·model만 지정 (auth.json이 있으면 OpenCode가 여기서 키를 읽음):
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "anthropic/claude-sonnet-4-5",
     "small_model": "anthropic/claude-3-5-haiku-20241022"
   }
   ```
   또는 OpenAI 구독이면 `"model": "openai/gpt-4o"` 등으로 지정.
5. `sudo systemctl restart opencode` 후 plan/build로 동작 확인.

이렇게 하면 **API 키 없이** 구독 한도 안에서만 OpenCode가 LLM을 사용합니다.

**Google Gemini (OpenCode 전용)**  
OpenCode 공식 번들에는 Gemini OAuth가 없고, **플러그인**으로 연결합니다.

1. config에 플러그인 추가 (`~/.config/opencode/opencode.json`):
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": ["opencode-gemini-auth@latest"]
   }
   ```
2. 로컬에서 `opencode auth login` → **Google** 선택 → **OAuth with Google (Gemini CLI)** → 브라우저 로그인.
3. 인증 정보는 `~/.local/share/opencode/auth.json` 등에 저장됨. headless 서버는 로컬에서 인증 후 이 파일을 서버로 복사.
4. (선택) 유료 Gemini Code Assist 쓰려면 `provider.google.options.projectId` 또는 환경변수 `OPENCODE_GEMINI_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` 설정.

참고: [jenslys/opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth).  
공식 OpenCode 문서의 **Google Vertex AI**는 GCP Vertex(서비스 계정)용이고, 위 플러그인은 **Gemini 구독/무료 한도 OAuth**용입니다.

---

### 실전: Gemini + ChatGPT OAuth 한 번에 (서버 OpenCode)

**목표**: 서버 OpenCode에 **Gemini OAuth**(플러그인) + **ChatGPT Plus/Pro OAuth** 둘 다 붙이고, 기본 모델만 골라서 사용.

**맥에 OpenCode를 설치할 필요는 없습니다.** 서버에 SSH 접속한 터미널에서 `opencode auth login`을 실행하고, OAuth 시 나오는 **URL을 맥(또는 핸드폰) 브라우저로 열어** 로그인한 뒤, **리다이렉트 URL(또는 인증 코드)을 서버 터미널에 붙여넣기**하면 됩니다.

#### 1) 서버에 config 먼저 넣기

1. 서버에 디렉터리 생성:  
   `ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "mkdir -p ~/.config/opencode ~/.local/share/opencode"`
2. **opencode.json** 복사 (레포 템플릿 → 서버):  
   `scp -i ~/.ssh/github-actions-oracle infra/templates/opencode-server-gemini-chatgpt-oauth.json devassistant@46.250.254.159:~/.config/opencode/opencode.json`  
   (실행 위치: 레포 루트. 경로는 환경에 맞게 조정.)
3. 서버에 OpenCode가 이미 설치돼 있어야 함. (03_INSTALL_OPENCODE.md 기준으로 설치된 상태 가정.)

#### 2) 서버 SSH 터미널에서 OAuth 2회 (맥 브라우저만 사용)

1. **서버에 SSH 접속** (대화형 터미널 유지):  
   `ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159`  
   PATH에 opencode가 있어야 함. (예: `export PATH="$HOME/.opencode/bin:$PATH"` 또는 `~/.npm-global/bin` 등.)
2. **Google(Gemini) OAuth**:  
   서버에서 `opencode auth login` → **Google** 선택 → **OAuth with Google (Gemini CLI)**.  
   터미널에 **URL**이 뜨면, **맥(또는 폰) 브라우저**로 그 URL을 열고 로그인.  
   완료 후 **리다이렉트된 URL 전체**를 복사해서 **서버 터미널에 붙여넣기**. (opencode-gemini-auth 문서: headless 환경에서는 URL/코드 수동 붙여넣기 지원.)
3. **OpenAI(ChatGPT) OAuth**:  
   같은 서버 터미널에서 다시 `opencode auth login` → **OpenAI** → **ChatGPT Plus/Pro**.  
   마찬가지로 URL을 맥 브라우저로 열고 로그인 후, 나온 URL/코드를 서버 터미널에 붙여넣기.  
   두 계정 모두 서버의 `~/.local/share/opencode/auth.json` 에 저장됨.
4. (선택) 유료 Gemini용 프로젝트 ID가 필요하면 서버 `~/.config/opencode/opencode.json` 에  
   `"provider": { "google": { "options": { "projectId": "your-gcp-project-id" } } }` 추가 또는 환경변수 `OPENCODE_GEMINI_PROJECT_ID` 설정.

#### 3) OpenCode 재시작

- 서버에서: `sudo systemctl restart opencode`
- 또는 SSH 한 줄: `ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "sudo systemctl restart opencode"`

#### 4) 기본 모델 선택

- 템플릿 `opencode-server-gemini-chatgpt-oauth.json` 은 **Gemini**를 기본으로 둠 (`model`: `google/gemini-2.5-flash`).
- **ChatGPT**를 기본으로 쓰려면 서버 `~/.config/opencode/opencode.json` 에서  
  `"model": "openai/gpt-4o"`, `"small_model": "openai/gpt-4o-mini"` 등으로 바꾸면 됨.
- 두 provider 모두 auth.json에 있으므로, **model** 문자열만 바꿔도 전환 가능.

#### 5) 확인

- `curl -u opencode:<비밀번호> http://127.0.0.1:4096/global/health`  
- 텔레그램에서 김빌드에게 `/plan 테스트` 등 요청 후, OpenCode 로그:  
  `journalctl -u opencode -f`

---

### Perplexity / Jina(젠스파크) — OpenCode 지원 여부

- **Perplexity**  
  OpenCode **공식 provider 목록**에는 Perplexity가 없음.  
  **OpenRouter**에서 Perplexity(Sonar 시리즈 등) 모델을 제공함.  
  → OpenCode에서 **OpenRouter**를 쓰면 **OpenRouter API 키** 하나로 `openrouter/perplexity/sonar-*` 등 모델 사용 가능.  
  단, OpenRouter는 **자체 과금**이라 Perplexity **유료 구독**과는 별개. OpenRouter에서 Perplexity 모델 호출 시 OpenRouter 요금이 부과됨.

- **Jina / 젠스파크**  
  OpenCode 공식 **provider 목록**에는 **Jina** 또는 **Jina Spark**가 **없음**.  
  Jina AI가 OpenAI 호환 API를 제공한다면, OpenCode의 **"Other"** (OpenAI 호환) provider로 **baseURL + apiKey**를 넣어 시도해 볼 수 있음.  
  `/connect` → 맨 아래 **Other** → base URL과 API 키 입력.  
  공식 지원 여부는 [OpenCode Providers](https://opencode.ai/docs/providers/) 및 Jina 문서를 확인해야 함.

---

### 2.1~2.3 API 키 방식 (Headless에서 직접 쓰기)

서버에 `auth.json`을 두지 않고 **환경변수 + config의 `{env:변수명}`** 만 쓰려면 아래처럼 API 키를 설정하면 됩니다.

### 2.1 Anthropic (Claude)

1. [Anthropic Console](https://console.anthropic.com/)에서 API 키 발급 (또는 Claude Pro/Max 구독 후 해당 인증).
2. 서버에서 환경변수 설정 (systemd override 권장, 아래 4절 참고):
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. 전역 config에 provider·모델 지정:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  },
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-3-5-haiku-20241022"
}
```

### 2.2 OpenAI (GPT)

1. [OpenAI API Keys](https://platform.openai.com/api-keys)에서 키 발급.
2. 환경변수:
   ```bash
   OPENAI_API_KEY=sk-...
   ```
3. config 예시:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openai": {
      "options": {
        "apiKey": "{env:OPENAI_API_KEY}"
      }
    }
  },
  "model": "openai/gpt-4o",
  "small_model": "openai/gpt-4o-mini"
}
```

### 2.3 OpenRouter (한 키로 여러 모델)

1. [OpenRouter](https://openrouter.ai/settings/keys)에서 API 키 발급 (`sk-or-...`).
2. 환경변수:
   ```bash
   OPENROUTER_API_KEY=sk-or-...
   ```
3. config 예시:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "openrouter": {
      "options": {
        "apiKey": "{env:OPENROUTER_API_KEY}"
      }
    }
  },
  "model": "openrouter/anthropic/claude-sonnet-4",
  "small_model": "openrouter/openai/gpt-4o-mini"
}
```

모델 ID는 [OpenRouter 모델 목록](https://openrouter.ai/docs/models) 참고.

---

### 2.4 오케스트레이션(에이전트별 모델) — 여러 LLM 연결

Planner / Architect / Coder / Reviewer / QA처럼 **에이전트별로 다른 모델**을 쓰려면, 그 모델들을 OpenCode가 쓸 수 있게 **연결**해 두어야 합니다.

**정리**

| 상황 | 연결해야 하는 것 |
|------|------------------|
| **한 provider, 여러 모델** (예: Plan=Haiku, Build=Sonnet, 모두 Anthropic) | 해당 provider **1개만** 연결 (API 키 또는 OAuth 1회). config에서 `agent.plan.model`, `agent.build.model` 등으로 모델만 나눠 지정. |
| **여러 provider** (예: Plan=OpenAI, Build=Claude) | 사용하는 **provider마다** 인증 필요 (OpenAI 키 + Anthropic 키, 또는 각 OAuth/auth.json). |
| **OpenRouter 한 개로 여러 모델** | OpenRouter **키 1개**만 연결. config에서 `openrouter/anthropic/...`, `openrouter/openai/...` 등 에이전트별로 다른 모델 ID 지정. |

**에이전트별 모델 지정 예시 (OpenCode config)**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-3-5-haiku-20241022",
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  },
  "agent": {
    "plan": {
      "model": "anthropic/claude-3-5-haiku-20241022",
      "tools": { "write": false, "edit": false, "bash": false }
    },
    "build": {
      "model": "anthropic/claude-sonnet-4-5"
    },
    "code-reviewer": {
      "description": "Reviews code for best practices",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-5",
      "tools": { "write": false, "edit": false }
    }
  }
}
```

- 위처럼 하면 **Anthropic 하나만 연결**해도 plan(빠른 모델), build(메인), code-reviewer(메인)를 나눠 쓸 수 있습니다.
- Planner/Architect/Coder/Reviewer/QA를 **서로 다른 provider**로 쓰고 싶다면, config의 `agent.*.model`에 `openai/...`, `anthropic/...` 등을 섞어 쓰고, **해당 provider들을 모두** 인증(API 키 또는 auth.json)해 두면 됩니다.

참고: [OpenCode – Agents](https://opencode.ai/docs/agents) (에이전트별 `model`, `tools`, `permission` 설정).

---

## 2.5 개발 관련 MCP (Stitch, Vercel, GitHub)

UI 개발·배포·소스 연동을 위해 OpenCode에 아래 MCP를 붙일 수 있습니다. `opencode.json`(전역 또는 프로젝트)에 `mcp` 블록을 추가하고, 필요 시 인증 후 `opencode serve`를 재시작합니다.

### 1) Stitch MCP (UI → 코드)

Google Stitch 디자인을 React 등 코드로 내려받는 데 쓰입니다.

#### 옵션 A — API 키만 (권장, 헤드리스 서버)

**[piyushcreates/stitch-mcp](https://github.com/piyushcreates/stitch-mcp)** 를 쓰면 **`STITCH_API_KEY` 환경변수만** 있으면 됩니다. gcloud 인증 불필요. 공식 Stitch API(`https://stitch.googleapis.com/mcp`)에 직접 연결합니다.

- **요구사항**: Python 3.10+, `pip install mcp requests`, [Stitch API 키](https://stitch.withgoogle.com/docs/mcp/setup) 발급.
- **서버 설치 예시** (한 번만, venv 사용 권장 — 시스템 Python이 externally-managed일 때):

  ```bash
  git clone https://github.com/piyushcreates/stitch-mcp.git ~/stitch-mcp
  cd ~/stitch-mcp && python3 -m venv .venv && .venv/bin/pip install mcp requests
  ```

- **opencode.json 설정 예** (venv 사용 시):

```json
"mcp": {
  "stitch": {
    "type": "local",
    "command": ["/home/devassistant/stitch-mcp/.venv/bin/python", "/home/devassistant/stitch-mcp/stitch_mcp.py"],
    "enabled": true,
    "environment": {
      "STITCH_API_KEY": "{env:STITCH_API_KEY}"
    }
  }
}
```

- 시스템에 `pip install mcp requests`가 가능하면 `command`를 `["python3", "/home/devassistant/stitch-mcp/stitch_mcp.py"]` 로 해도 됩니다.
- **의존성 점검 시**: OpenCode는 **`.venv/bin/python`** 으로만 Stitch MCP를 실행합니다. `pip list` / `pip show mcp`를 **시스템 기본 pip**로 하면 mcp가 없다고 나올 수 있습니다. 점검 시 반드시 **`/home/devassistant/stitch-mcp/.venv/bin/pip list`** 로 확인하세요. 서버에는 `~/stitch-mcp/requirements.txt`(mcp, requests)를 두어 venv 재설치 시 `.venv/bin/pip install -r requirements.txt`로 복구할 수 있습니다.

#### 옵션 B — npm stitch-mcp (GCP + gcloud)

- **패키지**: `stitch-mcp` (npm, [Kargatharaakash/stitch-mcp](https://github.com/Kargatharaakash/stitch-mcp)) — **Google Cloud 프로젝트 + gcloud 인증** 필요.
- **설정 예** (GCP 프로젝트 ID 사용 시):

```json
"mcp": {
  "stitch": {
    "type": "local",
    "command": ["npx", "-y", "stitch-mcp"],
    "enabled": true,
    "environment": {
      "GOOGLE_CLOUD_PROJECT": "{env:GOOGLE_CLOUD_PROJECT}"
    }
  }
}
```

- **서버(headless)**: `gcloud auth application-default login`이 불가하므로, 로컬에서 인증 후 `~/.config/gcloud/application_default_credentials.json` 등을 서버로 복사해야 함. **API 키만 쓰려면 위 옵션 A(piyushcreates/stitch-mcp)** 를 쓰면 됨. **projectId는 Stitch MCP가 아님** — opencode-gemini-auth(에이전트 모델) 때문. [§5.6 UnknownError (projectId)](#56-흔한-오류-unknownerror-google-cloud-project-id를-찾지-못함) 참고.
- **AGENTS.md** (visual-engineering): "Stitch MCP 스킬 우선" 사용 시 위 MCP가 연결돼 있어야 합니다.

### 2) Vercel MCP

배포·프로젝트·문서 검색용. **리모트** MCP이며 OAuth로 인증합니다.

- **URL**: `https://mcp.vercel.com`
- **설정 예**:

```json
"mcp": {
  "vercel": {
    "type": "remote",
    "url": "https://mcp.vercel.com",
    "enabled": true
  }
}
```

- **인증**: OpenCode는 OAuth 토큰을 `~/.local/share/opencode/mcp-auth.json`에 저장합니다. ([OpenCode MCP 문서](https://opencode.ai/docs/mcp-servers/#oauth))
- 참고: [Vercel MCP](https://vercel.com/docs/ai-resources/vercel-mcp)

#### 헤드리스 서버에서 Vercel MCP 쓰기

서버에는 브라우저가 없으므로 두 가지 중 하나를 쓰면 됩니다.

- **서버에서 그냥 `opencode mcp auth vercel`만 실행하면 안 되는 이유**: OAuth 콜백 URL이 `http://127.0.0.1:19876/...` 라서, 맥 브라우저에서 승인하면 리다이렉트가 **맥**의 127.0.0.1로 갑니다. 토큰을 기다리는 프로세스는 **서버**의 19876에서 대기 중이므로 서버는 콜백을 받지 못합니다.

---

**방법 A — 로컬에서 인증 후 파일 복사** (맥에 OpenCode가 있을 때)

1. **로컬**에서 OpenCode가 설치된 환경에서:
   ```bash
   opencode mcp auth vercel
   ```
   브라우저가 열리면 Vercel 로그인/승인 후 완료.
2. 로컬에 생성된 `~/.local/share/opencode/mcp-auth.json`을 서버로 복사:
   ```bash
   # 서버에 디렉터리 없으면 먼저 생성
   ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "mkdir -p ~/.local/share/opencode"

   scp -i ~/.ssh/github-actions-oracle \
     ~/.local/share/opencode/mcp-auth.json \
     devassistant@46.250.254.159:~/.local/share/opencode/mcp-auth.json
   ```
   (호스트/키 경로는 환경에 맞게 변경.)
3. 서버에서 OpenCode 재시작:
   ```bash
   ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "sudo systemctl restart opencode"
   ```
4. 연결 확인: `opencode mcp list`에서 vercel이 **connected**로 나오면 성공.  
   토큰 만료 시 같은 절차를 다시 수행하면 됩니다.

---

**방법 B — SSH 포트 포워딩** (맥에 OpenCode 없이, 서버에서 auth 한 번에 끝내기)

맥의 19876 포트를 서버의 19876으로 넘겨 두면, 브라우저가 `http://127.0.0.1:19876/...` 로 리다이렉트할 때 그 요청이 서버의 OpenCode로 전달됩니다. 맥에 OpenCode 설치·파일 복사 없이 서버만으로 완료할 수 있습니다.

1. **맥**에서 SSH 접속 시 **로컬 포트 포워딩** 추가:
   ```bash
   ssh -L 19876:127.0.0.1:19876 -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159
   ```
   (이 터미널은 auth 완료할 때까지 끄지 말고 유지.)
2. **서버** 쪽(위 SSH 세션 안)에서:
   ```bash
   opencode mcp auth vercel
   ```
3. 터미널에 나온 **인증 URL**을 맥 브라우저로 열고, Vercel 로그인/승인.
4. 승인 후 브라우저가 `http://127.0.0.1:19876/mcp/oauth/callback?...` 로 이동하면, 그 요청이 SSH 터널을 타고 **서버**의 OpenCode로 전달되어 인증이 완료됩니다. 서버 터미널에 성공 메시지가 뜨고, 토큰은 서버의 `~/.local/share/opencode/mcp-auth.json`에 저장됩니다.
5. (선택) `sudo systemctl restart opencode` 후 `opencode mcp list`로 vercel **connected** 확인.

토큰 만료 시 1~4를 같은 방식으로 다시 하면 됩니다.

### 3) GitHub MCP

이슈·PR·저장소 검색 등 GitHub API 연동. **로컬**로 두고 Personal Access Token을 환경변수로 넘기는 방식이 일반적입니다.

- **패키지**: `@modelcontextprotocol/server-github`
- **설정 예**:

```json
"mcp": {
  "github": {
    "type": "local",
    "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
    "enabled": true,
    "environment": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_PERSONAL_ACCESS_TOKEN}"
    }
  }
}
```

- **토큰**: [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)에서 repo·read:org 등 필요한 scope로 발급. 서버에는 systemd override에 `Environment=GITHUB_PERSONAL_ACCESS_TOKEN=...` 로만 넣고, config에는 `{env:...}` 유지.
- **주의**: GitHub MCP는 컨텍스트를 많이 쓰므로, 필요할 때만 사용하거나 특정 에이전트에만 켜 두는 것이 좋습니다. ([OpenCode – MCP](https://open-code.ai/docs/en/mcp-servers))
- **Gemini + GitHub MCP 스키마 오류**: Vertex AI(Gemini)는 `github_create_pull_request_review` 툴의 `any_of` 스키마를 지원하지 않아 호출 시 오류가 납니다. architect·reviewer·qa 등 **Gemini 모델 에이전트**에는 `opencode-agents-orchestration.json`에서 `tools: { "github_*": false }`로 GitHub MCP를 비활성화해 두면 됩니다.

#### Vertex-safe GitHub MCP (커스텀 서버)

이 레포의 **github-mcp** 서버는 anyOf/oneOf 없이 툴 스키마를 정의해 Vertex/Gemini에서도 GitHub 툴을 그대로 쓸 수 있게 합니다. PR·이슈 목록/상세·diff·코멘트·파일 읽기·쓰기 등 최소 풀세트만 제공합니다.

1. **배포** (레포 루트에서):
   ```bash
   ./scripts/deploy_github_mcp_server.sh
   ```
   서버에 `GITHUB_PERSONAL_ACCESS_TOKEN`이 설정되어 있어야 합니다. `/etc/systemd/system/github-mcp.service` 또는 override에서 `Environment=GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...` 설정.

2. **opencode.json** 에서 기존 `github` 블록을 **remote** 타입으로 교체:
   ```json
   "github": {
     "type": "remote",
     "url": "http://127.0.0.1:5050/mcp"
   }
   ```
   OpenCode 재시작 후 `opencode mcp list`로 연결 확인.

3. **제약**: 공식 GitHub MCP보다 툴 수가 적습니다. 필요 시 [github-mcp/README.md](../github-mcp/README.md) 참고.

4. **검증 시나리오**
   - 서버에서: `opencode mcp list` → github **connected**, `curl -s http://127.0.0.1:5050/health` → `{"ok":true}`.
   - 김빌드(OpenClaw) 경유: 텔레그램에서 "GitHub MCP로 devassistant 레포 열린 PR 목록 조회해줘" 등으로 요청 → 김빌드가 session/prompt에 "GitHub MCP의 github_list_pull_requests를 사용해 …"를 포함해 OpenCode에 전달하면, OpenCode가 GitHub MCP를 호출해 결과를 반환한다. OPENCODE_ACP_WORKFLOW.md "GitHub MCP" 절 참고.

#### 헤드리스 서버에서 GitHub MCP 쓰기

1. **GitHub에서 PAT 발급**
   - [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) (또는 [Fine-grained tokens](https://github.com/settings/tokens?type=beta)) 이동.
   - "Generate new token" → 사용 목적에 맞게 scope 선택.  
     예: 저장소 읽기/이슈·PR 검색이면 **repo**, 조직 정보가 필요하면 **read:org**. Classic token이면 `repo`, `read:org` 등.
   - 생성된 토큰을 복사해 두기 (한 번만 표시됨).

2. **서버의 systemd override에 토큰 넣기**  
   OpenCode가 MCP용으로 쓰는 환경변수는 `opencode.service.d` 아래 override에 넣습니다.  
   (이미 Stitch/Vercel용으로 `mcp-env.conf` 또는 `env.conf`를 쓰고 있다면 같은 파일에 한 줄만 추가하면 됩니다.)
   ```bash
   sudo mkdir -p /etc/systemd/system/opencode.service.d
   sudo nano /etc/systemd/system/opencode.service.d/env.conf
   ```
   다음 한 줄 추가(기존 `[Service]` 블록 안에):
   ```ini
   [Service]
   # 기존 항목들(OPENCODE_SERVER_PASSWORD, STITCH_API_KEY 등) 유지
   Environment=GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
   ```
   실제 토큰 값으로 `ghp_xxxxxxxxxxxx` 부분을 교체. 저장 후:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart opencode
   ```

3. **연결 확인**
   ```bash
   opencode mcp list
   ```
   github가 **connected**로 나오면 성공.  
   (opencode.json의 github 블록에 `"environment": { "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_PERSONAL_ACCESS_TOKEN}" }` 가 있어야 환경변수가 MCP 프로세스에 전달됩니다.)

### 한 번에 넣기 (템플릿)

아래 내용을 기존 `opencode.json`의 최상위에 **병합**합니다. 이미 `mcp`가 있으면 그 안에 항목만 추가.

- **Stitch**: API 키만 쓰려면 [§1 옵션 A](#옵션-a--api-키만-권장-헤드리스-서버)(piyushcreates/stitch-mcp, Python) 사용. 아래는 npm `stitch-mcp`(GCP 인증용) 예시이며, API 키 전용이면 stitch 블록을 옵션 A 설정으로 교체하면 됨.

```json
"mcp": {
  "stitch": {
    "type": "local",
    "command": ["npx", "-y", "stitch-mcp"],
    "enabled": false,
    "environment": { "STITCH_API_KEY": "{env:STITCH_API_KEY}" }
  },
  "vercel": {
    "type": "remote",
    "url": "https://mcp.vercel.com",
    "enabled": true
  },
  "github": {
    "type": "local",
    "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
    "enabled": true,
    "environment": { "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_PERSONAL_ACCESS_TOKEN}" }
  }
}
```

- Stitch/Vercel/GitHub 중 쓰지 않는 것은 `"enabled": false`로 두거나 블록을 제거하면 됩니다.
- 적용 후: `opencode mcp list`로 등록 확인, `opencode mcp auth vercel`로 Vercel 인증(필요 시). 서버면 `sudo systemctl restart opencode`.

#### MCP 설정이 사라졌을 때 (원인과 재발 방지)

**원인:** 서버의 `~/.config/opencode/opencode.json`이 **MCP가 포함되지 않은 템플릿으로 다시 덮어씌워졌기 때문**입니다.

- **`scripts/install_opencode.sh`**  
  `infra/templates/opencode.json`(권한만 있음)을 그대로 복사해 전역 설정을 **통째로 교체**합니다. 이 스크립트를 서버에서 다시 실행하면 기존에 수동으로 넣어 둔 `mcp`, `provider`, `agent` 등이 모두 사라집니다.
- **문서의 “opencode.json 복사” 절차**  
  `scp ... opencode-server-gemini-chatgpt-oauth.json ... opencode.json` 으로 설정을 다시 넣을 때, 해당 템플릿에는 `mcp` 블록이 없어서 한 번 덮어쓰면 MCP 설정이 없어집니다.
- **에이전트만 병합할 때**  
  `jq -s '.[0] + .[1]' opencode.json opencode-agents-orchestration.json` 처럼 **gemini + agents**만 합치고 MCP 템플릿을 넣지 않으면, 결과물에 `mcp`가 없습니다.

**재발 방지:**  
설정을 다시 반영할 때는 **MCP까지 포함해 병합**해야 합니다. 예: 기존 서버 설정을 백업한 뒤, `opencode-server-gemini-chatgpt-oauth.json` + `opencode-agents-orchestration.json` + **`opencode-mcp-dev.json`** 을 순서대로 `jq -s '.[0] * .[1] * .[2]'` 등으로 병합해 덮어쓰거나, 이미 MCP가 들어 있는 최종 opencode.json을 scp로 올립니다.  
**`install_opencode.sh`는 OpenCode 최초 설치 시에만 쓰고**, 이미 서버에 agent·MCP 등을 넣어 둔 상태에서는 이 스크립트로 opencode.json을 다시 덮어쓰지 않는 것이 좋습니다.

---

## 3. 권한(permission) + LLM 통합 예시

`infra/templates/opencode.json`은 **권한만** 정의해 두었습니다.  
전역 config에서 **권한 + provider + model**을 한 번에 두려면 아래처럼 확장할 수 있습니다.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "default": "ask",
    "edit": "ask",
    "bash": "ask",
    "external_directory": {
      "/srv/repos/**": "allow",
      "**": "ask"
    },
    "bash_allow": [
      "git status",
      "git diff",
      "git log --oneline -5",
      "grep -r",
      "ls -la",
      "pwd",
      "cat"
    ]
  },
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  },
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-3-5-haiku-20241022",
  "server": {
    "hostname": "127.0.0.1",
    "port": 4096
  }
}
```

- **permission**: DevBridge/OpenClaw가 호출하는 환경이므로 `ask`로 두고, 필요 시 `bash_allow`만 추가하는 것을 권장. **단, ACP/헤드리스**(김빌드가 exec+process로 `opencode acp`만 띄우는 스킬 방식)에서는 승인 UI가 없어 `ask`이면 권한 요청 시 무한 대기하므로, 서버 `~/.config/opencode/opencode.json`에 **`"permission": "allow"`** 로 두어야 한다. 레포: **`./scripts/patch_opencode_permission_allow_on_server.sh`**.
- **server**: `opencode serve --hostname 127.0.0.1 --port 4096`으로 이미 띄웠다면 생략 가능. config로 통일해도 됨.

---

## 4. systemd에 API 키 넣기 (비밀 분리)

비밀번호·API 키는 unit 파일에 직접 쓰지 않고 **override 디렉터리**로 두는 것이 좋습니다.

```bash
sudo mkdir -p /etc/systemd/system/opencode.service.d
sudo nano /etc/systemd/system/opencode.service.d/env.conf
```

내용 예:

```ini
[Service]
Environment=OPENCODE_SERVER_PASSWORD=기존_서버_비밀번호
Environment=ANTHROPIC_API_KEY=sk-ant-...
# 필요 시
# Environment=OPENCODE_CONFIG=/home/devassistant/.config/opencode/opencode.json
```

저장 후:

```bash
sudo systemctl daemon-reload
sudo systemctl restart opencode
```

`env.conf`는 버전 관리에 넣지 말고, 서버마다 로컬로만 관리하세요.

---

## 5. 확인

1. **OpenCode 헬스**  
   ```bash
   curl -u opencode:<OPENCODE_SERVER_PASSWORD> http://127.0.0.1:4096/global/health
   ```  
   `{"healthy":true,"version":"..."}` 이면 서비스는 정상.

2. **DevBridge에서 OpenCode 연결** (레거시: DevBridge 사용 시)  
   ```bash
   curl -H "X-DevBridge-Token: <DEVBRIDGE_TOKEN>" http://127.0.0.1:8080/health
   ```  
   `opencodeConnected: true` 이면 DevBridge → OpenCode 연동 OK.

3. **실제 plan/build**  
   텔레그램에서 김빌드 과장에게 `/plan 간단한 작업` 요청 후, DevBridge 승인까지 진행되면 OpenCode가 LLM을 사용해 계획을 세우는지 확인할 수 있습니다.  
   이때 OpenCode 로그에서 LLM 호출/에러가 있는지 확인:

   ```bash
   journalctl -u opencode -f
   ```

4. **OpenCode 진행 상황 / 실행 화면 보기**  
   "한참 해매는 느낌"일 때, 서버에 붙어서 보는 방법은 [05_DEVBRIDGE.md § OpenCode 진행 상황 보기](05_DEVBRIDGE.md) 참고.  
   요약: 김빌드에게 `/activity`, API 폴링(`/v1/opencode/session-activity`), 실시간 SSE(`/v1/opencode/live`), `journalctl -u opencode -f`.  
   **실행 화면(TUI)을 보고 싶다면** 서버에 SSH 접속한 뒤 `opencode attach http://127.0.0.1:4096` 를 실행한다. (서버에 비밀번호를 설정해 두었다면 `OPENCODE_SERVER_PASSWORD='<비밀번호>' opencode attach ...` 로 실행.)

---

## 5.5 흔한 오류: Cloud Code Assist API (401)

**증상**: 김빌드에게 "오픈코드 상태 확인해줘"라고 하면 다음 메시지가 온다.

```text
Cloud Code Assist API error (401): Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.
```

**원인**: OpenCode 설정에 **Google(Gemini / Cloud Code Assist)** 프로바이더가 들어 있는데, 해당 API를 부를 때 쓰는 **인증( OAuth 토큰 또는 API 키)** 이 없거나 만료된 상태다. `/devstatus` 등으로 상태를 조회할 때 OpenCode가 에이전트·프로바이더를 불러오면서 Google API를 호출하고, 그때 401이 발생한다.

**조치** (둘 중 하나):

1. **Google을 계속 쓰려면**  
   - 서버에서 `opencode auth login` → **Google** 선택 후 OAuth 다시 진행.  
   - 또는 로컬에서 인증한 뒤 `~/.local/share/opencode/auth.json` 을 서버로 복사.  
   - (opencode-gemini-auth 사용 시) headless 서버에서는 리다이렉트 URL을 터미널에 붙여넣는 방식으로 재인증.

2. **Google을 OpenCode에서 쓰지 않는다면**  
   - `~/.config/opencode/opencode.json` 에서 **Google 프로바이더·플러그인** 제거 또는 비활성화.  
   - 예: `"plugin"` 배열에서 `opencode-gemini-auth` 제거, `provider.google` 제거, 기본 `model` 을 다른 프로바이더(예: Anthropic, OpenAI)로 변경.  
   - 저장 후 `sudo systemctl restart opencode` 로 재시작.

재인증 또는 Google 설정 제거 후에는 상태 조회 시 401 없이 동작해야 한다.

#### 인증이 풀렸을 때 (재인증)

1. **서버에 SSH 접속** (대화형 터미널 유지).
2. **Google(Gemini)만 다시 붙이기**:  
   `opencode auth login` → **Google** → **OAuth with Google (Gemini CLI)**.  
   터미널에 나온 **URL**을 맥/폰 브라우저로 열고 Google 로그인 후, **리다이렉트된 URL 전체**를 복사해 서버 터미널에 붙여넣기.
3. **OpenCode 재시작**:  
   `sudo systemctl restart opencode`
4. **확인**: 김빌드에게 `/devstatus` 또는 "오픈코드 상태 확인해줘" 요청. 401 없이 응답하면 성공.

(ChatGPT 등 다른 프로바이더도 풀렸으면 같은 터미널에서 `opencode auth login` → 해당 프로바이더 선택 후 동일하게 URL 붙여넣기.)

---

## 5.6 흔한 오류: UnknownError (Google Cloud project ID를 찾지 못함)

**증상**: 에이전트들이 도구를 사용할 때 `UnknownError`가 나며 작업이 중단된다. 로그에 project ID 관련 메시지가 보인다.

**원인**  
- **Stitch MCP 때문이 아님**. 우리는 서드파티 piyushcreates/stitch-mcp를 쓰고 있어서 **STITCH_API_KEY**만 필요하다. projectId는 Stitch 쪽이 아니라 **opencode-gemini-auth**(Gemini OAuth) 쪽 설정이다.
- **opencode-gemini-auth**는 에이전트가 `google/*` 모델(gemini-2.5-flash, gemini-3-flash-preview 등)을 호출할 때 **GCP project ID**를 쓰거나 자동 프로비저닝을 시도한다.  
  - 무료 계정은 보통 자동으로 프로비저닝하지만, Workspace·유료 Code Assist·일부 계정·헤드리스 환경에서는 실패해 projectId가 필요하다.
- Gemini OAuth(auth.json)와 **별개로**, API 호출 시 project ID가 요구되는 것이다.

**조치** (둘 중 하나):

1. **opencode.json에 projectId 추가**  
   서버 `~/.config/opencode/opencode.json`의 `provider.google` 안에 `options.projectId`를 넣는다:
   ```json
   "provider": {
     "google": {
       "options": {
         "projectId": "실제-GCP-프로젝트-ID"
       },
       "name": "Google",
       "models": { ... }
     }
   }
   ```
   `실제-GCP-프로젝트-ID`는 [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 선택한 뒤, 프로젝트 ID(예: `my-project-123456`)로 채운다.

2. **환경변수로 설정**  
   systemd override(`opencode.service.d/env.conf` 또는 `mcp-env.conf`)에 추가:
   ```ini
   Environment=GOOGLE_CLOUD_PROJECT=실제-GCP-프로젝트-ID
   ```
   또는 `OPENCODE_GEMINI_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT_ID` 중 하나를 사용해도 된다.

**GCP 프로젝트가 없다면**  
1. [console.cloud.google.com](https://console.cloud.google.com/) 접속  
2. 프로젝트 선택 또는 새 프로젝트 생성  
3. 프로젝트 ID 복사(예: `my-project-123456`)  
4. 위 1 또는 2 방식으로 설정  
5. `sudo systemctl daemon-reload && sudo systemctl restart opencode`

설정 후 에이전트 작업이 UnknownError 없이 진행되면 정상이다. **재발 방지**를 위해 설정 체크리스트에 "Google Cloud projectId 설정 여부" 항목을 두면 좋다.

---

## 6. 요약

- **DevBridge**: 이미 설정됐으면 변경 없음.
- **OpenCode**:  
  - 설치·serve·비밀번호는 [03](03_INSTALL_OPENCODE.md) 참고.  
  - **LLM**: provider + model을 `~/.config/opencode/opencode.json`에 두고, API 키는 `{env:...}`로 참조.  
  - **권한**: 기존 `infra/templates/opencode.json`처럼 permission·bash_allow 유지.  
  - **비밀**: systemd override `opencode.service.d/env.conf`에만 넣고, 설정 파일은 버전 관리 가능한 범위로 유지.

이렇게 하면 OpenCode까지 LLM 연결·설정이 끝납니다.

---

## 7. 부록: OAuth/구독 방식 연결 가능 LLM 서비스

API 키 없이 **브라우저 로그인·구독·디바이스 코드** 등으로 연결할 수 있는 서비스만 정리합니다. (문서·제품 버전에 따라 변경될 수 있음.)

### OpenCode (`/connect` 또는 `opencode auth login`)

| 서비스 | 인증 방식 | 비고 |
|--------|-----------|------|
| **OpenAI – ChatGPT Plus/Pro** | 브라우저 OAuth | `/connect` → OpenAI → "ChatGPT Plus/Pro" 선택 시 브라우저 로그인 |
| **Anthropic – Claude Pro/Max** | 브라우저 OAuth | `/connect` → Anthropic → "Claude Pro/Max" 선택 시 브라우저 로그인 |
| **GitHub Copilot** | 디바이스 코드 | `/connect` → GitHub Copilot → [github.com/login/device](https://github.com/login/device)에 코드 입력. Pro+ 구독 필요 |
| **GitLab** | 브라우저 OAuth | `/connect` → GitLab → "OAuth (Recommended)" 선택 시 브라우저 승인 |
| **OpenCode Zen** | 웹 로그인 후 API 키 붙여넣기 | [opencode.ai/auth](https://opencode.ai/auth) 로그인 후 키 복사 → `/connect`에서 붙여넣기. 구독형 |
| **OpenCode Go** | 동일 | 저비용 구독 플랜. 동일하게 opencode.ai/auth → 키 붙여넣기 |
| **Google Gemini** | 브라우저 OAuth (플러그인) | **opencode-gemini-auth** 플러그인 필요. config에 `"plugin": ["opencode-gemini-auth@latest"]` 추가 후 `opencode auth login` → Google → "OAuth with Google (Gemini CLI)". [jenslys/opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) |
| **Anthropic Claude Pro/Max** | ~~브라우저 OAuth~~ **차단됨** | **2026년 1월~** Anthropic이 OpenCode·OpenClaw 등 서드파티에서 구독(OAuth) 토큰 사용을 차단. Claude는 **API 키**(sk-ant-api03-*)만 사용 가능. |

### OpenClaw (`openclaw models auth` 등)

| 서비스 | 인증 방식 | 비고 |
|--------|-----------|------|
| **OpenAI – ChatGPT Plus (Codex)** | OAuth (인증 복사) | 로컬에서 Codex CLI 또는 OpenClaw로 OAuth 후 `~/.codex/auth.json` 등을 서버로 복사. 서버 번들에 openai-codex provider 없을 수 있음 → [07_OPENCLAW_LLM.md](07_OPENCLAW_LLM.md) 참고 |
| **Claude Pro/Max** | setup-token (붙여넣기) | `claude setup-token` 실행 후 나온 토큰을 `openclaw models auth paste-token --provider anthropic` |
| **Gemini Pro** | 브라우저 OAuth | 플러그인 `google-gemini-cli-auth`. 서버에 Gemini CLI 설치 후 `openclaw models auth login --provider google-gemini-cli`. URL을 브라우저에서 열고 리다이렉트 URL을 터미널에 붙여넣기 |

### 요약

- **진짜 OAuth(브라우저만)**  
  OpenCode: ChatGPT Plus/Pro, GitLab, **Gemini(opencode-gemini-auth 플러그인)**. **Claude Pro/Max OAuth는 Anthropic 정책으로 OpenCode/OpenClaw에서 차단됨(2026년~).**  
  OpenClaw: Gemini (google-gemini-cli), Codex(로컬에서만 가능한 경우 있음). Claude 구독은 OpenClaw에서도 동일 정책 적용 가능.
- **토큰/코드 한 번 붙여넣기**  
  OpenClaw: Claude (setup-token).  
  OpenCode: GitHub Copilot (device code), OpenCode Zen/Go (웹 로그인 후 키).
- **headless 서버**에서는 브라우저가 없으므로, OAuth는 **로컬에서 완료 → auth.json 등 인증 파일을 서버로 복사**하는 방식으로 사용합니다.

---

## 8. 부록: Oh My OpenCode (OMO) 플러그인

**Oh My OpenCode**(오마이오픈코드, OMO)는 OpenCode **위에 올리는 오케스트레이션 플러그인**입니다. OpenCode를 대체하지 않고, 에이전트·훅·MCP·LSP를 미리 구성해 줍니다.

### 제공 기능 요약

| 항목 | 설명 |
|------|------|
| **에이전트** | Sisyphus(플래너·작업 완수), Librarian(문서), Explore(코드 탐색), Oracle(아키텍처 분석) 등 |
| **훅** | 20+ 개 (세션 복구, 컨텍스트 관리, 작업 이어하기 등) |
| **MCP** | Context7, grep.app 등 코드/문서 검색 연동 |
| **LSP** | 언어별 분석·리팩터링 |
| **빌드 파이프라인** | 멀티 레포·하이브리드 스택(Hugo/React, Vite 등) 인식 |

- 사이트: [ohmyopencode.com](https://ohmyopencode.com/)  
- 저장소: [github.com/code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)

### 써보면 좋은 이유

- 이미 **오케스트레이션**(Planner/Architect/Coder/Reviewer/QA)을 쓰고 있다면, OMO는 **플래너·작업 완수·컨텍스트 관리**를 플러그인으로 보강해 줌.
- `opencode.json`은 그대로 두고, **OMO 전용 설정**은 `oh-my-opencode.json`으로 분리되므로 기존 설정과 충돌 가능성이 낮음.
- OpenCode 1.0.133 이상이면 설치만 추가하면 됨.

### 설치 (로컬 또는 서버)

OpenCode를 먼저 설치한 뒤:

```bash
# 권장
bunx oh-my-opencode install

# 또는
npm install -g oh-my-opencode
```

버전: OpenCode **1.0.133 이상** 권장 (1.0.132 이하는 config 버그 가능성 있음).

### 서버에서 OMO 설치 및 설정 (요약)

이미 OpenCode + Gemini(opencode-gemini-auth)가 설정된 서버에 OMO를 붙일 때:

1. **설치** (비대화형, Gemini만 사용 시):
   ```bash
   npm install -g oh-my-opencode
   oh-my-opencode install --no-tui --claude=no --openai=no --gemini=yes --copilot=no
   ```
   - 설치기가 `~/.config/opencode/opencode.json`에 `oh-my-opencode@latest`를 추가하고, `oh-my-opencode.json`을 생성함. 기존 `opencode-gemini-auth`, permission, model, server 설정은 유지됨.

2. **plan과 Sisyphus 둘 다 쓰기** (선택): `~/.config/opencode/oh-my-opencode.json`에 다음을 넣거나 `agents["planner-sisyphus"]`를 추가:
   ```json
   "agents": {
     "planner-sisyphus": { "enabled": true, "replace_plan": false }
   }
   ```
   - 레포 템플릿: `infra/templates/oh-my-opencode.json` 참고.

3. **재시작**: `sudo systemctl restart opencode`

4. **확인**: `journalctl -u opencode -n 20` 에서 `opencode server listening on http://127.0.0.1:4096` 확인. DevBridge → /plan·/build 호출 시 OMO 에이전트·훅이 함께 동작하는지 실제 요청으로 검증.

### 팀 구성 설정 (에이전트·모델)

**누가 정하는지**: 에이전트 팀 구성과 모델 배정은 **설정 파일**로 사람이 정한다. 실행 중에 “누가 뭘 할지”는 플래너(기본) 또는 Sisyphus(OMO)가 정한다.

#### OpenCode 기본 (OMO 없을 때)

| 설정 파일 | 항목 | 역할 |
|-----------|------|------|
| `opencode.json` | `model`, `small_model` | 기본·소형 작업용 모델 |
| `opencode.json` | (선택) `agent.plan`, `agent.build` | plan/build 에이전트별 모델 오버라이드 |

- 플래너(plan)가 계획을 세우고, build가 실행. 모델을 지정하지 않으면 위 `model`/`small_model`을 씀.

#### 일반 OpenCode 오케스트레이션 에이전트 팀 (현재 적용)

`opencode.json`의 **`agent`** 로 plan(Planner), build(Implementer)와 서브에이전트 architect, reviewer, qa를 구성. OMO가 아닌 **기본 plan/build** 사용 시 적용.

| 역할 | 하는 일 | 모델 | variant | 이유 |
|------|----------|------|---------|------|
| **Planner** (plan) | 요구사항 분해·우선순위·순서 | openai/gpt-5.2 | high | 오케스트레이션/일관성/완수력 |
| **Architect** (architect) | 구조·보안·확장성 판단 | google/gemini-3.1-pro-preview-customtools | high | 설계/분석 + 툴 연계 |
| **Implementer** (build) | 코드 작성·기능 구현 | openai/gpt-5.3-codex | — | 코딩 생산성/정확도 |
| **Reviewer** (reviewer) | 논리/버그/엣지/리팩터링 지적 | google/gemini-3.1-pro-preview | — | Implementer와 다른 모델로 리뷰 |
| **QA/SDET** (qa) | 테스트 시나리오·테스트 코드·재현절차 | google/gemini-3-flash-preview | — | 테스트케이스는 많고 빠르게 (필요 시 Pro 승격) |

- **plan**, **build**: primary 에이전트. Tab/기본 전환.
- **architect**, **reviewer**, **qa**: subagent. `@architect`, `@reviewer`, `@qa` 로 호출하거나 primary가 Task 도구로 호출.

레포 템플릿: `infra/templates/opencode-agents-orchestration.json`. 서버에 반영 시 기존 `opencode.json`과 `jq -s '.[0] + .[1]'` 로 병합.

#### OMO 에이전트 팀 (Gemini만 쓸 때 예시)

`oh-my-opencode.json`의 `agents`에서 에이전트별 모델을 지정한다. **OpenCode Zen/Copilot 등이 없으면** `opencode/glm-4.7-free`, `opencode/gpt-5-nano` 등은 쓸 수 없으므로 전부 **Gemini**로 통일한다.

| 에이전트 | 역할 | 모델 (예시) | 비고 |
|----------|------|-------------|------|
| **planner-sisyphus** | 플래너·작업 완수 | `google/gemini-3-pro-preview` | `replace_plan: false`면 기본 plan과 공존 |
| **prometheus** | 플래너 인터뷰/프로메테우스 모드 | `google/gemini-3-pro-preview` | |
| **oracle** | 아키텍처·분석 | `google/gemini-3-pro-preview` (variant high) | |
| **librarian** | 문서 검색·정리 | `google/gemini-3-flash-preview` | 빠른 문서 작업용 |
| **explore** | 코드 탐색 | `google/gemini-3-flash-preview` | |
| **multimodal-looker** | 이미지·멀티모달 | `google/gemini-3-flash-preview` | |
| **metis, momus, atlas** | 보조 에이전트 | `google/gemini-3-pro-preview` | 필요 시 variant 지정 |

- **Pro** 계열: 계획·아키텍처·무거운 추론.
- **Flash** 계열: 문서/탐색/멀티모달 등 속도 중시.

#### 최적 배치 (주 1개 앱 개발) — 현재 적용

| 구분 | 에이전트/카테고리 | 모델 | variant |
|------|-------------------|------|---------|
| **에이전트** | planner-sisyphus | openai/gpt-5.2 | high |
| | prometheus | google/gemini-3-flash-preview | — |
| | oracle | google/gemini-3.1-pro-preview | high |
| | librarian | google/gemini-2.5-flash-lite | — |
| | explore | openai/codex-mini-latest | — |
| | multimodal-looker | google/gemini-2.5-flash-image | — |
| | metis | google/gemini-2.5-flash | — |
| | momus | openai/gpt-5.2 | — |
| | atlas | google/gemini-3-flash-preview | — |
| **카테고리** | visual-engineering | openai/gpt-5.3-codex | — |
| | ultrabrain | openai/gpt-5.2 | high |
| | artistry | google/gemini-3-pro-preview | — |
| | quick, writing | google/gemini-3-flash-preview | — |
| | unspecified-low | google/gemini-2.5-flash-lite | — |
| | unspecified-high | openai/gpt-5.2 | — |

**운영 룰** (AGENTS.md §4.5): visual-engineering은 Stitch MCP 스킬 우선(프롬프트 정제→Stitch→React→Codex); 동일 오류 2회 반복 시 gpt-5.3-codex로 1회 승격; 설계 결정 불가 시 oracle(3.1-pro high)에 1회 결정 요청.

레포 템플릿: `infra/templates/oh-my-opencode.json`. 서버에 반영 후 `sudo systemctl restart opencode`로 재시작.

### headless 서버(opencode serve)에서의 동작

- OMO는 대부분 **TUI** 사용 예시(`opencode --agent sisyphus`)로 소개됨.
- **`opencode serve`** 로 떠 있는 서버에서 DevBridge가 /plan, /build를 호출할 때, **OpenCode가 플러그인을 로드하면** OMO 에이전트·훅도 함께 동작할 수 있음.
- 서버에 OMO를 설치해 두고, `opencode.json`에 `"plugin": ["oh-my-opencode"]`(또는 OMO가 안내하는 플러그인 이름)가 포함되면, serve 모드에서도 플러그인이 로드되는지 **한 번 확인**해 보면 됨.  
  동작하지 않으면 OMO 이슈/문서에서 “serve / headless” 지원 여부를 검색하는 것이 좋음.

### 기존 설정과 중복/대체 관계 (중요)

**설정 파일**은 겹치지 않습니다. OMO는 **별도 파일** `oh-my-opencode.json`만 사용하고, `opencode.json`을 덮어쓰지 않습니다. OpenCode가 두 설정을 병합해 로드합니다.

**에이전트 역할**은 겹칩니다. OMO는 “플래너” 역할을 **OpenCode 기본 plan 에이전트 대신** 씁니다.

- OMO 설정에 **`replace_plan`** 옵션이 있음 (기본값 **true**).
  - **`replace_plan: true`** (기본): OpenCode 기본 **plan** 에이전트를 **서브 에이전트로 밀어내고**, **Planner-Sisyphus**가 플래너 역할을 담당함. 즉 **plan ↔ Sisyphus가 기능적으로 대체** 관계.
  - **`replace_plan: false`**: plan과 Sisyphus **둘 다** 사용 가능. 플래너가 두 개 공존.
- 따라서 “중복이 전혀 없다”고 보기는 어렵고, **플래너 역할은 OMO 쓰면 기본적으로 Sisyphus로 대체**된다고 보는 게 맞음.
- 우리 쪽 **AGENTS.md**의 “Planner/Architect/Coder/Reviewer/QA”는 **김빌드가 OpenCode에 주는 지시(역할 구분)**이고, OpenCode/OMO의 에이전트 이름(plan, build, sisyphus 등)과 1:1로 같진 않음. 다만 **/plan** 요청이 OpenCode로 들어갔을 때, OMO가 있으면 그 요청을 **Sisyphus**가 처리하게 됨.

**정리**

- **파일/키 충돌**: 없음. `opencode.json` + `oh-my-opencode.json` 별도.
- **역할 중복/대체**: 있음. **plan ↔ Sisyphus**는 OMO 기본값으로 **대체** 관계. 기존에 `opencode.json`에서 `agent.plan`을 커스터마이즈했다면, OMO 사용 시 그 설정은 Sisyphus에게 밀릴 수 있음.
- **둘 다 쓰고 싶을 때**: `oh-my-opencode.json`에서 `"replace_plan": false`로 두면 OpenCode 기본 plan과 Sisyphus를 둘 다 쓸 수 있음 (문서: [Configuration - Agents](https://ohmyopencode.com/configuration/)).

### OMO 위주 vs 기본 설정 위주: 양쪽 유불리

병행보다 **한쪽을 메인**으로 쓰는 편이 낫다면, 아래처럼 정리할 수 있음.

---

#### A. OMO 사용 (기본 plan/build는 쓰지 않음, OMO 에이전트·훅 위주)

| 구분 | 내용 |
|------|------|
| **장점** | • **Sisyphus**: “작업 완수”에 초점 맞춘 플래너. 중간에 멈추지 않고 끝까지 가는 동작을 노린 설계.<br>• **20+ 훅**: 세션 복구, 컨텍스트 관리, 작업 이어하기, 컴팩션 등이 이미 묶여 있음.<br>• **MCP·LSP**: Context7, grep.app, 언어 서버 등이 기본 구성에 포함. 문서/코드 검색·리팩터가 바로 활용 가능.<br>• **빌드 파이프라인 인식**: 멀티 레포·하이브리드 스택(Hugo/React, Vite 등)을 전제로 한 워크플로.<br>• **바로 쓸 수 있는 구성**: opencode.json 최소만 두고, 나머지는 OMO 기본값으로 돌릴 수 있음. |
| **단점** | • **OMO 의존성**: 플러그인 업데이트·호환성(OpenCode 버전)을 계속 봐야 함.<br>• **serve/headless**: OMO 문서는 TUI 기준. `opencode serve`에서 /plan·/build 호출 시 OMO 에이전트·훅이 그대로 적용되는지는 환경에서 한 번 검증 필요.<br>• **역할 매핑 차이**: AGENTS.md의 Planner/Architect/Coder/Reviewer/QA와 OMO의 Sisyphus·Librarian·Explore·Oracle은 이름·역할이 다름. 김빌드가 “에이전트 팀으로 토론해라”라고 해도, 실제로는 Sisyphus 등 OMO 에이전트가 처리하는 구조가 됨.<br>• **커스터마이즈**: 에이전트·훅 조정은 `oh-my-opencode.json` 위주. OpenCode 기본 `agent.plan`/`agent.build` 커스텀은 OMO 사용 시 거의 의미 없음. |

---

#### B. 기본 OpenCode만 사용 (OMO 미사용)

| 구분 | 내용 |
|------|------|
| **장점** | • **김빌드·AGENTS.md와 1:1**: /plan → OpenCode **plan**, /build → **build**. TOOLS.md·AGENTS.md에 정의한 워크플로와 단순하게 대응.<br>• **역할 정의를 우리가 완전 제어**: “Planner/Architect/Coder/Reviewer/QA”를 프롬프트·지시로만 쓰고, OpenCode는 plan/build 두 개만 써도 됨. opencode.json의 `agent.plan`, `agent.build`(모델·도구)만 관리하면 됨.<br>• **설정 단순**: opencode.json + permission + provider/model만 있으면 됨. 플러그인·oh-my-opencode.json 없음.<br>• **serve 모드 검증**: DevBridge → OpenCode serve(/plan, /build) 조합은 플러그인 없이 널리 쓰이는 경로라, 문서·이슈가 많음. |
| **단점** | • **플래너·빌드 동작은 OpenCode 기본만**: “작업 완수”나 “중간에 끊기지 않게 이어가기” 같은 건 기본 plan/build에 크게 의존. 훅이 없어서 세션 복구·컨텍스트 관리는 직접 설계하거나 프롬프트로 보완해야 함.<br>• **MCP·LSP**: 쓰려면 opencode.json·프로젝트에 직접 MCP/LSP 설정 추가 필요. OMO처럼 “한 번에 들어 있는” 상태는 아님.<br>• **빌드/멀티레포**: 복잡한 빌드·멀티 레포는 프롬프트(AGENTS.md·TOOLS.md)나 지시로만 해결. 도구·훅 레벨 지원은 OMO가 더 많음. |

---

#### 선택 가이드 (요약)

- **OMO 위주로 갈 때**: “플래너가 작업을 끝까지 완수하게”, “세션 끊겨도 복구”, “문서/코드 검색·LSP를 최소 설정으로 쓰고 싶다”가 중요하면 OMO를 메인으로 두고, **기본 plan/build는 대체(replace_plan: true 유지)** 하는 쪽이 맞음. 김빌드 → OpenCode 흐름은 그대로 두고, OpenCode **내부**는 OMO 에이전트·훅에 맡기는 형태.
- **기본 설정 위주로 갈 때**: “김빌드/AGENTS.md/TOOLS.md에 정의한 plan–build–diff–apply와 역할만 깔끔하게 맞추고, 추가 플러그인 의존은 줄이고 싶다”면 OMO를 쓰지 않고, **opencode.json의 plan/build + permission/model만** 사용하는 쪽이 맞음. MCP·LSP·훅이 필요하면 나중에만 골라서 추가.

---

### 운영 방안: 양쪽 모두 셋팅 + 업무 최초 지시 시 OMO 여부 선택

**정책**: OMO와 기본 설정을 **둘 다** 갖춰 두고, **업무를 처음 지시하는 시점**에 "이번 작업은 OMO로 할지 / 기본으로 할지"를 정한다.

#### 1) 셋팅 (양쪽 모두)

- **OpenCode**: opencode.json에 permission, provider, model, (선택) agent.plan / agent.build 정의. 그대로 유지.
- **OMO**: 플러그인 설치 (`bunx oh-my-opencode install`). `oh-my-opencode.json`을 두고, **`replace_plan: false`** 로 설정해 **plan과 Sisyphus 둘 다** 사용 가능하게 둠.
  ```json
  {
    "agents": {
      "planner-sisyphus": {
        "enabled": true,
        "replace_plan": false
      }
    }
  }
  ```
- 그러면 OpenCode 한 대에서 **기본 plan/build**와 **OMO Sisyphus·훅·MCP**가 공존함. 업무별로 "어느 쪽을 쓸지"만 정하면 됨.

#### 2) 업무 최초 지시 시점에서 선택

- **대표님**이 업무를 처음 지시할 때, 다음 중 하나로 OMO 사용 여부를 나타낸다.
  - **OMO로 진행**: 지시 문구 앞뒤에 **"OMO로"** 또는 **"오마이오픈코드로"** 를 붙인다.  
    예: `업무지시: (OMO로) 로그인 없이 공개 페이지에 /plan→/build로 기능 추가.`
  - **기본으로 진행**: 위 키워드 없이 지시하면 **기본(plan/build)** 으로 진행한다.
- **김빌드 과장**은 AGENTS.md/TOOLS.md에 따라, **첫 업무 지시에 "OMO로"(또는 "오마이오픈코드로")가 포함되면** OpenCode에 넘기는 요청(프롬프트/지시)에  
  **"이번 작업은 OMO(Oh My OpenCode)의 Sisyphus 플래너 및 OMO 훅·MCP를 사용해 진행한다."**  
  같은 문구를 포함한다. 반대로 키워드가 없으면 **"이번 작업은 OpenCode 기본 plan/build 에이전트로 진행한다."** 로 구분해 전달한다.
- OpenCode serve가 요청별로 에이전트를 지정하는 API를 지원하면, 그에 맞춰 Sisyphus vs plan을 지정할 수 있음. 지원하지 않으면 **프롬프트 문구로 구분**하는 방식이 됨.

#### 3) 워크스페이스 규칙 반영

- 위 규칙(업무 최초 지시에 "OMO로" 포함 시 OMO 사용)은 **AGENTS.md** 및 **TOOLS.md**에 짧게 적어 두면, 김빌드가 매 세션 읽고 준수할 수 있음.

---

### 정리

- **써보면 어떨까?** → **추천.** 기존 OpenCode 설정을 건드리지 않고 플러그인만 추가해 보면, 플래너·훅·MCP가 김빌드 → OpenCode 흐름에 어떻게 끼어드는지 바로 확인할 수 있음.
- **양쪽 모두 셋팅 + 지시 시점 선택**: OMO 설치 + **replace_plan: false** 로 plan·Sisyphus 공존시키고, **업무 최초 지시**에 "OMO로"(또는 "오마이오픈코드로")가 있으면 OMO(Sisyphus)로, 없으면 기본(plan/build)으로 진행하도록 AGENTS.md/TOOLS.md에 규칙을 두면 됨.
- 먼저 **로컬**에서 `opencode` TUI로 `opencode --agent sisyphus` 실행해 보고, 괜찮으면 **서버** OpenCode에 같은 플러그인 설치 후 serve와 함께 테스트하면 됨.
