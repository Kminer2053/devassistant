---
name: apply
description: Commit, push, or create PR. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_apply
command-arg-mode: raw
---

# Apply Skill

When the user invokes `/apply`, forward the request to the DevBridge tool with commandName `apply`.

## Usage

```
/apply [commit|push|pr] [message]
```

Examples:
- `/apply` or `/apply commit` - commit changes
- `/apply commit feat: add login` - commit with message
- `/apply push` - push to remote
- `/apply pr` - create PR (if supported)
