/**
 * DevBridge 플러그인 명령어 단일 소스.
 * 여기만 수정하면 슬래시 등록·/help·/명령어 안내·자연어 의도 매칭이 같이 반영된다.
 */

export type CommandDef = {
  /** 슬래시 이름(주). 예: /plan → name "plan" */
  name: string;
  /** 같은 동작의 다른 슬래시. 예: /명령어 → aliases ["명령어"] */
  aliases?: string[];
  /** 내부 처리용(commandName). callDevBridge(c.commandName, ...) */
  commandName: string;
  /** OpenClaw 명령 목록·도움말에 쓰는 한 줄 설명 */
  description: string;
  /** /help·/명령어 안내창에 나갈 한 줄. 예: "• /devstatus — ..." */
  helpLine: string;
  /** 자연어 의도 매칭용 키워드/구문. 사용자 말에 이 중 하나라도 포함되면 이 명령 후보가 됨 */
  intentKeywords?: string[];
  /** true면 슬래시 명령으로 등록하지 않음. 메시지가 에이전트(김빌드)에게 전달되도록 함 */
  skipSlashRegistration?: boolean;
};

export const COMMANDS: CommandDef[] = [
  {
    name: "plan",
    commandName: "plan",
    description: "Plan development tasks (DevBridge)",
    helpLine: "• /plan [작업 설명] — 계획 수립",
    intentKeywords: ["계획", "플랜", "plan", "설계", "기획", "할 일 정리"],
  },
  {
    name: "build",
    commandName: "build",
    description: "Implement changes (DevBridge)",
    helpLine: "• /build [구현 지시] — 구현 실행",
    intentKeywords: [
      "구현", "빌드", "build", "코드 작성", "만들어", "구현해",
      "다음 단계", "시작해", "진행해", "일 시켜", "실행해", "플랜대로", "계획대로",
      "빌드 시작", "구현 시작", "작업 시작", "진행해줘", "시작해줘", "일 시켜줘",
    ],
  },
  {
    name: "diff",
    commandName: "diff",
    description: "Show changes (DevBridge)",
    helpLine: "• /diff — 변경 파일 목록",
    intentKeywords: ["변경", "diff", "수정된 파일", "뭐 바뀌었", "차이"],
  },
  {
    name: "apply",
    commandName: "apply",
    description: "Commit/push/PR (DevBridge)",
    helpLine: "• /apply [commit|push|pr] [메시지] — 커밋/푸시/PR",
    intentKeywords: ["커밋", "commit", "푸시", "push", "pr", "적용", "apply"],
  },
  {
    name: "devstatus",
    commandName: "status",
    description: "Show DevBridge & OpenCode status",
    helpLine: "• /devstatus — 김빌드가 DevBridge·OpenCode 상태를 확인해 요약해 드립니다",
    intentKeywords: ["/devstatus", "devstatus", "상태", "status", "연결", "에이전트", "뭐 해", "뭐 해?", "뭐해", "뭐해요", "뭐하냐", "뭐하나", "뭐하고 있어", "뭐하고", "지금 뭐", "지금 뭐해", "오픈코드 상태", "오픈코드 뭐", "devbridge", "확인해", "알려줘"],
    skipSlashRegistration: true,
  },
  {
    name: "activity",
    commandName: "activity",
    description: "OpenCode 진행 상황(최근 메시지·TODO) 보기",
    helpLine: "• /activity — 김빌드가 OpenCode 진행 상황을 확인해 요약해 드립니다",
    intentKeywords: ["/activity", "activity", "진행", "todo", "메시지", "작업 중", "하고 있는", "진행 상황", "지금 뭐 하", "뭐하냐", "뭐해", "지금 뭐해", "오픈코드 뭐", "오픈코드 지금 뭐해", "오픈코드 지금 뭐 해"],
    skipSlashRegistration: true,
  },
  {
    name: "project",
    commandName: "project",
    description: "List/select projects (DevBridge)",
    helpLine: "• /project — 프로젝트 목록 (/project select N 으로 선택)",
    intentKeywords: ["프로젝트", "project", "목록", "선택"],
  },
  {
    name: "approvals",
    commandName: "approvals",
    description: "List pending approvals (DevBridge)",
    helpLine: "• /approvals — 승인 대기 목록",
    intentKeywords: ["승인 대기", "approvals", "승인 목록", "대기 중"],
  },
  {
    name: "approve",
    commandName: "approve",
    description: "Approve pending (id or first)",
    helpLine: "• /approve [id] — 승인 (id 생략 시 첫 번째)",
    intentKeywords: ["승인해", "승인 할게", "approve", "허용"],
  },
  {
    name: "deny",
    commandName: "deny",
    description: "Deny pending (id or first)",
    helpLine: "• /deny [id] — 거절 (id 생략 시 첫 번째)",
    intentKeywords: ["거절", "deny", "반려", "안 할게"],
  },
  {
    name: "handoff",
    commandName: "handoff",
    description: "Send natural-language message to OpenCode (김빌드→OpenCode)",
    helpLine: "• /handoff [자연어 메시지] — OpenCode 팀에 전달",
    intentKeywords: ["전달", "handoff", "오픈코드한테", "팀에 말해", "이렇게 해줘"],
  },
  {
    name: "devreset",
    commandName: "session-reset",
    description: "New OpenCode session for channel",
    helpLine: "• /devreset — 새 OpenCode 세션 시작",
    intentKeywords: ["세션 새로", "리셋", "reset", "다시 시작", "새 세션"],
  },
  {
    name: "abort",
    commandName: "session-abort",
    description: "Abort current OpenCode session",
    helpLine: "• /abort — 현재 세션 중단",
    intentKeywords: ["중단", "abort", "그만", "취소", "멈춰"],
  },
  {
    name: "help",
    aliases: ["명령어"],
    commandName: "help",
    description: "Show DevBridge/OpenCode command list",
    helpLine: "• /help, /명령어 — 명령어 목록 보기",
    intentKeywords: ["명령어", "help", "뭘 할 수 있어", "할 수 있는 것", "도움말", "사용법"],
  },
];

/** 사용자 자연어 메시지에 맞는 명령 하나를 찾는다. 없으면 null. */
export function matchIntent(userMessage: string): CommandDef | null {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) return null;
  let best: { cmd: CommandDef; score: number } | null = null;
  for (const cmd of COMMANDS) {
    const keywords = cmd.intentKeywords ?? [];
    for (const kw of keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        const score = kw.length;
        if (!best || score > best.score) best = { cmd, score };
        break;
      }
    }
  }
  return best?.cmd ?? null;
}
