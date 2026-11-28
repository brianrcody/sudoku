# Test Strategy — Hamburger Menu and Control Consolidation (V4)
**Date:** 2026-11-27
**Status:** Draft for Orchestrator review
**Author:** QE Strategist
**Inputs:** `aspec-hamburger-menu.md` (primary; O1–O4 accepted, §7.7 in scope),
`fspec-008-hamburger-menu.md`, `vspec-008-hamburger-menu.md`

---

## 1. Approach

**Coverage target (PD, 2026-11-27):** 100% branch coverage of every new and changed module
in this feature. Project-wide 100% stays waived for V4; nothing this feature adds or
touches may leave an uncovered branch.

| Scope | Files | Target |
|---|---|---|
| New | `js/ui/menu.js`, `js/ui/requestFocus.js` | 100% branch, file-wide |
| Reworked | `js/ui/stats.js`, `js/ui/share.js` | 100% branch, file-wide |
| Changed | `js/ui/themes.js`, `js/ui/handedness.js`, `js/ui/dialog.js`, `js/ui/keyboard.js`, `js/ui/controls.js`, `js/ui/numpad.js`, `js/game/foreground.js` | 100% branch on every added or edited branch; no regression of pre-existing arms |
| Changed (bootstrap) | `js/main.js` | Every added or edited branch and every new closure executed (§4.11); file-wide is not the target |

The feature is DOM, focus and CSS only (aspec §1). Every new module takes its
collaborators by injection — `menu.js` gets hooks and a `MediaQueryList`,
`requestFocus.js` gets target getters and a `doc` — so **unit tests carry the branch
coverage on their own** for every new and reworked module. Integration tests exist for
what unit tests cannot observe: real CSS (layout, the ≤720px hide, contrast, the grid
ring), the `main.js` wiring, the real bubble-phase game shortcut listeners, the real
`matchMedia`, and end-to-end focus flows through generation. Two system tests walk the
whole feature as a keyboard user and as a pointer user.

Conventions follow `tspec-left-hand.md` and `tspec-puzzle-sharing.md`: IDs are new per
file and continue existing ranges; integration tests use `createApp(src, { width, height })`
from `integration/_app.js`, select by ID, and **wait for `state.puzzle !== null`
(`waitForPuzzle`) before acting**. Keyboard input is synthetic `KeyboardEvent`s dispatched
on the focused element of the app frame, as A39/SHR tests do.

**Viewport rule.** Unless a test is about the narrow layout, every integration and system
test in this file uses a **1100×900** frame. At ≤720px the Left-handed item is hidden in
CSS *and* skipped by `menu.js` (`NARROW_QUERY`), so ArrowUp/End land on Mountain, not
Left-handed; a small or 1px frame silently changes what these tests exercise. Narrow tests
state their size explicitly (400×800, 720×800, 320×640).

### 1.1 New test files and prefixes

| File | Prefix | Level |
|---|---|---|
| `js/tests/unit/ui-menu.test.js` (new) | `MN` | Unit |
| `js/tests/unit/ui-requestFocus.test.js` (new) | `RQF` | Unit |
| `js/tests/integration/menu.test.js` (new) | `HMI` | Integration |
| `js/tests/integration/system.test.js` (extend) | `HMS` | System |
| Existing unit files (extend) | continue `US`, `SH`, `UT`, `UH`, `UD`, `FG`, `UC`, `UN`, `UK` | Unit |

Register both new unit files and `integration/menu.test.js` in `js/tests/setup.html`.

### 1.2 Shared unit fixtures

- **`makeMenuRig({ puzzle, theme = 'minimalist', left = false, narrow = false })`** in
  `ui-menu.test.js`: builds `.menu-wrap#menu-root` with `#menu-button` (static markup of
  aspec §3.2, including `aria-*`) and `#app-menu[role=menu][hidden]`, plus an outside
  `<select id="t-next">`, an outside `<button id="t-outside">` and an outside non-focusable
  `<div id="t-area">`. Stubs: `makeFakeGameState({ puzzle })`; `themes` with
  `options = THEME_OPTIONS`, a mutable `current()` and an `apply` spy that updates it;
  `hand` with a mutable `isLeft()` and a `toggle` spy that flips it; `onStatistics`,
  `onShare`, `onReset` spies that record `document.activeElement` and `isOpen()` at call
  time; `nextFocus` returning `#t-next`; **fake media** `{ matches: narrow,
  addEventListener(type, fn) { this._fn = fn } }` with a `flip(matches)` helper that sets
  `matches` and calls `_fn({ matches })`. Removes everything in `afterEach`.
- **`docKeySpy()`**: adds bubble-phase `keydown` listeners on `document` and `window`,
  returns call counts and a `remove()`.
- **`key(el, key, mods)`**: dispatches a bubbling, cancelable `keydown` on `el`, returns the
  event (for `defaultPrevented`).
- **Stubbing `document.activeElement`**: `Object.defineProperty(document, 'activeElement',
  { configurable: true, get: () => x })`, deleted in `afterEach`. Used only where a branch
  is otherwise unreachable (MN105, MN106).

---

## 2. Test Inventory — Unit

### 2.1 `unit/ui-menu.test.js` (new)

#### A. Mount and markup (fspec §4.5, §5.1; aspec §4.2)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN1 | renders the nine items in order with ids and roles | mount | `#app-menu .mi` = `mi-stats`, `mi-share`, `mi-reset`, `mi-theme-minimalist`, `-coffee`, `-school`, `-terminal`, `-mountain`, `mi-hand`; roles `menuitem`×3, `menuitemradio`×5, `menuitemcheckbox`; every item `class="mi"`, `tabindex="-1"` |
| MN2 | Game items carry the specified names and popups | mount | `#mi-stats`: `aria-label="Statistics"`, `aria-haspopup="dialog"`, `.mi-label` "Statistics…". `#mi-share`: `aria-label="Share puzzle link"`, no `aria-haspopup`, label "Share puzzle", `.mi-hint` "Copy link" with `aria-hidden="true"`. `#mi-reset`: `aria-label="Reset puzzle"`, `aria-haspopup="dialog"`, label "Reset puzzle…" |
| MN3 | theme items are named by their label text | mount | each theme item: no `aria-label`; `.mi-label` text = `THEME_OPTIONS[i].label`; `data-theme` = value; `.mi-radio` and `.mi-swatch` `aria-hidden="true"`. `#mi-hand`: label "Left-handed", `.mi-switch-track` `aria-hidden="true"` |
| MN4 | sections are groups labelled by their headings, headings hidden | mount | Game group `role=group`, `aria-labelledby="mh-game"`; theme group `aria-labelledby="mh-settings mh-theme"`; `.mi-hand-section` `role=group`, `aria-labelledby="mh-settings"`; `#mh-game`/`#mh-settings`/`#mh-theme` text "Game"/"Settings"/"Theme", each `aria-hidden="true"`; section wrappers `role="none"`; resolved names "Game", "Settings Theme", "Settings" |
| MN5 | labels are inserted as text, never HTML | `themes.options = [{ value: 'x', label: '<b>X</b>' }]` | `#mi-theme-x .mi-label` has no element children; `textContent === '<b>X</b>'` |
| MN6 | mounts closed | mount | `#app-menu` `hidden`; button `aria-expanded="false"`, `aria-haspopup="menu"`, `aria-controls="app-menu"`; `isOpen() === false` |
| MN7 | NARROW_QUERY is the CSS breakpoint | — | `NARROW_QUERY === '(max-width: 720px)'` |
| MN8 | without an injected media query, mount uses matchMedia(NARROW_QUERY) | stub `window.matchMedia` to record its argument and return a fake media; omit `hooks.media`; restore after | called once with `NARROW_QUERY`; ArrowUp-open lands on the item the fake's `matches` implies |
| MN9 | isOpen tracks the open state | open, close | `false → true → false` |

