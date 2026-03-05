/**
 * 자연어 → DevBridge 명령 매핑.
 * OpenClaw 플러그인 COMMANDS.intentKeywords와 동일한 키워드로 라우팅.
 */

export const INTENT_KEYWORDS: Record<string, string[]> = {
  plan: ["계획", "플랜", "plan", "설계", "기획", "할 일 정리"],
  build: [
    "구현", "빌드", "build", "코드 작성", "만들어", "구현해",
    "다음 단계", "시작해", "진행해", "일 시켜", "실행해", "플랜대로", "계획대로",
    "빌드 시작", "구현 시작", "작업 시작", "진행해줘", "시작해줘", "일 시켜줘",
  ],
  status: ["/devstatus", "devstatus", "상태", "status", "연결", "에이전트", "뭐 해", "뭐 해?", "뭐해", "뭐해요", "뭐하냐", "뭐하나", "뭐하고 있어", "뭐하고", "지금 뭐", "지금 뭐해", "오픈코드 상태", "오픈코드 뭐", "devbridge", "확인해", "알려줘", "현재상태확인", "상태확인", "현재 상태", "상태 확인"],
  activity: ["/activity", "activity", "진행", "todo", "메시지", "작업 중", "하고 있는", "진행 상황", "지금 뭐 하", "뭐하냐", "뭐해", "지금 뭐해", "오픈코드 뭐", "오픈코드 지금 뭐해", "오픈코드 지금 뭐 해", "현재상태확인", "상태확인", "현재 상태", "상태 확인"],
  diff: ["변경", "diff", "수정된 파일", "뭐 바뀌었", "차이"],
  apply: ["커밋", "commit", "푸시", "push", "pr", "적용", "apply"],
  approvals: ["승인 대기", "approvals", "승인 목록", "대기 중"],
  approve: ["승인해", "승인 할게", "approve", "허용"],
  deny: ["거절", "deny", "반려", "안 할게"],
  handoff: ["전달", "handoff", "오픈코드한테", "팀에 말해", "이렇게 해줘"],
  "session-reset": ["세션 새로", "리셋", "reset", "다시 시작", "새 세션"],
  "session-abort": ["중단", "abort", "그만", "취소", "멈춰"],
  project: ["프로젝트", "project", "목록", "선택"],
  help: ["명령어", "help", "뭘 할 수 있어", "할 수 있는 것", "도움말", "사용법"],
};

/** 사용자 자연어에 맞는 commandName 하나 반환. 없으면 null. */
export function matchIntent(naturalLanguage: string): string | null {
  const normalized = naturalLanguage.trim().toLowerCase();
  if (!normalized) return null;
  let best: { command: string; score: number } | null = null;
  for (const [command, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        const score = kw.length;
        if (!best || score > best.score) best = { command, score };
        break;
      }
    }
  }
  return best?.command ?? null;
}
