---
name: deploy-debug
description: Sideload a Roku BrightScript/SceneGraph app to a dev device, redeploy after changes, and read the BrightScript debug console for crashes and prints. Use when the user wants to deploy, redeploy, or attach to the console.
---

# Deploy and debug a channel

## Deploy

1. Confirm `<rootDir>/manifest` exists. The tool fails otherwise.
2. `roku_deploy` with `rootDir` (absolute path). Pass `files` only for a non-default glob; the default is `**/*`.
3. `roku_sleep` 3000–5000 ms before any UI interaction so the channel finishes launching.

A running dev channel is replaced. `roku_delete_dev_channel` removes it.

## Console

- `roku_console_send` and `roku_console_read` each open, run, and close the connection. Do not expect a persistent session.
- Read after a repro step, not in a loop.

## Screenshot

`roku_screenshot` once per significant UI change. Do not screenshot in a tight loop.
