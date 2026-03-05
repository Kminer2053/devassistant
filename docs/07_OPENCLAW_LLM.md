# OpenClaw LLM 설정

OpenClaw에 연결할 LLM을 선택하고 API 키를 설정하는 방법입니다.

**진행 순서**: [04 OpenClaw 설치](04_INSTALL_OPENCLAW.md)가 끝난 뒤 이 문서를 진행하면 됩니다.

## 지원 LLM (선택지)

| 제공자 | 설명 | 비고 |
|--------|------|------|
| **Anthropic (Claude)** | Claude Opus/Sonnet, 코딩·요약에 강함 | API 키 또는 Claude 구독 setup-token |
| **OpenAI (GPT)** | GPT-4 등 | API 키만 필요 |
| **OpenRouter** | 여러 모델를 하나의 API로 (Claude, GPT, Gemini 등) | `OPENROUTER_API_KEY` 하나로 유연한 모델 선택 |
| **Google (Gemini)** | Gemini 시리즈 | API 키 |
| **MiniMax** | MiniMax M2 등 | API 키, Anthropic 호환 API |
| **Mistral** | Mistral 시리즈 | API 키 |
| **LM Studio** | 로컬 모델 (서버에 LM Studio 실행 시) | 비용 없음, 네트워크 불필요 |

**개발 비서(DevBridge/OpenCode 연동) 용도 추천**

- **Anthropic (Claude)** – 계획·코드 생성 품질이 좋고, 문서/CLI 지원이 잘 되어 있음.
- **OpenAI (GPT-4)** – 이미 쓰고 있다면 설정이 단순함.
- **OpenRouter** – 여러 모델을 바꿔 가며 쓰고 싶을 때 (비용/모델 선택 유연).

---

## OAuth / 구독 연동 (API 과금 없이)

이미 **ChatGPT Plus**, **Claude Pro/Max**, **Gemini** 등을 구독 중이라면, API 키 대신 OAuth·setup-token으로 연동하면 **구독 한도 안에서만 사용**되므로 별도 API 과금이 없습니다.

| 구독 | OpenClaw 연동 방식 | 비고 |
|------|--------------------|------|
| **ChatGPT Plus** | **OAuth (OpenAI Codex)** | 서버 번들에 provider 플러그인 없음 → Codex CLI 인증 복사 또는 API 키 |
| **Claude Pro/Max** | **setup-token** | `claude setup-token` 후 `openclaw models auth paste-token --provider anthropic` |
| **Gemini Pro** | **OAuth (Google Gemini CLI)** | 번들 플러그인 `google-gemini-cli-auth` 사용. 아래 "Gemini OAuth" 참고. |

### ChatGPT Plus (OpenAI Codex OAuth)

