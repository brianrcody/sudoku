# Review: Hamburger Menu and Control Consolidation — v1

**Reviewer:** Reviewer subagent
**Date:** 2026-11-27
**Branch:** `hamburger-menu` (working tree vs `main`, staged + unstaged + new files)
**Specs:** rspec-008, fspec-008, vspec-008, aspec-hamburger-menu (with §17 O1–O4 accepted,
including §7.7 `keyboard.js`)
**Verdict:** **Not signed off: 1 blocker** (small). Everything else matches the three specs.

---

## 1. Method

All changed and new files were read in full: `js/ui/menu.js`, `js/ui/requestFocus.js`,
`js/ui/stats.js`, `js/ui/share.js`, `js/ui/dialog.js`, `js/ui/themes.js`,
`js/ui/handedness.js`, `js/ui/controls.js`, `js/ui/numpad.js`, `js/ui/keyboard.js`,
`js/game/foreground.js`, `js/main.js`, `index.html`, `css/menu.css`, and the diffs of
`css/base.css`, `css/grid.css`, `css/controls.css`, `css/stats.css`, the test files,
`captureSessionFixtures.js`, `visual-smoke.js`, README and the aspec docs.

Behavior was then checked in the real app (headless Chromium via Playwright against a
static server, `index.html` unmodified) with scratch scripts covering: Tab order, every
open/close trigger, roving focus and wrap, type-ahead, game-shortcut suppression, Escape
precedence, the focus table rows reachable without slow generation, ARIA tree, both
hands, wide/narrow, breakpoint crossing, computed focus-ring colours in all five themes,
the disabled-focused item ring, pad/grid alignment and subgrid rows.

`npm test` result: see §6.

---

## 2. Blockers

### B1. Roving focus goes stale after a touch/pen tap on an item

- **Spec:** fspec-008 §4.4 — roving focus, "Exactly one item is focusable at a time";
  ArrowDown/ArrowUp/type-ahead move relative to the *focused* item. aspec §4.5
  `_focusItem` is the only way `_current` changes.
- **Actual:** a tap (no `pointermove` with `pointerType === 'mouse'`) focuses the item
  natively (it has `tabindex="-1"`), but `_current` is not updated. Verified at 400px with
  `hasTouch`: open menu (focus Statistics), tap *School* → focus on School, menu open
  (correct), but `tabindex="0"` is still on `#mi-stats`; ArrowDown then focuses
  **Share puzzle**, not Digital Terminal. Type-ahead, Home/End-relative logic and the
  breakpoint rule (`_current === _handItem`) read the same stale value. Reachable by a
  tablet with a keyboard, or a pen.
- **Suggested fix:** keep `_current` in sync with real focus inside the menu, e.g. a
  `focusin` listener on `_menu` that calls `_focusItem`-equivalent bookkeeping when
  `e.target` is an `.mi` other than `_current` (or call `_focusItem(item)` at the top of the
  item `click` handler before `_activate`). Add a unit test: focus an item directly
  (not via `_focusItem`), then ArrowDown → next item after it; only it has `tabindex="0"`.

---

## 3. Implementor's interpretations

| # | Interpretation | Verdict |
|---|---|---|
| 1 | State flag named `_opened` (aspec used `_open` for flag and function) | **Accepted.** Unavoidable rename; `isOpen()` API unchanged |
| 2 | Menu button's handled keys (Enter, Space, ArrowDown, ArrowUp) `stopPropagation` | **Accepted.** fspec §4.2 defines these keys as opening the menu, so they are not "shortcuts behaving as on any other button" (§9.1 last line); without it ArrowDown/ArrowUp would also move the grid selection while the menu opens. Unhandled keys (`1`–`9`, `P`, `C`, Backspace, Escape) still bubble — verified, and tspec MN16 covers it |
| 3 | `mount` syncs checked/disabled once at mount as well as on open | **Accepted.** No behavioral difference (closed menu is hidden from AT); keeps the DOM truthful for tests |
| 4 | Removed SH7–SH9 and UH15–UH16 | **Accepted; tspec has replacement coverage.** SH7 (enabled with puzzle) → MN23; SH8 (enables when a puzzle arrives) → MN90; SH9 (unrelated change leaves state alone) → MN92; SH6 rewritten as `share()` no-op guard and covered by SH20; UH15/UH16 (checked reflects preference) → MN21, MN88, MN24. No tspec blocker |

---