#### B. Menu button (fspec §4.1–4.3; aspec §4.6)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN10 | clicking the closed button opens on the first item | click `#menu-button` | `hidden` false; `aria-expanded="true"`; focus `#mi-stats`; it alone has `tabindex="0"` |
| MN11 | Enter on the closed button opens on the first item and prevents the default | `key(button,'Enter')` | open; focus `#mi-stats`; `defaultPrevented` (the mechanism that keeps keyboard-open from synthesizing a deselecting click) |
| MN12 | Space on the closed button opens on the first item | `' '` | as MN11 |
| MN13 | ArrowDown on the closed button opens on the first item | `ArrowDown` | open; `#mi-stats`; prevented |
| MN14 | ArrowUp on the closed button opens on the last item (wide) | `narrow:false`; `ArrowUp` | focus `#mi-hand`; prevented |
| MN15 | ArrowUp on the closed button opens on Mountain (narrow) | `narrow:true`; `ArrowUp` | focus `#mi-theme-mountain` |
| MN16 | other keys on the closed button bubble untouched | for `'5'`, `'p'`, `'c'`, `Escape`, `Backspace` | not prevented; menu closed; `docKeySpy` document count +1 each |
| MN17 | clicking the button while open closes with focus on the button | open; click button | closed; `aria-expanded="false"`; focus button |
| MN18 | Enter and Space on the button while open close it | open; focus button; `Enter` (then reopen, `' '`) | closed; focus button; prevented |
| MN19 | ArrowDown and ArrowUp on the button while open do nothing but prevent | open; focus button; `ArrowDown`, `ArrowUp` | still open; focus button; prevented |

#### C. State synchronized on open (fspec §5.3–5.6; aspec §4.10)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN20 | the current theme is the one checked item | `theme:'school'`; open | `#mi-theme-school` `aria-checked="true"`; the other four `"false"` |
| MN21 | Left-handed reflects the preference | `left:true` → open → `"true"`; separate rig `left:false` → `"false"` | as stated |
| MN22 | Share and Reset are aria-disabled with no puzzle | `puzzle:null`; open | both `aria-disabled="true"`; still `tabindex` -1 (focusable by roving) |
| MN23 | Share and Reset carry no aria-disabled with a puzzle | puzzle set; open | `hasAttribute('aria-disabled') === false` on both; Statistics never has it |
| MN24 | opening resyncs state changed while closed | `theme:'school'`; open/close; set `current()` → `'coffee'`, `isLeft()` → true without activation; reopen | Coffee checked; `#mi-hand` `"true"` |

#### D. Roving focus and navigation (fspec §4.4; aspec §4.5, §4.7)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN30 | ArrowDown walks every item with exactly one tab stop | open; `ArrowDown` ×8 | focus visits items 2–9 in order; after each step exactly one item has `tabindex="0"` and it is `document.activeElement`; prevented |
| MN31 | ArrowDown wraps from the last item to the first | focus `#mi-hand`; `ArrowDown` | `#mi-stats` |
| MN32 | ArrowUp moves back and wraps from the first item to the last | focus `#mi-reset`; `ArrowUp` → `#mi-share`; from `#mi-stats` `ArrowUp` | `#mi-share`; then `#mi-hand` |
| MN33 | Home and End go to the first and last visible items (wide) | focus a theme item; `End`, then `Home` | `#mi-hand`; `#mi-stats`; both prevented |
| MN34 | narrow: Left-handed is skipped by every navigation key | `narrow:true`; `End` → Mountain; `ArrowDown` from Mountain → Statistics; `ArrowUp` from Statistics → Mountain | as stated; `#mi-hand` never focused |
| MN35 | disabled items are not skipped | `puzzle:null`; open; `ArrowDown` ×2 | `#mi-share`, then `#mi-reset` |
| MN36 | ArrowLeft and ArrowRight do nothing but prevent | focus `#mi-share`; each | focus unchanged; open; prevented |
| MN37 | focus moved programmatically before the first move still roves correctly | open; `_current` is Statistics; `ArrowUp` | `#mi-hand`; Statistics back to `-1` (covers `_focusItem` with a previous `_current`) |

#### E. Type-ahead (fspec §4.4, §9.1; aspec §4.7)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN40 | a letter moves to the next item whose label starts with it, wrapping | focus Statistics; `'s'` ×3 | Share puzzle → School → Statistics; each prevented |
| MN41 | C moves to Coffee Shop | focus Statistics; `'c'` | `#mi-theme-coffee` |
| MN42 | matching is case-insensitive and starts after the focused item | focus Statistics; `'M'`, `'m'`, `'m'` | Minimalist → Mountain → Minimalist |
| MN43 | the only match wraps back to itself | focus Coffee; `'c'` | focus stays Coffee; prevented |
| MN44 | wide: L reaches Left-handed | `'l'` from Statistics | `#mi-hand` |
| MN45 | narrow: L finds no visible match | `narrow:true`; focus Statistics; `'l'` | focus unchanged; prevented |
| MN46 | digits and unmatched letters do nothing but are consumed | `'5'`, `'1'`, `'x'` | focus unchanged; prevented; menu open |
| MN47 | a modified letter is not type-ahead and keeps its default | `{key:'m', ctrlKey}`, `{key:'m', metaKey}`, `{key:'m', altKey}` (three cases, one per operand) | focus unchanged; **not** prevented |
| MN48 | named non-printable keys do nothing and keep their default | `Backspace`, `Delete`, `F5`, `Shift`, `{key:'z', ctrlKey}` | focus unchanged; not prevented; menu open |

#### F. Closing from the keyboard (fspec §4.3; aspec §4.4, §4.7)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN50 | Escape closes and returns focus to the button | focus a theme item; `Escape` | closed; `aria-expanded="false"`; focus button; every item `tabindex="-1"`; prevented |
| MN51 | Tab closes and moves to the next tab stop | `Tab` | closed; focus `#t-next`; prevented |
| MN52 | Tab with no next target closes without throwing | `nextFocus: () => null`; `Tab` | closed; no exception |
| MN53 | Shift+Tab closes and returns focus to the button | `{key:'Tab', shiftKey}` | closed; focus button; prevented |
| MN54 | close() on a closed menu never moves focus | focus `#t-outside`; `close({ focusButton: true })` | focus `#t-outside`; `aria-expanded` unchanged |
| MN55 | close() without focusButton leaves focus alone | open (focus on an item); call `close()` | closed; button `focus` not called |

