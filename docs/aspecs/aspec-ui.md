# Architectural Spec — UI Layer
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 6), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree, cross-cutting conventions, and the event flow diagram.
> **Also load:** `aspec-game-state.md` — for the `GameState` shape, action list, and `createGameState` factory that all UI modules consume.
> **Also load:** `aspec-themes.md` — `ui/themes.js` and the no-flash inline script are part of the UI layer; load that spec when implementing `ui/themes.js`.

---

## Table of Contents

1. [UI Module Pattern](#1-ui-module-pattern)
2. [Mount Point Skeleton — `index.html`](#2-mount-point-skeleton--indexhtml)
3. [Module Boundaries](#3-module-boundaries)
4. [Grid — `js/ui/grid.js`](#4-grid--jsuigridjs)
5. [Number Pad — `js/ui/numpad.js`](#5-number-pad--jsuinumpadjs)
6. [Controls — `js/ui/controls.js`](#6-controls--jsuicontrolsjs)
7. [Dialog — `js/ui/dialog.js`](#7-dialog--jsuidialogjs)
8. [Win Banner — `js/ui/winBanner.js`](#8-win-banner--jsuiwinbannerjs)
9. [Statistics — `js/ui/stats.js`](#9-statistics--jsuistatsjs)
10. [SR Live Region — `js/ui/srLive.js`](#10-sr-live-region--jsuisrlivejs)
11. [Keyboard — `js/ui/keyboard.js`](#11-keyboard--jsuikeyboardjs)
12. [Accessibility Implementation](#12-accessibility-implementation)
13. [Screen Reader Announcements](#13-screen-reader-announcements)
14. [Focus Management](#14-focus-management)

---

## 1. UI Module Pattern

Each UI module owns exactly one DOM subtree. Each module uses named ES module exports — there is no default export and no factory pattern. Every module exports a `mount` function:

```js
export function mount(root, gameState) { ... }
```

Module-private state is held in module-level `let` variables (e.g. `let _root = null; let _gameState = null;`), not in class private fields.

- `gameState` is the object returned by `createGameState(...)`, exposing `dispatch`, `getState`, and `on`.
- `mount` is called once by `main.js`. The module stores references to `root` and `gameState` in module-level variables, subscribes to events, and performs the first render before returning:
  ```js
  export function mount(root, gameState) {
    _root = root;
    _gameState = gameState;
    gameState.on('changed', ({ changed }) => {
      if ([...changed].some(k => RELEVANT_KEYS.has(k))) _render(gameState.getState());
    });
    _render(gameState.getState());  // first render
  }
  ```
- Each module defines a module-level `RELEVANT_KEYS` set and short-circuits on irrelevant changes. This is a required performance optimization — do not re-render on every state change.
- `dispatch` is accessed via `gameState.dispatch` inside the module — not passed as a separate argument.
- Modules that subscribe to additional emitters (e.g. `ui/stats.js` subscribing to `statistics.on('stats-changed', ...)`) receive those instances as additional arguments to `mount`, not as constructor arguments. `stats.js` signature: `mount(root, gameState, statistics)`.
- No UI module imports from `game/*`, `providers/*`, or `persist/*` — all cross-module data flows via `gameState` or its emitter.
- No direct DOM access outside the module's `root`.

---

## 2. Mount Point Skeleton — `index.html`

The Implementor creates the following container IDs in `index.html`. UI modules mount to these exact IDs; tests reference them.

| ID | Mounted by |
|---|---|
| `#app-root` | Outermost wrapper |
| `#grid-root` | `ui/grid.js` |
| `#numpad-root` | `ui/numpad.js` |
| `#controls-root` | `ui/controls.js` (Difficulty selector) |
| `#stats-root` | `ui/stats.js` |
| `#win-banner-root` | `ui/winBanner.js` — absolute-positioned over grid; empty until won |
| `#dialog-root` | `ui/dialog.js` — modal container; empty until opened |
| `#sr-live` | `ui/srLive.js` — `aria-live` region |

No UI module queries the DOM outside its own root.

---

## 3. Module Boundaries

Each `js/ui/*` module owns exactly one DOM subtree. Mount returns nothing; render is driven by subscriptions to the state emitter. The isolation contract is strict:
- No cross-module imports between UI modules.
- No direct DOM access outside the module's own `root`.
- All state reads go through `gameState.getState()`.
- All state writes go through `gameState.dispatch(action)`.

---

## 4. Grid — `js/ui/grid.js`

- Creates 81 `<div role="gridcell">` elements inside `<div role="grid" aria-label="Sudoku puzzle" tabindex="0">`.
- Click on a player cell dispatches `SELECT_CELL { index }`. Click on a given has no effect.
- Arrow keydown dispatches `ARROW_NAV { direction }`.
- Click outside the grid dispatches `DESELECT`. The outside-click handler excludes `#numpad-root` and `#dialog-root` — see §5 for the rationale.
- All visual state (conflict, incorrect, pencil marks, pen digit, selection) derived from `getState()` on every relevant re-render.
- Cell `aria-label` constructed from `[row, col, contents, state]`, updated on every render that touches that cell.

---

## 5. Number Pad — `js/ui/numpad.js`

- The numpad container has `role="toolbar"` (semantically accurate since the pad acts as a tool group operating on an external selection).
- Digit buttons dispatch `PEN_ENTER { digit }` or `PENCIL_TOGGLE { digit }` based on `state.activeMode`.
- Erase button dispatches `ERASE`.
- Mode toggle dispatches `TOGGLE_MODE`; carries `aria-pressed` reflecting current mode.
- Hint button state derived from `state.hintsRemaining`, `state.selected`, `state.puzzle.givens`, and `state.pen` per `aspec-hints.md` §2.
- Check button has `display: none` via `.hidden-tier` class for Kiddie, Hard, and Death March (`CHECK_VISIBLE[difficulty] === false`).

**Toolbar focus pattern:** Every button in `#numpad-root` registers `mousedown: e => e.preventDefault()`. This prevents the browser from transferring DOM focus to the button on pointer interaction, so the selected cell keeps its focus ring across successive taps. Tab, Enter, and Space activation are unaffected.

**DESELECT guard:** The outside-click handler in `ui/grid.js` excludes `#numpad-root` (alongside `#dialog-root`) so numpad clicks never dispatch `DESELECT`. Without this exclusion, every button tap would clear `state.selected` via event bubbling, making successive digit taps no-op after the first.

---

## 6. Controls — `js/ui/controls.js`

Owns the difficulty selector only. New Puzzle and Reset buttons are static HTML in `index.html` (inside `.action-row`); they are not managed by `controls.js`. The theme selector is also static HTML in `index.html` (inside `.theme-control` in the header).

- **Difficulty selector:** Rendered into `#controls-root` by `mount`. On change, if a puzzle is in progress (`state.pen` has any non-zero player entries and `!state.won`), opens a confirmation dialog via `ui/dialog.js` with text "Change difficulty?" / "Your current progress will be lost." [Cancel] [Change Difficulty]. On confirm, dispatches `CHANGE_DIFFICULTY { difficulty }`. On cancel, reverts the `<select>` to the previous value.
- The difficulty selector always reflects `state.puzzle?.difficulty` or the last-set difficulty.

---

## 7. Dialog — `js/ui/dialog.js`

Reusable confirmation dialog. Exports three named functions:

```js
export function mount(root)                                                     → void
export function open({ title, body, confirmLabel, onConfirm })                  → void
export function close()                                                         → void
```

`mount(root)` takes only one argument — no `gameState`. It must be called once before `open`. `open` and `close` are standalone named exports, not methods on a returned object.

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title element.
- Focus trap: Tab cycles within the dialog while open.
- Escape key dismisses (equivalent to Cancel).
- Enter on the focused button confirms or cancels.
- On open: focus moves to the Cancel button (default focus target per fspec §14.4).
- On close: focus returns to the element that triggered the dialog.
- Rendered into `#dialog-root`; empty when not open.

---

## 8. Win Banner — `js/ui/winBanner.js`

- `#win-banner-root` is positioned absolute (inline style: `position:absolute; inset:0; z-index:10; pointer-events:none`) in `index.html`, overlaying the grid wrapper.
- `winBanner.js` renders a `#win-banner` div inside `#win-banner-root`. Relevant keys: `['won']`.
- When `state.won` becomes `true`, the banner div receives class `.show` and `aria-hidden` is removed. When false, `.show` is removed and `aria-hidden="true"` is restored.
- On show: announces `"Puzzle complete! Well done."` via `srLive.announce` and moves focus to the New Puzzle button (`#btn-new`) via `requestAnimationFrame` (per fspec §14.4).

---

## 9. Statistics — `js/ui/stats.js`

- Mounts at `#stats-root`. Signature: `mount(root, gameState, statistics)`.
- `statistics` is the third argument to `mount` — not a constructor argument. It exposes `get()` and `on(event, handler)`.
- Renders a 5-row table from `statistics.get()` on first mount.
- Subscribes to `statistics.on('stats-changed', ...)` for renders driven by stats changes.
- Also subscribes to state-level `'changed'` events; when `payload.changed` includes `'puzzle'` (difficulty change or new puzzle), recomputes the `.active-diff` row marker. This marker is driven by `state.puzzle?.difficulty`, not by statistics data.
- Row order follows `DIFFICULTY_ORDER` from `config.js`.

---

## 10. SR Live Region — `js/ui/srLive.js`

A single hidden `#sr-live` region with `aria-live="assertive"` `aria-atomic="true"` `role="status"`.

Exposes `announce(text: string) → void`.

Uses a single-frame clear-then-set pattern so repeated identical messages are re-announced by screen readers:
```js
function announce(text) {
  srLiveEl.textContent = '';
  requestAnimationFrame(() => {
    srLiveEl.textContent = text;
  });
}
```

---

## 11. Keyboard — `js/ui/keyboard.js`

Global `keydown` handler on `document`.

| Key | Action | Notes |
|---|---|---|
| 1–9 | `PEN_ENTER { digit }` or `PENCIL_TOGGLE { digit }` | Based on `state.activeMode`; no-op if no cell selected |
| Backspace / Delete | `ERASE` | No-op if no cell selected |
| Arrow keys | `ARROW_NAV { direction }` | Only when focus is inside `.sudoku-grid` OR `state.selected !== null` |
| P / p | `TOGGLE_MODE` | Only when focus is not in an `input`, `select`, `textarea`, or `button` |
| Escape | Close dialog | Dismissed via `dialog.close()` |

---

## 12. Accessibility Implementation

- Grid root: `role="grid"`, cells: `role="gridcell"`. All cells have `tabindex="0"`.
- Given cells: `aria-readonly="true"`.
- Cell `aria-label` constructed from `[row, col, contents, state]`, updated on render. States include conflict and incorrect flags when applicable.
- Dialogs: focus trap, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Win banner: `aria-hidden="true"` when not shown; on show, focus moves to New Puzzle button.
- Every announcement in §13 implemented by a corresponding `srLive.announce()` call in the matching action handler or UI event.

---

## 13. Screen Reader Announcements

Every one of these events must produce a screen reader announcement via `srLive.announce()` (from fspec §14.3):

| Event | Announcement text |
|---|---|
| Pen digit entered | `"Cell row N, column N: D"` |
| Pen digit erased | `"Cell row N, column N cleared"` |
| Conflict detected on entry | `"Conflict: D appears more than once"` |
| Conflict resolved | `"Conflict resolved"` |
| Incorrect flag applied (Kiddie real-time) | `"Incorrect"` |
| Check results — cells incorrect | `"N cell(s) incorrect."` |
| Check results — all correct | `"All filled cells are correct."` |
| Hard/Death March on-fill result (incorrect) | Announcement matches the visible completion message |
| Hint used | `"Hint used: D placed in cell row N, column N. N hints remaining."` (or `"unlimited hints remaining."`) |
| Hints exhausted (after last hint) | `"No hints remaining"` |
| Mode toggled | `"Mode: Pen"` or `"Mode: Pencil"` |
| Puzzle complete (win) | `"Puzzle complete! Well done."` |

Announcements are fired by UI modules (`numpad.js`, `winBanner.js`) immediately after the relevant action or state update, using `srLive.announce` imported from `ui/srLive.js`.

---

## 14. Focus Management

Behavioral obligations (from fspec §14.4):

- **Confirmation dialog open:** focus moves to the Cancel button (the dialog's default focus target).
- **Confirmation dialog close:** focus returns to the element that triggered it.
- **Puzzle completion (win):** focus moves to the New Puzzle button.
- **Page load with resumed puzzle:** no cell is auto-focused. The player's first Tab or arrow key interaction moves focus into the appropriate area.
