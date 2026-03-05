#!/usr/bin/env bash
# 서버의 ~/.openclaw/openclaw.json 을 스킬 기반(C안) 전환에 맞게 패치:
# - tools.deny에서 process, group:runtime 제거 (opencode acp --port 0 백그라운드 실행 허용)
# - tools.deny에 sessions_spawn 포함 (스킬 방식만 사용, ACP 미사용)
# - acp.enabled: false, plugins.entries.acpx.enabled: false
# - plugins.allow에 openclaw-plugin-devbridge 포함 (DevBridge 제거)
# 사용: 레포 루트에서 ./scripts/patch_openclaw_tools_allow_on_server.sh

set -e
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/github-actions-oracle}"
SERVER="${SERVER:-devassistant@46.250.254.159}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키가 없습니다: $SSH_KEY"
  exit 1
fi

echo "=== 서버 OpenClaw 스킬 기반(C안) 패치 ==="
ssh -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" "$SERVER" 'bash -s' << 'ENDSSH'
python3 << 'PY'
import json, os
path = os.path.expanduser("~/.openclaw/openclaw.json")
with open(path) as f:
    c = json.load(f)
changed = False

# 1) tools: process 허용(allow에 추가), deny에서 process/group:runtime 제거, sessions_spawn deny
tools = c.get("tools")
if tools is not None:
    # tools.allow가 있으면 process가 없을 때 추가 (백그라운드 exec에 필수)
    allow = list(tools.get("allow") or [])
    if allow and "process" not in allow:
        allow.append("process")
        tools["allow"] = allow
        c["tools"] = tools
        changed = True
        print("OK: tools.allow 에 process 추가 (background exec 허용)")
    deny = list(tools.get("deny") or [])
    for bad in ("process", "group:runtime"):
        if bad in deny:
            deny.remove(bad)
            changed = True
            print("OK: tools.deny 에서 %s 제거 (background exec 허용)" % bad)
    if "sessions_spawn" not in deny:
        deny.append("sessions_spawn")
        changed = True
        print("OK: tools.deny 에 sessions_spawn 추가")
    tools["deny"] = deny
    c["tools"] = tools

# 2) acp.enabled: false
if c.get("acp") is not None:
    if c["acp"].get("enabled", True):
        c["acp"]["enabled"] = False
        changed = True
        print("OK: acp.enabled = false")

# 3) plugins.entries.acpx.enabled: false
plugins = c.get("plugins") or {}
entries = plugins.get("entries") or {}
if entries.get("acpx") is not None:
    if entries["acpx"].get("enabled", True):
        entries["acpx"]["enabled"] = False
        plugins["entries"] = entries
        c["plugins"] = plugins
        changed = True
        print("OK: plugins.entries.acpx.enabled = false")

# 4) plugins.allow: openclaw-plugin-devbridge 포함, devbridge 제거
allow_plugins = list(plugins.get("allow") or [])
if "openclaw-plugin-devbridge" not in allow_plugins:
    allow_plugins.append("openclaw-plugin-devbridge")
    plugins["allow"] = allow_plugins
    c["plugins"] = plugins
    changed = True
    print("OK: plugins.allow 에 openclaw-plugin-devbridge 추가")
if "devbridge" in allow_plugins:
    allow_plugins[:] = [x for x in allow_plugins if x != "devbridge"]
    plugins["allow"] = allow_plugins
    c["plugins"] = plugins
    changed = True
    print("OK: plugins.allow 에서 devbridge 제거")

# 5) devbridge entry 제거
if "devbridge" in entries:
    del entries["devbridge"]
    plugins["entries"] = entries
    c["plugins"] = plugins
    changed = True
    print("OK: plugins.entries.devbridge 제거")

if changed:
    with open(path, "w") as f:
        json.dump(c, f, indent=2)
else:
    print("OK: 이미 스킬 기반 패치 적용됨.")
PY
ENDSSH

echo "패치 완료. OpenClaw 재시작 시 적용됩니다."
echo "참고: OpenCode 제어는 워크스페이스 OPENCODE_ACP_WORKFLOW.md(스킬 방식)로만 수행. DevBridge 서비스는 사용하지 않음."