#### G. Game shortcut suppression (fspec §9.1; aspec §4.7, §10, §14)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN60 | no key pressed on a focused item reaches a document or window listener | for each of `'1'`, `'9'`, `'c'`, `'C'`, `'p'`, `'P'`, `Backspace`, `Delete`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `{z,ctrl}`, `{z,meta}`, `{m,alt}`, `F5`: reopen if needed, focus a theme item, `key(item, …)` | `docKeySpy` document and window counts stay 0 |
| MN61 | keys that act on the menu are also isolated | `Enter` on a theme item, `' '` on `#mi-hand`, `Escape`, `Tab`, `Shift+Tab` | document/window counts 0 |
| MN62 | browser shortcuts keep their default inside the menu | `{key:'z', ctrlKey}` on an item | not prevented; document count 0 |
| MN63 | after closing, the same key from the button reaches the game | `Escape` to close; `key(button,'5')` | document count 1 |

#### H. Pointer inside the menu (fspec §4.4; aspec §4.8)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN70 | mouse hover focuses the item | open; `PointerEvent('pointermove', { pointerType:'mouse', bubbles:true })` on `#mi-theme-school` | focus School; it alone `tabindex="0"` |
| MN71 | hovering the focused item does not refocus it | count `focus` events on Statistics; pointermove on Statistics | count 0; roving unchanged |
| MN72 | touch and pen moves do not move focus | pointermove with `pointerType` `'touch'`, then `'pen'`, on School | focus stays Statistics |
| MN73 | a move over a heading or section gap does nothing | pointermove on `#mh-settings` | focus unchanged |
| MN74 | clicking an item activates it | click `#mi-stats` | `onStatistics` called once; closed |
| MN75 | clicking a non-item inside the menu does nothing | click `#mh-game` | open; no hook called |

#### I. Activation (fspec §5.2–5.6, §8.1; aspec §4.9)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN80 | Statistics closes with focus on the button before the dialog opens | `Enter` on Statistics | `onStatistics` saw `activeElement === button`, `isOpen() === false`; called once |
| MN81 | Statistics is available with no puzzle | `puzzle:null`; activate | `onStatistics` called |
| MN82 | enabled Share closes to the button, then shares | puzzle set; activate Share | `onShare` saw button focus and closed menu; called once; `onReset` not called |
| MN83 | disabled Share does nothing and keeps the menu | `puzzle:null`; `Enter` on Share | `onShare` not called; open; focus Share |
| MN84 | enabled Reset closes to the button, then opens its confirmation | activate Reset | `onReset` saw button focus, closed; called once; `onShare` not called |
| MN85 | disabled Reset does nothing and keeps the menu | `puzzle:null`; `' '` on Reset; also click | `onReset` not called (both paths); open; focus Reset |
| MN86 | a theme other than the current one is applied and checked; menu stays | current `minimalist`; `Enter` on Coffee | `apply('coffee')` once; Coffee `aria-checked="true"`, Minimalist `"false"`; open; focus Coffee |
| MN87 | the current theme re-chosen does nothing | `Enter` on Minimalist | `apply` not called; open; checked unchanged |
| MN88 | Left-handed toggles and reflects; menu stays | `left:false`; `Enter` on `#mi-hand` ×2 | `toggle` called twice; `aria-checked` `"true"` then `"false"`; open; focus `#mi-hand` |

#### J. Live updates (fspec §5.3, §5.4, §11; aspec §4.10)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN90 | a puzzle landing while open enables Share and Reset | `puzzle:null`; open; set `state.puzzle`; `_emit('changed', { changed: new Set(['puzzle']), action:{type:'NEW_PUZZLE'} })` | `aria-disabled` removed from both; menu open; focus unchanged |
| MN91 | losing the puzzle while open disables them | puzzle set; open; `state.puzzle = null`; emit `puzzle` | both `aria-disabled="true"` |
| MN92 | unrelated changes do not resync | puzzle set; open; `state.puzzle = null`; emit `changed: {'selected'}` | attribute still absent |
| MN93 | the win state closes the menu without moving focus to the button | open, focus a theme item; `state.won = true`; emit `{'won'}` | closed; `activeElement !== button` |
| MN94 | a won flag turning false keeps the menu open | open; `state.won = false`; emit `{'won'}` | open |
| MN95 | the win state with the menu closed is a no-op | closed; `state.won = true`; emit `{'won'}` | no throw; `aria-expanded="false"`; focus unchanged |

#### K. Closing from outside (fspec §4.3, §8.2; aspec §4.11)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN100 | focus moving outside closes the menu and stays where it went | open; `#t-outside.focus()` | closed; focus `#t-outside` |
| MN101 | focus moving between items keeps the menu open | open; `ArrowDown` | open |
| MN102 | outside focus while closed is ignored | closed; focus `#t-outside` | no change; no throw |
| MN103 | an outside click with focus on body closes and focuses the button | open; `item.blur()` (focus → body); click `#t-area` | closed; focus button |
| MN104 | an outside click on a non-focusable target while an item has focus focuses the button | open (focus on item); click `#t-area` | closed; focus button (the item is inside `#app-menu`) |
| MN105 | an outside click with no active element focuses the button | open; stub `activeElement` → `null`; click `#t-area` | closed; button `focus` called |
| MN106 | an outside click with focus already elsewhere leaves it there | open; stub `activeElement` → `#t-outside` (no `focusin`); click `#t-area` | closed; button `focus` not called |
| MN107 | a click while closed does nothing | closed; click `#t-area` | button `focus` not called |
| MN108 | the outside click still reaches its target | spy `click` on `#t-outside`; open; click it | spy called; event not prevented; menu closed |

#### L. Breakpoint crossing (fspec §11; aspec §4.5)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| MN110 | narrowing while Left-handed has focus moves focus to Mountain | `narrow:false`; open; `End`; `media.flip(true)` | focus Mountain, `tabindex="0"`; `#mi-hand` `-1`; open; `#sr-live` (if mounted) unchanged |
| MN111 | narrowing with focus on another item leaves it | focus School; `flip(true)` | focus School |
| MN112 | narrowing while closed does nothing | closed; `flip(true)` | focus unchanged; closed |
| MN113 | a widening change does not move focus | `narrow:false`; open; `End`; `flip(false)` | focus `#mi-hand` |
| MN114 | after widening, Left-handed is reachable again | `narrow:true`; open; `flip(false)`; `End` | `#mi-hand` |
| MN115 | native focus on an item (touch/pen tap) syncs roving state (review v1 B1) | open; `#mi-theme-school.focus()` directly (no `_focusItem`); `ArrowDown` | focus is the item after School; exactly one item has `tabindex="0"` and it is the focused item |
| MN116 | `mousedown` on a non-item part of the menu (heading, padding) keeps focus on the current item (review v1 obs. 1) | open; dispatch `mousedown` on a section heading | event `defaultPrevented`; `mousedown` on an item is not prevented |

### 2.2 `unit/ui-requestFocus.test.js` (new) — aspec §6

