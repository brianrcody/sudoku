# Architectural Spec — Left-Hand Layout Mode
**Status:** Final
**Date:** 2026-09-13
**Author:** Uber Developer (Architect stage)
**Inputs:** `fspec-004-left-hand.md`, `vspec-004-left-hand.md`
**Loaded by:** Implementor (Phase 12), Reviewer, QE.

> **Also load:** `aspec-overview.md` (directory tree, test infra), `aspec-themes.md` (the
> no-flash inline script and `themes.js` pattern this feature mirrors).

---

## Table of Contents

1. [Approach](#1-approach)
2. [Files Touched](#2-files-touched)
3. [State Representation](#3-state-representation)
4. [`js/ui/handedness.js`](#4-jsuihandednessjs)
5. [No-Flash Inline Script](#5-no-flash-inline-script)
6. [Markup](#6-markup)
7. [CSS](#7-css)
8. [Bootstrap Wiring](#8-bootstrap-wiring)
9. [Test Infrastructure](#9-test-infrastructure)
10. [Implementation Sequence](#10-implementation-sequence)
11. [Feasibility and Decisions](#11-feasibility-and-decisions)

---

## 1. Approach

Pure presentation. Handedness is a document-level attribute read by CSS; no game state,
reducer action, or emitter involvement. The column swap is a CSS `flex-direction` change,
so DOM order — and therefore Tab and screen reader order — is untouched by construction
(fspec §5.2). The module mirrors `ui/themes.js`: an apply function, an init function that
reconciles with the inline script, and a bind function for the control. No server code,
no new dependencies.

## 2. Files Touched

| File | Change |
|---|---|
| `index.html` | Inline head script reads `sudoku.hand`; header gains `.header-controls` wrapper and the switch button |
| `css/base.css` | `.header-controls` rule; wide-viewport `row-reverse` rule |
| `css/controls.css` | Switch styles, per-theme overrides, mobile hide; theme-select focus fix (vspec §5) |
| `js/ui/handedness.js` | **New** — apply/init/bind |
| `js/main.js` | Call `initHandedness()` (step 2) and `bindHandToggle()` (step 8) |
| `js/tests/unit/ui-handedness.test.js` | **New** — unit tests |
| `js/tests/setup.html` | Register the new test file |
| `js/tests/setup.js` | Global `beforeEach` clears `data-hand` on `<html>` |
| `js/tests/unit/arch.test.js` | Add `handedness.js` to `UI_MODULES` |
| `js/tests/integration/system.test.js` | Full-page layout/persistence tests |
| `README.md` | Feature mention |
| `docs/aspecs/aspec-overview.md` | Directory tree, sequence, index |

## 3. State Representation

| Where | Representation |
|---|---|
| Cookie | `sudoku.hand` = `left` \| `right` (via `persist/cookies.js`, default 2-year max-age) |
| DOM | `<html data-hand="left">` when left; attribute **absent** when right |
| Control | `#hand-toggle[aria-checked="true" \| "false"]` |

**Why `<html>` and not a `<body>` class:** the existing theme inline script assigns
`document.body.className` wholesale on `DOMContentLoaded`, and the test harness resets
`body.className` before every test. An attribute on `document.documentElement` is set
synchronously in `<head>` (before any CSS or body parse), is immune to both, and needs no
change to the theme system.

**Why absent-when-right:** CSS only needs to match the non-default case, and a missing or
garbage cookie naturally yields the default layout without JS.

The `<html>` attribute is the single runtime source of truth; the toggle's `aria-checked`
is derived from it.

## 4. `js/ui/handedness.js`

Imports: `../persist/cookies.js`, `./srLive.js` (`announce`). No `game/` or `providers/`
imports (arch invariant).

Module-private constants: `COOKIE_NAME = 'sudoku.hand'`, the two announcement strings
from fspec §5.3.

### `getHandedness() → 'left' | 'right'`

Returns `'left'` iff `document.documentElement` has `data-hand="left"`, else `'right'`.

### `applyHandedness(hand: 'left'|'right', shouldAnnounce = true) → void`

1. If `hand === 'left'`, set `data-hand="left"` on `<html>`; otherwise remove the attribute.
   Any value other than `'left'` is treated as right.
2. Write the normalized value (`'left'`/`'right'`) to the cookie.
3. If `shouldAnnounce`, `announce()` the on/off string.

### `initHandedness() → void`

`applyHandedness(cookies.get(COOKIE_NAME) === 'left' ? 'left' : 'right', false)`.
Reconciles the DOM with the cookie (mirrors `initTheme`) and normalizes an unrecognized
cookie value to `right`.

### `bindHandToggle(buttonEl: HTMLButtonElement) → void`

1. Set `aria-checked` to `String(getHandedness() === 'left')`.
2. On `click`: compute `next` as the opposite of `getHandedness()`, call
   `applyHandedness(next)`, set `aria-checked` to `String(next === 'left')`.

Space/Enter activation comes free from `<button>`. `keyboard.js` needs no change: it acts on
neither Space nor Enter, and its `p`/digit handling is unchanged (fspec §2.4).

```js
export function bindHandToggle(buttonEl) {
  buttonEl.setAttribute('aria-checked', String(getHandedness() === 'left'));
  buttonEl.addEventListener('click', () => {
    const next = getHandedness() === 'left' ? 'right' : 'left';
    applyHandedness(next);
    buttonEl.setAttribute('aria-checked', String(next === 'left'));
  });
}
```

## 5. No-Flash Inline Script

Extend the existing head IIFE in `index.html` (it already runs before the CSS `<link>`s):

```js
var h = document.cookie.match(/(?:^|; )sudoku\.hand=([^;]+)/);
if (h && h[1] === 'left') document.documentElement.setAttribute('data-hand', 'left');
```

The attribute exists before first style computation, so the swapped layout is the first
layout painted (fspec §4). Update the script's leading comment to mention handedness.

## 6. Markup

The header's right side (replacing the bare `.theme-control`):

```html
<div class="header-controls">
  <button type="button" id="hand-toggle" class="hand-switch" role="switch" aria-checked="false">
    <span class="hand-switch-label">Left-handed</span>
    <span class="hand-switch-track" aria-hidden="true"><span class="hand-switch-thumb"></span></span>
  </button>
  <div class="theme-control"> …unchanged… </div>
</div>
```

Accessible name comes from the button content ("Left-handed"); the track is hidden from
AT. `aria-checked="false"` in static HTML is corrected by `bindHandToggle` at step 8 — the
module loads before any user interaction is possible.

## 7. CSS

Exactly as approved in the mockup's "NEW for left-hand layout" block (vspec §§1–5):

**`base.css`** — after the header section add `.header-controls`; after the game-area
layout section and **before** the mobile `@media (max-width: 720px)` block add:

```css
@media not all and (max-width: 720px) {
  html[data-hand="left"] .game-area { flex-direction: row-reverse; }
}
```

The media query is the exact complement of the mobile breakpoint, so the higher-specificity
swap rule can never override the mobile `flex-direction: column` (no fractional-width gap
between `720px` and `721px`).

**`controls.css`** — a new "Handedness switch (vspec-004)" section after the theme
selector section, containing the switch rules, per-theme overrides, reduced-motion block,
and its own `@media (max-width: 720px) { .hand-switch { display: none; } }`. The theme
selector focus fix goes in the existing theme-selector section:

```css
body.theme-coffee .theme-control #theme-select:focus { outline-color: #c9a97a; }
body.theme-mountain .theme-control #theme-select:focus { outline-color: #adc6de; }
```

## 8. Bootstrap Wiring

Amends `aspec-game-state.md` §1.2 order:

- **Step 2:** `initTheme();` then `initHandedness();`
- **Step 8:** after `bindThemeSelect`, `bindHandToggle(document.getElementById('hand-toggle'));`

The element is static HTML and always present, so no null guard (a guard would add an
unreachable branch to `main.js`).

## 9. Test Infrastructure

Existing Mocha/Chai/Playwright/c8 pipeline; no changes to the runner.

- **Unit** — `js/tests/unit/ui-handedness.test.js`: module in isolation against a
  test-created button and the real `<html>` of the test page. Target 100% branch on
  `handedness.js`.
- **Integration/system** — `system.test.js` loads `index.html` in iframes. Layout
  assertions need real viewport widths, so these tests create a sized off-screen iframe
  (e.g., 1100px wide for desktop, 400px for narrow) instead of the existing 1px helper.
- **Harness hygiene** — `setup.js` global `beforeEach` removes `data-hand` from
  `document.documentElement` alongside the existing `body.className` reset, so the test
  page's own layout state can't leak between tests.
- **Arch** — `arch.test.js` gains `/js/ui/handedness.js`.

## 10. Implementation Sequence

**Phase 12 — Left-hand layout**
45. `js/ui/handedness.js`
46. `index.html` inline script + header markup; `base.css`; `controls.css`
47. `main.js` wiring
48. Tests (unit, arch, system) and harness hygiene
49. README + overview updates

## 11. Feasibility and Decisions

- **CSS-only swap vs. DOM move.** DOM moving would change Tab order (rejected by rspec R7)
  and would need re-mount or resize handling. `row-reverse` is zero-JS and reflows instantly
  on viewport change (fspec §3.3). No layout-dependent JS exists: the coach overlay SVG is
  positioned inside `.grid-wrapper` and scales with the grid; no module reads column
  positions (`getBoundingClientRect`/`offsetLeft` are unused in `js/ui/`).
- **Cookie vs. localStorage.** Cookie, for parity with theme and because the inline head
  script can read it synchronously with no try/catch around storage access.
- **Constants location.** Unlike `THEME_CLASSES`, handedness has no extensibility story and
  a single consumer, so its constants stay module-private rather than in `config.js`.
- **No performance concern.** A single attribute change and one reflow.
