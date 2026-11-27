# Visual Design Spec: Hamburger Menu and Control Consolidation
**ID:** vspec-008-hamburger-menu
**Status:** Final
**Date:** 2026-11-27
**Author:** Visual Designer
**Based on:** fspec-008-hamburger-menu, rspec-008-hamburger-menu
**Approved mockup:** `docs/mockups/hamburger-menu-v3.html` (Product Director, 2026-11-27,
including the 6px tool-button side padding at the current number pad width)
**Extends:** vspec-001-v1, vspec-004-left-hand, vspec-006-puzzle-sharing

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Layout Model](#2-layout-model)
3. [Header and Menu Button](#3-header-and-menu-button)
4. [Menu](#4-menu)
5. [Next-Game Cluster](#5-next-game-cluster)
6. [Number Pad](#6-number-pad)
7. [Statistics Dialog](#7-statistics-dialog)
8. [Focus Indicators](#8-focus-indicators)
9. [Theme-Specific Overrides](#9-theme-specific-overrides)
10. [Narrow Viewports](#10-narrow-viewports)
11. [Board Column Below the Grid](#11-board-column-below-the-grid)
12. [CSS Changes by File](#12-css-changes-by-file)
13. [Overrides of Existing Visual Specs](#13-overrides-of-existing-visual-specs)
14. [Out of Scope Findings](#14-out-of-scope-findings)

---

## 1. Scope and Conventions

This spec covers the look and layout of everything fspec-008 adds or moves: the menu
button and menu, the next-game cluster, the regrouped number pad, the Statistics dialog,
the wide-layout alignment of the control column, and focus indicators, including the
Coffee contrast fixes required by rspec-008 R14 and R15. Behavior, roles, accessible
names and announcements are fspec-008's; they are repeated here only where markup shapes
the visuals.

**No new color tokens.** Every value is an existing theme custom property or a literal
the app already uses for that theme (vspec-004 §2.4 header tones). A theme added later
inherits everything in §§3–8 through its tokens. §9 lists the only per-theme rules.

**Breakpoint.** *Narrow* is `@media (max-width: 720px)`. *Wide* is
`@media not all and (max-width: 720px)`, its exact complement (vspec-004 §3). The
mockup expresses both as container queries on a mock frame (`@container app`, `cqw`);
the app keeps media queries and `vw`.

**Provenance.** *[v3]* marks a value taken verbatim from the approved mockup. *[R15]*
marks a value added by this spec after approval, to meet rspec-008 R15; it is not in the
mockup. Values from the existing stylesheets are marked *(unchanged)*.

---

## 2. Layout Model

### 2.1 DOM (unchanged order)

```
header            h1, .menu-wrap (button + menu)
main
  .game-area#app-root
    .left-col     #controls-root (cluster), .grid-wrapper, #busy-root, #notice-root,
                  #coach-panel-wrap, #coach-recap
    .right-col    #numpad-root            ← action row and #stats-root removed
footer
#dialog-root, #stats-dialog-root
```

DOM order is reading and Tab order (fspec-008 §2). No layout rule below reorders it.

### 2.2 Wide (> 720px) [v3]

`.game-area` is a two-column CSS grid. `.left-col` is `display: contents`, so each
board-column child becomes a row of column 1. The control column is placed in the grid's
row, so **the number pad's top edge is the grid's top edge**, whatever the cluster's height.

```css
@media not all and (max-width: 720px) {
  .game-area {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 32px;           /* was flex gap: 32px */
    row-gap: 14px;              /* was .left-col gap: 14px */
    justify-content: center;
    align-items: start;
  }
  .left-col { display: contents; }
  .left-col > * { grid-column: 1; }
  .left-col > #controls-root { grid-row: 1; }
  .right-col { grid-column: 2; grid-row: 2; }

  html[data-hand="left"] .left-col > * { grid-column: 2; }
  html[data-hand="left"] .right-col { grid-column: 1; }
}
```

- Every other board-column child is auto-placed in column 1 in DOM order: the grid
  wrapper goes in row 2, then the busy card, notice, coach panel and recap in rows 3 and
  later. Children with `hidden` or `display: none` (busy root, notice root, an idle
  recap) make no row. The always-present `#coach-panel-wrap` (height 0 while closed)
  makes a zero-height row, exactly as it made a zero-height flex item before (§11).
- `.left-col` has no role and no styling of its own, so removing its box changes no
  semantics. `.game-area`'s `width: 100%` and `max-width: 860px` are unchanged.
- **Left-hand mode** swaps the two `grid-column` values. It replaces vspec-004 §3's
  `flex-direction: row-reverse`. It is instant, with no transition (unchanged).
- **Caveat.** A control column taller than the grid would make the grid's row taller and
  push the cards below the grid down. They would never overlap. Today the pad is 333px
  (Terminal) to 344px against a 414px grid, so this cannot happen at current content.

**Measured (v3, 1100px window):** pad top − grid top = **0px** in all five themes in both
hands (grid top 137px; 138px in School, whose 2px header border moves the whole board down 1px). The board column
matches v2 to 0.1px, and only the pad moves, by 48px (34px cluster + 14px gap). With a
30px Difficulty label injected to simulate a font change, the grid moved to 145px and the
pad followed (Δ 0).

### 2.3 Narrow (≤ 720px)

Unchanged from vspec-001 §8.2: `.game-area` is a flex column (`align-items: center`,
`gap: 18px`), `.left-col` a centred flex column, and `.right-col` `width: 100%`,
`max-width: 414px`. The wide-only grid rules do not apply. Order: cluster, grid, cards,
number pad. Both hands are identical (vspec-004 §4).

### 2.4 Control column

`.right-col` now holds only `#numpad-root`. Its rules (`flex-direction: column`,
`gap: 20px`, `min-width: 220px`, `flex-shrink: 0`) are unchanged. Its width is still
content-sized: 231.9px in Minimalist, Coffee, School and Mountain, and 291.7px in
Terminal (uppercase labels). These are the same widths as before this feature.

---

## 3. Header and Menu Button

### 3.1 Header

- Contents: `h1` then `.menu-wrap`. `justify-content: space-between` (unchanged) puts the
  button at the right end. **The header is never mirrored**: the button stays right in
  both hands and at every width (R1).
- Add `position: relative; z-index: 50` to `header`, so the menu overlays `main`. [v3]
- `.menu-wrap { position: relative; }`, which anchors the menu. [v3]
- Removed: `.header-controls`, `.theme-control`, `#theme-select`, `.hand-switch` (§12).

### 3.2 Menu button [v3]

Markup: `<button type="button" class="menu-button" aria-haspopup="menu"
aria-expanded="false" aria-controls="app-menu" aria-label="Menu">` containing an inline
SVG icon (`width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"
focusable="false"`). The icon is three `<rect>`s with `x="2" width="16" height="2" rx="1"
fill="currentColor"` at `y="4"`, `y="9"` and `y="14"`, plus `.menu-button svg { display: block; }`.

| Property | Value |
|---|---|
| Box | `inline-flex`, centred; `36px × 36px`; `padding: 0` |
| Border | `1px solid transparent`; `border-radius: 5px` |
| Background | `none` |
| Color | `inherit` (the header text color) |
| Cursor | `pointer` |
| Transition | `background 0.1s, border-color 0.1s` |

| State | Rule |
|---|---|
| Hover, and open (`[aria-expanded="true"]`) | `background: var(--btn-hover)`; `border-color: var(--btn-border)` |
| Focus (`:focus-visible`) | `outline: 2px solid var(--accent)`; `outline-offset: 2px` |
| Disabled | None. The button is always enabled |

The open state is the same as hover, so the button reads as pressed while its menu shows.
For per-theme values see §9.1.

---

## 4. Menu

### 4.1 Structure

```html
<div class="app-menu" id="app-menu" role="menu" aria-label="Menu" hidden>
  <div class="menu-section" role="none">
    <div class="menu-heading" id="mh-game" aria-hidden="true">Game</div>
    <div role="group" aria-labelledby="mh-game">
      <div class="mi" role="menuitem" tabindex="-1" id="mi-stats"
           aria-haspopup="dialog" aria-label="Statistics">
        <span class="mi-label">Statistics…</span></div>
      <div class="mi" role="menuitem" tabindex="-1" id="mi-share" aria-label="Share puzzle link">
        <span class="mi-label">Share puzzle</span>
        <span class="mi-hint" aria-hidden="true">Copy link</span></div>
      <div class="mi" role="menuitem" tabindex="-1" id="mi-reset"
           aria-haspopup="dialog" aria-label="Reset puzzle">
        <span class="mi-label">Reset puzzle…</span></div>
    </div>
  </div>
  <div class="menu-section" role="none">
    <div class="menu-heading" id="mh-settings" aria-hidden="true">Settings</div>
    <div class="menu-subheading" id="mh-theme" aria-hidden="true">Theme</div>
    <div role="group" aria-labelledby="mh-settings mh-theme">
      <!-- one per theme, in theme order -->
      <div class="mi" role="menuitemradio" tabindex="-1" aria-checked="…" data-theme="…">
        <span class="mi-radio" aria-hidden="true"></span>
        <span class="mi-label">Minimalist</span>
        <span class="mi-swatch" aria-hidden="true" style="background: …"></span></div>
    </div>
    <div class="mi-hand-section" role="group" aria-labelledby="mh-settings">
      <div class="mi" role="menuitemcheckbox" tabindex="-1" aria-checked="…" id="mi-hand">
        <span class="mi-label">Left-handed</span>
        <span class="mi-switch-track" aria-hidden="true"><span class="mi-switch-thumb"></span></span>
      </div>
    </div>
  </div>
</div>
```

The menu is a child of `.menu-wrap`, after the button.

### 4.2 Panel [v3]

| Property | Value |
|---|---|
| Position | `absolute`; `top: calc(100% + 6px)`; `right: 0` (right-aligned to the button in every layout) |
| Size | `width: 248px`; `max-height: calc(100vh - 80px)`; `overflow-y: auto` |
| Padding | `6px 0` |
| Background / text | `var(--modal-bg)` / `var(--text)` |
| Border | `1px solid var(--border)`; `border-radius: 8px` |
| Shadow | `0 8px 28px rgba(0,0,0,0.18)` |
| Type | `font-size: 14px`; `text-transform: none`; `letter-spacing: normal` (header styles must not leak in) |
| Hidden | `.app-menu[hidden] { display: none; }` |
| Entry | `animation: menu-in 0.12s ease-out`; `@keyframes menu-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }` |
| Reduced motion | `@media (prefers-reduced-motion: reduce) { .app-menu { animation: none; } }` |
| Exit | None; the menu disappears at once |

### 4.3 Sections and headings [v3]

| Element | Rule |
|---|---|
| `.menu-section + .menu-section` | `margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border)` |
| `.menu-heading` | `padding: 6px 14px 4px`; `font-size: 11px`; `font-weight: 700`; `letter-spacing: 0.08em`; `text-transform: uppercase`; `color: var(--text-muted)` |
| `.menu-subheading` | `padding: 8px 14px 2px`; `font-size: 12px`; `font-weight: 600`; `color: var(--text-muted)` |

### 4.4 Items [v3]

| Element | Rule |
|---|---|
| `.mi` | `display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 14px; cursor: pointer; user-select: none; outline: none; transition: background 0.08s` |
| `.mi-label` | `flex: 1` |
| `.mi-hint` (Share's "Copy link") | `font-size: 12px; color: var(--text-muted)` |

| State | Rule |
|---|---|
| Rest | No background; `var(--text)` |
| Focused, by pointer hover or keyboard (`.mi:focus`) | `background: var(--accent-light); color: var(--accent)`. `.mi:focus .mi-hint { color: inherit; opacity: 0.8; }` |
| Keyboard focus (`.mi:focus-visible`) | Adds `box-shadow: inset 0 0 0 2px var(--accent)` |
| Disabled (`[aria-disabled="true"]`) | `cursor: not-allowed`; the item stays at `opacity: 1`, and its children (`.mi[aria-disabled="true"] > *`) take `opacity: 0.38` [R15] |
| Disabled and focused (`[aria-disabled="true"]:focus`) | `background: var(--btn-hover); color: var(--text)`; `.mi[aria-disabled="true"]:focus .mi-hint { opacity: 0.3; }` [R15] |

Pointer hover moves focus to the item (fspec-008 §4.4), so hover and keyboard focus
share one highlight. Keyboard focus adds the inset ring.

**Departure from v3 [R15].** v3 put `opacity: 0.38` on the whole disabled item, which
also faded the item's background and focus ring. The ring fell below 3:1 in every theme.
Putting the opacity on the children dims the text exactly as before, while the
background and ring draw at full strength (§8.5). The hint rule is needed because
`.mi:focus .mi-hint` (opacity 0.8) outranks the children rule. 0.3 ≈ 0.38 × 0.8, which
keeps v3's look.

### 4.5 Theme radio and swatch [v3]

| Element | Rule |
|---|---|
| `.mi-radio` | `position: relative; flex-shrink: 0; width: 14px; height: 14px; border: 1.5px solid var(--text-muted); border-radius: 50%` |
| Checked (`.mi[aria-checked="true"] .mi-radio`) | `border-color: var(--accent)`; `::after { content: ""; position: absolute; inset: 2px; border-radius: 50%; background: var(--accent); }` |
| `.mi-swatch` | `flex-shrink: 0; width: 18px; height: 12px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.25)` |

Each swatch shows a fixed diagonal split of that theme's page background and its accent.
The swatches are the same in every active theme:

| Item | `background` |
|---|---|
| Minimalist | `linear-gradient(135deg, #f7f6f2 55%, #2c5282 55%)` |
| Coffee Shop | `linear-gradient(135deg, #3b2a1a 55%, #c9a97a 55%)` |
| School | `linear-gradient(135deg, #f8f5e6 55%, #4a5568 55%)` |
| Digital Terminal | `linear-gradient(135deg, #0d0d0d 55%, #39ff14 55%)` |
| Mountain | `linear-gradient(135deg, #1a3a52 55%, #d4e8f5 55%)` |

### 4.6 Left-handed switch graphic [v3]

This is vspec-004 §2.2's track and thumb, drawn on the menu surface. It has no per-theme
header overrides.

| Element | Rule |
|---|---|
| `.mi-switch-track` | `position: relative; flex-shrink: 0; width: 32px; height: 18px; border: 1px solid var(--text-muted); border-radius: 9px; background: var(--btn-bg); transition: background 0.15s, border-color 0.15s` |
| `.mi-switch-thumb` | `position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--text-muted); transition: transform 0.15s, background 0.15s` |
| On | Track `border-color` and `background: var(--accent)`; thumb `transform: translateX(14px); background: var(--surface)` |
| Reduced motion | No track or thumb transitions |

---

## 5. Next-Game Cluster

### 5.1 Markup

Inside `.difficulty-row` (unchanged: `flex`, `align-items: center`, `gap: 10px`, the
visible "Difficulty" label first):

```html
<label for="difficulty-select">Difficulty</label>
<div class="next-game" role="group" aria-label="Next game">
  <select id="difficulty-select" aria-label="Select difficulty level">…</select>
  <button type="button" class="btn btn-new" id="btn-new" aria-label="Start new puzzle">New Puzzle</button>
</div>
```

### 5.2 Styling [v3]

Select and button share one border, so they read as a single control.

| Element | Rule |
|---|---|
| `.next-game` | `display: inline-flex; align-items: stretch` |
| `.next-game #difficulty-select` | `height: 34px; border-top-right-radius: 0; border-bottom-right-radius: 0; position: relative`. Other select styling is unchanged (vspec-001 §7) |
| `.next-game .btn.btn-new` | `height: 34px; margin-left: -1px; padding: 0 14px; border-top-left-radius: 0; border-bottom-left-radius: 0; border-color: var(--btn-border); box-shadow: none`. The other states (hover, disabled) are the base `.btn` |
| Raise on focus/hover | `.next-game #difficulty-select:focus, .next-game .btn-new:focus-visible, .next-game .btn-new:hover { z-index: 1; position: relative; }`, so the ring and hover border sit above the shared border |

The cluster is 34px tall in every theme and visible at every width. For per-theme rules see §9.

---

## 6. Number Pad

### 6.1 Markup

```html
<div class="numpad" role="group" aria-label="Number pad">      <!-- was role="toolbar" -->
  <div class="numpad-digits">…9 × .btn.btn-digit…</div>
  <div class="numpad-tools">
    <div class="tool-group" role="group" aria-label="Input and help">
      #btn-mode (Pen/Pencil) · #btn-coach · #btn-hint
    </div>
    <div class="tool-group" role="group" aria-label="Corrections">
      #btn-undo · #btn-clear · #btn-erase-all
    </div>
  </div>
  <div class="numpad-bottom-row2"> #btn-check </div>
  <div class="completion-msg" … hidden></div>
</div>
```

The buttons keep their classes, labels, badge, accessible names and states (vspec-001
§5.2–5.8, vspec-002). The rows `.numpad-utils`, `.numpad-undo-row` and
`.numpad-bottom-row1` are removed.

### 6.2 Grouping: spacing and a hairline, no visible heading [v3]

The two columns read as two groups through a gutter 14px wide against 6px between
buttons, with a 1px rule centred in it. There is no visible group label (fspec-008
§7.3). The block sits 12px from the digits and from Check (the pad's 8px gap plus a 4px
margin), so it reads as one unit with two halves.

```css
.numpad-tools {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(3, auto);
  column-gap: 14px;
  row-gap: 6px;
  margin: 4px 0;
}
.numpad-tools::before {               /* divider */
  content: "";
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 50%;
  width: 1px;
  margin-left: -0.5px;
  background: var(--border);
  pointer-events: none;
}
.tool-group {
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: subgrid;        /* rows shared across both columns */
  row-gap: 6px;
}
.tool-group .btn {
  padding-left: 6px;                  /* was 8px; approved */
  padding-right: 6px;
}
```

- **Width is unchanged.** The column's width comes from "Erase all pencil" at
  min-content. The 8px of extra gutter is paid for by 2px less side padding on each tool
  button. "Erase all pencil" therefore sits with 6px side padding. The Product Director
  approved this.
- **Rows** are shared through `subgrid`, so the two columns line up row by row. The row
  heights are the same as today's: row 1 takes the two-line Pen/Pencil height (46px; 45px
  in Terminal), row 2 is 36px (34px), and row 3 takes Hint's badge height (40px). The pad
  is 344px tall (Terminal 333px).
- **Divider** color is `var(--border)` in every theme. It is clearly visible in Coffee
  (`#c9a97a` on the dark backdrop) and Mountain. In Terminal it is faint but matches the
  button borders. In School it crosses the ruled lines like a margin rule. No per-theme
  override.
- **Coaching state.** The Coach button's pulsing ring (vspec-002, up to 5px) fits within
  the 6px row gaps above and below it.
- `.numpad-bottom-row2` and `.btn-check` keep `width: 100%` (unchanged). Check stays
  hidden on tiers without it (vspec-001 §5.4), and the 4px block margin stays.

---

## 7. Statistics Dialog

The same modal shell and backdrop as the confirmation dialog (vspec-001 §4.11, §5.5),
with a second root `#stats-dialog-root`:

```html
<div class="modal-backdrop" id="stats-backdrop" role="dialog" aria-modal="true"
     aria-labelledby="stats-dialog-title">
  <div class="modal modal-stats">
    <h2 id="stats-dialog-title">Statistics</h2>
    <div class="stats-panel">
      <table class="stats-table" aria-label="Game statistics by difficulty">…</table>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="stats-close">Close</button>
    </div>
  </div>
</div>
```

| Element | Rule [v3] |
|---|---|
| `.modal.modal-stats` | `max-width: 340px` (as `.modal`) |
| `.modal-stats h2` | `margin-bottom: 14px` (was 8px for the confirmation, which has body text) |
| `.modal-stats .stats-panel` | `margin-bottom: 20px` |

- The table, the active-row treatment (vspec-001 §5.7) and Terminal's `" >"` marker are
  unchanged. The panel's `.stats-heading` is not rendered: the dialog title replaces it.
- Close is the only button, styled `.btn-primary`, right-aligned by `.modal-actions`.
- The page behind the dialog is inert while it is open. The backdrop has the
  confirmation's color, with no click action.

---

## 8. Focus Indicators

### 8.1 Inventory after this feature

| Element | Indicator | Sits on |
|---|---|---|
| Number pad buttons, Check (`.btn:focus-visible`) | `outline: 2px solid var(--accent); outline-offset: 2px` (unchanged) | Page backdrop |
| New Puzzle (`.btn`) | Same as above | Page backdrop |
| Difficulty selector (`#difficulty-select:focus`) | `outline: 2px solid var(--accent); outline-offset: 2px` (unchanged) | Page backdrop |
| Grid (`.sudoku-grid:focus-visible`) | New, §8.2 (R14) | Page backdrop |
| Grid cell (`.cell:focus-visible`; a focused cell is selected) | `outline: 2px solid var(--accent); outline-offset: -2px` on `var(--accent-light)` (unchanged). Conflict: `var(--conflict)` on `var(--conflict-bg)`. Coached: `var(--coach)` on `var(--coach-light)` | Cell |
| Menu button | §3.2, with header overrides §9.1 | Header |
| Menu item | `inset 0 0 0 2px var(--accent)` on `var(--accent-light)` | Menu item |
| Dialog buttons (Cancel, confirm, Close) | `.btn:focus-visible` | `var(--modal-bg)` |
| Busy card Cancel, notice Dismiss | `.btn:focus-visible` | `var(--surface)` |
| Notice link field (`.notice-field:focus`) | `outline: 2px solid var(--accent); outline-offset: 1px` (unchanged) | `var(--surface)` |
| Footer link | Browser default (unchanged, not restyled) | Footer |

### 8.2 Grid focus indicator (R14) [v3]

The grid element itself takes focus after a confirmed Reset and after a New Puzzle load,
with no cell selected (fspec-008 §3.4, §5.4). It shows a ring for keyboard focus only:

```css
.sudoku-grid:focus { outline: none; }
.sudoku-grid:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;              /* clears the 2.5px box border */
}
body.theme-coffee .sudoku-grid:focus-visible { outline-color: #c9a97a; }
```

- `:focus-visible` follows the browser heuristic. After a keyboard-activated Reset or New
  Puzzle, the programmatic focus shows the ring. After a mouse-activated one it does not,
  and the first arrow key or Home then selects row 1, column 1 with its usual cell
  outline. This is the approved behavior.
- The `outline: none` on plain `:focus` removes the browser default ring for pointer focus.
- The ring is drawn outside the grid's `overflow: hidden` box, so it is not clipped. The
  win banner is inside the wrapper and does not cover it.

### 8.3 Coffee: 3:1 for every indicator (R15) [R15]

Coffee's accent `#8b4513` is close in luminance to its page backdrop, a gradient of
`#3b2a1a`–`#4a3020`. Every indicator drawn on the backdrop switches to the Coffee border
and header tone `#c9a97a`, the color already used for Coffee's header focus rings
(vspec-004 §2.4). Indicators drawn on a light surface keep the accent, which passes there.

```css
body.theme-coffee .numpad .btn:focus-visible,
body.theme-coffee .next-game .btn-new:focus-visible,
body.theme-coffee #difficulty-select:focus,
body.theme-coffee .sudoku-grid:focus-visible {   /* repeated from §8.2 */
  outline-color: #c9a97a;
}
```

The disabled menu item fix applies to **all themes**, not just Coffee. See §8.5.

The selectors are scoped (`.numpad`, `.next-game`) so that `.btn` rings on light
surfaces in Coffee (dialog buttons, busy card Cancel, notice Dismiss) keep the accent.
`#c9a97a` on `#f5ede0` would be about 1.9:1.

**Coffee contrast, before → after.** Ratios are WCAG relative luminance, computed from the
token values and checked against computed styles in a rendered scratch copy. Where the
background is a gradient, the worst stop is given.

| Indicator | Background | Before | After |
|---|---|---|---|
| Number pad buttons, Check | Page `#3b2a1a`–`#4a3020` | `#8b4513`: **1.71** (1.93 at `#3b2a1a`) | `#c9a97a`: **5.44** (6.16) |
| New Puzzle | Page | **1.71** | **5.44** |
| Difficulty selector | Page | **1.71** | **5.44** |
| Grid (new) | Page | — (browser default) | **5.44** |
| Disabled menu item, focused (§8.5) | Item `#e0cead` (all at 0.38 over `#f5ede0`) | ring `#cdad92` on `#ede1cd`: **1.63** | `#8b4513` on `#e0cead`: **4.60** |
| Menu item ring | `#fde8cc` (accent-light) | 5.95 | 5.95 (no change) |
| Menu button | Header `#2b1d0e` | `#c9a97a`: 7.35 | 7.35 (no change) |
| Dialog buttons, Statistics Close | `#f5ede0` | `#8b4513`: 6.11 | 6.11 (no change) |
| Busy Cancel, notice Dismiss, link field | `#f5ede0` | 6.11 | 6.11 (no change) |
| Cell focus | `#fde8cc` | 5.95 | 5.95 (no change) |
| Cell focus, conflict | `#fdf0ee` | `#c0392b`: 4.89 | 4.89 (no change) |
| Cell focus, coached | `#ffedd5` | `#c2410c`: 4.52 | 4.52 (no change) |

### 8.4 Other themes (checked; only the disabled menu item changed)

| Indicator | Minimalist | School | Terminal | Mountain |
|---|---|---|---|---|
| `.btn` / select / grid on page | 7.37 | 6.88 (3.72 where a ring crosses a `#a8b8cc` ruled line) | 14.33 | 4.74 (worst gradient stop `#d4e8f5`) |
| Menu button on header | 7.97 | 7.21 | 14.69 | `#adc6de` on `#1a3a52`: 6.72 |
| Menu item ring on accent-light | 6.53 | 6.10 | 11.49 | 4.69 |
| Disabled menu item, focused: before (v3) → after (§8.5) | **1.72 → 6.05** | **1.73 → 6.10** | **2.66 → 11.13** | **1.58 → 4.23** |
| Dialog / card buttons on modal or surface | 7.97 | 7.21 | 13.93 | 5.70 |
| Cell focus (accent / conflict / coach) | 6.53 / 5.91 / 4.80 | 6.10 / 5.11 / 5.49 | 11.49 / 5.77 / 3.16 | 4.69 / 5.91 / 4.86 |

Before §8.5 every indicator passed 3:1 except the disabled-focused menu item. After it,
every indicator passes in all five themes.

### 8.5 Disabled menu item focus, all themes [R15]

This was in-scope finding 1 of the first draft. The Product Director approved it for all
themes on 2026-11-27.

In v3, `opacity: 0.38` was on the whole disabled item. That faded the item's
`var(--btn-hover)` background and its inset focus ring along with the label. Now the
opacity goes on the children instead:

```css
.mi[aria-disabled="true"] { cursor: not-allowed; }            /* no item opacity */
.mi[aria-disabled="true"] > * { opacity: 0.38; }
.mi[aria-disabled="true"]:focus .mi-hint { opacity: 0.3; }    /* beats .mi:focus .mi-hint */
```

The label and hint render as in v3: about 0.38 for the label and about 0.3 for the
focused hint. The focused background and ring are now at full strength.

| Theme | Ring on background | Before (blended at 0.38 over `--modal-bg`) | After |
|---|---|---|---|
| Minimalist | `#2c5282` on `#e4e0d7` | 1.72 | **6.05** |
| Coffee Shop | `#8b4513` on `#e0cead` | 1.63 | **4.60** |
| School | `#4a5568` on `#e2e8f0` | 1.73 | **6.10** |
| Digital Terminal | `#39ff14` on `#162b16` | 2.66 | **11.13** |
| Mountain | `#1a6b8a` on `#c8dcea` | 1.58 | **4.23** |

The "after" values were re-verified in a rendered scratch copy of v3 with these rules
added. Playwright read the computed ring and background colors of the focused, disabled
Share item in each theme; the item's computed opacity was 1. The same render confirmed
the hint opacity: 0.8 without the third rule, 0.3 with it.

---

## 9. Theme-Specific Overrides

All per-theme rules this feature adds. Everything else comes from tokens.

### 9.1 Menu button [v3]

| Theme | Hover / open background | Hover / open border | Focus outline | Other |
|---|---|---|---|---|
| Minimalist, School | `var(--btn-hover)` | `var(--btn-border)` | `var(--accent)` | — |
| Coffee Shop | `#3b2a1a` | `#7c4f22` | `#c9a97a` | — |
| Mountain | `#2d5878` | `#4d7a99` | `#adc6de` | — |
| Digital Terminal | `var(--btn-hover)` | `var(--accent)` | `var(--accent)` | `border-radius: 0`; `color: var(--accent)`; hover/open adds `box-shadow: 0 0 6px rgba(57,255,20,0.2)` |

Coffee and Mountain use the dark-header tones of vspec-004 §2.4.

### 9.2 Menu [v3, plus R15 where marked]

| Theme | Rule |
|---|---|
| Coffee Shop | `.app-menu { box-shadow: 0 8px 28px rgba(59,42,26,0.45); }` |
| Mountain | `.app-menu { box-shadow: 0 8px 28px rgba(26,58,82,0.25); }` |
| Digital Terminal | `.app-menu { border-radius: 0; border-color: var(--accent); box-shadow: 0 0 18px rgba(57,255,20,0.2); }`. `.menu-heading { color: var(--accent); letter-spacing: 0.15em; font-size: 10px; }`. `.menu-subheading { text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px; }`. `.mi { text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }`. `.mi:focus { text-shadow: 0 0 4px rgba(57,255,20,0.3); }`. `.mi-radio` and the checked dot `border-radius: 0`. `.mi-swatch { border-radius: 0; }`. `.mi-switch-track, .mi-switch-thumb { border-radius: 0; }`. On-state thumb `background: #000` |

### 9.3 Cluster [v3]

| Theme | Rule |
|---|---|
| Coffee Shop | `.next-game { border-radius: 6px; box-shadow: 0 1px 3px rgba(59,42,26,0.15); }` |
| Mountain | `.next-game { border-radius: 6px; box-shadow: 0 1px 3px rgba(26,58,82,0.1); }` |
| Digital Terminal | `.next-game .btn-new { border-color: var(--accent); }` (matches the select's Terminal border) |

The `.btn` theme rules still apply to New Puzzle: Coffee's own shadow, which is cancelled
in the cluster by `box-shadow: none`; Terminal's square corners and uppercase 12px type;
and the radii. The cluster's shared inner edge stays square in every theme.

### 9.4 Focus [v3 grid, R15 rest]

Coffee only: §8.2 and §8.3. The disabled menu item fix (§8.5) applies in every theme
and has no per-theme rule.

### 9.5 Number pad and dialog

No per-theme rules. The existing `.btn` and `.modal` theme rules apply.

---

## 10. Narrow Viewports (≤ 720px)

| Element | Rule |
|---|---|
| Layout | Stacked, §2.3; identical in both hands |
| Header | Unchanged mobile padding (`12px 16px`); menu button at the right |
| Menu panel | `width: min(300px, calc(100vw - 24px)); right: -4px` [v3] |
| Menu items | `min-height: 44px` (touch target) [v3] |
| Left-handed item | `.mi-hand-section { display: none; }`, which hides the item and its "Settings" group (R6) [v3] |
| Cluster | Unchanged; fits at 390px |
| Number pad | `.right-col` `width: 100%; max-width: 414px`. The tool columns widen evenly; gutter, divider and row gaps unchanged |
| Statistics dialog | `.modal` `width: 90%`, `max-width: 340px` (unchanged) |

The menu stays a dropdown at narrow widths. It is not a sheet or drawer.

---

## 11. Board Column Below the Grid

These items were checked under the §2.2 grid in a scratch copy of v3 with the app's
`#coach-panel-wrap` and `#coach-recap` markup added. The coach panel was open, the recap
visible and the notice showing; each was also checked empty. Positions at 1100px:

| Element | Top (v2 flex / v3 grid) | Width | Note |
|---|---|---|---|
| Grid wrapper | 137 / 137 | 414 | — |
| Notice | 565 / 565 | 414 | Grid bottom 551 + 14 gap |
| Coach panel wrap (open) | 634.5 / 634.5 | 414 | Its own `margin-top: 10px` sits inside the wrap |
| Coach recap (visible) | 745 / 745 | 414 | — |
| Coach panel wrap (closed, empty) | 565 / 565, height 0 | 414 | Zero-height row, with the same trailing 14px as the zero-height flex item it was |

Results:
- The two models give identical results in both hands, and the game-area height is
  identical (476px idle, 729px with all three cards).
- The busy card (vspec-003) and notice (vspec-006 §3) stack the same way. In the v3
  check the busy card sat at 565–752 and the notice below it at 766.
- The control column ends at 481px, above every card, and is in its own column. Nothing
  overlaps or clips.
- `#coach-overlay` and the win banner are absolutely positioned inside `.grid-wrapper`,
  which does not move, so they are unaffected.

---

## 12. CSS Changes by File

Mockup provenance: the v3 file copies these stylesheets as they stood at `dd12413`.

### 12.1 `css/base.css`

| Change | Rules |
|---|---|
| Remove | `.header-controls`; `.theme-control`, `.theme-control label`, `body.theme-mountain .theme-control`, `body.theme-coffee .theme-control` |
| Remove | `@media not all and (max-width: 720px) { html[data-hand="left"] .game-area { flex-direction: row-reverse; } }` (replaced by §2.2) |
| Keep | `.game-area`, `.left-col`, `.right-col` base flex rules and the `@media (max-width: 720px)` block. They are the narrow model and the fallback |
| Add | §2.2 wide grid block |
| Add | `header { position: relative; z-index: 50; }`; `.menu-wrap`; `.menu-button` and states (§3.2) |
| Add | `.app-menu`, `@keyframes menu-in`, `.menu-section`, `.menu-heading`, `.menu-subheading`, `.mi*` (§4), including the disabled item rules of §8.5 (no item `opacity`; children 0.38; focused hint 0.3); theme rules §9.1–9.2; narrow rules §10. A separate `css/menu.css` is equally acceptable (Architect's call) |

### 12.2 `css/grid.css`

| Change | Rules |
|---|---|
| Add | `.next-game` cluster rules (§5.2, §9.3) |
| Add | `.sudoku-grid:focus`, `.sudoku-grid:focus-visible`, Coffee override (§8.2) |
| Add | `body.theme-coffee #difficulty-select:focus { outline-color: #c9a97a; }` (§8.3) |

### 12.3 `css/controls.css`

| Change | Rules |
|---|---|
| Remove | `.numpad-utils`, `.numpad-bottom-row1`, `.numpad-undo-row` |
| Remove | `.action-row`, `#btn-share` |
| Remove | `#theme-select` and all its theme and focus variants (`body.theme-* #theme-select`, `.theme-control #theme-select`, `:focus` overrides) |
| Remove | `.hand-switch`, `.hand-switch-track`, `.hand-switch-thumb` and all their state, theme, reduced-motion and `@media (max-width: 720px)` rules |
| Keep | `.numpad`, `.numpad-digits`, `.numpad-bottom-row2`, `.btn*` and the rest unchanged |
| Add | `.numpad-tools`, `.numpad-tools::before`, `.tool-group`, `.tool-group .btn` (§6.2) |
| Add | Coffee focus rules for `.numpad .btn` and `.next-game .btn-new` (§8.3). These may sit with the menu rules instead |

### 12.4 `css/stats.css`

| Change | Rules |
|---|---|
| Add | `.modal.modal-stats`, `.modal-stats h2`, `.modal-stats .stats-panel` (§7) |
| Remove | `.stats-heading` and `body.theme-terminal .stats-heading`, which are no longer rendered |
| Keep | `.stats-panel`, the table and active-row rules |

### 12.5 `css/themes.css`, `css/dev.css`

No change.

---

## 13. Overrides of Existing Visual Specs

| Spec § | Was | Now |
|---|---|---|
| vspec-001 §4.2 Header | Title left, theme control right | Title left, menu button right (§3) |
| vspec-001 §4.3 Main Layout | `.game-area` flex row, `.left-col` flex column, gap 14px | Wide: grid with `display: contents` board column; pad aligned to the grid (§2.2). Narrow unchanged |
| vspec-001 §4.4, §7 Difficulty Selector | Standalone select | Joined to New Puzzle in `.next-game`; height 34px, right corners square (§5) |
| vspec-001 §4.5 Number Pad | Utils row, Undo row, Hint/Coach row, Check | Digits, two-column tool block with divider, Check (§6) |
| vspec-001 §4.7 Action Row | New Puzzle / Reset (+ Share) | Removed. New Puzzle in the cluster; Reset and Share in the menu |
| vspec-001 §4.8, §5.7 Stats Panel | On the page with a heading | In the Statistics dialog, no panel heading; table and active row unchanged (§7) |
| vspec-001 §6 Theme Selector | Header `<select>` | Theme radio items in the menu (§4.4–4.5) |
| vspec-001 §8.1, §8.2 Responsive | Header controls; action row and stats in the stacked panel | §10 |
| vspec-001 §10.1 Focus Indicators | Accent outline everywhere | Adds the grid (§8.2), menu (§3.2, §4.4), Coffee overrides (§8.3) and the full-strength disabled menu item ring (§8.5) |
| vspec-001 §10.2 ARIA Structure | Number pad `role="group"` (code used `toolbar`) | `group` "Number pad" with two labelled column groups (§6.1) |
| vspec-001 §10.4 Theme Contrast Notes | Accent assumed to contrast with surface | Coffee focus rings on the page backdrop use `#c9a97a` (§8.3) |
| vspec-004 §1 Header Arrangement | `.header-controls` with switch and theme control | Removed; menu button only |
| vspec-004 §2 Handedness Switch | Header `role="switch"` button | Menu item with the same track and thumb graphic (§4.6); header overrides §2.4 dropped |
| vspec-004 §3 Layout Swap | `flex-direction: row-reverse` | `grid-column` swap (§2.2) |
| vspec-004 §4 Responsive | Switch `display: none` at ≤720px | `.mi-hand-section` `display: none` at ≤720px (§10) |
| vspec-004 §5 Theme Selector Focus Fix | Coffee/Mountain theme-select outline | Removed with the selector; same tones now on the menu button (§9.1) |
| vspec-006 §2 Share Button | Full-width third row of the action row | "Share puzzle" menu item with "Copy link" hint (§4.4) |
| vspec-006 §6 Responsive and Handedness | Share in the control panel | Share in the menu at every width |

vspec-006 §3 (notice) and the rest of vspec-001 are unchanged.

---

## 14. Out of Scope Findings

These are not fixed here. The Product Director decides.

1. **Footer link** uses the browser's default focus ring. It is not styled by the app and
   was not measured.
2. **Dev mode** (`css/dev.css`) focus indicators were not audited. Dev mode is out of
   scope for rspec-008.

**Resolved.** The first draft's finding 1, a disabled menu item focus ring below 3:1
outside Coffee (1.58–2.66), was resolved as in scope on 2026-11-27 by Product Director
approval. The fix applies to all themes: §4.4, §8.5.