## 4. Checklist results

### 4.1 Functional spec fidelity (fspec-008)

| Area | Result |
|---|---|
| §2 page structure / R13 order | Pass. Tab order verified: `#menu-button` → `#difficulty-select` → `#btn-new` → `.sudoku-grid` → cells → number pad. Action row, stats panel, header theme select and hand switch removed |
| §3.3 cluster | Pass. `group` "Next game"; select "Select difficulty level"; button "Start new puzzle" |
| §3.4 focus around a new game | Pass. New Puzzle (keyboard and pointer, no progress) → grid; progress confirm → New Puzzle while generating → grid; menu opened during a New Puzzle generation stays open with focus in it (guard). Difficulty change → selector. Cancel / declined / failed paths implemented per aspec §6 table (incl. O2), read and matched against `foreground` event order |
| §4.1 button | Pass. `aria-haspopup="menu"`, `aria-controls`, `aria-expanded`, name "Menu", static first Tab stop |
| §4.2 opening | Pass. Click/Enter/Space/ArrowDown → Statistics; ArrowUp → Left-handed (wide) / Mountain (narrow). Pointer open deselects the cell; keyboard open keeps it (verified). Space keyup does not re-toggle |
| §4.3 closing | Pass. Escape, button click, Tab (→ selector), Shift+Tab (→ button), outside click on cell (→ cell), on number pad (→ button), dialog opening (O1/§11; verified via a programmatic Difficulty confirmation over the open menu: menu closes, Cancel focused, Escape returns to the menu button), win (→ New Puzzle, verified) |
| §4.4 navigation | Pass except B1. Wrap, Home/End, type-ahead (`c` → Coffee Shop), Left/Right inert, hidden Left-handed skipped narrow, disabled items focusable |
| §4.5 / §5.1 semantics | Pass. ARIA tree: `menu "Menu"` › `group "Game"` (3 `menuitem`, names Statistics / Share puzzle link / Reset puzzle) › `group "Settings Theme"` (5 `menuitemradio`, one checked) › `group "Settings"` (`menuitemcheckbox "Left-handed"`). `aria-haspopup="dialog"` on Statistics and Reset; hint and headings `aria-hidden` |
| §5.3 / §5.4 enable rules (R4b, R4c) | Pass. `aria-disabled` iff `puzzle === null`, live via `changed` on `puzzle`/`won`; both enabled after a win (verified); disabled activation is inert and keeps the menu open |
| §5.4 Reset | Pass. Confirm → grid, no cell selected, "Puzzle reset." (keyboard and pointer verified); Cancel/Escape → menu button |
| §5.5 / §5.6 Theme, Left-handed | Pass. Menu stays open, focus stays; same theme re-chosen announces nothing; Left-handed flips layout, announces fspec-004 string, `aria-checked` updates; menu button stays at the right edge (1076px of 1100 in both hands) |
| R6 | Pass. `.mi-hand-section { display: none }` ≤720px; cookie untouched; crossing to narrow with Left-handed focused moves focus to Mountain, menu stays open |
| §6 Statistics dialog | Pass. Modal, focus to Close, Tab trapped, digits do not reach the board, Escape/Close → menu button; current row "Easy, current level: 0 attempted, 0 won" |
| §7 number pad | Pass. `group "Number pad"` (no `toolbar`), digits, `group "Input and help"` (Pen/Pencil, Coach, Hint), `group "Corrections"` (Undo, Clear, Erase all pencil), Check outside both; DOM = R10 order |
| §8.1 focus table | Pass for every row exercised (see above); remaining rows traced in code |
| §9.1 shortcut suppression | Pass. With an item focused, `5`, `p`, Backspace, ArrowLeft, Ctrl+Z, `c` changed neither the board, the mode nor the selection |
| §9.3 Escape precedence | Pass. Mutually exclusive by construction (`beforeOpen`, `focusin`, backdrop); each surface handles its own Escape |
| §10 announcements | Pass for theme, Left-handed, reset, same-theme (none) |

### 4.2 Visual spec fidelity (vspec-008)