**사용량 한도 (공식 [Codex pricing](https://developers.openai.com/codex/pricing) 기준)**

| 구분 | ChatGPT Plus 기준 |
|------|--------------------|
| **로컬 메시지** (OpenClaw/CLI/IDE 등) | **5시간당 약 45~225회** (작업 크기·복잡도에 따라 변동) |
| **클라우드 태스크** | 5시간당 약 10~60회 (로컬과 한도 공유) |
| **코드 리뷰** (GitHub 연동) | 주당 10~25건 |

- “로컬 메시지”에 **OpenClaw에서 Codex OAuth로 보내는 요청**이 포함됩니다. 텔레그램 `/plan`, `/build` 등이 이 한도 안에서 소진됩니다.
- 작업이 가볍고 짧으면 5시간에 약 225회까지, 무겁고 길면 약 45회 수준입니다. 한도 소진 후에는 5시간 롤링 윈도우가 지나야 복구되거나, **GPT-5.1-Codex-Mini**로 바꾸면 같은 한도로 약 4배 더 많이 쓸 수 있습니다.
- 현재 사용량·리셋 시점: [Codex usage dashboard](https://chatgpt.com/codex/settings/usage) 또는 CLI에서 `/status`로 확인 가능.

**ChatGPT Plus 연결 체크리스트 (Contabo 서버 기준)**

OpenClaw는 **Contabo VPS에서** 돌고, Codex 호출도 **서버에서** 합니다.

**⚠️ 현재 제한**: OpenClaw npm 설치본에는 **openai-codex provider 플러그인이 포함돼 있지 않습니다.**  
서버에서 `openclaw models auth login --provider openai-codex` 를 실행하면 `Unknown provider "openai-codex". Loaded providers: copilot-proxy` 오류가 납니다.  
그래서 **서버 터미널에서 직접 Codex OAuth 로그인은 불가**하고, 아래 **방법 A(OpenClaw 로그인 후 복사)** 또는 **방법 C(Codex CLI 인증 복사)** 만 사용할 수 있습니다.

- **방법 A**: Mac에 OpenClaw 설치 → Codex OAuth 로그인 → `~/.openclaw/...` 인증 파일을 서버로 복사 (Mac에 OpenClaw 필요, Mac에서도 openai-codex provider가 있을 때만 가능)
- **방법 C (추천)**: Mac에서 **OpenAI Codex CLI** 로그인 → `~/.codex/auth.json` 을 서버로 복사. OpenClaw 문서: "If `~/.codex/auth.json` exists, the wizard can reuse it." 서버에 같은 경로에 두면 OpenClaw가 재사용할 수 있음.
- **대안**: **OpenAI API 키** 사용 (과금). 아래 "2. OpenAI (GPT)로 설정" 참고.

---

### 방법 C (추천): Codex CLI 인증 재사용

Mac에 **OpenAI Codex CLI**가 있고, 이미 `codex` 로그인을 했다면 `~/.codex/auth.json` 이 있습니다. 이 파일만 서버로 복사하면 OpenClaw가 Codex 구독 인증을 재사용할 수 있습니다.

1. **Mac**에서 Codex CLI 로그인 (한 번만, 아직 안 했다면):
   ```bash
   # Codex CLI 설치: https://developers.openai.com/codex/cli
   codex auth login
   ```
   브라우저에서 ChatGPT(Plus)로 로그인 until 완료.

2. **Mac**에서 서버로 `auth.json` 복사:
   ```bash
   ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "mkdir -p ~/.codex"
   scp -i ~/.ssh/github-actions-oracle ~/.codex/auth.json devassistant@46.250.254.159:~/.codex/auth.json
   ```

3. **서버**에서 OpenClaw 재시작 (systemd 사용 시):
   ```bash
   sudo systemctl restart openclaw
   ```

4. 텔레그램에서 `/plan 테스트` 로 동작 확인.  
   서버 기본 모델이 이미 `openai-codex/gpt-5.3-codex` 로 설정돼 있으면, 인증만 있으면 됩니다.

---

### 방법 D: SSH 터널링으로 서버에서 Codex OAuth

서버에 **openai-codex provider**가 있다면, Vercel MCP처럼 **로컬 포트 포워딩**으로 OAuth 콜백을 서버로 넘겨 서버에서 직접 로그인할 수 있습니다. OpenClaw Codex OAuth는 **1455** 포트에서 콜백을 받습니다.

1. **맥**에서 SSH 접속 시 **1455 포트 포워딩**:
   ```bash
   ssh -L 1455:127.0.0.1:1455 -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159
   ```
   (이 터미널은 인증 끝날 때까지 유지.)

2. **서버** 쪽(위 SSH 세션 안)에서:
   ```bash
   export PATH="$HOME/.npm-global/bin:$PATH"
   openclaw models auth login --provider openai-codex --set-default
   ```

3. 터미널에 나온 **인증 URL**을 맥 브라우저로 열고, ChatGPT(Plus) 로그인/승인.

4. 승인 후 브라우저가 `http://127.0.0.1:1455/auth/callback?...` 로 이동하면, 요청이 SSH 터널을 타고 **서버**의 OpenClaw로 전달되어 인증이 완료됩니다.

5. `openclaw models status` 로 openai-codex 프로필 확인 후, `sudo systemctl restart openclaw` (필요 시).

**참고**: 서버 OpenClaw 번들에 openai-codex provider가 없으면 `Unknown provider "openai-codex"` 가 나옵니다. 그 경우 [방법 C](#방법-c-추천-codex-cli-인증-재사용) 또는 [방법 A](#방법-a-mac에-openclaw-설치-후-로그인--서버로-복사)로 인증을 복사해야 합니다.

---

### 방법 B: 서버 터미널에서 로그인 (터널 없이, 현재 불가)

**현재 OpenClaw npm 번들에는 openai-codex provider가 없어 이 방법은 사용할 수 없습니다.**  
(위 **방법 D**처럼 터널링을 쓰거나, 나중에 해당 플러그인이 번들에 포함되면 서버에서 URL 받아서 브라우저로 열고 코드 붙여넣기 방식으로 가능해질 수 있음.)

---

### 방법 A: Mac에 OpenClaw 설치 후 로그인 → 서버로 복사

Mac에 OpenClaw를 깔고 로그인한 뒤, 생성된 인증 파일만 서버로 복사하는 방식입니다.

| 단계 | 어디서 | 할 일 |
|------|--------|--------|
| ① | **로컬 Mac** | OpenClaw 설치 |
| ② | **로컬 Mac** | Codex OAuth 로그인 (브라우저에서 ChatGPT 로그인) |
| ③ | **로컬 Mac** | 인증 파일을 서버로 복사하는 스크립트 실행 |
| ④ | **서버** | 인증·모델 상태 확인 후 텔레그램으로 테스트 |

**① 로컬 Mac: OpenClaw 설치**

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

설치 후 터미널 재실행 또는 `export PATH="$HOME/.npm-global/bin:$PATH"` 후 `openclaw --version` 으로 확인.

**② 로컬 Mac: Codex OAuth 로그인**

```bash
openclaw models auth login --provider openai-codex
```

브라우저가 뜨면 ChatGPT Plus 계정으로 로그인 until 완료.

**③ 로컬 Mac: 인증을 서버로 복사**

```bash
cd /Users/hoonsbook/devassistant
./scripts/copy_codex_auth_to_server.sh
```

다른 키·서버: `SSH_KEY=~/.ssh/내키 SERVER=user@서버 ./scripts/copy_codex_auth_to_server.sh`

**④ 서버에서 확인**

로컬에서 SSH로 들어가서 모델/인증 상태를 확인합니다.

```bash
ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 "export PATH=\"\$HOME/.npm-global/bin:\$PATH\"; openclaw models status"
```

출력에 `openai-codex` 관련 프로필이 보이면 성공입니다. **텔레그램**에서 봇에게 `/plan 테스트` 또는 짧은 메시지를 보내서 응답이 오는지 확인하면 됩니다.

---

**참고**

- 서버의 기본 모델은 이미 `openai-codex/gpt-5.3-codex` 로 설정돼 있습니다. 바꾸려면 서버의 `~/.openclaw/openclaw.json` 에서 `agents.defaults.model.primary` 를 수정하면 됩니다.
- Codex CLI가 없거나 방법 C가 안 되면 **OpenAI API 키**로 `openai/gpt-5.1-codex` 등 사용 가능 (과금). 아래 "2. OpenAI (GPT)로 설정" 참고.

### Gemini Pro (Google Gemini CLI OAuth)

OpenClaw **번들**에 `google-gemini-cli-auth` 플러그인이 있어, **Gemini 구독 OAuth**를 서버에서 바로 쓸 수 있습니다. (openai-codex와 달리 provider가 있어 `models auth login` 가능.)  
단, 이 플러그인은 **Gemini CLI**를 사용하므로 서버에 Gemini CLI가 설치돼 있어야 합니다.

**서버에서 할 일 (이미 플러그인 활성화·기본 모델·Gemini CLI 설치까지 되어 있음):**

1. **Gemini CLI 설치** (아직 안 했다면):
   ```bash
   npm install -g @google/gemini-cli
   export PATH="$HOME/.npm-global/bin:$PATH"
   ```

2. **OpenClaw 재시작** (플러그인 적용 후):
   ```bash
   sudo systemctl restart openclaw
   ```

3. **서버에 SSH 접속한 터미널**에서 로그인 (대화형 TTY 필요):
   ```bash
   export PATH="$HOME/.npm-global/bin:$PATH"
   openclaw models auth login --provider google-gemini-cli --set-default
   ```
   - **URL이 나오면** 로컬 브라우저(또는 핸드폰)로 열고 Google(Gemini) 계정으로 로그인.
   - 로그인 후 **리다이렉트된 URL 전체**를 복사해서 서버 터미널에 붙여넣기.

4. **확인**:
   ```bash
   openclaw models status
   ```
   `google-gemini-cli` 프로필이 보이면 성공. 텔레그램에서 `/plan` 또는 일반 메시지로 테스트.

**모델**: 기본 모델은 `google-gemini-cli/gemini-3-pro-preview` 로 설정돼 있음. 바꾸려면 서버 `~/.openclaw/openclaw.json` 의 `agents.defaults.model.primary` 를 수정.

**참고**: [Model Providers - Google Vertex, Antigravity, and Gemini CLI](https://docs.openclaw.ai/concepts/model-providers)

---

### Claude Pro/Max (setup-token)

- 이미 쓰는 **Claude Code CLI**가 있으면:
  ```bash
  claude setup-token
  ```
  나온 토큰을 서버에서:
  ```bash
  openclaw models auth paste-token --provider anthropic
  ```
- config에는 모델만 지정하면 됩니다 (API 키 불필요):
  ```json
  {
    "agents": {
      "defaults": {
        "model": { "primary": "anthropic/claude-opus-4-6" }
      }
    }
  }
  ```

### Gemini Pro 구독

- OpenClaw 공식 문서에는 **Gemini 구독 계정 OAuth** 연동은 없고, **Google AI Studio API 키**로만 설정하는 방법이 안내되어 있습니다.  
- 구독 한도를 그대로 쓰려면 Google 쪽에서 “구독 계정으로 쓰는 API/게이트웨이” 지원 여부를 확인해 보시고, 지원되면 그 방식을 쓰면 됩니다. 현재 문서 기준으로는 **API 키(과금 가능)** 방식만 명시되어 있습니다.

---

## 1. Anthropic (Claude)로 설정

### API 키 발급

1. [Anthropic Console](https://console.anthropic.com/) 로그인
2. API Keys → Create Key → 키 복사 (예: `sk-ant-...`)

### 서버에서 설정 (Contabo)

**방법 A: 온보딩으로 한 번에 (대화형)**

```bash
ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159
export PATH="$HOME/.npm-global/bin:$PATH"

# 대화형: LLM 선택 후 API 키 입력
openclaw onboard
# 메뉴에서 "Anthropic API key" 선택 후 키 붙여넣기
```

**방법 B: 비대화형 (이미 키가 있을 때)**

```bash
# 환경변수로 전달
export ANTHROPIC_API_KEY="sk-ant-여기에_키"
openclaw onboard --anthropic-api-key "$ANTHROPIC_API_KEY"
```

**방법 C: 설정 파일에 직접**

`~/.openclaw/openclaw.json`에 다음을 넣거나 기존 `agents`와 병합:

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-여기에_실제_키"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      }
    }
  }
}
```

API 키를 파일에 두기 싫다면, 서버의 `~/.bashrc` 또는 systemd 서비스에만 `ANTHROPIC_API_KEY` 환경변수를 설정하고, config에는 `agents.defaults.model.primary`만 두면 됩니다.

### 모델 선택 (Anthropic)

- `anthropic/claude-sonnet-4-5` – 균형 (기본 추천)
- `anthropic/claude-opus-4-6` – 더 고성능
- `anthropic/claude-3-5-haiku-20241022` – 저렴·빠름

설정 확인:

```bash
openclaw models status
```

---

## 2. OpenAI (GPT)로 설정

1. [OpenAI API Keys](https://platform.openai.com/api-keys)에서 키 발급 (예: `sk-...`)
2. 서버에서:

```bash
openclaw onboard
# 메뉴에서 OpenAI API key 선택 후 키 입력
```

또는 config에:

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-..."
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-4o"
      }
    }
  }
}
```

---

## 3. OpenRouter로 설정

한 API 키로 여러 모델(Claude, GPT, Gemini 등) 사용 가능.

1. [OpenRouter](https://openrouter.ai/) 가입 후 API 키 발급 (`sk-or-...`)
2. config에:

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-..."
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/anthropic/claude-sonnet-4"
      }
    }
  }
}
```

모델 ID는 OpenRouter 문서의 모델 목록을 참고하면 됩니다.

---

## 4. 설정 후 확인

```bash
openclaw models status
openclaw doctor
```

이후 텔레그램에서 `/plan` 또는 일반 대화를 보내서 LLM이 응답하는지 확인하면 됩니다.

---

## 5. 참고

- **비밀 관리**: API 키는 가능하면 `openclaw.json`이 아닌 환경변수로만 두고, 설정 파일은 버전 관리에 넣지 않는 것이 좋습니다.
- **문서**: [OpenClaw – Anthropic](https://docs.openclaw.ai/providers/anthropic), [Configuration Examples](https://docs.openclaw.ai/gateway/configuration-examples)
