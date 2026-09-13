# Test Strategy — Left-Hand Layout Mode
**Date:** 2026-09-13
**Status:** Final — implemented; see `docs/misc/test-summary-left-hand.md`
**Author:** Uber Developer (QE Strategist stage)
**Inputs:** aspec-left-hand, fspec-004-left-hand, vspec-004-left-hand

---

## 1. Approach

All logic lives in one small module, `js/ui/handedness.js` (4 functions, 5 decision
points). Unit tests are the primary vehicle and alone reach 100% branch coverage on it.
The layout itself is CSS, which unit tests cannot observe, so a handful of system tests
load `index.html` in a **sized** iframe and assert computed layout, the no-flash head
script contract, narrow-viewport behavior, DOM order, and non-interference with game state.

Unit tests run against the Mocha page's own `<html>` element and a test-created button;
the global `beforeEach` in `setup.js` clears `data-hand` and cookies so tests are
order-independent.

## 2. Test Inventory

### 2.1 Unit — `js/tests/unit/ui-handedness.test.js`

| ID | Name | Input / Arrange | Expected |
|---|---|---|---|
| UH1 | getHandedness returns right when data-hand is absent | no attribute | `'right'` |
| UH2 | getHandedness returns left when data-hand is left | `data-hand="left"` | `'left'` |
| UH3 | getHandedness returns right for an unrecognized data-hand value | `data-hand="up"` | `'right'` |
| UH4 | applyHandedness left sets data-hand on the root element | `applyHandedness('left', false)` | attribute `left` |
| UH5 | applyHandedness right removes data-hand | attribute pre-set; `applyHandedness('right', false)` | attribute absent |
| UH6 | applyHandedness left writes the left cookie | `applyHandedness('left', false)` | cookie `sudoku.hand` = `left` |
| UH7 | applyHandedness right writes the right cookie | `applyHandedness('right', false)` | cookie = `right` |
| UH8 | applyHandedness treats an unrecognized value as right | attribute pre-set; `applyHandedness('up', false)` | attribute absent; cookie `right` |
| UH9 | applyHandedness left announces the on message | `applyHandedness('left')` | live region = on string |
| UH10 | applyHandedness right announces the off message | `applyHandedness('right')` | live region = off string |
| UH11 | applyHandedness with shouldAnnounce false is silent | `applyHandedness('left', false)` | live region empty |
| UH12 | initHandedness applies a saved left preference silently | cookie `left` | attribute `left`; live region empty |
| UH13 | initHandedness defaults to right and clears a stale attribute when no cookie | attribute pre-set; no cookie | attribute absent; cookie `right` |
| UH14 | initHandedness normalizes an unrecognized cookie to right | cookie `sideways` | attribute absent; cookie `right` |
| UH15 | bindHandToggle marks the switch checked when left is applied | attribute `left`; bind | `aria-checked="true"` |
| UH16 | bindHandToggle marks the switch unchecked when right is applied | no attribute; button pre-marked `true`; bind | `aria-checked="false"` |
| UH17 | clicking the switch from right turns left-hand mode on | right; bind; click | attribute `left`, `aria-checked="true"`, cookie `left`, on announcement |
| UH18 | clicking the switch from left turns left-hand mode off | left; bind; click | attribute absent, `aria-checked="false"`, cookie `right`, off announcement |
| UH19 | clicking the switch twice restores the original state | right; bind; click ×2 | attribute absent, `aria-checked="false"` |

### 2.2 Unit — `js/tests/unit/arch.test.js`

| ID | Name | Expected |
|---|---|---|
| AR-H | `/js/ui/handedness.js` has no forbidden imports | added to `UI_MODULES`; no `../game/` or `../providers/` import |

### 2.3 System — `js/tests/integration/system.test.js`

Helper: `createSizedIframe(width, height)` — off-screen iframe with real dimensions so
media queries evaluate at that viewport width.

