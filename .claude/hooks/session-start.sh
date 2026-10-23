#!/bin/bash
# Install dependencies once per container so sessions don't spend turns on it.
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] && exit 0
npm ci --no-audit --no-fund >/dev/null 2>&1 \
  || npx -y npm@11.6.2 ci --no-audit --no-fund >/dev/null 2>&1 \
  || echo "npm ci failed; run it by hand (see CLAUDE.md)"
exit 0
