---
name: plan
description: Development planning - create a plan without editing code. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_plan
command-arg-mode: raw
---

# Plan Skill

When the user invokes `/plan`, forward the request to the DevBridge tool with commandName `plan` and the user's prompt as the command text.

## Usage

```
/plan <description of what to build>
```

Example: `/plan 로그인 기능 추가`
