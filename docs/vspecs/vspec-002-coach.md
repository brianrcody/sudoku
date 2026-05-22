# Visual Design Spec: Coach Mode
**ID:** vspec-002-coach
**Status:** Approved
**Date:** 2026-05-03
**Author:** Visual Designer
**Based on:** fspec-002-coach, coach-v2.html (approved)
**Approved mockup:** docs/mockups/coach-v2.html

---

## 1. Coach Accent Color System

Coach Mode uses five CSS custom properties — `--coach`, `--coach-light`, `--coach-mid`, `--pencil-on-coach`, and `--pencil-on-coach-light` — that are defined **per theme** inside each `body.theme-*` block in `css/themes.css`. The Minimalist theme's values also sit in the `:root, body.theme-minimalist` block and serve as the cascade fallback.

| Role | Property |
|------|----------|
| Primary coach accent: button active state, cause-cell border, target-cell outline, overlay arrows, panel heading text, auto-revealed pencil marks | `--coach` |
| Pale tint: cause-cell fill, coached-target fill, Simple Coloring Group B fill, coaching button tint background | `--coach-light` |
| Mid tone: cause-cell border (softer than `--coach`), coaching button pulse ring at mid-phase | `--coach-mid` |
| Pencil mark color inside Simple Coloring Group A cells (`.coached-sc-a`) | `--pencil-on-coach` |
| Pencil mark color inside Simple Coloring Group B cells (`.coached-sc-b`) | `--pencil-on-coach-light` |

**Per-theme values:**

| Theme | `--coach` | `--coach-light` | `--coach-mid` | `--pencil-on-coach` | `--pencil-on-coach-light` |
|-------|-----------|-----------------|---------------|---------------------|---------------------------|
| Minimalist | `#7c3aed` | `#ede9fe` | `#c4b5fd` | `#ffffff` | `var(--pencil)` |
| Coffee Shop | `#c2410c` | `#ffedd5` | `#fb923c` | `#ffffff` | `var(--pencil)` |
| School | `#1d4ed8` | `#dbeafe` | `#93c5fd` | `#ffffff` | `var(--pencil)` |
| Mountain | `#0f766e` | `#ccfbf1` | `#5eead4` | `#ffffff` | `var(--pencil)` |
| Digital Terminal | `#0e7490` | `#0a1f28` | `#155e75` | `#b0ffb0` | `#b0ffb0` |

