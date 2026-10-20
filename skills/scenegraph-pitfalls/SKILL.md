---
name: scenegraph-pitfalls
description: Known Roku SceneGraph/BrightScript/BrighterScript pitfalls that cause silent failures, hangs or crashes. Use when writing or debugging SceneGraph components, focus handling, RowList item components, text rendering, or task-thread code.
---

# SceneGraph pitfalls

Each entry: symptom → cause → fix. Check the console (`deploy-debug`) first; most of these leave a backtrace or an error line.

## Threads

- Crash, console says "MAIN|TASK-only component" → `roFontRegistry` can't be created on the render thread → measure text with a hidden Label, or do it in a Task.

## Focus and tree

- RowList/MarkupGrid item component can't find its list → item components are NOT descendants of the list; `getParent()` never reaches it → share state via a field on the list's content or `m.global`.
- `SetFocus(true)` on a parent does nothing → it is a no-op while one of its descendants holds focus → release the descendant first (`child.SetFocus(false)`), then focus the parent.
- Details reload in a loop, server flooded → a frequently-changing node (e.g. a Video) is stored in a field of a ContentNode that other components observe as their `content`; every state change propagates as a content change → store a boolean flag instead, keep the node elsewhere.

## BrightScript / BrighterScript

- Wrong function called, odd values → BrighterScript transpiles a local variable or parameter named like a function in the same namespace (case-insensitive) into a reference to that function → rename it; grep the transpiled `.brs` for `Namespace_lowercase`.
- Callback crashes or touches the wrong state → a callback stored in an AA and invoked as `item.callback()` runs with `m` = that AA, not the component → don't pass component functions as AA callbacks; handle the event in the component.
- "Function Call Operator ( ) attempted on non-function" on `params.Count()` → an AA key named like an AA method (e.g. `count`) shadows the method → put such params in the URL string or use another container.
- Error path always taken → string error fields (`""` on success) checked with `<> invalid` are always true → check a success flag.

## Text and lint

- Arabic/Persian text renders as disconnected, left-to-right, or tofu glyphs → Roku labels do no Arabic-script shaping or bidi reordering, and system fonts lack the glyphs → bundle a font (e.g. Vazirmatn) and shape to presentation forms yourself. Same for DynamicCustomKeyboard key labels (use per-key icon images) and TextEditBox (overlay a Label; make the box text transparent).
- bslint color-cert error on a transparent color → the rule rejects pure black/white even with alpha 0 → use e.g. `"#80808000"`.

## Observation

- Video "missing" in a screenshot → screenshots capture only the graphics plane; video is never in them → assert playback with `roku_query_media_player` (see `ecp-control`).