Arrange: real elements in the test document (`#t-new` button, `#t-diff` select, `#t-grid`
div `tabindex=0`, `button.busy-cancel`, `#t-other` button), `focus` spies on the targets,
and `createRequestFocus({ newPuzzle, difficulty, grid, doc })`. *Nowhere (body)* = blur
everything; *nowhere (null)* = fake `doc = { activeElement: null, body: document.body }`.

| ID | Origin / status | Focus before | Expected focus call |
|---|---|---|---|
| RQF1 | new-puzzle / loaded | New Puzzle | grid |
| RQF2 | new-puzzle / loaded | busy Cancel | grid |
| RQF3 | new-puzzle / loaded | body | grid |
| RQF4 | new-puzzle / loaded | null (fake doc) | grid |
| RQF5 | new-puzzle / loaded | other element | none (unchanged) |
| RQF6 | new-puzzle / cancelled | other element | New Puzzle (unconditional) |
| RQF7 | new-puzzle / cancelled | busy Cancel | New Puzzle |
| RQF8 | new-puzzle / fallback-declined | New Puzzle | New Puzzle |
| RQF9 | new-puzzle / fallback-declined | body | New Puzzle |
| RQF10 | new-puzzle / fallback-declined | busy Cancel | none (O2: not in the guard) |
| RQF11 | new-puzzle / fallback-declined | other (e.g. menu button) | none (O2 menu case) |
| RQF12 | new-puzzle / failed | busy Cancel | New Puzzle |
| RQF13 | new-puzzle / failed | body | New Puzzle |
| RQF14 | new-puzzle / failed | null (fake doc) | New Puzzle |
| RQF15 | new-puzzle / failed | other | none |
| RQF16 | difficulty / loaded | other | selector (unconditional, N1/D10) |
| RQF17 | difficulty / loaded | grid | selector |
| RQF18–20 | difficulty / cancelled, fallback-declined, failed | busy Cancel | selector |
| RQF21–23 | difficulty / cancelled, fallback-declined, failed | body | selector |
| RQF24–26 | difficulty / cancelled, fallback-declined, failed | other | none |
| RQF27 | difficulty / failed | null (fake doc) | selector |
| RQF28 | either origin / replaced, needs-accept-fallback (4 cases) | body | none |
| RQF29 | either origin / an unknown status | body | none (default arm) |
| RQF30 | `doc` omitted defaults to `document` | real body focus; new-puzzle / failed | New Puzzle |
| RQF31 | a target getter returning null does not throw | `grid: () => null`; new-puzzle / loaded from body | no exception (only if the implementation uses `?.`; otherwise drop and note) |
| RQF32 | "on Cancel" is judged by class, not identity | a second element with class `busy-cancel` focused; new-puzzle / failed | New Puzzle |

"Expected" also asserts no other target's `focus` spy fired.

### 2.3 `unit/ui-stats.test.js` (extended; US1–US5 repaired by the Implementor)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| US6 | builds a closed, labelled modal dialog | mount into a test root | `#stats-backdrop.modal-backdrop` `role=dialog`, `aria-modal="true"`, `aria-labelledby="stats-dialog-title"`; title text "Statistics"; no `.open`; `.modal.modal-stats`; table `aria-label="Game statistics by difficulty"`; three `th[scope=col]` Level/Tried/Won; `#stats-close` `type=button` text "Close"; no `.stats-heading`; `isOpen() === false` |
| US7 | the current row's name says it is the current level | puzzle `medium`; stats medium 4/2 | medium row `aria-label="Medium, current level: 4 attempted, 2 won"`, `.active-diff`; every other row `"<Label>: N attempted, M won"` |
| US8 | no row is current before a puzzle | `puzzle:null` | no `.active-diff`; no label contains "current level" |
| US9 | no row is current for an Unrated puzzle | puzzle `unrated` | as US8 |
| US10 | the table stays current while open | open; fire `stats-changed` with new counts; then change puzzle tier and emit `{'puzzle'}` | counts updated; current row and its label move to the new tier; still open |
| US11 | open moves focus to Close | `open(trigger)` | `.open` present; focus `#stats-close`; `isOpen() === true` |
| US12 | Close returns focus to the trigger | open; click Close | `.open` absent; focus trigger; `isOpen() === false` |
| US13 | Escape closes and returns focus | open; Escape on Close | closed; focus trigger; prevented |
| US14 | Tab and Shift+Tab are trapped on Close | open; `Tab`, `Shift+Tab` | focus Close; open; both prevented |
| US15 | no key inside the dialog reaches the game | open; `docKeySpy`; `'5'`, `'p'`, `'c'`, `Backspace`, `ArrowDown`, `Home`, `{z,ctrl}`, `Escape`, `Tab` | document/window counts 0 |
| US16 | other keys keep their default | open; `'5'`, `{z,ctrl}` | not prevented; open |
| US17 | close() when not open does nothing | focus `#t-other`; `close()` | focus unchanged |
| US18 | the trigger is forgotten after closing | open; close; focus `#t-other`; `close()` | focus unchanged |
| US19 | a backdrop click does not close | open; click `#stats-backdrop` | open |
| US20 | opening and closing change no game or statistics state | open; close | `dispatch.calls` empty; fake statistics has no write method called |
| US21 | a stats map of null renders zeros | `statistics.get = () => null` | every row 0/0 (pre-existing arm in the reworked module) |
| US22 | a missing tbody is tolerated | remove `#stats-tbody`; fire `stats-changed` | no throw. *Only if the `if (!tbody)` guard survives the rework; if the Implementor removes it, drop this test.* |

### 2.4 `unit/ui-share.test.js` (extended; SH1–SH16 repaired by the Implementor)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| SH17 | share() with no puzzle does nothing | `puzzle:null`; `await share()` | `copy` not called; no notice; live region empty |
| SH18 | a successful copy shows and announces the copied notice | copy → true | notice "Link copied to clipboard."; announced; `copy` called with `buildShareUrl(givens, getHref())` |
| SH19 | a failed copy shows the link; Dismiss focuses `returnFocus()` | copy → false; `returnFocus` returns `#a`, then switch it to `#b` before Dismiss | link notice shown; announcement text unchanged; after Dismiss focus is `#b` (resolved at dismiss time) |
| SH20 | mount takes no button and owns no disabled state | mount; emit `{'puzzle'}` with puzzle null | no element in the document gains `disabled`; `mount` returns `{ share }` |
| SH21 | only NEW_PUZZLE hides the notice | show a notice; emit `changed` action `RESET_PUZZLE`; then `NEW_PUZZLE` | notice kept, then hidden |

### 2.5 `unit/ui-themes.test.js` (extended)

| ID | Name | Expected |
|---|---|---|
| UT8 | THEME_OPTIONS lists every theme in THEME_CLASSES order | 5 entries; `value` = class minus `theme-`; `label` = display name ("Coffee Shop", "Digital Terminal", …) |
| UT9 | currentTheme returns the applied theme | body `theme-coffee` → `'coffee'` |
| UT10 | currentTheme falls back to the default with no theme class | `body.className = ''` → default's value (`'minimalist'`) |
| UT11 | the menu's apply path announces the display name | `applyTheme('theme-' + 'terminal')` → live region "Theme changed to Digital Terminal." |
| UT12 | bindThemeSelect is gone | `'bindThemeSelect' in themesModule === false` |

