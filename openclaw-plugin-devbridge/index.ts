/**
 * OpenClaw Help Plugin (formerly DevBridge plugin)
 * Registers /help and /명령어 only. OpenCode is controlled via 스킬 워크플로 (exec + process + JSON-RPC).
 */

type PluginApi = {
  registerCommand: (opts: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: { channel?: string; senderId?: string; commandBody?: string; args?: string }) => Promise<{ text: string }> | { text: string };
  }) => void;
};

const ACP_HELP_TEXT = `**OpenCode 제어 (스킬 워크플로) — 사용법**

OpenCode는 **OPENCODE_ACP_WORKFLOW**(exec + process + JSON-RPC)로 제어됩니다.

**대표님이 하실 것**
- "계획해줘", "구현해줘", "OOO 기능 구현해줘" 등 **자연어로만** 지시하시면 됩니다.
- 김빌드가 워크플로에 따라 OpenCode를 실행하고, 결과를 요약해 전달합니다.
- /acp spawn, /focus 등 슬래시 명령은 사용하지 않습니다. (텔레그램·디스코드 동일)

**상세 절차**: 워크스페이스 \`OPENCODE_ACP_WORKFLOW.md\` 참고.`;

function getHelpText(): string {
  return ACP_HELP_TEXT;
}

export default function register(api: PluginApi): void {
  api.registerCommand({
    name: "help",
    description: "Show OpenCode/ACP command help",
    acceptsArgs: false,
    requireAuth: false,
    handler: () => ({ text: getHelpText() }),
  });
  api.registerCommand({
    name: "명령어",
    description: "OpenCode/ACP 명령어 안내",
    acceptsArgs: false,
    requireAuth: false,
    handler: () => ({ text: getHelpText() }),
  });
}
