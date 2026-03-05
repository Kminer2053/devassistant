---
name: build
description: Implement changes - run build with approval flow. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_build
command-arg-mode: raw
---

# Build Skill

When the user invokes `/build`, forward the request to the DevBridge tool with commandName `build` and the user's prompt as the command text.

## Usage

```
/build [description or continue from plan]
```

Example: `/build 로그인 폼 추가` or `/build` (to continue from plan)
