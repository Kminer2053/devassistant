#!/bin/bash
set -e

echo "=== Installing OpenClaw ==="

curl -fsSL https://openclaw.ai/install.sh | bash

echo "=== Run onboarding and install daemon ==="
echo "Execute: openclaw onboard --install-daemon"

echo "=== Deploying openclaw.json baseline ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$REPO_DIR/infra/templates/openclaw.json" ]; then
  mkdir -p ~/.openclaw
  if [ -f ~/.openclaw/openclaw.json ]; then
    echo "Backing up existing openclaw.json to openclaw.json.bak"
    cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak
  fi
  cp "$REPO_DIR/infra/templates/openclaw.json" ~/.openclaw/openclaw.json
  echo "openclaw.json copied to ~/.openclaw/"
  echo "Edit ~/.openclaw/openclaw.json: set gateway.auth.token, plugins.entries.devbridge.config.devbridgeToken"
fi

echo "=== Install DevBridge plugin ==="
echo "openclaw plugins install -l $REPO_DIR/openclaw-plugin-devbridge"
