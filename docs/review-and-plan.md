# roku-mcp review and improvement plan

Written for: maintainers of roku-mcp. Scope: code, security dependencies, rules and docs, plugin packaging. Verified against the working tree on 2026-10-10 (v1.7.0).

## What changed in this pass

- **Security dependencies.** `npm audit fix` applied, plus a `fast-xml-parser` override (`^5.7.0`) for the nested copy under `roku-perfetto`, which pins `^4.5.0`. Production audit went from 26 findings (1 critical, 15 high) to 4 high, all from `braces`. `braces` has no patched release on npm (advisory covers `<=3.0.3`), so it stays until upstream ships a fix. Build passes and all 11 tests pass. The `ecp` and stream-manifest XML parsers use `XMLParser` with the same options on v5.
- **Plugin mode.** Claude Code: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`. Cursor: `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, `mcp.json`. Both launch `bootstrap.mjs`, which runs `npm ci` and build on first start. Shared skills live in `skills/` (7 skills). Cursor rules are loaded from `rules/cursor/`.
- **Docs.** README gained a plugin-mode section. CHANGELOG has an Unreleased entry.

Not committed. The tree also holds pre-existing uncommitted work (`src/tools/bsprof.ts` cache changes, `test/bsprof.header.test.ts`, the `test` script in `package.json`). Left as is.

## Findings

### Security

1. **Unpatched `braces` (high).** Stack-exhaustion DoS through deeply nested glob patterns, reached via `roku-deploy` → `fast-glob`/`micromatch`. Patterns come from the caller, so exposure is low for a local tool. Track upstream; re-run `npm audit` each release.
2. **Unvalidated host in URLs.** `ecpUrl(host, path)` in `src/tools/ecp.ts:11` and the RTA launch in `src/stream/live.ts:211` interpolate `host` raw. A value such as `evil.com/x` changes the request target. Validate as IPv4, IPv6, or hostname before use.
3. **Server fetches arbitrary URLs.** `src/stream/manifest.ts:452` and `:473` fetch whatever `url` the caller passes, including child playlists. Acceptable for a local dev tool. Document it, and consider refusing non-http(s) schemes and link-local addresses.
4. **Predictable deploy staging dir.** `src/tools/deploy.ts:37` uses `os.tmpdir()/roku-mcp-deploy`, a fixed shared path. Use `fs.mkdtemp`.
5. **Local secrets.** `.mcpregistry_*_token` and `.cursor/mcp.json` (which holds a Slack auth entry) sit in the repo root. Both are gitignored (the `.cursor` entry comes from the global gitignore). Keep them out of any commit.

### Code

6. **Duplicated server setup.** `src/index.ts` registers the same eight tool groups twice (in `createServer` and in the `isDirectRun` block). The version `1.7.0` is hardcoded in both places plus `package.json`. Make one factory and read the version from `package.json`.
7. **Thin test coverage.** Two test files exist (`test/diagnose.regression.test.ts`, `test/bsprof.header.test.ts`). Nothing covers `ecp.ts`, `edit-ui.ts` (RTA framing), `console.ts`, `deploy.ts`, `perfetto.ts`, or `stream/manifest.ts` parsing. Start with pure functions: RTA frame encode/decode, URL building, manifest parsing.
8. **Large-file cache.** `bsprof.ts` keeps one parsed profile. Fine for now. Compare-two-files re-parses each call. Noted in code already.

### Rules, skills, and docs

9. **Six hand-maintained rule variants** (`rules/*`, `.cursor/rules`, `AGENTS.md`, `README.md`). Tool names currently match the 38 registered tools, but nothing enforces it. Generate them from one source, or add a test that greps tool names from `src/` and fails on drift.
10. **Two plugins with overlapping tools.** The fox-internal `fox-roku-mcp` plugin is installed on this machine alongside `roku-mcp`. Both expose `roku_*`. Pick one to avoid duplicate tools and skill confusion.
11. **The fox-internal plugin's skills are stale.** They reference `roku_collect_diagnostics`, which this repo does not have, and omit the RTA editing and stream tools. The new `skills/` directory supersedes them for this repo.
12. **Cursor MCP config has no `env` block.** Cursor may not pass `ROKU_DEVICE_*` from the user shell. Device host and password must come from a project `.env` (dotenv loads from the working directory) or per-call parameters. Confirm in a live Cursor session.

## Unverified

- Install through `/plugin marketplace add` and Cursor marketplace loading. Not run here; the manifests parse and the launcher works over stdio.
- Cursor's strict-schema rules for `.cursor-plugin/plugin.json`. The official reference was fetched; it lists `name` and `version` as required. I did not confirm whether extra fields are rejected.
- `${ROKU_DEVICE_HOST}` expansion when the variable is unset, in both hosts.
- Runtime behavior of Perfetto and bsprof tools after the `fast-xml-parser` override. Only the XML parse path was smoke-tested.
- No Roku device was available. Device-facing tools were not exercised.

## Plan (priority order)

**P0, now**
- Review and commit: security deps + override, plugin files, README/CHANGELOG, and the pending bsprof work with its test.
- Decide on the duplicate `fox-roku-mcp` plugin (finding 10).

**P1, next release**
- Consolidate `createServer` and version source (6).
- Validate `host` (2) and use `mkdtemp` for deploy staging (4).
- Unit tests for RTA framing, URL building, manifest parsing (7). Add to `npm test`.

**P2**
- Generate rule variants from one source, or add a drift test (9).
- Scheme and address policy for `url` fetches (3).

**P3, when upstream fixes it**
- Drop the `braces` exposure: bump `roku-deploy` or add an override once a patched `braces` ships (1). Re-run `npm audit --omit=dev` each release.

**Verification before tagging a plugin release**
- Install via `/plugin marketplace add` in Claude Code on a clean machine. Confirm the `roku` server starts and `/fox-roku-mcp`-style skill names resolve as `roku-mcp:*`.
- Install in Cursor and confirm the server starts, skills load, and `alwaysApply` rules apply.
- Run the stream diagnosis and RTA edit flows against a real device.
