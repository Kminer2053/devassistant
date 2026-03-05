# 운영 가이드

서비스 관리, SSH 터널링, 백업/복구 Runbook입니다. **OpenCode 제어**: 워크스페이스 OPENCODE_ACP_WORKFLOW.md(스킬 방식, exec+process+JSON-RPC)로만 수행합니다. DevBridge/ACP(acpx)/PTY 관련 절은 레거시 참고용입니다.

**보안**: 토큰·API 키·비밀번호는 이 리포에 커밋하지 말고, 서버에서는 환경변수·systemd override·`.env`(미커밋)로만 관리하세요. [README 보안 절](../README.md#보안) 참고.

## 1. systemd 서비스

### 1.1 OpenCode

```bash
sudo systemctl start opencode
sudo systemctl stop opencode
sudo systemctl restart opencode
sudo systemctl status opencode
```

로그:

```bash
journalctl -u opencode -f
journalctl -u opencode -n 100
```

### 1.2 OpenClaw

온보딩 시 `--install-daemon`으로 설치된 경우:

```bash
# 상태 확인 (openclaw CLI)
openclaw status

# systemd로 설치되었다면
sudo systemctl status openclaw   # 서비스명은 설치 시 표시됨
```

**OpenCode 제어**: 스킬 방식(OPENCODE_ACP_WORKFLOW.md). DevBridge 서비스는 사용하지 않음. 비활성화: `sudo systemctl stop devbridge && sudo systemctl disable devbridge`

### 1.3 배포 후 재시작 — 변경 반영이 안 될 때

**`systemctl restart`만으로는 프로세스가 완전히 죽지 않아** 예전 코드가 계속 돌 수 있습니다. **서비스 중지 → 관련 프로세스 강제 종료 → 서비스 시작** 순서로 해야 합니다.

**OpenClaw** (플러그인/워크스페이스 배포 후):

```bash
sudo systemctl stop openclaw
sleep 2
# 게이트웨이 등 자식 프로세스가 남아 있으면 재시작 후에도 예전 코드 로드됨
pkill -u devassistant -f openclaw-gateway
pkill -u devassistant -f "openclaw gateway"
sleep 2
sudo systemctl start openclaw
sudo systemctl is-active openclaw
```

PID가 바뀌었는지 확인하면 새 프로세스가 떴는지 알 수 있습니다: `pgrep -f "node dist/index.js"` 또는 `pgrep -fa openclaw`.

**스크립트 사용** (레포의 `scripts/server_hard_restart.sh`):

```bash
# 서버에 스크립트 복사 후 (배포 스크립트가 복사함)
./server_hard_restart.sh openclaw
# 또는 로컬에서
ssh -i ~/.ssh/github-actions-oracle devassistant@46.250.254.159 'bash -s' < scripts/server_hard_restart.sh openclaw
```

### 1.4 코드 배포 후 서버 반영 (한 번에 하기)

OpenClaw 플러그인·워크스페이스 코드를 서버에 동기화하고 OpenClaw만 재시작:

```bash
# 레포 루트에서
./scripts/deploy_to_server.sh
```

- 기본: `~/.ssh/github-actions-oracle`, `devassistant@46.250.254.159`, 원격 경로 `/srv/devassistant`
- 다른 키/서버: `SSH_KEY=경로 SERVER=user@host ./scripts/deploy_to_server.sh`
- 동작: rsync(플러그인, 워크스페이스, 스크립트) → 서버 OpenClaw 패치(스킬 기반: ACP 비활성화, sessions_spawn deny) → `server_hard_restart.sh openclaw`
- **워크스페이스(AGENTS.md) 또는 플러그인 수정 후**: 서버에는 바로 반영되지만, **기존 텔레그램 대화 세션**은 예전 규칙·도구 설명을 유지합니다. 새 규칙을 쓰려면 텔레그램에서 **`/new` 또는 `/reset`** 을 보내 새 세션을 시작하세요.

### 1.5 배포 후 테스트

- **스크립트**: `./scripts/verify.sh` — OpenClaw 게이트웨이(18789) 확인.
- **채팅**: "테스트로 계획만 세워줘" 요청 후 김빌드가 OPENCODE_ACP_WORKFLOW(exec + process + JSON-RPC)로 OpenCode에 지시하는지 확인.

아래 1.6·1.7은 **레거시(DevBridge/PTY)** 참고용입니다. ACP 전환 후에는 사용하지 않습니다.

### 1.6 (레거시) DevBridge API / PTY 확인

DevBridge가 **PTY 백엔드**로 `opencode attach`를 채널별로 띄우는지 확인하는 방법.

**1) 백엔드 모드**

