#!/usr/bin/env node
// Plugin entry for Claude Code and Cursor. Installs deps and builds on first start, then
// hands stdio to the server. Install/build output goes to stderr: stdout is the
// MCP JSON-RPC channel.
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist', 'index.js');
const pkg = path.join(root, 'package.json');

const stale = !existsSync(dist) || statSync(pkg).mtimeMs > statSync(dist).mtimeMs;
if (!existsSync(path.join(root, 'node_modules')) || stale) {
  const opts = { cwd: root, stdio: ['ignore', 2, 2] };
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], opts);
  execFileSync('npm', ['run', 'build'], opts);
}

// dist/index.js starts the stdio server only when argv[1] names it, so point argv[1] there.
process.argv[1] = dist;
await import(pathToFileURL(dist).href);
