#!/bin/bash
set -e

echo "=== Installing OpenCode ==="

curl -fsSL https://opencode.ai/install | bash

echo "OpenCode installed. Verify with: opencode --version"

echo "=== Deploying opencode.json template ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$REPO_DIR/infra/templates/opencode.json" ]; then
  if [ -f ~/.config/opencode/opencode.json ] && grep -q '"mcp"' ~/.config/opencode/opencode.json 2>/dev/null; then
    echo "WARNING: ~/.config/opencode/opencode.json already has an 'mcp' block. This copy will OVERWRITE it and remove MCP. See docs/09_OPENCODE_SETUP.md §2.5 (MCP 설정이 사라졌을 때)."
    echo "To keep MCP, merge with infra/templates/opencode-mcp-dev.json instead of overwriting. Skipping copy."
  else
    mkdir -p ~/.config/opencode
    cp "$REPO_DIR/infra/templates/opencode.json" ~/.config/opencode/opencode.json
    echo "opencode.json copied to ~/.config/opencode/"
  fi
fi

echo "=== To run opencode serve via systemd ==="
echo "1. Edit /etc/systemd/system/opencode.service: set OPENCODE_SERVER_PASSWORD"
echo "2. sudo systemctl daemon-reload"
echo "3. sudo systemctl enable opencode && sudo systemctl start opencode"
