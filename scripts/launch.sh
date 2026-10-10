#!/usr/bin/env bash
# Launch roku-mcp for plugin hosts (Claude Code, Cursor).
# Plugin installs clone the repo without node_modules or dist/, so build on first run.
# stdout is the MCP JSON-RPC channel: install/build output goes to stderr only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d node_modules ] || [ ! -f dist/index.js ] || [ package.json -nt dist/index.js ]; then
  npm ci --ignore-scripts --no-audit --no-fund >&2
  npm run build >&2
fi

exec node dist/index.js "$@"
