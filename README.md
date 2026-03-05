# devassistant

개발 서버(OpenClaw + OpenCode, 스킬 방식) 설정·운영 자료. Contabo/Ubuntu, OpenCode, OpenClaw, MCP(Stitch, GitHub Vertex-safe), 워크스페이스 설정을 포함합니다.

## 구조

| 경로 | 설명 |
|------|------|
| [docs/](docs/) | 설정·운영 문서 (00_OVERVIEW ~ 09_OPENCODE_SETUP) |
| [scripts/](scripts/) | 배포·설치·패치 스크립트 |
| [infra/](infra/) | systemd 유닛, OpenCode/OpenClaw 템플릿 |
| [openclaw/workplace/](openclaw/workplace/) | 워크스페이스 설정 (AGENTS.md, TOOLS.md, OPENCODE_ACP_WORKFLOW.md 등) |
| [github-mcp/](github-mcp/) | Vertex-safe GitHub MCP 서버 (OpenCode 연동용) |
| [openclaw-plugin-devbridge/](openclaw-plugin-devbridge/) | OpenClaw 플러그인 (deploy_to_server.sh 동기화 대상) |
| [devbridge/](devbridge/) | (레거시 참고) DevBridge API |

## 문서 인덱스

1. [00_OVERVIEW.md](docs/00_OVERVIEW.md) – 아키텍처 개요
2. [01_CONTABO_SETUP.md](docs/01_CONTABO_SETUP.md) – Contabo VPS 설정
3. [01_OCI_SETUP.md](docs/01_OCI_SETUP.md) – (참고) OCI 인스턴스
4. [02_SERVER_BOOTSTRAP.md](docs/02_SERVER_BOOTSTRAP.md) – 서버 초기 세팅
5. [03_INSTALL_OPENCODE.md](docs/03_INSTALL_OPENCODE.md) – OpenCode 설치
6. [04_INSTALL_OPENCLAW.md](docs/04_INSTALL_OPENCLAW.md) – OpenClaw 설치
7. [05_ACP_OPENCODE.md](docs/05_ACP_OPENCODE.md) – 스킬 방식·acpx 참고
8. [06_OPERATIONS.md](docs/06_OPERATIONS.md) – 운영/백업/복구
9. [07_OPENCLAW_LLM.md](docs/07_OPENCLAW_LLM.md) – OpenClaw LLM·모델 인증
10. [08_OPENCLAW_IDENTITY.md](docs/08_OPENCLAW_IDENTITY.md) – 워크스페이스·역할·정체성
11. [09_OPENCODE_SETUP.md](docs/09_OPENCODE_SETUP.md) – OpenCode provider·모델·MCP(Stitch, GitHub 등) 상세
12. [05_DEVBRIDGE.md](docs/05_DEVBRIDGE.md) – (레거시) DevBridge API

MCP(Stitch, GitHub Vertex-safe) 연동은 [09_OPENCODE_SETUP.md](docs/09_OPENCODE_SETUP.md) 참고.

## 빠른 시작

1. [00_OVERVIEW.md](docs/00_OVERVIEW.md)로 아키텍처 파악
2. [02_SERVER_BOOTSTRAP.md](docs/02_SERVER_BOOTSTRAP.md) – 서버 부트스트랩
3. [03_INSTALL_OPENCODE.md](docs/03_INSTALL_OPENCODE.md) – OpenCode 설치
4. [04_INSTALL_OPENCLAW.md](docs/04_INSTALL_OPENCLAW.md) – OpenClaw 설치
5. [09_OPENCODE_SETUP.md](docs/09_OPENCODE_SETUP.md) – provider·모델·MCP 설정
6. [06_OPERATIONS.md](docs/06_OPERATIONS.md) – 운영·배포 스크립트

사용 흐름: "계획해줘", "구현해줘" 등 자연어 → 김빌드(OpenClaw)가 OPENCODE_ACP_WORKFLOW로 OpenCode 제어 → 결과 요약. 워크스페이스 [openclaw/workplace/OPENCODE_ACP_WORKFLOW.md](openclaw/workplace/OPENCODE_ACP_WORKFLOW.md) 참고.

## 보안

- **토큰·API 키·비밀번호**는 이 리포지토리에 커밋하지 마세요.
- 서버에서는 **환경변수**, **systemd override**, 또는 **.env**(git에 올리지 않음)로만 관리하세요.
- `.gitignore`에 `.env`, `*-auth.json`, `auth.json`이 포함되어 있습니다.

## 원격 저장소 배포

로컬에서 초기 커밋까지 완료된 상태입니다. GitHub에 **devassistant** 이름으로 빈 리포지토리를 만든 뒤:

```bash
git remote add origin https://github.com/<your-org>/devassistant.git
git push -u origin main
```

또는 SSH:

```bash
git remote add origin git@github.com:<your-org>/devassistant.git
git push -u origin main
```
