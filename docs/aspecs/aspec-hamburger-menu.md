# Architectural Spec — Hamburger Menu and Control Consolidation (V4)
**Status:** Draft for Orchestrator review
**Date:** 2026-11-27
**Author:** Architect
**Inputs:** `rspec-008-hamburger-menu.md`, `fspec-008-hamburger-menu.md`,
`vspec-008-hamburger-menu.md` (governs visuals; `docs/mockups/hamburger-menu-v3.html` is
reference only)
**Extends / amends:** `aspec-ui.md` (§2, §5, §6, §9, §14), `aspec-left-hand.md` (§4, §6–§8),
`aspec-themes.md` (§2), `aspec-puzzle-sharing.md` (§7.2, §7.4), `aspec-harder-tiers.md`
§5.3 (focus around the busy card), `aspec-game-state.md` §1.2 step 8 (bootstrap)

---

## Table of Contents

1. [Approach](#1-approach)
2. [Files Touched](#2-files-touched)
3. [Markup — `index.html`](#3-markup--indexhtml)
4. [`js/ui/menu.js` (new)](#4-jsuimenujs-new)
5. [Statistics Dialog — `js/ui/stats.js` (reworked)](#5-statistics-dialog--jsuistatsjs-reworked)
6. [Request Focus — `js/ui/requestFocus.js` (new)](#6-request-focus--jsuirequestfocusjs-new)
7. [Changes to Existing Modules](#7-changes-to-existing-modules)
8. [Bootstrap Wiring — `main.js`](#8-bootstrap-wiring--mainjs)
9. [Focus Management Map](#9-focus-management-map)
10. [Keyboard and Escape Precedence](#10-keyboard-and-escape-precedence)
11. [CSS](#11-css)
12. [Dev Tooling and Recorder Compatibility](#12-dev-tooling-and-recorder-compatibility)
13. [Impact on Existing Tests](#13-impact-on-existing-tests)
14. [Test Infrastructure Notes for the QE Strategist](#14-test-infrastructure-notes-for-the-qe-strategist)
15. [Implementation Sequence](#15-implementation-sequence)
16. [Performance](#16-performance)
17. [Feasibility / Open Issues for the Orchestrator](#17-feasibility--open-issues-for-the-orchestrator)
18. [Adjacent Observations (not in scope)](#18-adjacent-observations-not-in-scope)

---

## 1. Approach

Client-side only, plain ES modules, no new dependencies, no build step. Nothing in this
feature touches the reducer, the worker, persistence formats or the recorder: every new
behavior is DOM, focus and CSS. The reducer actions the UI dispatches are unchanged
(`RESET_PUZZLE`, `NEW_PUZZLE`, `CHANGE_DIFFICULTY`, `DESELECT`, …).

Three new pieces carry the behavior:

- **`js/ui/menu.js`** owns the menu button and the menu: open/close, roving focus,
  type-ahead, game-shortcut suppression, item state (`aria-checked`, `aria-disabled`),
  the narrow-breakpoint rule for Left-handed. It knows nothing about themes, handedness,
  sharing, resetting or statistics: those arrive as injected callbacks from `main.js`,
  keeping the `aspec-ui.md` §3 rule that UI modules do not couple to each other.
- **`js/ui/stats.js`** is reworked from an on-page panel into the Statistics dialog. It
  keeps its `mount(root, gameState, statistics)` shape and the always-current table.
- **`js/ui/requestFocus.js`** is a small, DOM-only policy function that decides where
  focus goes when a foreground puzzle request from New Puzzle or the Difficulty selector
  ends (fspec §3.4, D9). It replaces `_afterNewPuzzle`'s unconditional focus in `main.js`.

`foreground.startNew` gains an `onOutcome` parameter so that cancel, declined fallback
and failure reach the focus policy (today only a successful load does).

The wide layout moves from a flex row with `row-reverse` to the vspec §2.2 CSS grid with
a `display: contents` board column. DOM order is unchanged except for the header, the
cluster, the number pad tool block and the removed elements.

---

## 2. Files Touched

| File | Change |
|---|---|
| `index.html` | Header: `.menu-wrap` with button and empty `#app-menu`; action row and `#stats-root` removed; `#stats-dialog-root` added after `#dialog-root`; `<link>` for `css/menu.css` (§3) |
| `js/ui/menu.js` | **New** (§4) |
| `js/ui/stats.js` | Reworked into the Statistics dialog (§5) |
| `js/ui/requestFocus.js` | **New** (§6) |
| `js/ui/controls.js` | Renders the next-game cluster including `#btn-new` (§7.1) |
| `js/ui/numpad.js` | Two-column tool block, `role="group"` (§7.2) |
| `js/ui/share.js` | No longer owns a button; exposes `share()` (§7.3) |
| `js/ui/themes.js` | `bindThemeSelect` removed; `THEME_OPTIONS`, `currentTheme()` added (§7.4) |
| `js/ui/handedness.js` | `bindHandToggle` removed; `toggleHandedness()` added (§7.5) |
| `js/ui/dialog.js` | `mount(root, { beforeOpen })` hook (§7.6) |
| `js/ui/keyboard.js` | Arrow/Home from the focused grid container move DOM focus to the selected cell (§7.7, open issue O4) |
| `js/game/foreground.js` | `startNew(difficulty, afterLoad, onOutcome)` (§7.8) |
| `js/main.js` | Wiring (§8) |
| `css/menu.css` | **New**: header button, menu, items, theme rules, narrow rules (§11) |
| `css/base.css`, `css/grid.css`, `css/controls.css`, `css/stats.css` | Per vspec §12 (§11) |
| `css/themes.css`, `css/dev.css` | No change |
| `js/tests/**` | See §13 |
| `js/tests/tools/captureSessionFixtures.js`, `scripts/visual-smoke.js` | Reach Reset/Share through the menu (§12) |

---

## 3. Markup — `index.html`

### 3.1 Head

Stylesheet order becomes `themes.css → base.css → grid.css → controls.css → menu.css →
stats.css`. The inline no-flash script is unchanged (it sets `data-theme`/`data-hand` on
`<html>` and the body class).

### 3.2 Header

Replace `.header-controls` (switch + theme control) with:

```html
<header>
  <h1>Sudoku</h1>
  <div class="menu-wrap" id="menu-root">
    <button type="button" class="menu-button" id="menu-button"
            aria-haspopup="menu" aria-expanded="false" aria-controls="app-menu"
            aria-label="Menu">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect x="2" y="4"  width="16" height="2" rx="1" fill="currentColor"/>
        <rect x="2" y="9"  width="16" height="2" rx="1" fill="currentColor"/>
        <rect x="2" y="14" width="16" height="2" rx="1" fill="currentColor"/>
      </svg>
    </button>
    <div class="app-menu" id="app-menu" role="menu" aria-label="Menu" hidden></div>
  </div>
</header>
```

The button is static so it is the first Tab stop before any module runs. The menu's
contents are rendered by `menu.js` (§4.2). `#hand-toggle` and `#theme-select` are gone.

### 3.3 Body

- `.right-col` keeps only `#numpad-root`. The `.action-row` (`#btn-new`, `#btn-reset`,
  `#btn-share`) and `#stats-root` are removed. `#btn-new` is now rendered by `controls.js`
  inside `#controls-root` (§7.1); its ID is unchanged.
- After `<div id="dialog-root"></div>` add `<div id="stats-dialog-root"></div>`.
- Update the `.right-col` comment to "number pad".

### 3.4 Element ID inventory

| ID | Owner | Notes |
|---|---|---|
| `#menu-root` (`.menu-wrap`) | `menu.js` root | Static |
| `#menu-button` | static, wired by `menu.js` | |
| `#app-menu` | static container, filled by `menu.js` | |
| `#mi-stats`, `#mi-share`, `#mi-reset`, `#mi-hand` | `menu.js` | vspec §4.1 |
| `#mi-theme-<value>` (e.g. `#mi-theme-coffee`) | `menu.js` | Added for test addressing; vspec shows no ID |
| `#mh-game`, `#mh-settings`, `#mh-theme` | `menu.js` | Heading IDs for `aria-labelledby` |
| `#btn-new` | `controls.js` | Moved; same ID |
| `#stats-dialog-root`, `#stats-backdrop`, `#stats-dialog-title`, `#stats-tbody`, `#stats-close` | `stats.js` | §5 |
| Removed | — | `#btn-reset`, `#btn-share`, `#stats-root`, `#theme-select`, `#hand-toggle` |

---

## 4. `js/ui/menu.js` (new)

### 4.1 Public API

```js
/**
 * Wires the menu button and renders the menu.
 *
 * @param {HTMLElement} root - `#menu-root` (`.menu-wrap`), containing `#menu-button`
 *   and `#app-menu`.
 * @param {{ getState: function, on: function }} gameState
 * @param {object} hooks
 * @param {function(): void} hooks.onStatistics - Opens the Statistics dialog.
 * @param {function(): void} hooks.onShare - Runs the share action.
 * @param {function(): void} hooks.onReset - Opens the Reset confirmation.
 * @param {{ options: Array<{value: string, label: string}>,
 *           current: function(): string,
 *           apply: function(string): void }} hooks.themes
 *   Theme choices in menu order; `current()` returns the applied value; `apply(value)`
 *   applies, saves and announces it.
 * @param {{ isLeft: function(): boolean, toggle: function(): void }} hooks.hand
 * @param {function(): (HTMLElement|null)} hooks.nextFocus - The Tab stop after the
 *   menu button (the Difficulty selector).
 * @param {MediaQueryList} [hooks.media] - Narrow-viewport query; defaults to
 *   `matchMedia(NARROW_QUERY)`. Injected for tests.
 */
export function mount(root, gameState, hooks) {}

/** @returns {boolean} Whether the menu is open. */
export function isOpen() {}

/**
 * Closes the menu if it is open; a no-op otherwise (it never moves focus then).
 *
 * @param {{ focusButton?: boolean }} [opts] - Move focus to the menu button.
 */
export function close({ focusButton = false } = {}) {}
```

`export const NARROW_QUERY = '(max-width: 720px)';` — the same breakpoint as the CSS.

Private: `_open(which: 'first'|'last')`, `_focusItem(item)`, `_visibleItems()`,
`_activate(item)`, `_onMenuKeydown(e)`, `_onButtonKeydown(e)`, `_syncDisabled(state)`,
`_syncChecked()`, `_onMediaChange()`.

### 4.2 Rendered markup

`mount` fills `#app-menu` with exactly vspec §4.1's structure:

- Game section: `#mi-stats` (`menuitem`, `aria-haspopup="dialog"`, `aria-label="Statistics"`,
  label "Statistics…"), `#mi-share` (`menuitem`, `aria-label="Share puzzle link"`, label
  "Share puzzle", `.mi-hint` "Copy link" `aria-hidden`), `#mi-reset` (`menuitem`,
  `aria-haspopup="dialog"`, `aria-label="Reset puzzle"`, label "Reset puzzle…"). Group
  `role="group" aria-labelledby="mh-game"`.
- Settings section: one `menuitemradio` per `hooks.themes.options`, in order, with
  `id="mi-theme-<value>"`, `data-theme="<value>"`, `.mi-radio`, `.mi-label`, `.mi-swatch`
  (both decorations `aria-hidden`). No `aria-label`: the name is the label text. Group
  `aria-labelledby="mh-settings mh-theme"`.
- `.mi-hand-section` group (`aria-labelledby="mh-settings"`) holding `#mi-hand`
  (`menuitemcheckbox`, label "Left-handed", `.mi-switch-track` `aria-hidden`).
- Every item: `class="mi"`, `tabindex="-1"`. Headings: `aria-hidden="true"`; section
  wrappers `role="none"`.

Labels go in via `textContent`, never interpolated HTML. Swatch colors are CSS keyed by
`.mi[data-theme="…"] .mi-swatch` (§11.2), not inline styles: same rendering as vspec
§4.5, presentation kept out of JS.

### 4.3 Module state

```js
let _button, _menu, _items /* HTMLElement[] in DOM order */, _handItem, _themeItems;
let _hooks, _media, _gameState;
let _open = false;
let _current = null;   // the item holding tabindex="0" (roving), or null when closed
```

### 4.4 Open / close

`_open(which)`:
1. `_syncChecked()`; `_syncDisabled(state)`.
2. `_menu.hidden = false`; `_button.setAttribute('aria-expanded', 'true')`; `_open = true`.
3. Focus the first (or last) of `_visibleItems()`.

`close({ focusButton })`:
1. Return if not open.
2. `_menu.hidden = true`; `aria-expanded="false"`; `_open = false`; reset every item to
   `tabindex="-1"`; `_current = null`.
3. If `focusButton`, `_button.focus()`.

Close never moves focus unless asked. Every caller that must put focus somewhere does so
explicitly (§9).

### 4.5 Roving focus and visibility

`_setCurrent(item)`: set the previous `_current` to `tabindex="-1"`, the new one to
`tabindex="0"`, `_current = item`. It never moves focus.

`_focusItem(item)`: `_setCurrent(item)`, then `item.focus()`.

**Native focus sync** (review B1): a `focusin` listener on `#app-menu` calls
`_setCurrent(item)` when the focused element is within a `.mi` that is not `_current`.
This keeps the roving state correct for every focus path that bypasses `_focusItem`: a
touch or pen tap (which focuses the item natively, since only mouse `pointermove` calls
`_focusItem`), or a screen reader's virtual cursor. It cannot recurse: `_setCurrent` never
focuses, and `_focusItem` sets `_current` before calling `focus()`, so the event it raises
is a no-op.

`_visibleItems()`: `_items` minus `_handItem` when `_media.matches`. Visibility is derived
from the same media query the CSS uses (`.mi-hand-section { display: none }` at ≤720px),
not from layout, so it is deterministic in unit tests without stylesheets. Disabled items
are included (fspec §4.4).

**Breakpoint crossing** (`_media.addEventListener('change', _onMediaChange)`): if open,
narrow now, and `_current === _handItem`, `_focusItem(last visible)` (Mountain). The menu
stays open; nothing is announced.

### 4.6 Button interaction

| Event on `#menu-button` | Behavior |
|---|---|
| `click` (pointer only; see below) | Open → `_open('first')`; open → `close({ focusButton: true })` |
| `keydown` Enter / Space / ArrowDown | `preventDefault()`; if closed `_open('first')`, else `close({ focusButton: true })` (Enter/Space only) |
| `keydown` ArrowUp | `preventDefault()`; if closed `_open('last')` |

Enter and Space are handled in `keydown` with `preventDefault`, so the browser never
synthesizes a `click`. That is what makes "opening from the keyboard does not change the
selection" (fspec §4.2) true: the grid's document `click` listener (which deselects on
any click outside the grid and number pad) only sees pointer clicks on the button. No
change to `grid.js` is needed. Other keys on the closed button bubble to the game
shortcuts as on any button (fspec §9.1 last sentence).

### 4.7 Menu keyboard (`keydown` on `#app-menu`)

The listener **always** calls `e.stopPropagation()` first. Every game shortcut listener
(`keyboard.js`, `coach.js`) is a bubble-phase `document` listener and none uses capture,
so stopping propagation at the menu suppresses all of them (fspec §9.1). Then:

| Key | Action | `preventDefault` |
|---|---|---|
| ArrowDown / ArrowUp | Next / previous visible item, wrapping | yes |
| Home / End | First / last visible item | yes |
| Enter, Space | `_activate(_current)` | yes |
| Escape | `close({ focusButton: true })` | yes |
| Tab (no Shift) | `close()`, then `hooks.nextFocus()?.focus()` | yes |
| Shift+Tab | `close({ focusButton: true })` | yes |
| ArrowLeft / ArrowRight | nothing | yes |
| Single printable char, no Ctrl/Meta/Alt | Type-ahead | yes |
| Anything else (Ctrl+Z, Backspace, Delete, F-keys, …) | nothing | **no** (browser shortcuts keep working; the game never sees them) |

**Type-ahead:** `ch = e.key.toLowerCase()`. Starting after `_current` and wrapping, among
`_visibleItems()`, find the first whose `.mi-label` `textContent.trim().toLowerCase()`
starts with `ch`; focus it. No match: nothing. Space is matched by the Enter/Space row
first and never reaches type-ahead. Digits never match a label.

Tab is handled explicitly (not left to the browser) because the default action would
start from a now-hidden item. `nextFocus` is injected rather than computed so the target
is deterministic: the Difficulty selector, the next Tab stop after the button in DOM
order (fspec §4.3).

### 4.8 Pointer inside the menu

- `pointermove` on an item (`pointerType === 'mouse'`) whose element is not `_current`:
  `_focusItem(item)` (fspec §4.4 hover highlight = focus).
- `click` on an item: `_activate(item)`.
- `mousedown` inside `#app-menu` whose target is not within a `.mi` (a heading, a section
  rule, the panel padding): `preventDefault()`, so focus stays on the current item instead
  of falling to `body` while the menu stays open (review observation 1).

### 4.9 Activation

```
_activate(item):
  if item is #mi-stats:               close({focusButton:true}); hooks.onStatistics()
  if item is #mi-share or #mi-reset:
     if aria-disabled="true":         return            // menu stays open, focus stays
     close({focusButton:true}); (share ? hooks.onShare : hooks.onReset)()
  if item is a theme item:
     if value === hooks.themes.current(): return       // no change, no announcement
     hooks.themes.apply(value); _syncChecked()         // menu stays open, focus stays
  if item is #mi-hand:
     hooks.hand.toggle(); _syncChecked()               // menu stays open, focus stays
```

Closing with focus on the button *before* invoking an action is the mechanism behind
every "focus returns to the menu button" row in fspec §8.1: the dialog the action opens
records the button as its trigger.

### 4.10 Item state

- `_syncChecked()`: each theme item `aria-checked = (value === themes.current())`;
  `#mi-hand` `aria-checked = hand.isLeft()`.
- `_syncDisabled(state)`: `#mi-share` and `#mi-reset` get `aria-disabled="true"` when
  `state.puzzle === null`, and the attribute is **removed** otherwise. Subscribed via
  `gameState.on('changed')` with `RELEVANT_KEYS = new Set(['puzzle', 'won'])`, so the state
  updates live while the menu is open (fspec §5.3, §5.4).
- `won`: when `changed` has `won` and `state.won` is true, `close()` without focus; the
  win banner moves focus to New Puzzle on its next frame (fspec §11, R3).

### 4.11 Closing from outside

Two document listeners, registered once in `mount`, act only while `_open`:

- **`focusin`**: if `e.target` is outside `root` (`.menu-wrap`), `close()` without moving
  focus. This covers outside clicks on focusable targets (a cell, the selector), the
  win-banner focus move, and any programmatic focus elsewhere (D10 at a Difficulty load;
  see O3).
- **`click`** (bubble): if the target is outside `root`, `close()`; then, if
  `document.activeElement` is `document.body`, null, or inside `#app-menu`, focus the
  menu button. This covers clicks on number pad buttons (which `preventDefault` their
  `mousedown`, so focus never leaves the item) and on empty page area (focus falls to
  `body`). The click still acts on its target normally (fspec §4.3).

Clicks inside `root` (button, items) are excluded, so the click that opens the menu does
not close it.

---

## 5. Statistics Dialog — `js/ui/stats.js` (reworked)

### 5.1 Public API

```js
/**
 * Builds the Statistics dialog (closed) inside `root` and keeps its table current.
 *
 * @param {HTMLElement} root - `#stats-dialog-root`.
 * @param {{ getState: function, on: function }} gameState
 * @param {{ get: function, on: function }} statistics
 */
export function mount(root, gameState, statistics) {}

/**
 * Opens the dialog and moves focus to Close.
 *
 * @param {HTMLElement} returnFocus - Receives focus when the dialog closes.
 */
export function open(returnFocus) {}

/** Closes the dialog, if open, and focuses the `returnFocus` given to `open`. */
export function close() {}

/** @returns {boolean} */
export function isOpen() {}
```

### 5.2 Markup

vspec §7 exactly: `#stats-backdrop.modal-backdrop[role=dialog][aria-modal=true]
[aria-labelledby=stats-dialog-title]` › `.modal.modal-stats` › `h2#stats-dialog-title`
"Statistics", `.stats-panel` › `table.stats-table[aria-label="Game statistics by
difficulty"]` with the existing `thead` (`th scope="col"`) and `tbody#stats-tbody`, then
`.modal-actions` › `button.btn.btn-primary#stats-close[type=button]` "Close". The panel's
`.stats-heading` is not rendered.

### 5.3 Rendering

Unchanged from today's panel: re-render on `statistics.on('stats-changed')` and on
`changed` with `puzzle`, whether or not the dialog is open. The table is therefore always
current: correct at open and while open, including a puzzle landing mid-dialog (fspec
§11). This also keeps `#stats-tbody` readable by tests without opening the dialog (§13).

Row accessible name (D6, fspec §6.3):

| Row | `aria-label` |
|---|---|
| Current tier | `` `${label}, current level: ${attempted} attempted, ${won} won` `` |
| Other tiers | `` `${label}: ${attempted} attempted, ${won} won` `` (unchanged) |

The current row keeps `class="active-diff"`. No row is current when `state.puzzle` is null
or Unrated (Unrated is not in `DIFFICULTY_ORDER`, so this falls out of the existing
comparison).

### 5.4 Behavior

- `open(returnFocus)`: store it; add `.open` to the backdrop; focus `#stats-close`.
- `close()`: return if not open; remove `.open`; focus the stored element; clear it.
- `#stats-close` `click` → `close()`.
- `keydown` on the backdrop: **always** `stopPropagation()` (the page behind is inert to
  game shortcuts while the dialog is open). Escape → `preventDefault`, `close()`. Tab /
  Shift+Tab → `preventDefault` (Close is the only focusable element; focus stays on it).
- Backdrop click: nothing (no listener).

The confirmation dialog (`dialog.js`) and this dialog are separate modules sharing CSS
classes. A shared generic modal was considered and rejected: the two have different
content models and only the focus trap is common; the duplication is ~15 lines.

---

## 6. Request Focus — `js/ui/requestFocus.js` (new)

```js
/**
 * Builds the focus policy for the end of a foreground puzzle request
 * (fspec-008 §3.4, §8.1; D9).
 *
 * @param {object} targets
 * @param {function(): (HTMLElement|null)} targets.newPuzzle - `#btn-new`.
 * @param {function(): (HTMLElement|null)} targets.difficulty - `#difficulty-select`.
 * @param {function(): (HTMLElement|null)} targets.grid - `.sudoku-grid`.
 * @param {Document} [targets.doc=document]
 * @returns {function('new-puzzle'|'difficulty', {status: string}): void}
 *   Call with the request's origin and its `onOutcome` value.
 */
export function createRequestFocus({ newPuzzle, difficulty, grid, doc = document }) {}
```

Definitions, evaluated at the moment the outcome is reported:
- *nowhere* — `doc.activeElement` is null or `doc.body`.
- *on Cancel* — `doc.activeElement` has class `busy-cancel`.

| Origin | Status | Focus |
|---|---|---|
| `new-puzzle` | `loaded` | `grid()` if focus is on `newPuzzle()`, on Cancel, or nowhere; else unchanged |
| `new-puzzle` | `cancelled` | `newPuzzle()` |
| `new-puzzle` | `fallback-declined` | `newPuzzle()` if focus is on `newPuzzle()` or nowhere; else unchanged (see O2) |
| `new-puzzle` | `failed` | `newPuzzle()` if on Cancel or nowhere; else unchanged |
| `difficulty` | `loaded` | `difficulty()`, unconditionally (today's behavior; D10, N1) |
| `difficulty` | `cancelled`, `fallback-declined`, `failed` | `difficulty()` if on Cancel or nowhere; else unchanged |
| any | `replaced`, `needs-accept-fallback` | nothing |

Why the checks work with the real event order:
- On `loaded`, `NEW_PUZZLE` has already cleared `generating`, so `busy.js` has removed the
  card; a focused Cancel has become *nowhere*. Both checks are kept so the policy does not
  depend on that ordering.
- On `cancelled`, `foreground.abort` reports the outcome before `SET_GENERATING false`
  removes the card, so focus moves off Cancel before it disappears.
- On `failed`, the card is already gone, so a focused Cancel has become *nowhere*.
- On an accepted fallback the outcome is `loaded`; the confirmation dialog has already
  returned focus to its trigger (New Puzzle, or *nowhere* if the trigger was the removed
  Cancel), so the `loaded` guard sends it to the grid.

The busy card's rule that moves focus to Cancel when it appears (`busy.js`, fspec-003
§9.3, D11) is unchanged: it still checks for `#btn-new`.

---

## 7. Changes to Existing Modules

### 7.1 `js/ui/controls.js`

Render vspec §5.1:

```html
<div class="difficulty-row">
  <label for="difficulty-select">Difficulty</label>
  <div class="next-game" role="group" aria-label="Next game">
    <select id="difficulty-select" aria-label="Select difficulty level">…</select>
    <button type="button" class="btn btn-new" id="btn-new" aria-label="Start new puzzle">New Puzzle</button>
  </div>
</div>
```

`controls.js` only renders the button; its `click` stays wired in `main.js` (it needs
`foreground`), which runs after `mountControls`. No other logic changes. Update the file
overview comment.

### 7.2 `js/ui/numpad.js`

Replace the template's tool rows with vspec §6.1:

```html
<div class="numpad" role="group" aria-label="Number pad">
  <div class="numpad-digits" id="numpad-digits"></div>
  <div class="numpad-tools">
    <div class="tool-group" role="group" aria-label="Input and help">
      #btn-mode  #btn-coach  #btn-hint
    </div>
    <div class="tool-group" role="group" aria-label="Corrections">
      #btn-undo  #btn-clear  #btn-erase-all
    </div>
  </div>
  <div class="numpad-bottom-row2"> #btn-check </div>
  <div class="completion-msg" id="completion-msg" aria-live="polite" hidden></div>
</div>
```

Each button's element (classes, `aria-label`, `aria-pressed`, inner spans, `disabled`
default) is moved verbatim; DOM order is the Tab and reading order of fspec §7.2.
Listeners, `_update` and the `mousedown` `preventDefault` loop are unchanged; rename the
loop's comment from "Toolbar pattern" to "Pointer taps keep focus on the selected cell".
`coach.js` still finds `#btn-coach` by ID after `mountNumpad`.

### 7.3 `js/ui/share.js`

The module no longer owns a button or its disabled state (the menu does, §4.10).

```js
/**
 * @param {{ getState: function, on: function }} gameState
 * @param {object} deps
 * @param {function(): HTMLElement} deps.returnFocus - Receives focus when the
 *   copy-fallback notice is dismissed (the menu button).
 * @param {function(string): Promise<boolean>} [deps.copy]
 * @param {function(): string} [deps.getHref]
 * @returns {{ share: function(): Promise<void> }}
 */
export function mount(gameState, { returnFocus, copy = copyText, getHref = () => location.href }) {}
```

`share()`: return if `getState().puzzle === null` (defensive; the item is disabled then);
otherwise exactly today's click body, with `onDismiss: () => returnFocus().focus()`. The
`NEW_PUZZLE → notice.hide()` subscription stays. `buildShareUrl` is unchanged.

### 7.4 `js/ui/themes.js`

- Remove `bindThemeSelect`.
- Add:

```js
/** Theme choices in menu order: `[{ value: 'minimalist', label: 'Minimalist' }, …]`. */
export const THEME_OPTIONS = THEME_CLASSES.map(c => ({ value: c.replace('theme-', ''), label: DISPLAY_NAMES[c] }));

/** @returns {string} The applied theme's value (e.g. `'coffee'`), or the default's. */
export function currentTheme() {}
```

`applyTheme` is unchanged; the menu's `apply` hook is `v => applyTheme('theme-' + v)`,
which announces "Theme changed to *X*." as today.

### 7.5 `js/ui/handedness.js`

- Remove `bindHandToggle`.
- Add:

```js
/** Flips the applied handedness, saves it, and announces it (fspec-004 §2.3 steps 2–5). */
export function toggleHandedness() {}
```

Implementation: `applyHandedness(getHandedness() === 'left' ? 'right' : 'left')`. Update
the overview comment: the swap is the vspec-008 §2.2 grid-column swap, not `row-reverse`.

### 7.6 `js/ui/dialog.js`

`mount(root, { beforeOpen = null } = {})`. `open()` calls `beforeOpen?.()` **first**, before
it captures `_triggerEl`. `main.js` passes a hook that closes the Statistics dialog and
the menu (`close({ focusButton: true })`), so:

- A confirmation that opens without player action while the menu is open (fspec §11:
  replace-confirmation, substitute offer) first closes the menu with focus on the menu
  button; the dialog then records the button as its trigger and returns focus there on
  close, never to a hidden item.
- The same holds if a substitute offer arrives while the Statistics dialog is open (see
  O1): Statistics closes, returning focus to the menu button, which becomes the trigger.

Both closers are no-ops when nothing is open, so the hook is inert for every
player-initiated confirmation. No other change.

### 7.7 `js/ui/keyboard.js`

The grid container (`.sudoku-grid`, `tabindex="0"`) is now a regular focus target after
Reset and New Puzzle. Today, arrow keys pressed while the container itself has focus
select a cell in state but leave DOM focus on the container, so the screen reader is not
moved onto the cell. Proposed fix (O4): in the arrow branch, when
`document.activeElement === grid`, after dispatching `ARROW_NAV`, focus the selected cell
on the next frame (the same `requestAnimationFrame` pattern Home already uses). The Home
branch already does this. No other change.

### 7.8 `js/game/foreground.js`

```js
/**
 * @param {string} difficulty
 * @param {function(object): void} [afterLoad] - Runs after the puzzle starts.
 * @param {function(SeededOutcome): void} [onOutcome] - Hears how the request ended.
 */
function startNew(difficulty, afterLoad = () => {}, onOutcome = () => {}) {
  request(difficulty, puzzle => { /* unchanged */ }, { onOutcome });
}
```

No other change. `cancel()`, `abort()`, the fallback dialog and failure paths already
report through `onOutcome`.

---

## 8. Bootstrap Wiring — `main.js`

Amends `aspec-game-state.md` §1.2 / `aspec-left-hand.md` §8, step 8:

```js
import { initTheme, applyTheme, currentTheme, THEME_OPTIONS } from './ui/themes.js';
import { initHandedness, getHandedness, toggleHandedness } from './ui/handedness.js';
import { mount as mountMenu, close as closeMenu } from './ui/menu.js';
import { mount as mountStats, open as openStats, close as closeStats } from './ui/stats.js';
import { createRequestFocus } from './ui/requestFocus.js';
// bindThemeSelect, bindHandToggle imports removed
```

Step 8, in order:

1. `mountSrLive(document.body)`.
2. `mountDialog(document.getElementById('dialog-root'), { beforeOpen: () => { closeStats(); closeMenu({ focusButton: true }); } })`.
   Both closers are safe before their modules mount (they return when not open).
3. Remove `bindThemeSelect` / `bindHandToggle` calls.
4. `mountControls`, `mountGrid`, `mountNumpad`, `mountCoach`, `mountCoachOverlay`,
   `mountBusy` — unchanged.
5. `mountStats(document.getElementById('stats-dialog-root'), gameState, stats)`.
6. `mountWinBanner`, `mountKeyboard`, `notice.mount` — unchanged.
7. ```js
   const menuButton = document.getElementById('menu-button');
   const gridEl = document.querySelector('#grid-root .sudoku-grid');
   const share = mountShare(gameState, { returnFocus: () => menuButton });
   mountMenu(document.getElementById('menu-root'), gameState, {
     onStatistics: () => openStats(menuButton),
     onShare: () => share.share(),
     onReset: _confirmReset,
     themes: { options: THEME_OPTIONS, current: currentTheme, apply: v => applyTheme('theme-' + v) },
     hand: { isLeft: () => getHandedness() === 'left', toggle: toggleHandedness },
     nextFocus: () => document.getElementById('difficulty-select'),
   });
   const focusAfterRequest = createRequestFocus({
     newPuzzle: () => document.getElementById('btn-new'),
     difficulty: () => document.getElementById('difficulty-select'),
     grid: () => gridEl,
   });
   ```
8. New Puzzle and Reset:
   ```js
   const _startFrom = (origin, tier) => foreground.startNew(
     tier, () => removeItem(STATE_KEY), outcome => focusAfterRequest(origin, outcome));

   document.getElementById('btn-new').addEventListener('click', () => {
     const state = gameState.getState();
     const start = () => _startFrom('new-puzzle', foreground.generationTier(state));
     if (_isInProgress(state)) {
       openDialog({ title: 'Start a new puzzle?', body: 'Your current progress will be lost.',
                    confirmLabel: 'New Puzzle', onConfirm: start });
     } else {
       start();
     }
   });

   function _confirmReset() {
     // No puzzle guard: the item is aria-disabled with no puzzle and menu._activate
     // returns before calling this, so a guard would be an unreachable branch (§14).
     openDialog({
       title: 'Reset puzzle?', body: 'Your entries will be cleared.', confirmLabel: 'Reset',
       onConfirm: () => {
         gameState.dispatch({ type: 'RESET_PUZZLE' });
         announce('Puzzle reset.');
         gridEl.focus();
       },
     });
   }
   ```
   `#btn-new` is now always rendered by `controls.js`, so the `?.` guard is dropped (it
   would be an unreachable branch). `_afterNewPuzzle` is deleted.
9. Persistence listener, `CHANGE_DIFFICULTY` branch:
   `foreground.chooseTier(action.difficulty); _startFrom('difficulty', action.difficulty);`

The persistence writer, priming, loader, link handling and the lazy dev import are
unchanged. `closeDialog` in `beforeReplace` is unchanged.

---

## 9. Focus Management Map

Every row of fspec §8.1 and §3.4, mapped to the code path that implements it.

| Event (fspec) | Focus | Code path |
|---|---|---|
| Menu opened (click/Enter/Space/ArrowDown) | First visible item | `menu._open('first')` |
| Menu opened (ArrowUp) | Last visible item | `menu._open('last')` |
| Escape in menu | Menu button | `menu` keydown → `close({focusButton})` |
| Tab out of menu | Difficulty selector | `menu` keydown → `close()`, `nextFocus().focus()` |
| Shift+Tab out of menu | Menu button | `menu` keydown |
| Outside click, focusable target | That element | browser focus at `mousedown` → `menu` `focusin` → `close()` |
| Outside click, non-focusable target | Menu button | `menu` document `click` → `close()`, button focus |
| Menu button clicked while open | Menu button | `menu` button `click` |
| Theme / Left-handed activated | Stays on item, menu open | `menu._activate` (no close) |
| Disabled Share / Reset activated | Stays on item, menu open | `menu._activate` early return |
| Statistics opened | Close | `stats.open` |
| Statistics closed | Menu button | `stats.close` → `returnFocus` (the menu button) |
| Share: copy succeeded | Menu button | `menu._activate` closes with button focus before `share()` |
| Share: copy failed | Link field, selected | `notice.showLink` (unchanged) |
| Share: Link notice dismissed | Menu button | `share` `onDismiss` → `returnFocus()` |
| Reset confirmation opened | Cancel | `dialog.open` (unchanged) |
| Reset cancelled | Menu button | `dialog.close` → trigger, which `menu._activate` made the button |
| Reset confirmed | Grid container, no cell selected | `_confirmReset` `onConfirm` → `gridEl.focus()` (after `dialog` returns focus to the button). `RESET_PUZZLE` already sets `selected = null`; focusing the container dispatches nothing (only cells have `focus` listeners) |
| Win while menu open | New Puzzle | `menu` `won` subscription → `close()`; `winBanner` rAF → `#btn-new` |
| New Puzzle pressed, no confirmation | Stays on New Puzzle | nothing moves it |
| Progress-loss confirm confirmed / cancelled | New Puzzle | `dialog.close` → trigger (`#btn-new`) |
| Busy Cancel appears (New Puzzle path) | Cancel, if on New Puzzle | `busy.js` (unchanged) |
| Puzzle loaded (New Puzzle path) | Grid, with guard | `requestFocus('new-puzzle', loaded)` |
| Busy Cancel (New Puzzle path) | New Puzzle | `requestFocus('new-puzzle', cancelled)` |
| Fallback offered | Dialog Cancel | `dialog.open` (unchanged) |
| Fallback accepted | Grid, via loaded guard | `requestFocus('new-puzzle', loaded)` |
| Fallback declined (New Puzzle path) | New Puzzle (guarded, O2) | `requestFocus('new-puzzle', fallback-declined)` |
| Request failed (New Puzzle path) | New Puzzle if on Cancel/nowhere | `requestFocus('new-puzzle', failed)` |
| Puzzle loaded (Difficulty path) | Selector | `requestFocus('difficulty', loaded)` |
| Cancel / declined / failed (Difficulty path) | Selector if on Cancel/nowhere | `requestFocus('difficulty', …)` |
| Programmatic confirmation while menu open (fspec §11) | Dialog; on close, menu button | `dialog` `beforeOpen` → `closeMenu({focusButton})` |
| Breakpoint hides focused Left-handed | Mountain | `menu._onMediaChange` |

---

## 10. Keyboard and Escape Precedence

- **Game shortcuts while a menu item has focus (fspec §9.1):** suppressed by
  `stopPropagation` on `#app-menu` keydown (§4.7). This relies on every game shortcut
  listener being a bubble-phase `document` listener. Add a code comment at the menu
  listener stating that dependency, and a unit test that a `keydown` dispatched on a
  focused item does not reach a `document` listener (§14).
- **While the Statistics dialog is open:** suppressed the same way at `#stats-backdrop`.
- **No menu shortcut (§9.2):** nothing added to `keyboard.js`.
- **Escape precedence (§9.3):** the three surfaces are mutually exclusive by construction
  — opening any dialog closes the menu (`beforeOpen` and `focusin`); a dialog's backdrop
  covers the header, so the menu cannot open over one; a confirmation closes Statistics
  first (`beforeOpen`). Each surface handles its own Escape: the menu and Statistics stop
  propagation; the confirmation dialog keeps its existing handler plus `keyboard.js`'s
  global `closeDialog()` (both idempotent). With none open, Escape reaches `keyboard.js`,
  whose `closeDialog()` is a no-op.

---

## 11. CSS

### 11.1 Placement decision

Menu styles go in a new **`css/menu.css`** (vspec §12.1 allows it): ~250 lines of
self-contained rules that would otherwise dominate `base.css`. `menu.css` holds
everything vspec §12.1 lists under "Add" for the header button, menu, items, swatches,
switch graphic, menu theme rules (§9.1–9.2) and the menu's narrow rules (§10). `base.css`
keeps the layout changes.

### 11.2 By file

| File | Changes (vspec section) |
|---|---|
| `css/base.css` | Remove `.header-controls`, `.theme-control*` (incl. Coffee/Mountain variants), the `row-reverse` block. Keep `.game-area`/`.left-col`/`.right-col` base flex rules and the narrow block. Add the §2.2 wide grid block and `header { position: relative; z-index: 50; }` |
| `css/menu.css` (new) | `.menu-wrap`, `.menu-button` + states (§3.2), `.app-menu`, `[hidden]`, `@keyframes menu-in`, reduced motion (§4.2), sections/headings (§4.3), `.mi*` incl. disabled rules of §8.5 — **no item opacity; children 0.38; focused hint 0.3** (§4.4), radio and swatch (§4.5; swatch backgrounds as `.mi[data-theme="minimalist"] .mi-swatch { … }` etc.), switch graphic + reduced motion (§4.6), theme rules (§9.1, §9.2), narrow rules incl. `.mi-hand-section { display: none; }` (§10) |
| `css/grid.css` | Add `.next-game` rules (§5.2, §9.3); `.sudoku-grid:focus { outline: none; }`, `.sudoku-grid:focus-visible` (§8.2); Coffee `#difficulty-select:focus` and `.sudoku-grid:focus-visible` → `#c9a97a` (§8.2, §8.3) |
| `css/controls.css` | Remove `.numpad-utils`, `.numpad-bottom-row1`, `.numpad-undo-row`, `.action-row`, `#btn-share`, all `#theme-select` rules, all `.hand-switch*` rules (incl. theme, reduced-motion and narrow variants). Add `.numpad-tools`, `::before`, `.tool-group`, `.tool-group .btn` (§6.2). Add Coffee focus rules for `.numpad .btn:focus-visible` and `.next-game .btn-new:focus-visible` (§8.3) |
| `css/stats.css` | Add `.modal.modal-stats`, `.modal-stats h2`, `.modal-stats .stats-panel` (§7). Remove `.stats-heading` and its Terminal variant |
| `css/themes.css`, `css/dev.css` | No change |

The R15 Coffee selectors are scoped (`.numpad .btn`, `.next-game .btn-new`) so rings on
light surfaces keep the accent (vspec §8.3). The disabled-item fix applies in every theme
with no per-theme rule (vspec §8.5).

`subgrid` (vspec §6.2) is supported by every current evergreen browser; the test
browser is Playwright Chromium. No fallback is specified.

---

## 12. Dev Tooling and Recorder Compatibility

Checked against `aspec-debug-instrumentation.md`, `aspec-dev-mode.md` and the code:

- **Recorder / session format / replay:** encode reducer actions only (`sessionCodec.js`
  action table). This feature adds and removes no actions. Theme, handedness, menu and
  Statistics never dispatch. Reset through the menu dispatches the same `RESET_PUZZLE`;
  clicking the menu button dispatches `DESELECT`, as any outside click did before.
  **`format-v1-baseline.json` is untouched and needs no change**; headless replay has no
  DOM.
- **`window.sudokuDev`, `devSession.js`, `devApi.js`:** no DOM selector dependencies on
  moved elements. The D-36 win-focus rule (focus to `#btn-new`) still resolves.
- **`devPanel.js` / `dev.css`:** the panel is appended to `<main>` (`main.dev-host`), a
  sibling of `.game-area`; the badge is `position: fixed` bottom-left, `z-index: 50`, not
  overlapping the header. Neither depends on `.left-col`/`.right-col` or the moved
  controls. The grid-layout change is inside `.game-area` and does not affect
  `main.dev-host`'s flex row.
- **`scripts/devdrive.mjs`, `scripts/devdrive/*`:** only `#btn-coach`, `#modal-confirm`
  and `#dev-*` selectors. No change.
- **`js/tests/tools/captureSessionFixtures.js`** (line ~356): `d.click('#btn-reset')` →
  `d.click('#menu-button'); d.click('#mi-reset');`. Only affects re-captures of
  non-frozen fixtures; the frozen baseline is never overwritten by the tool. A re-capture
  may record one extra `DESELECT` from the menu-button click, which is harmless.
- **`scripts/visual-smoke.js`** (line ~152): `page.click('#btn-share')` →
  `page.click('#menu-button'); page.click('#mi-share');`. Add shots for the open menu
  (each theme, narrow and wide) and the Statistics dialog.

---

## 13. Impact on Existing Tests

**Hazard: silent skips.** Several affected tests guard with `if (!el) return this.skip()`.
Removing `#btn-reset` / `#theme-select` turns them into skips, not failures (A17, GF8,
SYS4). The QE Test Writer must rewrite them, not just watch for red.

### 13.1 Unit

| Test | Breaks because | Update |
|---|---|---|
| `ui-stats.test.js` (US1–US*) | Root `#stats-root` → `#stats-dialog-root`; heading removed; current-row label changes | Mount into a test root; keep `#stats-tbody` assertions; add current-row label, open/close, focus, Escape, Tab trap, key isolation tests |
| `ui-share.test.js` | `mount(button, …)` → `mount(gameState, {returnFocus, …})`; disabled sync moved | Rewrite against `share()`; Dismiss → `returnFocus` |
| `ui-handedness.test.js` UH15–UH19 | `bindHandToggle` removed | Replace with `toggleHandedness` tests; item `aria-checked` tests move to `ui-menu.test.js` |
| `ui-themes.test.js` | (no `bindThemeSelect` test exists) | Add `THEME_OPTIONS`, `currentTheme` tests |
| `ui-controls.test.js` UC10 | Comment names `bindThemeSelect` | Update comment; add cluster markup/role/name tests |
| `ui-numpad.test.js` | No structural assertions today | Add group roles/names, DOM order, no `toolbar` |
| `ui-dialog.test.js` | — | Add `beforeOpen` runs before trigger capture |
| `foreground.test.js` | — (defaults keep FG23/24/34 passing) | Add `startNew` forwards `onOutcome` for each status |
| `arch.test.js` | — | Add `/js/ui/menu.js`, `/js/ui/requestFocus.js` to `UI_MODULES`; add both to `ALWAYS_LOADED` |
| `ui-busy.test.js` UB8, `ui-winBanner.test.js` | Use `#btn-new` | No change |

### 13.2 Integration / system

| Test | Breaks because | Update |
|---|---|---|
| `_app.js` `readStats` | Regex `^(.+): …` captures "Medium, current level" | Regex `/^(.+?)(?:, current level)?: (\d+) attempted, (\d+) won$/`; update the file comment naming `#hand-toggle` |
| `a11y.test.js` A17 | `#btn-reset` (silent skip) | Open menu → Reset → Cancel → focus is `#menu-button` |
| `game-flows.test.js` GF8, reset-after-win (~l.463) | `#btn-reset` (GF8 silent skip; the other fails its `won` assertion) | Reach Reset through the menu; add R4a grid-focus assertion |
| `game-flows.test.js` (~l.703) | Comment about the header switch | Comment only |
| `sharing.test.js` SHR29–31, 33, 36 | `#btn-share` | Activate `#mi-share` through the menu |
| `sharing.test.js` SHR32 | Dismiss focus → `btn-share` | Expect `#menu-button` |
| `sharing.test.js` SHR33 | `.disabled` | `aria-disabled` absent |
| `sharing.test.js` SHR34 | Button semantics | `menuitem`, name "Share puzzle link", focusable in open menu |
| `sharing.test.js` SHR35 | Share visible at all widths; `#hand-toggle` sanity | Share item reachable in the open menu at every width; menu within viewport; `.mi-hand-section` hidden ≤720px |
| `sharing.test.js` SHR37 | `#theme-select`, `#hand-toggle`, Share position vs grid | Drive themes via menu items; drop the Share-position checks; keep notice-follows-board via `#mi-hand` |
| `sharing.test.js` l.266 | `#stats-tbody .active-diff` | Passes unchanged (tbody always rendered) |
| `system.test.js` SYS4 | `#theme-select` (silent skip) | Drive theme items |
| `system.test.js` SYS5 | `#hand-toggle`; `.left-col` rect is empty under `display: contents` | `#mi-hand` `aria-checked`; compare `.right-col` against `.grid-wrapper` |
| `system.test.js` SYS7 | Toggle via switch | Open menu (pointer click → deselect), activate `#mi-hand`; focus stays on item, menu open |
| `system.test.js` SYS8 | `#hand-toggle` display | `.mi-hand-section` display none ≤720px; `flexDirection` check still valid |
| `system.test.js` SYS9 | `#hand-toggle`, `#stats-root` | `#menu-button` precedes `#difficulty-select` precedes `.sudoku-grid` precedes `#numpad-root` |
| `system.test.js` SYS10 | Switch semantics | `#mi-hand` is `menuitemcheckbox` in group "Settings" |
| `devmode.test.js` (~l.512, 538, 560: DVI side-by-side, DVI24) | `#hand-toggle`, `#theme-select` | Use menu items |
| `debug.test.js`, `perf.test.js`, `persistence.test.js`, other `#btn-new` users | — | No change (`#btn-new` keeps its ID); D-36 still holds |

---

## 14. Test Infrastructure Notes for the QE Strategist

Existing Mocha/Chai/Playwright/c8 pipeline; no runner changes. New file
`js/tests/unit/ui-menu.test.js` and `js/tests/unit/ui-requestFocus.test.js`.

**Unit-testable in isolation:**
- `menu.js`: mount against a test-built `.menu-wrap`, a stub `gameState` (`getState`,
  `on`), stub hooks, and a fake `MediaQueryList` (`{ matches, addEventListener }`) to drive
  the breakpoint. Covers open/close, every row of §4.7 including type-ahead wrap and
  no-match, roving `tabindex`, disabled items (focusable, inert, live update while open),
  checked state, `won` close, `focusin`/`click` outside closing, the breakpoint focus
  move, and propagation suppression (a `document` keydown spy must not fire for keys on a
  focused item, including `1`, `c`, `p`, Backspace, Ctrl+Z, arrows, Home).
- `requestFocus.js`: pure over a test document — every row of the §6 table, including
  the *nowhere* and *on Cancel* preconditions.
- `stats.js`: dialog shell, labels, live re-render while open, focus in/out.
- `share.js`, `themes.js`, `handedness.js`, `dialog.js`, `foreground.js` deltas.

**Needs integration (real `index.html` in a sized iframe):**
- CSS-dependent behavior: grid layout alignment (pad top = grid top, both hands; vspec
  §2.2), `.mi-hand-section` hidden ≤720px, menu within viewport at narrow widths, the
  menu overlaying `main` (`header` z-index).
- End-to-end focus flows: Reset confirm → grid; New Puzzle load → grid (keyboard and
  pointer); win → New Puzzle with the menu open; programmatic confirmation over an open
  menu → focus back to the menu button (drive with a share link over progress, or the
  dev API); Difficulty path focus.
- `:focus-visible` on the grid after keyboard vs pointer activation (Playwright keyboard
  vs `click`).
- Contrast: extend the existing contrast helpers to the R15 indicators (Coffee number pad,
  New Puzzle, selector, grid; disabled focused menu item in all themes) using computed
  `outline-color` / `box-shadow` against computed backgrounds.
- `subgrid` row alignment of the two tool columns (`getBoundingClientRect().top` equal per
  row).

**Coverage notes:** the `main.js` branches added here (`_isInProgress` split in the New
Puzzle handler) are covered by integration. `_confirmReset` deliberately has no puzzle
guard (unreachable, as `aspec-left-hand.md` §8's precedent); `share()` keeps its guard
because it is unit-testable directly.

---

## 15. Implementation Sequence

1. `foreground.startNew` `onOutcome` + tests.
2. `requestFocus.js` + tests.
3. `themes.js` (`THEME_OPTIONS`, `currentTheme`), `handedness.js` (`toggleHandedness`)
   + tests.
4. `dialog.js` `beforeOpen` + tests.
5. `stats.js` dialog rework + `stats.css` + tests.
6. `share.js` rework + tests.
7. `menu.js` + `menu.css` + tests.
8. `controls.js` cluster + `grid.css` cluster rules; `numpad.js` regroup + `controls.css`
   tool block; removals in `controls.css`.
9. `index.html` header, body, stats root, stylesheet link; `base.css` layout + header;
   grid focus ring and Coffee R15 rules.
10. `main.js` wiring (§8); `keyboard.js` (§7.7, pending O4).
11. Update integration/system tests (§13.2), `_app.js`, arch test.
12. `captureSessionFixtures.js`, `visual-smoke.js`; README controls section.
13. Update `aspec-ui.md` §2 mount table, §14 focus section with pointers to this spec
    (Implementor, as documentation).

---

## 16. Performance

Nothing approaches the 1 s budget. Opening the menu is one attribute change plus a
0.12 s CSS animation; theme and handedness changes are as today (class/attribute swap);
the Statistics dialog toggles a class over a 9-row table rendered ahead of time. The
grid layout swap is a single reflow. Type-ahead scans ≤ 9 items.

---

## 17. Feasibility / Open Issues for the Orchestrator

None blocks implementation. Each has a proposed resolution that this plan implements by
default unless the Orchestrator directs otherwise.

**Orchestrator disposition (2026-11-27):** O1–O4 accepted as proposed. All four are
edge-case reconciliations within the spirit of fspec-008; O4 implements behavior fspec §3.4
already describes. Implement §7.7.

**O1. Substitute offer while the Statistics dialog is open — non-blocking.** fspec §9.3
says only one of menu / confirmation / Statistics is open at a time, and §11 covers a
confirmation arriving while the *menu* is open, but not while *Statistics* is open (a
Diabolical/Nightmare search can exhaust its budget with Statistics showing). Two modals
stacked would put the confirmation behind the Statistics dialog. *Proposed:* the
confirmation closes Statistics first; focus returns to the menu button, which becomes the
dialog's trigger (§7.6). Matches the §11 menu rule in spirit.

**O2. Fallback declined when focus is elsewhere — non-blocking.** fspec §3.4 sends focus
to New Puzzle unconditionally on a declined fallback; §11 says that when the menu was open
as the offer arrived, focus returns to the menu button after the dialog closes. These
conflict for that case. *Proposed:* apply the "Puzzle loaded" guard principle — on a
declined fallback, focus New Puzzle only if focus is on New Puzzle or nowhere (§6). In the
common path (no menu, focus on New Puzzle or a removed Cancel) the result is exactly the
§3.4 table; the menu case honors §11; and a player who moved focus elsewhere keeps it.

**O3. Difficulty-path load while the menu is open — non-blocking.** fspec §11 says the
menu stays open when a puzzle loads; §3.4/N1 (PD decision) keeps the Difficulty path's
unconditional focus-to-selector at load. Both cannot hold: moving focus to the selector
must close the menu, or focus would sit outside an open menu. *Proposed:* N1 wins (it is
the explicit PD decision); the `focusin` rule closes the menu without moving focus further.
The New Puzzle path keeps the menu open, as §11 intends. Only reachable by opening the
menu during a Difficulty-started generation.

**O4. Arrow keys on the focused grid container — non-blocking, small UX impact.** After
R4a/R4d the grid container is a routine focus target. Today an arrow key there selects
r1c1 in state but leaves DOM focus on the container, so a screen reader does not move to
the cell and a sighted keyboard user sees the selection without the cell's focus ring.
Home already moves DOM focus to the cell. *Proposed:* mirror Home in the arrow branch
when the container itself has focus (§7.7). This aligns with vspec §8.1 ("a focused cell
is selected") and fspec §3.4 ("the first arrow key … selects row 1, column 1"). If the
Orchestrator prefers no change to `keyboard.js`, drop §7.7.

**Minor technical interpretations resolved here (no action needed):**
- Menu markup is rendered by `menu.js` from `THEME_OPTIONS`, not static HTML; swatch
  colors are CSS rules, not inline styles (identical rendering).
- Theme item IDs `#mi-theme-<value>` added for test addressing.
- Narrow-viewport item visibility in JS keys off the same media query as the CSS.
- Tab out of the menu targets an injected `nextFocus` (the selector) rather than relying
  on the browser's default action from a hidden item.
- Menu CSS in a new `css/menu.css` (vspec §12.1 permits).
- `stats.js` keeps rendering the table while closed, so the dialog is always current and
  `#stats-tbody` stays testable.

**Spec drift noted, not acted on:** `keyboard.js`'s header comment says Home "focuses the
first non-given cell"; the code (and fspec-001 §5.2) select index 0 regardless. Comment
fix only.

---

## 18. Adjacent Observations (not in scope)

- **Confirmation dialog does not isolate game keys.** With the existing confirmation
  open, focus is on Cancel (a `BUTTON`), so digits, `P`, `C`, Backspace and arrows still
  reach the game if a cell is still selected (possible when the dialog was opened from the
  keyboard, which does not deselect). The new Statistics dialog stops propagation (§5.4); the confirmation
  dialog is unchanged. Worth a one-line fix (`stopPropagation` in its backdrop keydown)
  in a later pass.
- **Neither dialog sets `inert`** on the page behind; they rely on the backdrop (pointer)
  and focus trap (keyboard). The Statistics dialog matches the confirmation dialog, as the
  fspec asks.
- **`aspec-ui.md` §1/§3 "no cross-module imports between UI modules"** is already not
  true of the code (`controls.js`/`keyboard.js` → `dialog.js`, `share.js` → `notice.js`,
  several → `srLive.js`). `menu.js` adds no UI-to-UI imports (it takes hooks). The rule
  text should be relaxed to "may import the shared services `srLive`, `dialog`, `notice`".