- 서버에서 `DEVBRIDGE_OPENCODE_BACKEND`가 없거나 `pty`이면 PTY 모드. (기본값 `pty`.)
- 확인: `sudo systemctl show devbridge -p Environment` 또는 unit drop-in에서 해당 변수 확인.

**2) opencode attach 프로세스 해석**

- **opencode serve**: systemd `opencode.service` (예: PID 487972), 127.0.0.1:4096 리슨.
- **opencode attach** 두 종류:
  - **사람이 터미널에서 띄운 TUI**: `opencode attach ...` 의 부모가 **bash** (예: pts/1). 이건 DevBridge PTY가 아님.
  - **DevBridge가 채널용으로 띄운 PTY**: `/plan` 또는 `/build` 호출 시 생성. **부모 프로세스가 DevBridge node**(예: PID 732462) 또는 그 자식이어야 함.
- **PPID가 1(init)** 인 `opencode attach`: 예전에 DevBridge가 띄웠다가 서비스 재시작으로 **고아 프로세스**가 된 경우. 현재 동작 중인 채널 PTY는 아님.

**3) 서버에서 한 번에 확인 (복붙용)**

```bash
# DevBridge PID (예: 732462)
DEVBRIDGE_PID=$(pgrep -f "node dist/index.js" | head -1)
echo "DevBridge PID: $DEVBRIDGE_PID"

# opencode attach 전부 + 부모 PID
ps -eo pid,ppid,tty,cmd | grep opencode
```

- `opencode attach` 중 **ppid가 $DEVBRIDGE_PID 인 것**이 있으면 → 해당 채널의 PTY가 지금 살아 있음 (PTY 잘 돌고 있음).
- **그런 프로세스가 하나도 없으면** → 아직 해당 재시작 이후로 `/plan`·`/build`를 호출한 채널이 없었거나, 호출 후 PTY가 종료된 상태. **텔레그램에서 /plan 한 번 보낸 뒤** 위 명령을 다시 실행해 보면, 새로 생기는 `opencode attach`의 ppid가 DevBridge node인지 확인 가능.

**4) 요약**

- PTY가 “잘 돌고 있다” = (1) 백엔드가 pty이고, (2) `/plan` 또는 `/build` 호출 시 해당 채널용 `opencode attach`가 DevBridge(node) 자식으로 생성·유지되는 것.
- 현재 attach가 전부 “bash 자식” 또는 “ppid=1 고아”뿐이면, **지금 시점에 활성 채널 PTY는 없는 것**이지, PTY 백엔드 코드가 동작하지 않는 것은 아님. 필요 시 /plan 한 번 보낸 직후 프로세스 목록으로 재확인.

**5) PTY가 생성되지 않을 때 (attach가 DevBridge 자식으로 안 보일 때)**

- **원인 후보**: systemd 기동 시 PATH에 `opencode`가 없어 spawn한 `opencode attach`가 실행 실패(예: exit 127)로 곧바로 종료.
- **조치**: DevBridge 서비스에 **OPENCODE_BIN** 설정. (레포 `infra/systemd/devbridge.service`에 반영됨.)
  - 서버에서: `/etc/systemd/system/devbridge.service` 또는 drop-in에  
    `Environment=OPENCODE_BIN=/home/devassistant/.opencode/bin/opencode` 추가 후  
    `sudo systemctl daemon-reload && sudo systemctl restart devbridge`
- 배포 후 **spawn/exit 로그**: `journalctl -u devbridge -n 50` 에 `[DevBridge PTY] spawn attach` / `attach exited ... exitCode=...` 로 원인 구분 가능 (127=실행 파일 없음 등).

## 2. SSH 터널링으로 접근

### 2.1 OpenClaw 대시보드

```bash
# Contabo (devassistant 사용자)
ssh -L 18789:127.0.0.1:18789 devassistant@<server_ip>

# OCI (키 파일 사용)
ssh -L 18789:127.0.0.1:18789 -i <key.pem> devassistant@<server_ip>
```

로컬 브라우저: http://127.0.0.1:18789/

### 2.2 DevBridge API (디버깅용)

```bash
ssh -L 8080:127.0.0.1:8080 devassistant@<server_ip>
# 또는 -i <key.pem> 사용
```

로컬에서:

```bash
curl -H "X-DevBridge-Token: <token>" http://127.0.0.1:8080/health
```