### 2.6 `unit/ui-handedness.test.js` (extended; UH15–UH19 replaced)

| ID | Name | Expected |
|---|---|---|
| UH20 | toggleHandedness from right turns left-hand mode on | `data-hand="left"`; cookie `left`; on announcement |
| UH21 | toggleHandedness from left turns it off | attribute absent; cookie `right`; off announcement |
| UH22 | two toggles restore the original state | attribute absent |
| UH23 | bindHandToggle is gone | not exported |

### 2.7 `unit/ui-dialog.test.js` (extended)

| ID | Name | Expected |
|---|---|---|
| UD14 | beforeOpen runs before the trigger is captured | focus `#a`; `beforeOpen` focuses `#b`; open; Cancel | focus returns to `#b` |
| UD15 | beforeOpen runs once per open, before the dialog shows | hook records whether `#modal-backdrop` is open at call time | called once; dialog not yet open at call time |
| UD16 | mount(root) with no options still opens | default-object arm | dialog opens; no throw |
| UD17 | mount(root, {}) with no beforeOpen still opens | default-property arm | as UD16 |

### 2.8 `unit/foreground.test.js` (extended)

Use the existing fake provider/dialog fixtures of FG1–FG41.

| ID | Name | Expected |
|---|---|---|
| FG42 | startNew reports `loaded` to onOutcome after afterLoad | order: `NEW_PUZZLE` dispatched, `afterLoad`, then `onOutcome({status:'loaded'})` |
| FG43 | startNew reports `cancelled` on cancel() | `{status:'cancelled'}` |
| FG44 | startNew reports `replaced` when superseded | first request's onOutcome `{status:'replaced'}` |
| FG45 | startNew reports `fallback-declined` from the fallback dialog's Cancel | `{status:'fallback-declined'}` |
| FG46 | startNew reports `failed` on a provider error | `{status:'failed'}` |
| FG47 | startNew with no onOutcome still loads | default arm (FG23/24/34 already pass this; assert explicitly) |

### 2.9 `unit/ui-controls.test.js` (extended)

| ID | Name | Expected |
|---|---|---|
| UC20 | renders the next-game cluster | `.difficulty-row` › `label[for=difficulty-select]` "Difficulty" + `.next-game[role=group][aria-label="Next game"]` containing `#difficulty-select` then `#btn-new` |
| UC21 | New Puzzle keeps its id, name and type | `#btn-new` `type=button`, classes `btn btn-new`, `aria-label="Start new puzzle"`, text "New Puzzle"; selector `aria-label="Select difficulty level"` |
| UC22 | controls.js wires no New Puzzle action | click `#btn-new` → `dispatch.calls` empty |

### 2.10 `unit/ui-numpad.test.js` (extended)

| ID | Name | Expected |
|---|---|---|
| UN16 | the pad is a group named Number pad, not a toolbar | `.numpad[role=group][aria-label="Number pad"]`; no `[role=toolbar]` in the root |
| UN17 | two labelled tool groups in the specified order | "Input and help" = `#btn-mode`, `#btn-coach`, `#btn-hint`; "Corrections" = `#btn-undo`, `#btn-clear`, `#btn-erase-all` |
| UN18 | DOM order is the Tab order of fspec §7.2 | all buttons: digits 1–9, mode, coach, hint, undo, clear, erase-all, check |
| UN19 | Check, the completion message and the digits are outside both tool groups | `#btn-check`, `#completion-msg` not inside `.tool-group`; `#numpad-digits` has no role |
| UN20 | buttons keep their names and default state | each tool button's `aria-label`/`aria-pressed`/`disabled` default equals the pre-feature values (table in the test) |

### 2.11 `unit/ui-keyboard.test.js` (extended; aspec §7.7, O4)

| ID | Name | Arrange | Expected |
|---|---|---|---|
| UK17 | an arrow key on the focused grid container moves DOM focus to the selected cell | grid in `#grid-root`; container focused; fake state `selected` set to 0 by the dispatch stub; `ArrowRight` | `ARROW_NAV` dispatched; after one `requestAnimationFrame`, focus on `.cell[data-index="0"]` |
| UK18 | an arrow key with focus on a cell does not refocus from keyboard.js | cell 4 focused, `selected` 4; `ArrowDown`; spy `focus` on every cell | `ARROW_NAV` dispatched; no cell `focus` call from keyboard.js after a frame |
| UK19 | container focused but no selection after dispatch | stub leaves `selected` null | no focus call; no throw (null guard arm, if present) |
| UK20 | an arrow with a selection and focus outside the grid dispatches without moving focus | `selected` 3; focus a pad button | `ARROW_NAV`; focus stays on the button |

### 2.12 Architecture

`arch.test.js`: `/js/ui/menu.js` and `/js/ui/requestFocus.js` join `UI_MODULES` and
`ALWAYS_LOADED` (aspec §13.1 — Implementor). The QE Test Writer verifies both entries exist.

---

## 3. Test Inventory — Integration and System

### 3.1 `integration/menu.test.js` (new)

Every test: `createApp('/index.html', { width, height })`, `await waitForPuzzle(frame)`
before acting (except HMI12, which acts before the first puzzle on purpose), keys
dispatched on the frame's active element.

