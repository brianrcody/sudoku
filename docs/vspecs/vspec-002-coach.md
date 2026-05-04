# Visual Design Spec: Coach Mode
**ID:** vspec-002-coach
**Status:** Approved
**Date:** 2026-05-03
**Author:** Visual Designer
**Based on:** fspec-002-coach, coach-v2.html (approved)
**Approved mockup:** docs/mockups/coach-v2.html

---

## 1. Coach Accent Color System

Coach Mode introduces a single accent color — vivid violet — that is theme-invariant. It does not vary by theme class. It is injected at `:root` alongside, but independent of, all per-theme custom properties.

| Property        | Value      | Role                                                              |
|-----------------|------------|-------------------------------------------------------------------|
| `--coach`       | `#7c3aed`  | Primary coach accent: button active state, cause-cell border, target-cell outline, overlay arrows, panel heading text, auto-revealed pencil marks |
| `--coach-light` | `#ede9fe`  | Pale lavender: cause-cell fill, coached-target fill, Simple Coloring Group B fill, coaching button tint background |
| `--coach-mid`   | `#c4b5fd`  | Medium lavender: cause-cell border (softer than `--coach`), coaching button pulse ring at mid-phase |

**Color selection rationale:** `#7c3aed` was selected because vivid violet sits outside the hue ranges used by all five existing themes (blues, browns, greens, near-blacks). It provides sufficient contrast against all per-theme surface colors and does not require per-theme adjustment. Cross-theme visual validation is required during implementation — in particular, ensure the violet reads clearly against Terminal's near-black background and Coffee's warm-cream surface.

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

Coach Mode adds five cell-state classes. All use `!important` on background overrides to take precedence over selection and conflict states. All set `z-index: 2` and `outline-offset: -2px`.

### 4.1 Cause Cell (`.coached-cause`)

Used for: the source cell(s) of a logical pattern (e.g., the pair cells in a Naked Pair, the filled peers in a Naked Single).

- `background: var(--coach-light) !important` — solid pale lavender fill
- `outline: 2px solid var(--coach-mid)` — medium-lavender solid border (softer than the target outline)
- `z-index: 2`

When focused: `outline-color: var(--coach)` (via `.coached-cause:focus-visible`).

### 4.2 Placement Target Cell (`.coached-target`)

Used for: the cell the player should fill (Naked Single, Hidden Single placement techniques).

- `background: var(--coach-light) !important` — same pale lavender fill as cause
- `outline: 2px solid var(--coach)` — full coach-accent solid border (stronger than cause)
- `z-index: 2`

When also selected (`.coached-target.selected`): retains `background: var(--coach-light)`, outline strengthens to `2.5px solid var(--coach)`.

When focused: `outline-color: var(--coach)`.

### 4.3 Elimination Target Cell (`.coached-elim-target`)

Used for: cells from which a candidate should be eliminated (elimination techniques: Naked Pair, Simple Coloring). Visually distinct from cause/target — no fill, dashed border to signal "remove from here."

- `background`: no override — cell retains its current background
- `outline: 2px dashed var(--coach)` — dashed coach-accent outline
- `z-index: 2`

### 4.4 Hidden Single Unit Members (`.coached-unit-member`)

Used for: all cells in the relevant row, column, or box in a Hidden Single explanation.

- `background: var(--coach-light) !important` — pale lavender tint
- No outline override

### 4.5 Simple Coloring — Group A (`.coached-sc-a`)

The "filled" group: cells that form one pole of the coloring chain.

- `background: var(--coach) !important` — solid full coach-accent fill
- `color: #ffffff` — white digit on the coach-accent background
- `outline: 2px solid var(--coach)` — solid matching border
- `z-index: 2`

### 4.6 Simple Coloring — Group B (`.coached-sc-b`)

The "outlined" group: cells forming the other pole.

- `background: var(--coach-light) !important` — pale lavender tint (same as cause cells)
- `outline: 2.5px dashed var(--coach)` — dashed coach-accent border (slightly heavier than elimination targets to distinguish the group role)
- `z-index: 2`

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

*Naked Single — arrows from peers to target:*
- Straight `<line>` elements from each filled peer cell center to the target cell center
- `stroke: #7c3aed` (hardcoded coach accent), `stroke-opacity: 0.6`, `stroke-width: 1.5`
- Lines start 16px from the peer center, end 20px from the target center (to clear cell content)
- Arrowhead: `<marker>` with `markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto"`, filled `<polygon points="0 0, 6 2, 0 4">` at `fill: #7c3aed`, `opacity: 0.7`

*Naked Pair — arc between cause cells, dashed lines to elimination targets:*
- Cause-to-cause: quadratic Bézier `<path>` with control point raised 18px above the midpoint. `stroke: #7c3aed`, `stroke-opacity: 0.8`, `stroke-width: 2`, `fill: none`. Arrowhead on the end point; marker `opacity: 0.85`
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

**Auto-dismiss:** After 3 seconds (per fspec §4.2 — 3s for error toasts, slightly longer than the 2.5s recap).

**ARIA:** Same `role="status"`, `aria-live="polite"` as the recap element.

---

## 11. Theme Compatibility

The coach accent (`#7c3aed`) is theme-invariant and intentionally sits outside each theme's hue range:

| Theme      | Theme accent hue | Coach accent contrast notes                             |
|------------|------------------|---------------------------------------------------------|
| Minimalist | Blue `#2c5282`   | Violet clearly distinct; lavender reads on white surface |
| Coffee     | Brown `#8b4513`  | Violet distinct; validate on warm-cream `#f5ede0`        |
| School     | Slate `#4a5568`  | Violet distinct; validate on off-white `#fdfaf0`         |
| Mountain   | Teal `#1a6b8a`   | Violet distinct; validate on light-blue `#f7fafc`        |
| Terminal   | Phosphor `#39ff14` | Violet on near-black `#111111` — validate contrast; ensure `#7c3aed` is legible against dark backgrounds; coach-light tint `#ede9fe` will appear pale grey-purple, which is acceptable |

Implementation requirement: verify `#7c3aed` coach cell borders and button states are visually distinguishable in all five themes before shipping. No per-theme override is expected to be necessary, but it must be confirmed.

The coached-cell focus ring when a coached cell has keyboard focus uses `outline-color: var(--coach)` rather than `var(--accent)`, ensuring the coach context is preserved regardless of theme.

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
.cell.coached-target:focus-visible,
.cell.coached-cause:focus-visible {
  outline-color: var(--coach);
}
```

This overrides the default `var(--accent)` focus ring so coached cells maintain visual context when keyboard-navigated.

---

## 13. Responsive / Mobile

Mobile treatment for Coach Mode elements is deferred. The following items require design decisions before mobile implementation:

- The explanation panel is `width: 414px` on desktop (matches grid). On mobile the grid is fluid; the panel width must track the grid width.
- The Hint/Coach row and Check row are sized to fit the numpad column width; this is expected to adapt naturally but must be verified.
- The SVG overlay is `414px × 414px` on desktop; on mobile it must scale with the grid.
- The recap/error toast is `width: 414px` on desktop; on mobile it must match the grid width.

No mobile breakpoint styles are defined in this spec. They will be specified as part of a future mobile-focused design pass, consistent with the approach taken in vspec-001-v1.
