/**
 * 김빌드(OpenClaw) → OpenCode 자연어형 전달 포맷.
 * OpenCode 에이전트가 "과장이 팀에 전달하는 말"로 인식하도록 문장을 꾸밉.
 */

const PREFIX = "【김빌드 과장 전달】\n";

export function formatPlanHandoff(rawText: string): string {
  return `${PREFIX}대표님 지시는 아래와 같습니다.\n\n${rawText}\n\n---\n(이번 메시지는 **plan 모드**입니다. 코드 변경·쉘 실행 없이, 계획·단계·리스크만 수립해 주세요.)`;
}

export function formatBuildHandoff(rawText: string): string {
  if (!rawText.trim()) {
    return `${PREFIX}앞서 수립한 계획대로 구현을 진행해 주세요. edit·bash 권한이 필요하면 반드시 승인을 요청한 뒤 진행해 주세요.`;
  }
  return `${PREFIX}대표님 지시는 아래와 같습니다.\n\n${rawText}\n\n---\n(구현을 진행해 주세요. edit·bash 권한 요청 시 반드시 승인 대기 후 진행해 주세요.)`;
}

/** 자유 형식 핸드오프: 김빌드가 자연어로 그대로 전할 때 */
export function formatFreeHandoff(rawText: string): string {
  return `${PREFIX}${rawText}`;
}