| ID | Name | Arrange | Expected |
|---|---|---|---|
| SYS5 | a saved left preference renders controls left of the board on a wide viewport | cookie `left`; 1100×800 iframe; wait for puzzle | `data-hand="left"`; switch `aria-checked="true"`; `#numpad-root` left < `.sudoku-grid` left; `.right-col` right edge ≤ `.left-col` left edge |
| SYS6 | the head script applies only a saved left preference, before the stylesheets load | fetch `/index.html` as text; extract the first inline `<script>` in `<head>`; run it via `new Function('document', src)` against a fake `document` (`cookie` string, recording `documentElement.setAttribute`, no-op `addEventListener`) for cookies `sudoku.hand=left`, `=right`, absent, `=sideways`, and `x=1; sudoku.hand=left` | `data-hand` set to `left` only for the two `left` cookies; never set otherwise; the script's position in the source precedes the first `<link rel="stylesheet">` |
| SYS7 | toggling the switch swaps the layout without disturbing game state | no cookie; 1100×800; enter a pen digit, keep selection; click switch | numpad moves left of grid within 1 s; pen digit unchanged; `selected` is `null` (fspec-001 §4.2 outside-click rule); focus on switch; click again → numpad right of grid |
| SYS8 | the switch is hidden and the layout stacks on a narrow viewport | cookie `left`; 400×800 | switch computed `display: none`; `.game-area` `flex-direction: column`; `data-hand` still `left` |
| SYS9 | document order keeps the grid before the controls in left-hand mode | cookie `left`; 1100×800 | via `compareDocumentPosition`: `#hand-toggle` precedes `.sudoku-grid`; `.sudoku-grid` precedes `#numpad-root`; `#numpad-root` precedes `#stats-root` |
| SYS10 | the header switch exposes switch semantics with its visible label as name | 1100×800 | `role="switch"`, `type="button"`, text content "Left-handed", track `aria-hidden="true"`, precedes `#theme-select` in document order |

## 3. Coverage Map — `js/ui/handedness.js`

| Branch | True arm | False arm |
|---|---|---|
| `getHandedness`: attribute === `'left'` | UH2 | UH1, UH3 |
| `applyHandedness`: `left` (set vs remove) | UH4 | UH5, UH8 |
| `applyHandedness`: cookie ternary | UH6 | UH7 |
| `applyHandedness`: `shouldAnnounce` | UH9, UH10 | UH11 |
| `applyHandedness`: announcement ternary | UH9 | UH10 |
| `applyHandedness`: default parameter | UH9 (omitted) | UH11 (supplied) |
| `initHandedness`: cookie === `'left'` | UH12 | UH13, UH14 |
| `bindHandToggle`: initial `aria-checked` expression | UH15 | UH16 |
| `bindHandToggle`: click `next` ternary | UH18 | UH17 |
| `bindHandToggle`: click `aria-checked` expression | UH17 | UH18 |

Every branch has both arms exercised → **100% branch** on `handedness.js`.

`main.js` gains two unconditional calls and no branches; they execute in every system test
that loads `index.html`. The `index.html` inline script is outside c8's `js/**` scope and is
covered behaviorally by SYS5/SYS6/SYS8.

## 4. Gaps and Risks

- **CSS visual details** (colors, per-theme overrides, focus rings, the theme-select focus
  fix) are not asserted by automated tests — computed `:focus`/`:focus-visible` styles
  inside an unfocused off-screen iframe are unreliable in headless Chromium. They were
  verified against the approved mockup and by screenshot during review. This matches the
  precedent of vspec-001 theme styling.
- **SYS6 isolation:** a live-iframe check at `DOMContentLoaded` cannot distinguish the head
  script from `initHandedness()` — deferred module scripts also run before that event. SYS6
  therefore executes the extracted head script against a fake `document`, which tests the
  no-flash contract deterministically. Its placement before the stylesheets is asserted
  from source order.
- **First-`<button>` assumptions in existing tests:** the switch is now the first
  `<button>` in document order and is `display: none` in the 1px iframes used by
  `game-flows.test.js`. Any test that focuses `querySelector('button')` must target a
  displayed button instead (GF18 amended accordingly).
- **Real-worker puzzle generation** makes system tests slower (seconds each); follow the
  existing `waitForPuzzle` pattern and generous timeouts.
- Iframes share the test page's cookie jar (same origin); `setup.js` clears cookies before
  each test, so tests that seed cookies must do so inside the test body.
