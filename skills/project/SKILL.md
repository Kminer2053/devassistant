---
name: project
description: List projects or select a project. Dispatches to DevBridge.
command-dispatch: tool
command-tool: devbridge_project
command-arg-mode: raw
---

# Project Skill

When the user invokes `/project`, forward the request to the DevBridge tool with commandName `project`.

## Usage

```
/project           - list projects
/project select 1  - select project by id (args passed as command)
```