| Area | Result |
|---|---|
| §2.2 wide grid | Pass. Pad top = grid top = 137px in both hands; columns swap in left-hand mode; `.right-col` 231.9px |
| §3 header / button | Pass. `header` z-index 50, `.menu-wrap` relative, 36×36 button, hover = open state, per-theme §9.1 rules |
| §4 menu | Pass. Panel, animation + reduced motion, sections, items, radio, swatches (CSS keyed by `data-theme`, aspec-sanctioned), switch graphic, Terminal rules, narrow width/44px items |
| §5 cluster | Pass. 34px select and button, joined border, raise-on-focus, Coffee/Mountain/Terminal rules |
| §6 tool block | Pass. Subgrid rows aligned (row tops 299/351/393, heights 46/36/40), 6px tool padding, pad 344px, divider |
| §7 Statistics dialog | Pass. Markup and three rules; `.stats-heading` removed |
| §8.2 grid ring (R14) | Pass. `:focus-visible` after keyboard Reset/New Puzzle; no ring after pointer Reset/New Puzzle |
| §8.3 Coffee 3:1 (R15) | Pass. Computed outline `#c9a97a` on `#btn-hint`, `#btn-check`, `#btn-new`, `#difficulty-select`; other themes keep the accent |
| §8.5 disabled-focused item | Pass. Item opacity 1, children 0.38 / hint 0.3; measured ring ratios 6.05 / 4.60 / 6.10 / 11.13 / 4.23 (Minimalist / Coffee / School / Terminal / Mountain) — identical to the vspec table |
| §12 CSS by file | Pass. Every Remove/Add item present in the file the aspec §11.2 assigns (menu rules in `menu.css` per aspec); no leftover selectors for removed elements |

### 4.3 Architectural plan fidelity (aspec)

| Area | Result |
|---|---|
| §2 files touched | Pass. All listed files changed as described; `themes.css`, `dev.css` untouched |
| §3 markup / ID inventory | Pass |
| §4 `menu.js` API, markup, state, keyboard, pointer, activation, item state, outside close | Pass (B1 aside); comment documents the bubble-phase dependency (§10) |
| §5 `stats.js` | Pass. Always-rendered table, current-row label, `open/close/isOpen` |
| §6 `requestFocus.js` | Pass. Matches the table row for row |
| §7.1–7.8 module changes | Pass. `beforeOpen` runs before trigger capture; `startNew` forwards `onOutcome`; `keyboard.js` arrow-from-container moves DOM focus to the cell (verified: ArrowRight from focused grid → cell 0 focused) |
| §8 bootstrap | Pass. `_afterNewPuzzle` deleted; `?.` on `#btn-new` dropped; `_confirmReset` has no guard |
| §12 dev tooling / recorder | Pass. No new/removed actions; no dev module references a removed ID (`grep` over `js/`, `scripts/`); `captureSessionFixtures.js` and `visual-smoke.js` updated as specified, with menu and Statistics shots added |
| Dependencies | None added |
| §15 sequence step 13 | Done (`aspec-ui.md` §2/§14 amendment notes, `aspec-overview.md` tree and index) |

---

## 5. Non-blocking observations

1. **Click on non-item menu area drops focus to `body`.** Clicking a section heading or the
   menu's padding leaves the menu open with focus on `body` (verified). Keys then reach the
   game shortcuts and the menu's own keys stop working until the player clicks an item.
   No spec row covers it. Cheap fix, could share B1's change: `mousedown` →
   `preventDefault()` on `#app-menu` when the target is not inside an `.mi`.
2. **Theme group name reads "Settings Theme"** (no comma) because `aria-labelledby`
   concatenates with a space. fspec §5.1 writes "Settings, Theme"; vspec §4.1 and aspec
   §4.2 prescribe exactly this `aria-labelledby`, so it is per spec. Screen readers
   announce it the same way in practice.
3. **`docs/aspecs/aspec-overview.md` is modified but unstaged**, unlike the rest of the
   change set. Stage it with the others.
4. **tspec numbering drift.** tspec §2.6 replaces UH15–UH19 with UH20–UH23; the
   Implementor kept UH17–UH19 rewritten against `toggleHandedness`. The QE Test Writer
   should reconcile IDs; no coverage gap.
5. **README** uses "(☰)" for the menu button; harmless.

---

## 6. Test run

`npm test` on the working tree: **2756 passing, 0 failing, 10 pending** (exit 0). Coverage
was not reported by this run, and the new `ui-menu` / `ui-requestFocus` suites do not exist
yet (QE Test Writer has not run). So this result shows no regressions only. It says nothing
about tspec coverage. The aspec §13 silent-skip hazard (A17, GF8, SYS4) is addressed: those
tests were rewritten without `this.skip()` guards.