| ID | Name | Size | Arrange / Act | Expected |
|---|---|---|---|---|
| HMI1 | the menu button is the first tab stop and the menu overlays the board | 1100×900, 400×800 | collect displayed focusables in document order; open the menu | first is `#menu-button`; with the menu open, `elementFromPoint` at each item's centre returns that item (header z-index over `main`); `#app-menu` rect inside the viewport |
| HMI2 | the menu fits the viewport at narrow widths | 320×640, 390×800, 720×800 | open | `#app-menu` left ≥ 0 and right ≤ `innerWidth`; every item height ≥ 44px |
| HMI3 | Left-handed is hidden exactly at ≤720px, in CSS and in the keyboard model | 720×800, then 721×800 (two frames) | open with `ArrowUp` | 720: `.mi-hand-section` computed `display: none`, focus Mountain. 721: displayed, focus `#mi-hand`. Covers the real `matchMedia` default (MN8) agreeing with the CSS |
| HMI4 | crossing the breakpoint while Left-handed has focus moves focus to Mountain | 1100×900 → resize iframe to 400×800 | open, `End`, resize, wait for `matchMedia` change | focus `#mi-theme-mountain`; menu open; `#sr-live` text unchanged |
| HMI5 | game shortcuts are suppressed while a menu item has focus, with the real listeners | 1100×900 | select cell (non-given) via `SELECT_CELL`, focus it; focus `#menu-button`; `Enter` (keyboard open); then on the focused item: `'5'`, `'p'`, `'c'`, `Backspace`, `ArrowRight`, `Home`, `{z,ctrl}` | `state.selected` unchanged by the keyboard open (fspec §4.2); after the keys: entries, pencil, `inputMode`, `selected`, coach state and undo stack identical to the snapshot; focus moved to Coffee Shop on `'c'` |
| HMI6 | a pointer click on the menu button deselects; outside clicks route focus | 1100×900 | select a cell; `#menu-button.click()`; then (a) focus + click a cell; reopen; (b) click a number pad digit; reopen; (c) click `main` empty area | `selected === null` after opening; (a) menu closed, focus on the cell, cell selected; (b) closed, focus `#menu-button`; (c) closed, focus `#menu-button` |
| HMI7 | Reset through the menu by keyboard, confirmed | 1100×900 | enter a digit; select via state; focus button; `Enter`, `ArrowDown`×2, `Enter`; in the dialog `Tab` to Reset, `Enter` | dialog opened with Cancel focused; after confirm: entries cleared, `selected === null`, "Puzzle reset." announced, `activeElement` is `.sudoku-grid`, grid matches `:focus-visible` with computed `outline` 2px solid, offset 3px (R14); then `ArrowRight` → focus is `.cell[data-index="0"]`… after one frame, and that cell is selected (O4) |
| HMI8 | Statistics end to end | 1100×900 | set the board to `medium`; open menu; activate Statistics; press `'5'` with a cell still selected via state; Escape | dialog `role=dialog` labelled "Statistics"; focus `#stats-close`; `readStats` (repaired regex) parses every row; the medium row's label contains "current level"; `'5'` entered nothing; after Escape: dialog closed, focus `#menu-button`, menu closed |
| HMI9 | New Puzzle with no progress: focus stays while generating, then the grid | 1100×900 | focus `#btn-new`; click; record `activeElement` synchronously; wait for a new puzzle id | during: `#btn-new`; after: `.sudoku-grid`, `selected === null` |
| HMI10 | New Puzzle over progress: confirm returns to New Puzzle, load moves to the grid; cancel returns to New Puzzle | 1100×900 | enter a digit; click `#btn-new`; confirm. Separately: cancel | confirm: focus `#btn-new` while generating, grid after load. Cancel: focus `#btn-new`, no request (puzzle id unchanged after 500 ms) |
| HMI11 | the load guard keeps an open menu open | 1100×900 | click `#btn-new` (no progress), then in the same task focus `#menu-button` and `Enter` | after the new puzzle lands: menu still open, focus on a menu item, `#mi-share` without `aria-disabled` |
| HMI12 | Share and Reset are disabled before the first puzzle and enable live | 1100×900 | open the menu immediately after the frame loads, **before** `waitForPuzzle` (fresh boot, empty cache, Hard tier so generation outlasts the open); `Enter` on Reset | while `puzzle === null`: both `aria-disabled="true"`, Reset activation opens no dialog and keeps focus. Then `waitForPuzzle`: attribute removed with the menu still open. If the puzzle arrives before the menu opens, retry the boot up to 3 times; fail if the precondition is never met (no `this.skip()`) |
| HMI13 | Difficulty path: load returns to the selector; a load closes an open menu (O3) | 1100×900 | (a) change `#difficulty-select` to `easy` via `change` event; wait for load. (b) change again, then in the same task open the menu by keyboard; wait for load | (a) focus `#difficulty-select`. (b) menu closed (`focusin` rule), focus `#difficulty-select` |
| HMI14 | busy Cancel returns focus to its origin | 1100×900 | Nightmare tier, fresh cache. (a) focus `#btn-new`, click; wait (≤ 20 s) for `.busy-cancel` to be focused; click it. (b) change the selector to Nightmare; wait for `.busy-cancel`; focus and click it | (a) focus `#btn-new`; "Puzzle search cancelled." announced. (b) focus `#difficulty-select`. If the search finishes before Cancel appears (3 s delay), retry up to 3 requests; fail if never observed |
| HMI15 | a programmatic confirmation over the open menu returns focus to the menu button | 1100×900 | open menu, `ArrowDown`; import `/js/ui/dialog.js` **inside the frame** (`frame.contentWindow.eval("import('/js/ui/dialog.js')")`, same module instance) and call `open({...})`; Escape | menu closed before the dialog takes focus; Cancel focused; after Escape focus `#menu-button` (wiring of `beforeOpen` → `closeMenu({focusButton})`) |
| HMI16 | a confirmation over the Statistics dialog closes Statistics first (O1) | 1100×900 | open Statistics via the menu; open a dialog as HMI15; Cancel | Statistics closed when the confirmation shows; one backdrop visible; after Cancel focus `#menu-button` |
| HMI17 | the win state with the menu open closes it and focuses New Puzzle | 1100×900 | seed a game one cell from solved (`seedSavedGame`); open menu by keyboard; dispatch the final `ENTER_DIGIT` via `gsOf(frame)` (dev-tools path, fspec §11) | menu closed; after a frame focus `#btn-new` |
| HMI18 | theme and Left-handed from the menu keep the menu open and the game intact | 1100×900 | snapshot state; open; activate Coffee Shop, then `#mi-hand` | body `theme-coffee`, "Theme changed to Coffee Shop." announced; `data-hand="left"` and `#numpad-root` left of the grid on the next frame; menu open; focus `#mi-hand`; game state equal to the snapshot; undo stack unchanged. Finally `Tab` → menu closed, focus `#difficulty-select` (real `nextFocus`) |
| HMI19 | wide layout: the pad's top is the grid's top in both hands and every theme | 1100×900 | for each of 5 themes × {right, left} | `#numpad-root` top − `.sudoku-grid` top within ±1px; left-hand: `.right-col` right ≤ `.grid-wrapper` left; right-hand: the reverse; tool rows: `#btn-mode`/`#btn-undo`, `#btn-coach`/`#btn-clear`, `#btn-hint`/`#btn-erase-all` tops equal (subgrid) |
| HMI20 | narrow layout stacks cluster, grid, pad identically in both hands | 400×800 | both hands | `.next-game` bottom ≤ grid top ≤ grid bottom ≤ `#numpad-root` top; `#btn-new` and `#difficulty-select` displayed |
| HMI21 | Coffee focus indicators on the page backdrop reach 3:1 (R15) | 1100×900 | Coffee; `.focus()` each of `#btn-check` (shown tier) or a digit button, `#btn-new`, `#difficulty-select`, `.sudoku-grid` | each matches `:focus-visible` (select: `:focus`); `outline-color` is `rgb(201, 169, 122)`; `contrast(outline, worst stop of body's computed background-image gradient) ≥ 3`. Dialog Close in Coffee keeps the accent (`rgb(139, 69, 19)`) |
| HMI22 | indicators on the page backdrop reach 3:1 in the other four themes | 1100×900 | same elements × Minimalist, School, Terminal, Mountain | contrast ≥ 3 against the worst background stop |
| HMI23 | a focused disabled menu item keeps a full-strength ring in every theme (vspec §8.5) | 1100×900 | each theme: open the menu, **then** set `aria-disabled="true"` on `#mi-share` (opening resyncs it), focus it | item computed `opacity: 1`; each child `opacity` 0.38 (hint 0.3); `contrast(box-shadow ring colour, item background) ≥ 3` |
| HMI24 | the grid ring is keyboard-only by rule | 1100×900 | scan `document.styleSheets` of the frame | a rule `.sudoku-grid:focus` sets `outline-style: none`; a rule `.sudoku-grid:focus-visible` sets 2px solid accent, offset 3px (pointer behavior itself is a manual check, §5) |

