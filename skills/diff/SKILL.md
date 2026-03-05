---
name: diff
description: Show change summary and risky files. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_diff
command-arg-mode: raw
---

# Diff Skill

When the user invokes `/diff`, forward the request to the DevBridge tool with commandName `diff`.

## Usage

```
/diff
```

Shows file-level changes and highlights risky files (passwords, keys, credentials).
