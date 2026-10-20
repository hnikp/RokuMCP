---
name: ecp-control
description: Drive a Roku with simulated remote input and inspect the running app via ECP (keypress, type text, SceneGraph tree, focused node, media player state). Use to navigate menus, type into fields, find nodes, or assert video playback state.
---

# ECP control and observation

## Loop

Observe → act → wait → verify. Always pause between presses.

```
roku_screenshot                       # observe
roku_get_focused_node                 # what has focus
roku_keypress / roku_keypress_sequence / roku_type_text   # act
roku_sleep durationMs=500..2000       # settle
roku_find_node | roku_query_app_ui    # verify
```

- Text fields: focus with `roku_keypress` first, then `roku_type_text`.
- Video assertions: `roku_query_media_player` is the source of truth. `state` is one of `play`, `pause`, `buffer`, `stop`, `none`. Read `position`, `duration`, `error`.
- Never assert without a preceding `roku_sleep`.
- Hold a key with `roku_long_press key=<Key> holdMs=1500` (keydown … keyup), e.g. for long-press menus.
- Non-ASCII `Lit_` works: `roku_type_text` can type e.g. Persian letters.

## Focus

`roku_get_focused_node` walks the focus chain and returns `{focused, path}`. `query/app-ui` marks every node on the chain `focused="true"` (plus each RowList row's current cell and some checked items), so a plain search for `focused="true"` finds the wrong node. The tool follows the first focused child from the root.

## Screenshots

- Each takes ~8 s and captures only the graphics plane. A Video node shows as a black rectangle; sharp images inside a "playing" thumbnail may be storyboard frames, not video.
- Player chrome that auto-hides after ~5 s is gone by the time the screenshot lands. Send the whole key sequence, then screenshot. Don't screenshot between keys.
- `outFile` is a bare file name (a path separator is rejected); `outDir` is resolved to an absolute path.

## Pitfalls

- ECP 403 on keypress: on the device set Settings → System → Advanced system settings → Control by mobile apps → Network access to "Permissive".
- During fullscreen video Roku OS grabs the Options (`*`) key; the app never receives it.
- Blind key sequences can change device-wide settings (one changed the system caption mode). Screenshot before Select when focus is uncertain.
- Popups such as skip notices can capture OK/Back.
- Every keypress ignored and RTA queries hang: the app is probably stopped in the BrightScript debugger. Read the console for a backtrace (`deploy-debug`).

## Test generation

- Match the target project's test framework. Read sibling tests first.
- Every step is navigate → wait → assert.
- Prefer `uiElementId` (`RTA_<digits>`) over text matches for selectors when RTA is present (see `runtime-ui-editing`).