**Terminal note:** `--coach-light` is a *dark* tint (`#0a1f28`) rather than a light one, appropriate for the near-black surface. Coached cell backgrounds will appear as a subtle blue-black rather than a pale fill. Both pencil-mark color variables are set to `#b0ffb0` (the terminal's standard dim-text color) to remain readable on dark coach backgrounds.

---

## 2. Numpad Button Layout

### 2.1 Row Structure

The numpad bottom section is restructured into two rows:

**Row 1 — Hint | Coach (two equal-width buttons):**
- Layout: `grid-template-columns: 1fr 1fr`, `gap: 6px`
- Hint button on the left, Coach button on the right
- Both buttons match the standard `.btn` height and padding (`10px 8px`)

**Row 2 — Check (full-width, single button):**
- Layout: full-width below Row 1; `width: 100%`
- Check button spans the entire width of the numpad
- Visibility rules unchanged from v1: visible only for Easy and Medium difficulty

This corrects the v2 mockup, which placed all three (Hint, Coach, Check) in a single 3-column row. The approved layout is strictly two rows: a 2-column Hint/Coach row above a full-width Check row.

### 2.2 Structural Change from v1

In v1, the bottom of the numpad was a single 2-column row where Check used `grid-column: span 2`. That row is replaced with two separate layout containers:
1. A 2-column grid containing Hint and Coach
2. A standalone full-width Check button below

Both containers participate in the numpad's column flex flow with `gap: 8px` between rows.

---

## 3. Coach Button

### 3.1 Placement and Sizing

The Coach button occupies the right cell of the Hint/Coach row (Row 1 above). It matches the Hint button in height, padding, and border radius — both use the base `.btn` style (`padding: 10px 8px`, `border-radius: 5px`, `font-size: 14px`, `font-weight: 500`). No icon; label is the plain text "Coach".

Theme-specific button overrides from v1 apply here too: Terminal renders the Coach button with `border-radius: 0`, `text-transform: uppercase`, `font-size: 12px`; Coffee and Mountain apply `border-radius: 6px`.

### 3.2 Visual States

**Idle:** Standard `.btn` appearance — `background: var(--btn-bg)`, `border: 1px solid var(--btn-border)`, `color: var(--text)`. No coach-specific styling. `aria-label="Coach"`.

**Coaching (active — hint is displayed):** Applied via class `.coaching`.
- `background: var(--coach-light)`
- `border-color: var(--coach)`
- `color: var(--coach)`
- `font-weight: 600`
- Outer ring: `box-shadow: 0 0 0 2px var(--coach-light), 0 0 0 3px var(--coach)` at rest
- Pulse animation: `coach-pulse 2s ease-in-out infinite` (see §3.3)
- `aria-label="Coach (active)"`

**Error-feedback (no applicable technique, board complete, board inconsistent):** Button appearance is unchanged from idle — no class is added, no visual modification. Per fspec §2.6, the error message appears in the panel area below the grid, not on the button.

### 3.3 Pulse Animation

```css
@keyframes coach-pulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--coach-light), 0 0 0 3px var(--coach); }
  50%       { box-shadow: 0 0 0 4px var(--coach-light), 0 0 0 5px var(--coach-mid); }
}
```

- Property animated: `box-shadow` (the double-ring grows outward at 50%)
- Duration: `2s`
- Easing: `ease-in-out`
- Iteration: `infinite`
- Applied only while `.coaching` class is present

---

## 4. Grid Cell Highlight States

Coach Mode adds five cell-state classes. All use `!important` on background overrides to take precedence over selection and conflict states. All set `z-index: 2`.

Solid-ring classes use `box-shadow: inset` for their coach ring so the selection `outline` (painted last by CSS) remains visible on top when the cell is also selected. Dashed-ring classes (`coached-elim-target`, `coached-sc-b`) cannot use box-shadow and instead use an explicit `.selected` override to show the accent ring.

### 4.1 Cause Cell (`.coached-cause`)

Used for: the source cell(s) of a logical pattern (e.g., the pair cells in a Naked Pair, the filled peers in a Naked Single).

- `background: var(--coach-light) !important` — solid pale lavender fill
- `box-shadow: inset 0 0 0 2px var(--coach-mid)` — medium-lavender solid ring (softer than the target ring)
- `z-index: 2`

When focused but not selected: `outline-color: var(--coach)` (via `.coached-cause:not(.selected):focus-visible`). When focused and selected, the accent outline from `.selected` is retained so the "you are here" indicator remains distinct from the coach ring.

### 4.2 Placement Target Cell (`.coached-target`)

Used for: the cell the player should fill (Naked Single, Hidden Single placement techniques).

- `background: var(--coach-light) !important` — same pale lavender fill as cause
- `box-shadow: inset 0 0 0 2px var(--coach)` — full coach-accent solid ring (stronger than cause)
- `z-index: 2`

When also selected (`.coached-target.selected`): retains `background: var(--coach-light)`; the selection `outline: 2px solid var(--accent)` is visible on top of the coach box-shadow ring — regardless of whether focus arrived via mouse or keyboard.

When focused but not selected: `outline-color: var(--coach)` (via `.coached-target:not(.selected):focus-visible`).

### 4.3 Elimination Target Cell (`.coached-elim-target`)

Used for: cells from which a candidate should be eliminated (elimination techniques: Naked Pair, Simple Coloring). Visually distinct from cause/target — no fill, dashed border to signal "remove from here."

- `background`: no override — cell retains its current background
- `outline: 2px dashed var(--coach)` — dashed coach-accent outline
- `z-index: 2`

When also selected (`.coached-elim-target.selected`): dashed ring replaced by `outline: 2px solid var(--accent)` to show selection clearly.

### 4.4 Hidden Single Unit Members (`.coached-unit-member`)

Used for: all cells in the relevant row, column, or box in a Hidden Single explanation.

- `background: var(--coach-light) !important` — pale lavender tint
- No outline override

### 4.5 Simple Coloring — Group A (`.coached-sc-a`)

The "filled" group: cells that form one pole of the coloring chain.

- `background: var(--coach) !important` — solid full coach-accent fill
- `color: #ffffff` — white digit on the coach-accent background
- `box-shadow: inset 0 0 0 2px var(--coach)` — solid matching ring
- `z-index: 2`
- Pencil marks inside: `color: var(--pencil-on-coach)` — ensures readability on the saturated background

### 4.6 Simple Coloring — Group B (`.coached-sc-b`)

The "outlined" group: cells forming the other pole.

- `background: var(--coach-light) !important` — pale lavender tint (same as cause cells)
- `outline: 2.5px dashed var(--coach)` — dashed coach-accent border (slightly heavier than elimination targets to distinguish the group role)
- `z-index: 2`
- Pencil marks inside: `color: var(--pencil-on-coach-light)` — needed for Terminal where `--coach-light` is near-black

When also selected (`.coached-sc-b.selected`): dashed ring replaced by `outline: 2px solid var(--accent)` to show selection clearly.

---

## 5. Auto-Revealed Candidates

When the coach auto-populates pencil marks into cause or target cells (e.g., showing {2,5} in a Naked Pair), those marks are rendered in the standard 3×3 pencil-mark sub-grid but with distinct styling:

- Class `.coach-reveal` on the `.pencil-mark` span
- `color: var(--coach)` — vivid violet instead of `var(--pencil)`
- `font-weight: 700` — heavier than user pencil marks (which are `font-weight: 500`)

User-entered pencil marks remain `color: var(--pencil)`, `font-weight: 500`. If a cell contains both user marks and coach-revealed marks, each span is styled independently: user-mark spans use `.pencil-mark`, coach-revealed spans add `.coach-reveal`.

---

## 6. Grid Overlay (SVG Arrow Layer)

An SVG element (`#coach-overlay`) is absolutely positioned above the grid within `.grid-wrapper`.

**Positioning:**
- `position: absolute; top: 0; left: 0`
- `width: 414px; height: 414px` (matches grid dimensions)
- `pointer-events: none` — does not intercept clicks
- `z-index: 5` — above cells (`z-index: 2`) and win banner (`z-index: 10` takes full priority when shown)
- `aria-hidden="true"`

**Visibility:** Hidden (`display: none`) by default. Class `.visible` sets `display: block`. The overlay is shown only while the explanation panel is open; it is cleared and hidden on panel dismiss or state reset.

**Arrow and connector styles:**

**Color:** All arrow strokes and the arrowhead marker fill use `currentColor`. The `#coach-overlay` SVG element carries `color: var(--coach)` in CSS, so `currentColor` resolves to the active theme's coach accent at all times. No hardcoded color values appear in the SVG or JS.

*Naked Single — arrows from peers to target:*
- Straight `<line>` elements from each filled peer cell center to the target cell center
- `stroke: currentColor`, `stroke-opacity: 0.6`, `stroke-width: 1.5`
- Lines start 16px from the peer center, end 20px from the target center (to clear cell content)
- Arrowhead: `<marker>` with `markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto"`, filled `<polygon points="0 0, 6 2, 0 4">` at `fill="currentColor"`, `opacity: 0.7`

*Hidden Single — elimination crossing lines:*
- Straight `<line>` elements from each cause cell center to the far boundary of the
  eliminated cell (the line passes through the eliminated cell and stops at its exit edge)
- `stroke: currentColor`, `stroke-opacity: 0.45`, `stroke-width: 1.5`
- No arrowhead; no shortening — the line starts at the cause cell center and terminates
  exactly at the eliminated cell's far boundary in the direction of travel

*Naked Pair — arc between cause cells, dashed lines to elimination targets:*
- Cause-to-cause: quadratic Bézier `<path>` with control point raised 18px above the midpoint. `stroke: currentColor`, `stroke-opacity: 0.8`, `stroke-width: 2`, `fill: none`. Arrowhead on the end point; marker `opacity: 0.85`
- Cause-to-target: `<line>` elements with `stroke-dasharray: "4 3"`, `stroke-opacity: 0.5`, `stroke-width: 1.5`, same arrowhead marker
- Lines start/end 18px from each cell center

The exact pixel offsets above are derived from the approved mockup and should be reproduced as-is. The arrowhead marker is defined once in `<defs>` and referenced via `marker-end`.

---

## 7. Explanation Panel

### 7.1 Placement

Below the grid, inside `.left-col`. The panel sits in a wrapper (`.coach-panel-wrap`) that animates open; below the `.grid-wrapper` and before any recap toast in the DOM.

### 7.2 Animation

The wrapper uses a `max-height` expand pattern:

```css
.coach-panel-wrap {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.15s ease-out;
}
.coach-panel-wrap.open {
  max-height: 220px;
}
```

Opening: class `.open` is added → `max-height` expands to `220px` over `150ms` with `ease-out`.
Closing / dismissing: class `.open` is removed → `max-height` collapses to `0` immediately (no transition on close — instant dismiss).

### 7.3 Panel Appearance

`.coach-panel`:
- `margin-top: 10px`
- `border: 1.5px solid var(--coach)` — coach-accent border on all four sides
- `border-radius: 6px` (Terminal: `border-radius: 0`)
- `background: var(--surface)` — theme surface color
- `padding: 14px 16px`
- `width: 414px` — matches grid width

### 7.4 Panel Typography

**Technique name** (`.coach-panel-technique`):
- `font-size: 15px`, `font-weight: 700`
- `color: var(--coach)` — vivid violet
- `margin-bottom: 6px`, `letter-spacing: 0.01em`

**Explanation text** (`.coach-panel-text`):
- `font-size: 13px`, `color: var(--text)`, `line-height: 1.5`
- Inline emphasis (`<em>` rendered as non-italic): `color: var(--coach)`, `font-style: normal`, `font-weight: 600` — used to highlight key digits or cell references within the explanation
- `margin-bottom: 0`

**ARIA:** `role="region"`, `aria-label="Coach explanation"`.

---

## 8. Recap Toast (Normal Variant)

Displayed below the grid (same position as the explanation panel) after the player fills a coached cell correctly. Auto-dismisses after ~2.5 seconds.

**Element:** `.coach-recap` (shared with error and no-technique variants).

**Appearance:**
- `display: none` by default; class `.visible` sets `display: block`
- `margin-top: 10px`
- `width: 414px` — matches grid width
- `border-radius: 6px`
- `padding: 14px 16px`
- `font-size: 13px`, `line-height: 1.5`
- Left border: `border-left: 4px solid var(--coach)` — coach-accent
- Remaining three borders: `1px solid var(--border)` (top, right, bottom)
- `background: var(--surface)`
- Entrance: `animation: fadein 0.15s ease` (opacity 0 → 1)

**Content layout:**
- `.coach-recap-line1`: primary message — `font-weight: 700`, `color: var(--text)`, `margin-bottom: 4px`
- `.coach-recap-line2`: supporting detail — `color: var(--text-muted)`

**Example content:**
- Line 1: "You used Naked Single."
- Line 2: "Naked Single in row 5, column 5: only 5 could go here."

**ARIA:** `role="status"`, `aria-live="polite"`.

---

## 9. Recap Toast (Error Variant)

Same element and structure as the normal recap. Applied when the player fills a coached cell with the wrong digit.

**Differences from normal variant:**
- Additional class `.error` on `.coach-recap`
- Left border: `border-left: 4px solid var(--conflict)` — conflict red replaces coach-accent
- `.coach-recap-line1`: `color: var(--conflict)` — red heading instead of default text color

**Example content:**
- Line 1: "That's not the right digit — the Naked Single suggestion still stands."
- Line 2: "Press Coach to try again."

Auto-dismisses after ~2.5 seconds (same timing as normal recap).

---

## 10. Error Toast (No Applicable Technique)

Displayed when Coach is pressed but cannot find a applicable technique, the puzzle is already complete, or the board is inconsistent.

**Uses the same `.coach-recap` element** with the `.error` class variant. The Coach button is visually unchanged (remains idle — no `.coaching` class is applied).

**Appearance:** Identical to the error recap variant — `border-left: 4px solid var(--conflict)`, `.coach-recap-line1` in `color: var(--conflict)`.

**Content layout:**
- Line 1: Error message (e.g., "The puzzle is already solved." or "The board has a contradiction. Use Erase to fix it.")
- Line 2: Empty (no second line for simple error cases)

**Auto-dismiss:** After 5 seconds (per fspec §4.2 — 5s for error toasts, longer than the 2.5s recap).

**ARIA:** Same `role="status"`, `aria-live="polite"` as the recap element.

---

## 11. Theme Compatibility

Coach accent colors are per-theme (see §1). Each theme's values were selected to be cohesive with its palette and to maintain legibility of pencil marks and digits over coach-highlighted cell backgrounds.

| Theme | Coach accent | Legibility notes |
|-------|-------------|-----------------|
| Minimalist | Violet `#7c3aed` | Lavender `--coach-light` reads clearly on white `#ffffff` surface |
| Coffee Shop | Rust `#c2410c` | Warm peach `--coach-light` (`#ffedd5`) is distinct from the cream `#f5ede0` surface; brown pencil marks readable over it |
| School | Royal blue `#1d4ed8` | Blue `--coach-light` (`#dbeafe`) distinct from the grayish `--accent-light`; slate pencil marks readable |
| Mountain | Teal `#0f766e` | Mint `--coach-light` (`#ccfbf1`) contrasts the cool-white `#f7fafc` surface; green pencil marks readable |
| Digital Terminal | Dark cyan `#0e7490` | `--coach-light` is a dark tint (`#0a1f28`) — coached backgrounds are subtly blue-black over the near-black `#111111` surface; bright green text and pencil marks remain readable |

The coached-cell focus ring uses `outline-color: var(--coach)` when a coached cell has keyboard focus and is **not** selected, ensuring the coach context is preserved regardless of theme. When the cell is also selected, the accent outline is retained so the selection state remains visually distinct from the coach highlight.

---

## 12. Accessibility

### 12.1 Coached Cell ARIA

- All cells with coach highlight classes receive `aria-describedby` pointing to a hidden span (`#sr-coached-desc`) containing "Coached cell — focus for explanation."
- The explanation panel has `role="region"`, `aria-label="Coach explanation"`.
- Coach button: `aria-label="Coach"` in idle state; `aria-label="Coach (active)"` in coaching state.

### 12.2 Screen Reader Announcements

Delivered via the existing `aria-live="assertive"` `#sr-live` region. Coach-specific messages:

| Event | Announcement |
|-------|--------------|
| Coach identifies technique, no cell focused | "Coach: {Technique name} identified. N cells highlighted." |
| Coached cell focused, panel opens | "Coached cell. {Technique}. {Plain-text explanation}." |
| Correct fill recap | "You used {Technique}. {Detail sentence}." |
| Wrong fill recap | "That's not the right digit — {technique} suggestion still stands. Press Coach to try again." |
| Error — no technique | "Coach: {Error message text}." |

### 12.3 Focus Ring Override for Coached Cells

```css
.cell.coached-target:not(.selected):focus-visible,
.cell.coached-cause:not(.selected):focus-visible {
  outline-color: var(--coach);
}
```

This overrides the default `var(--accent)` focus ring so coached cells maintain visual context when keyboard-navigated. The `:not(.selected)` guard ensures that when a coached cell is also the currently selected cell, the accent-colored selection outline is preserved — without it, the keyboard focus ring would match the coach box-shadow color, making the selection state invisible.

---

## 13. Responsive / Mobile

Mobile treatment for Coach Mode elements is deferred. The following items require design decisions before mobile implementation:

- The explanation panel is `width: 414px` on desktop (matches grid). On mobile the grid is fluid; the panel width must track the grid width.
- The Hint/Coach row and Check row are sized to fit the numpad column width; this is expected to adapt naturally but must be verified.
- The SVG overlay is `414px × 414px` on desktop; on mobile it must scale with the grid.
- The recap/error toast is `width: 414px` on desktop; on mobile it must match the grid width.

No mobile breakpoint styles are defined in this spec. They will be specified as part of a future mobile-focused design pass, consistent with the approach taken in vspec-001-v1.
