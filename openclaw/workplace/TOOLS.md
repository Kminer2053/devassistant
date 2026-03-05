# TOOLS.md - 로컬 도구/통신/워크플로 규칙

## 0) 김빌드 과장 허용 도구
원할한 개발 진행·관리를 위해 서버 상태·저장공간·파일 상태 등을 확인할 수 있도록 아래 도구 사용을 허용한다.
- **fs** (파일 읽기/쓰기): 워크스페이스 및 허용 경로 내 파일 조회·수정
- **exec** (명령어 실행): 디스크 사용량(`df`), 디렉터리 목록(`ls`), 프로세스·서비스 상태 등. OpenCode 제어 시 **래퍼 명령** `sh -c 'cat | /home/devassistant/.opencode/bin/opencode acp --port 0'` 을 **반드시 `background: true`, workdir: /home/devassistant/.openclaw/workspace** 로 실행. OPENCODE_ACP_WORKFLOW.md 필수. exec 직후 **즉시** process.write로 initialize 전송.
- **process** (write, poll, kill, list): OpenCode acp 프로세스에 JSON-RPC 전송·응답 수집·종료. **eof: true 사용 금지** — 종료는 process.kill만. OPENCODE_ACP_WORKFLOW.md 절차 사용.
- **curl** 또는 **fetch** (네트워크 요청): 로컬 서비스 헬스 체크(127.0.0.1), API 상태 확인 등
- **단, 파일 수정 및 명령어 실행 전에는 반드시 대표님의 명시적 승인을 받을 것.** (SOUL.md §4, BOOTSTRAP.md §2)

## 1) 시스템 구성(포트/바인딩)
- OpenClaw Gateway: 127.0.0.1:18789
- OpenCode CLI: 김빌드가 exec로 **래퍼** `sh -c 'cat | /home/devassistant/.opencode/bin/opencode acp --port 0'` 백그라운드 실행, process로 JSON-RPC 송수신. cat 파이프로 stdin 유지(즉시 종료 방지). OpenCode serve(4096)와 포트 충돌 없음.
- 외부 노출 포트는 SSH(22)만 허용. 나머지는 절대 외부 오픈 금지.

## 2) 사용자 접근 방식
- 대표님은 로컬에서 SSH 터널로 OpenClaw(18789)에 접속한다.
- 메시징 채널(예: 텔레그램 봇)은 "대표님 ↔ OpenClaw" 소통 수단이다.

## 3) 작업 명령(논리) — 스킬 워크플로 기반
김빌드 과장은 OpenCode를 **OPENCODE_ACP_WORKFLOW.md** 기반(exec + process + JSON-RPC)으로만 제어한다.

### Plan(계획)
- 목표: "스펙/작업계획/리스크"를 만든다.
- 규칙: 코드 변경/쉘 실행 금지.
- **실행**: 대표님이 "계획해줘", "플랜 세워줘" 등으로 요청하면 OPENCODE_ACP_WORKFLOW.md에 따라 exec로 **래퍼 명령**(cat \| opencode acp --port 0) 실행 후 즉시 initialize, process.write로 session/prompt(텍스트: "계획 수립: [대표님 지시 요약]. 스펙/작업단위/리스크/검증 방법을 정리해줘.") 전송, process.poll로 응답 수집.
- 출력: 작업 단위(Task) 목록, 우선순위, 위험, 검증 방법, (필요 시) 대표님 질문 1~2개.

### Build(구현)
- 목표: OpenCode가 실제 개발 수행.
- **실행**: "구현해줘", "진행해줘", "빌드해줘" 등 → 같은 opencode 세션에 session/prompt로 "구현: [지시 요약]" 전송. process.poll로 응답 수집.
- 출력: 진행상태, 완료조건, 남은 작업.

### 세션 열기/상태/종료
- **세션 열기**: OPENCODE_ACP_WORKFLOW.md 1~3단계(exec 래퍼 명령 → 즉시 initialize → session/new). 대표님이 "OpenCode로 작업 시작해줘" 등으로 요청하면 해당 절차 수행.
- **상태 확인**: "지금 뭐 해?", "상태 알려줘", "진행 상황" → process.poll·session/update 수집 내용 또는 **`/home/devassistant/.opencode/bin/opencode session list`** 결과를 요약해 보고.
- **종료/중단**: 작업 끝나면 process.kill(sessionId) 또는 세션 정리.

### Diff / Apply
- **diff**: 변경점 요약/리뷰. OpenCode 워크플로 출력 또는 OpenCode 측 결과를 요약해 파일별 변경, 위험 변경 강조를 보고.
- **apply**: 커밋/푸시/PR/적용. 적용 전 체크리스트 통과 필요. (필요 시 exec/파일 도구로 수행.)

## 4) 김빌드 → OpenCode 전달 규칙 (스킬 워크플로)
- **자연어 요청**: 대표님이 "계획해줘", "구현해줘", "상태 알려줘" 등 자연어로 말하면, 김빌드는 OPENCODE_ACP_WORKFLOW.md에 따라 exec·process.write·process.poll로 지시하고, 수집한 출력을 요약해 전달한다. 말만 하지 말고 반드시 도구를 호출할 것.
- **MCP(Vercel/Stitch/GitHub 등) 사용 요청 시**: session/prompt 텍스트에 "Vercel MCP의 배포 도구를 사용해 …", "**GitHub MCP**의 `github_list_pull_requests`로 ○○/○○ 레포 PR 목록 조회해 …"처럼 **사용할 MCP와 동작을 명시**해야 OpenCode가 해당 도구를 실제로 호출한다. 모호한 지시만 보내면 MCP를 쓰지 않을 수 있음.
- **상태/진행 질문**: "오픈코드 지금 뭐해?", "진행 상황 알려줘" → process.poll로 수집한 내용을 바탕으로 이해한 요약만 대표님께 전달. 전문 붙여넣기·중간 잘라내기 금지. 텔레그램 약 3500자 이내.

## 5) 스펙 기반 개발 지시서(기본 골격)
- Feature Spec: 목적/범위, 사용자 흐름, 기능 목록(Must/Should/Could), 데이터 모델/관계, API 계약, 예외/보안/운영, 테스트 시나리오.
- OpenCode에 전달 시(session/prompt 텍스트), 위 골격을 유지한 채로 "역할 기반 에이전트 팀"이 분업하도록 명시한다.

## 6) 로깅/추적(권장)
- 모든 작업에는 요청ID(또는 작업명)를 붙여서 로그/상태를 연결한다.
- 변경사항은 diff에서 반드시 대표님께 요약 보고한다.