Contrast helper: reuse `contrast()` exported from `integration/sharing.test.js` (move it to
`_app.js` if a second file needs it). The worst stop is parsed from every `rgb()/rgba()` in
`getComputedStyle(body).backgroundImage`, falling back to `backgroundColor`.

### 3.2 `integration/system.test.js` (extended)

| ID | Name | Size | Flow | Expected |
|---|---|---|---|---|
| HMS1 | a keyboard-only player uses every menu action | 1100×900 | wait for puzzle; focus `#menu-button` (first Tab stop); `ArrowUp` → Left-handed, Enter; `Home`, `'c'`, Enter (Coffee); `Escape`; Enter → Statistics; Escape; Enter, `'s'` → Share (clipboard stubbed to fail), Enter → link field focused and selected; Dismiss; Enter, `'r'` → Reset, Enter, Enter on Reset; `Tab` from the grid | each step's focus per fspec §8.1; final: left-hand layout, Coffee, board reset, focus on the grid, then the first non-grid Tab stop is the first enabled digit button; no game state changed except by Reset |
| HMS2 | a pointer player opens, uses and dismisses the menu | 390×800 (narrow, real touch-sized layout) | click menu button; click School; click outside on a cell; click menu, click Statistics…; click Close; click menu, click Reset puzzle…, click Cancel | School applied with the menu open; outside cell click closes and selects the cell; Statistics shows and closes to `#menu-button`; Reset cancel → `#menu-button`, board unchanged; `.mi-hand-section` never displayed |

### 3.3 Repaired existing tests that also contribute coverage