OpenCode 권한 요청(approval) 흐름의 **확인 및 테스트 절차**는 [05_DEVBRIDGE.md](05_DEVBRIDGE.md#opencode-권한-요청approval-흐름-및-검증)의 "OpenCode 권한 요청(approval) 흐름 및 검증" 섹션을 참고한다.

### 2.3 OpenCode API (디버깅용)

```bash
ssh -L 4096:127.0.0.1:4096 devassistant@<server_ip>
```

```bash
curl -u opencode:<password> http://127.0.0.1:4096/global/health
```

## 3. 백업 체크리스트

### 3.1 SQLite (DevBridge)

```bash
cp /var/lib/devbridge/devbridge.db /backup/devbridge_$(date +%Y%m%d).db
```

### 3.2 레포 경로

```bash
tar -czf /backup/repos_$(date +%Y%m%d).tar.gz /srv/repos
```

### 3.3 설정 파일

- `/srv/devassistant/` 전체
- `~/.openclaw/openclaw.json`
- `~/.openclaw/workspace/` (역할·정체성·AGENTS/SOUL/USER/TOOLS 등, see `08_OPENCLAW_IDENTITY.md`)
- `~/.config/opencode/` (또는 OPENCODE_CONFIG 경로)
- `/etc/systemd/system/opencode.service`, `devbridge.service`

## 4. 복구

1. SQLite: `devbridge.db`를 `/var/lib/devbridge/`에 복원
2. 레포: `/srv/repos`에 압축 해제
3. 설정: `openclaw.json`, `opencode.json` 복원
4. 서비스 재시작: `opencode`, `devbridge`, openclaw daemon

## 5. Build/OpenCode 에러 트러블슈팅

### 5.1 execute_natural_command / fetch failed **(레거시: DevBridge 사용 시에만)**

스킬 방식에서는 이 항목 해당 없음. **스킬 방식에서** OpenCode 제어 실패 시: exec 실패(환경/PATH), process.write·process.poll 미응답, `opencode acp --port 0` 미실행(4096 충돌 시), 워크스페이스 [OPENCODE_ACP_WORKFLOW.md](../openclaw/workplace/OPENCODE_ACP_WORKFLOW.md) 절차 준수 여부 확인.

**레거시**: "현재상태확인" 등에서 김빌드가 "Execute Natural Command failed" 또는 "fetch failed" 를 보여줄 때는 **OpenClaw 플러그인에서 DevBridge(8080)로의 HTTP 요청**이 실패한 경우다. 아래 순서로 확인한다.

1. **DevBridge 동작 여부**: `systemctl status devbridge` 로 서비스가 active인지 확인.
2. **헬스 체크**: `curl -s http://127.0.0.1:8080/health` 로 200 및 JSON 응답 확인.
3. **OpenClaw 로그**: `journalctl -u openclaw -n 50` 에서 `[devbridge-plugin] execute fetch failed` 로그와 함께 찍힌 `code`/`cause` 로 원인 구분(예: ECONNREFUSED → DevBridge 미기동, AbortError → 30초 타임아웃).
4. **재시작**: 필요 시 `./scripts/server_hard_restart.sh both` 로 DevBridge → OpenClaw 순 차례 재시작.

시작 순서는 1.3절(OpenClaw)의 "시작 순서" 참고.

### 5.2 `/devstatus` 최근 실행 실패 (DevBridge → OpenCode)

`/devstatus` 최근 실행에서 `[failed]`가 나올 때, `summary`에 저장된 메시지로 원인을 추정할 수 있다.

| 에러 메시지 | 의미·대응 |
|-------------|-----------|
| `fetch failed` | DevBridge → OpenCode HTTP 연결 실패. `opencode serve` 상태 확인, `journalctl -u opencode -n 20`. `OPENCODE_BASE_URL`이 DevBridge 서버에서 접근 가능한 주소인지 확인 (같은 호스트면 `127.0.0.1:4096`). |
| `Invalid input: expected array, received undefined` at `path: ["parts"]` | OpenCode API가 `parts`를 기대하는데 undefined 수신. DevBridge는 `parts`를 항상 전송함. OpenCode 버전/SDK 호환성 확인, `opencode --version`. |
| `[object Object]` | 예외 객체가 순환 참조 등으로 제대로 문자열화되지 않음. DevBridge `errorToMessage` 개선으로 대부분 방지됨. 여전히 나오면 `journalctl -u devbridge -n 50`에서 상세 로그 확인. |
| `(원인 미기록)` | `runs.summary`가 비어 있음. 예외가 catch되지 않았거나 summary 저장 전 오류 가능성. |

상세 확인:

```bash
journalctl -u devbridge -n 50   # DevBridge 로그
journalctl -u opencode -n 50    # OpenCode 로그
```
