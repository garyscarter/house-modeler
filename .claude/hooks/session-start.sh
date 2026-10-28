#!/bin/bash
# Install dependencies once per container so sessions don't spend turns on it, then print the first-run welcome
# (scripts/house/welcome.mjs --hook) when there is something new to say. Never fails a session.
cd "$CLAUDE_PROJECT_DIR" || exit 0
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 \
    || npx -y npm@11.6.2 ci --no-audit --no-fund >/dev/null 2>&1 \
    || echo "npm ci failed; run it by hand (see CLAUDE.md)"
fi
if [ -d node_modules ]; then
  node "$CLAUDE_PROJECT_DIR"/scripts/house/welcome.mjs --hook 2>/dev/null || true
fi
exit 0