Specified in aspec §13 and owned by the Implementor; listed here only for the coverage map.
A17 (Reset cancel → menu button), GF8 and reset-after-win (Reset via the menu), SHR29–37
(Share through the menu; SHR32 exercises `share`'s `returnFocus` closure in `main.js`),
SYS4 (theme items), SYS5/SYS7–SYS10 (Left-handed item, DOM order, narrow hide), DVI side-by-side
and DVI24 (menu items under dev mode), `_app.js` `readStats` regex, `arch.test.js` additions.
**Silent-skip hazard (aspec §13):** A17, GF8 and SYS4 currently `this.skip()` when their
element is missing; the QE Test Writer checks the run reports them as passed, not pending.

---

## 4. Coverage Map

Branches are taken from the aspec. Before sign-off the Test Writer re-derives them from the
actual code with c8 (`npx c8 report --reporter=html --include='js/**' --exclude='js/tests/**'`
after the `CodeCoverageV2.md` §6 URL rewrite) and adds a test for any implementation branch
not listed here (defensive `?.`, default parameters). A branch that cannot be reached is
reported to the Orchestrator for removal from the code, not left uncovered.

### 4.1 `menu.js`

| Decision point | Arm A → tests | Arm B → tests |
|---|---|---|
| `hooks.media` injected vs default `matchMedia` | MN1 ff. (injected) | MN8, HMI3 (default) |
| `_open(which)` first vs last | MN10–13 | MN14, MN15 |
| `_visibleItems` narrow vs wide | MN15, MN34, MN45 | MN14, MN33, MN44 |
| `_focusItem` previous `_current` null vs set | MN10 | MN30, MN37 |
| `close` not open → return | MN54, MN95 | MN50 |
| `close` `focusButton` true vs false | MN50, MN53 | MN55, MN93, MN100 |
| button `click` closed vs open | MN10 | MN17 |
| button keydown Enter/Space/ArrowDown vs ArrowUp vs other | MN11–13 | MN14/15; MN16 (other: not prevented) |
| … closed vs open, for Enter/Space | MN11, MN12 | MN18 |
| … open, ArrowDown/ArrowUp (no toggle) | MN19 | — |
| menu keydown: ArrowDown wrap vs not | MN31 | MN30 |
| ArrowUp wrap vs not | MN32 (from first) | MN32 (from Reset) |
| Home / End | MN33, MN34 | |
| Enter / Space → activate | MN80, MN86 | MN85, MN88 |
| Escape | MN50 | |
| Tab: Shift vs not | MN53 | MN51 |
| Tab: `nextFocus()` element vs null | MN51 | MN52 |
| ArrowLeft / ArrowRight | MN36 | |
| printable: `key.length === 1` | MN40 | MN48 |
| … `ctrlKey` / `metaKey` / `altKey` (each operand) | MN47 ×3 | MN40 |
| type-ahead match after current vs wrapped vs none | MN40 (first two), MN41 | MN40 (third), MN42, MN43; none: MN45, MN46 |
| fall-through key not prevented | MN48, MN62 | |
| `stopPropagation` (unconditional; asserted) | MN60, MN61 | |
| pointermove: `pointerType === 'mouse'` | MN70 | MN72 |
| … target is an item | MN70 | MN73 |
| … item is `_current` | MN71 | MN70 |
| item click: on an item vs not | MN74 | MN75 |
| `_activate`: Statistics | MN80, MN81 | |
| … Share/Reset disabled vs enabled | MN83, MN85 | MN82, MN84 |
| … Share vs Reset | MN82 | MN84 |
| … theme current vs not | MN87 | MN86 |
| … Left-handed | MN88 | |
| `_syncChecked`: value === current | MN20 | MN20 (others) |
| … `isLeft()` | MN21 (true) | MN21 (false) |
| `_syncDisabled`: puzzle null vs set | MN22, MN91 | MN23, MN90 |
| `changed` relevant keys vs not | MN90, MN93 | MN92 |
| … `won` changed and `state.won` | MN93 | MN94 (false); MN90 (not changed) |
| `focusin`: open vs closed | MN100 | MN102 |
| … target inside vs outside root | MN101 | MN100 |
| document `click`: open vs closed | MN103 | MN107 |
| … target inside vs outside root | MN75, MN17 | MN103 |
| … `activeElement` body / null / in `#app-menu` / elsewhere | MN103 / MN105 / MN104 | MN106 |
| `_onMediaChange`: open | MN110 | MN112 |
| … narrow | MN110 | MN113 |
| … `_current === _handItem` | MN110 | MN111 |

### 4.2 `requestFocus.js`

| Decision point | Covered by |
|---|---|
| origin new-puzzle vs difficulty | RQF1–15 vs RQF16–27 |
| status switch (each of 6 + default) | loaded RQF1/16; cancelled RQF6/18; fallback-declined RQF8/19; failed RQF12/20; replaced & needs-accept-fallback RQF28; default RQF29 |
| *nowhere*: `activeElement` null / body / neither | RQF4, RQF14, RQF27 / RQF3, RQF9, RQF13, RQF21–23 / RQF5, RQF11, RQF15 |
| *on Cancel*: has `busy-cancel` vs not | RQF2, RQF7, RQF12, RQF18–20, RQF32 / RQF5 |
| *on New Puzzle* (loaded, fallback-declined) | RQF1, RQF8 / RQF5, RQF10 |
| `doc` default | RQF30 |
| target getter null (`?.`, if present) | RQF31 |

### 4.3 `stats.js`

| Decision point | Covered by |
|---|---|
| `statsMap` null vs set | US21 vs US7 |
| row is current vs not (class and label template) | US7 (both arms) |
| no current row (null puzzle, Unrated) | US8, US9 |
| `changed` relevant vs not | US10, US4 vs US5 |
| `!tbody` guard (if kept) | US22 vs every render |
| `close` not open → return | US17, US18 vs US12 |
| keydown Escape / Tab (either shift) / other | US13 / US14 / US16 |
| return-focus element set vs cleared (`?.`, if present) | US12 vs US18 |

### 4.4 `share.js`

| Decision point | Covered by |
|---|---|
| `share()` puzzle null guard | SH17 vs SH18 |
| copy ok vs failed | SH18 vs SH19 |
| `onDismiss` → `returnFocus()` | SH19, SHR32 |
| action `NEW_PUZZLE` vs other | SH21 (both) |
| `copy` / `getHref` defaults | repaired SH16 (defaults) vs SH18 (injected) |
| `buildShareUrl` (unchanged) | repaired SH1–SH4 |

### 4.5 `themes.js`, `handedness.js`

| Decision point | Covered by |
|---|---|
| `currentTheme` found vs `?? DEFAULT_THEME` | UT9 vs UT10 |
| `THEME_OPTIONS` mapping (no branch; `DISPLAY_NAMES[c]`) | UT8 |
| `toggleHandedness` ternary | UH20 vs UH21 |

### 4.6 `dialog.js`

| Decision point | Covered by |
|---|---|
| options object omitted vs supplied | UD16 vs UD14 |
| `beforeOpen` default `null` vs function (`?.()`) | UD17, UD1–13 vs UD14, UD15 |

### 4.7 `foreground.js`

| Decision point | Covered by |
|---|---|
| `startNew` `onOutcome` default vs supplied | FG47 vs FG42–46 |

### 4.8 `keyboard.js`

| Decision point | Covered by |
|---|---|
| arrow: `activeElement === grid` | UK17, UK19 vs UK18, UK20 |
| rAF: `selected !== null` (if added) | UK17 vs UK19 |
| pre-existing arrow guard arms | existing UK tests (unchanged) |

### 4.9 `controls.js`, `numpad.js`

Markup-only changes; no new branches. UC20–UC22 and UN16–UN20 pin the structure;
existing UC/UN tests keep their arms.

### 4.10 Observable-only (CSS and markup)

`index.html`, `css/menu.css`, `base.css`, `grid.css`, `controls.css`, `stats.css` are
outside c8's scope. Behavioral coverage: HMI1–4, HMI19–24, HMS2, repaired SYS5/8/9/10.

### 4.11 `main.js` (changed lines only)

| Change | Covered by |
|---|---|
| New Puzzle handler: `_isInProgress` true vs false | HMI10 vs HMI9 |
| `_startFrom('new-puzzle' …)` / `_startFrom('difficulty' …)` and the `onOutcome` closure | HMI9–11, HMI14a / HMI13, HMI14b |
| `CHANGE_DIFFICULTY` branch's new call | HMI13 |
| `mountDialog` `beforeOpen` closure | HMI15, HMI16, every confirmation |
| menu hooks: `onStatistics`, `onShare`, `onReset`, `themes.apply`, `themes.current`, `hand.isLeft`, `hand.toggle`, `nextFocus` | HMI8, SHR29, HMI7, HMI18 (incl. `Tab` → `nextFocus`), HMS1 |
| `share` `returnFocus` closure | SHR32 (repaired), HMS1 |
| `_confirmReset` `onConfirm` → `gridEl.focus()` | HMI7, HMS1 |
| `createRequestFocus` getters (`newPuzzle`, `difficulty`, `grid`) | HMI9, HMI13, HMI14 |
| removed `?.` on `#btn-new`, removed `_afterNewPuzzle` | — (verify absent in review) |

The c8 HTML report for `main.js` is reviewed line by line: every line and branch in the
diff against `main` is executed. Pre-existing uncovered blocks (honest-fallback confirm,
`CodeCoverageV3.md` §2) stay as documented exceptions.

---

## 5. Gaps and Risks

1. **Pointer-focus suppression of the grid ring (R14) is not observable in-page.**
   Synthetic events are untrusted, so Chromium's `:focus-visible` heuristic treats every
   programmatic focus in the test page as keyboard-like (A39 relies on this). HMI7 proves
   the keyboard ring; HMI24 proves the `:focus { outline: none }` rule exists. "No ring after
   a mouse-activated Reset/New Puzzle" is a manual check with `scripts/devdrive.mjs`
   (real CDP mouse input) or a `visual-smoke.js` shot.
2. **"Keyboard open does not deselect" relies on no synthesized click.** In-page synthetic
   `keydown` never synthesizes a click, so HMI5 cannot fail for the wrong reason; the
   mechanism is pinned by MN11/MN12 (`defaultPrevented`). Confirm once with devdrive.
3. **Module singletons and accumulating document listeners (question for the
   Orchestrator).** `menu.js` registers document `focusin`/`click` listeners in `mount`,
   and every unit test mounts a fresh rig. If those listeners close over the `root` of
   their own mount, stale listeners from earlier tests will see the new rig's targets as
   "outside" and close its menu, failing tests in an order-dependent way. **Request:** the
   listeners must read module-level state (`_root`, `_open`), or `menu.js` exposes a
   test-only reset. Same consideration for `stats.js` if it adds any document listener.
   **Resolved (Orchestrator, 2026-11-27):** the implementation's document listeners read
   module-level state (`_opened`, `_root`, `_menu`), which `mount` resets; stale
   listeners act on the latest rig and are idempotent. No test-only reset. If a test
   observes order dependence, flag it as a production bug rather than adding a reset.
4. **Unreachable-by-input arms.** `activeElement === null` (MN105, RQF4/14/27) and the
   "open but focus elsewhere" click arm (MN106) need a stubbed `activeElement`; acceptable at
   unit level. The honest fallback (accepted/declined) is not seed-controllable through the
   UI; its focus policy is covered by RQF8–11/19/22/25 and FG45, consistent with the
   existing V3 exception.
5. **Timing-dependent integration tests.** HMI12 (before the first puzzle) and HMI14 (busy
   Cancel after its 3 s delay) race real generation. Both use cold, slow tiers and a
   bounded retry that fails, never skips. HMI11/HMI13b avoid races by acting in the same task
   as the click/change.
6. **Viewport.** All menu/cluster tests run at ≥1100 wide unless narrow is the point;
   HMI3 pins both sides of the 720px boundary. Do not run menu assertions in the 1px frames
   used by parts of `game-flows.test.js`.
7. **Clipboard.** HMS1 stubs `navigator.clipboard` in the app frame to force the
   fallback, per the sharing tspec precedent.
8. **Performance.** Nothing approaches 1 s (aspec §16): opening the menu, theme/hand swaps
   and the Statistics toggle are attribute/class changes over pre-rendered DOM. No
   performance test is added; HMI18 asserts the layout swap is visible on the next frame,
   which is far inside the budget.
9. **Out of scope, not tested:** game-key isolation in the confirmation dialog (aspec §18),
   `inert` on the page behind dialogs.
