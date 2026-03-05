# OpenClaw 설치 및 설정

OpenClaw를 설치하고 보안 baseline으로 설정하는 가이드입니다.

## 1. 설치

### 1.1 공식 설치 스크립트

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### 1.2 온보딩 및 데몬

```bash
openclaw onboard --install-daemon
```

온보딩 시 채널(WhatsApp, Telegram 등)과 LLM 설정을 구성합니다.

## 2. 보안 설정 (openclaw.json)

`~/.openclaw/openclaw.json`에 아래 baseline을 반영합니다.
`infra/templates/openclaw.json`을 참고:

- `gateway.mode`: `"local"`
- `gateway.bind`: `"loopback"`
- `gateway.port`: `18789`
- `gateway.auth.mode`: `"token"`
- `gateway.auth.token`: `<long_random_token>`
- `session.dmScope`: `"per-channel-peer"`
- `tools.profile`: `"coding"` (김빌드에게 fs/exec 허용 시; 기본만 쓰려면 `"messaging"`)
- `tools.deny`: **스킬 방식**에서는 **sessions_spawn 포함**. 예: `["group:automation", "sessions_send", "sessions_spawn"]`. `infra/templates/openclaw.json` 및 배포 패치(`scripts/patch_openclaw_tools_allow_on_server.sh`) 참고.
- `tools.exec.security`: `"full"`, `tools.exec.ask`: `"always"`
- `elevated.enabled`: `false`
- **스킬 방식**: acpx 비활성화. OpenCode 제어는 워크스페이스 [OPENCODE_ACP_WORKFLOW.md](../openclaw/workplace/OPENCODE_ACP_WORKFLOW.md) 및 [05_ACP_OPENCODE.md](05_ACP_OPENCODE.md) 상단 참고. acpx 설정은 레거시 참고용([05_ACP_OPENCODE.md](05_ACP_OPENCODE.md) 본문).

## 3. 보안 점검

```bash
openclaw security audit
```

심화 점검:

```bash
openclaw security audit --deep
```

## 4. 원격 접근 (SSH 터널만)

외부에서 직접 18789 포트를 열지 않고, SSH 터널로만 접근:

```bash
ssh -L 18789:127.0.0.1:18789 devassistant@<server_ip>
```

이후 로컬 브라우저에서:

```
http://127.0.0.1:18789/
```

## 5. 상태 확인

```bash
openclaw status
openclaw doctor
```
