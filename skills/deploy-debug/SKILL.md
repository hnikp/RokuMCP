---
name: deploy-debug
description: Sideload a Roku BrightScript/SceneGraph app to a dev device, redeploy after changes, and read the BrightScript debug console for crashes and prints. Use when the user wants to deploy, redeploy, or attach to the console.
---

# Deploy and debug a channel

## Deploy

1. Confirm `<rootDir>/manifest` exists. The tool fails otherwise.
2. `roku_deploy` with `rootDir` (absolute path). Pass `files` only for a non-default glob; the default is `**/*`.
3. `roku_sleep` 3000–5000 ms before any UI interaction so the channel finishes launching.

A running dev channel is replaced; its registry (logins, settings) survives. Deleting the channel wipes the registry: `roku_delete_dev_channel` and `roku_deploy deleteInstalledChannel=true` do that. roku-deploy's own `deploy()` deletes by default; this tool sets it to false.

### Prebuilt package

Projects that build their own zip (BrighterScript/ropm builds, component-library apps): run the project's build, then `roku_deploy zipPath=<absolute path to .zip>`. `zipPath` and `rootDir` are mutually exclusive.

- Component-library apps (a small app that loads a lib from a URL in debug, with an embedded fallback): deploy the app zip with `zipPath`.
- Running a unit-test package sideloads over the dev channel AND shares its registry: it can wipe logins and settings. Back up the registry first; afterwards redeploy the real app and restore.

## Console

- `roku_console_send` and `roku_console_read` each open, run, and close the connection. Do not expect a persistent session.
- Read after a repro step, not in a loop.
- Port 8085 takes one client. The VS Code debugger, a Rooibos/test runner, `nc` captures and `roku_console_capture_*` all kick each other off.
- Capturing by hand: `nc -d <host> 8085 >> log`. Without `-d`, a backgrounded nc exits on stdin EOF.
- `Missing or invalid PHY: /RokuOS/Artwork/...` means OS artwork the app relies on is absent on this firmware. Bundle your own images.

## Capture to a file and wait for a line

1. `roku_console_capture_start` (optional `file`; default `./logs/<ts>-rokuDevice.log`). Detach the VS Code debugger first: 8085 takes one client.
2. `roku_deploy` for a cold start, or `roku_launch appId=dev restart=true` (instant-resume channels resume instead of restarting).
3. `roku_console_wait pattern="<regex>"` (add `predicate=jwtValid` to require a non-expired `Authorization: Bearer` token).
4. `roku_console_capture_stop`. Read the matched line from the file; don't paste raw console output into chat.

## Screenshot

`roku_screenshot` once per significant UI change. Do not screenshot in a tight loop.
