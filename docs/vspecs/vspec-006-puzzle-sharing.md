# Visual Design Spec: Puzzle Sharing via URL
**ID:** vspec-006-puzzle-sharing
**Status:** Final — mockup gate waived by the Product Director (handoff brief §3); visual
decisions below were made by the Uber Developer and await the post-hoc UX review
**Date:** 2026-11-13
**Author:** Uber Developer (Visual Designer stage)
**Based on:** fspec-006-puzzle-sharing; extends vspec-001-v1, vspec-003-harder-tiers,
vspec-004-left-hand

---

## 1. Principles

No new colours, fonts, or radii. Every value comes from the existing theme custom
properties, so all five themes are covered without per-theme colour tables. The only
theme-specific rules are the Terminal square corners the app already applies to cards.

## 2. Share Button

- Markup: `<button class="btn" id="btn-share">Share</button>` as the third child of
  `.action-row`.
- `.action-row` keeps its two-column grid (`1fr 1fr`, gap 8px). The Share button spans
  both columns (`grid-column: 1 / -1`), forming a second row.
- Appearance and states (hover, focus-visible, disabled) are the base `.btn` states
  (vspec-001 §5), unmodified in every theme.
- It is never hidden by a media query. On narrow viewports the action row is inside the
  stacked control panel (max-width 414px) and the button spans it.
- Left-hand mode moves the whole control panel; the row's internal order is unchanged.

## 3. Notice

A card below the board, between the generation busy card and the coach panel, in the
board column. It follows the board in left-hand mode.

| Property | Value |
|---|---|
| Width | 414px, `max-width: 100%` — set on `#notice-root`, not the card: in the stacked layout the board column centres its children, and a percentage max-width on the card would resolve against a shrink-to-fit parent |
| Margin | 10px top |
| Padding | 12px 14px |
| Background | `var(--surface)` |
| Border | 1px solid `var(--border)`; left edge 4px solid `var(--accent)` |
| Radius | 6px (Terminal: 0) |
| Font | 13px, line-height 1.5, `var(--text)` |
| Layout | flex row, gap 10px, `align-items: flex-start`; message block grows, Dismiss button fixed |
| Entry | The existing `fadein` 0.15s keyframes |
| Hidden state | `display: none` (root carries `hidden`) |

Variants:

| Variant | Difference |
|---|---|
| Info | Base |
| Progress | Message in `var(--text-muted)`; no Dismiss button |
| Error | Left edge `var(--conflict)`; message `font-weight: 600` |
| Link | Base, plus the link field |

**Link field:** full width of the message block, 6px top margin, padding 6px 8px, 12px
monospace (`ui-monospace, "Courier New", monospace`), `var(--text)` on `var(--given-bg)`, 1px
solid `var(--btn-border)`, radius 4px (Terminal: 0). Focus: 2px solid `var(--accent)`
outline, offset 1px.

Inset fields use `--given-bg` rather than `--bg`: Coffee's `--bg` is its dark page
backdrop, against which `--text` has a contrast of 1.2:1.

**Dismiss button:** a `.btn` reduced to padding 4px 8px, 12px font, containing "✕".
Standard `.btn` hover/focus states.

## 4. Unrated Presentation

- **Difficulty selector:** an extra `<option>` "Unrated" appended after Nightmare while
  the current puzzle is Unrated. Native select styling.
- **Hint button:** standard disabled `.btn` (opacity 0.38); the badge shows an en dash
  "–" in place of a count.
- **Coach button:** standard disabled `.btn`.
- **Check button:** visible, standard.
- **Statistics table:** no `active-diff` row.

## 5. Replace Confirmation

The existing modal (vspec-001 §7), unchanged: title, one-line body, Cancel + primary
confirm button labelled "Load Puzzle".

## 6. Responsive and Handedness

| Width | Share button | Notice |
|---|---|---|
| > 720px | Second row of the action row in the control panel | 414px under the board |
| ≤ 720px | Same, panel stacked under the board | `max-width: 100%` of the board column |
| ≤ 375px | Same | Shrinks with the column |

Nothing in this feature is conditional on `data-hand`.
