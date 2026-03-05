---
name: status
description: Show DevBridge status and recent runs. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_status
command-arg-mode: raw
---

# Status Skill

When the user invokes `/status`, forward the request to the DevBridge tool with commandName `status`.

## Usage

```
/status
```

Shows channel context and recent runs.
