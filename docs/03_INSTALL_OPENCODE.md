# OpenCode 설치 및 설정

OpenCode를 설치하고 `opencode serve`로 headless 서버를 실행하는 가이드입니다.

## 1. 설치

### 1.1 공식 설치 스크립트

```bash
curl -fsSL https://opencode.ai/install | bash
```

### 1.2 버전 확인

```bash
opencode --version
```

## 2. 설정

### 2.1 opencode serve 실행 방식

- 호스트: `127.0.0.1`
- 포트: `4096`
- Basic Auth: `OPENCODE_SERVER_PASSWORD` 환경변수 **선택**. 넣으면 서버 접속 시 비밀번호 필요, 안 넣으면 비밀번호 없이 동작(로컬 전용이면 생략 가능)

### 2.2 systemd 서비스

`infra/systemd/opencode.service`를 복사 후:

```bash
sudo cp /srv/devassistant/infra/systemd/opencode.service /etc/systemd/system/
sudo systemctl daemon-reload
```

(선택) 외부 노출을 막기 위해 `/etc/systemd/system/opencode.service` 또는 override에서 비밀번호 설정:

```ini
Environment=OPENCODE_SERVER_PASSWORD=<안전한_비밀번호>
```
설정하지 않으면 서버·TUI attach 모두 비밀번호 없이 접속된다.

서비스 시작:

```bash
sudo systemctl enable opencode
sudo systemctl start opencode
```

### 2.3 opencode.json (권한 최소화)

`infra/templates/opencode.json`을 참고하여 프로젝트별 또는 전역 설정:

- 기본: `"*" = "ask"`
- edit: `"ask"` 또는 `"deny"`
- bash: `"ask"`, 일부(git status, grep 등) allow 예시
- external_directory: `/srv/repos/**` 만 allow

설정 위치:

- `~/.config/opencode/opencode.json` (전역)
- 또는 `OPENCODE_CONFIG` 환경변수로 경로 지정

## 3. Health 체크

```bash
curl http://127.0.0.1:4096/global/health
```
(비밀번호를 설정했다면 `curl -u opencode:<password> http://127.0.0.1:4096/global/health`)

성공 예시:

```json
{"healthy":true,"version":"x.x.x"}
```

## 4. 로그 확인

```bash
journalctl -u opencode -f
```

## 5. 재시작

```bash
sudo systemctl restart opencode
```

## 6. LLM 연결·전체 설정

OpenCode는 plan/build 시 **자체 LLM**을 사용합니다. provider·모델·API 키 설정은 **[09_OPENCODE_SETUP.md](09_OPENCODE_SETUP.md)**를 참고하세요.
