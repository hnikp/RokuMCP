---
name: install
description: Install and configure the roku-mcp plugin (Claude Code or Cursor) against a Roku dev device. Use when the user asks how to install roku-mcp, point it at a different Roku, or hits "No Roku device found" or "developer password required".
---

# Install & configure roku-mcp

## Install

Claude Code:

```text
/plugin marketplace add jack1590/RokuMCP
/plugin install roku-mcp@roku-mcp-marketplace
```

Run `/reload-plugins`. The server is registered as `roku`.

Cursor: add the repo as a plugin marketplace (`.cursor-plugin/marketplace.json`) or copy it to `~/.cursor/plugins/local/roku-mcp/`.

First launch runs `npm ci` and `npm run build` (needs Node 18+). Output goes to stderr.

## Device credentials

Resolution order, highest first:

1. Tool parameters `host` / `password`
2. Env vars `ROKU_DEVICE_HOST` / `ROKU_DEVICE_PASSWORD`, else the roku-deploy/BrighterScript aliases `ROKU_DEV_TARGET` / `ROKU_DEVPASSWORD`. Also read from a project `.env`. Empty strings count as unset.
3. SSDP discovery (host only; password must come from 1 or 2)

Do not invent an IP or password. If neither is available, ask the user.

## Verify

Keypresses return 403? Check first: Settings → System → Advanced system settings → Control by mobile apps → Network access = "Permissive".

1. `roku_discover`: SSDP sees the device.
2. `roku_query_device_info`: ECP on 8060 answers.
3. `roku_query_active_app`: foreground app reports correctly.
