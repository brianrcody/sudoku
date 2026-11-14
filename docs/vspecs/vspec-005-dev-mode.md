# Visual Design Spec: Developer Mode
**ID:** vspec-005-dev-mode
**Status:** Final — mockup gate waived by the Product Director (handoff brief §3); visual
decisions below were made by the Uber Developer and await the post-hoc UX review
**Date:** 2026-11-13
**Author:** Uber Developer (Visual Designer stage)
**Based on:** fspec-005-dev-mode; extends vspec-001-v1, vspec-002-coach, vspec-004-left-hand

---

## 1. Principles

Developer UI is utilitarian: dense, monospace where data is shown, and visually
subordinate to the game. It uses only existing theme custom properties, so it renders
legibly in all five themes with no per-theme colour tables. All styles live in
`css/dev.css`, which is loaded only when dev mode is on.

## 2. DEV Badge

| Property | Value |
|---|---|
| Position | `fixed`, bottom 8px, left 8px, `z-index: 50` (below the modal backdrop at 100) |
| Text | "DEV", 11px, weight 700, letter-spacing 0.08em, monospace |
| Colours | `var(--surface)` text on `var(--conflict)` background |
| Padding / radius | 3px 7px / 4px (Terminal: 0) |
| Hover | `opacity: 0.85` |
| Focus-visible | 2px solid `var(--accent)` outline, offset 2px |
| Decoration | none (it is a link) |

The badge does not move in left-hand mode.

## 3. Developer Panel

Placed in `<main>` after the game area, so it sits below the board and controls at every
width and in both hand modes.

| Property | Value |
|---|---|
| Width | 100%, `max-width: 860px` (the game area's max width) |
| Background | `var(--surface)` |
| Border | 1px dashed `var(--border-strong)` |
| Radius | 6px (Terminal: 0) |
| Padding | 14px 16px |
| Font | 13px, `var(--text)` |
| Heading | `h2`, 13px, weight 700, uppercase, letter-spacing 0.07em |
| Note | 12px, `var(--text-muted)`, 4px below the heading |
| Focus (panel itself, when reached from the badge) | 2px solid `var(--accent)` outline |

### 3.1 Tool sections

Each tool is a `<details>` separated by a 1px `var(--border)` top rule, margin-top 10px,
padding-top 8px.

- `summary`: 13px, weight 600, pointer cursor; focus-visible 2px solid `var(--accent)`,
  offset 2px.
- Body: margin-top 8px; flex column, gap 8px.
- Buttons are standard `.btn` reduced to padding 6px 10px, 13px font, laid out in a
  wrapping flex row, gap 6px.
- Status lines: 12px, `var(--text-muted)`, min-height 18px; `.dev-error` switches to
  `var(--conflict)` weight 600.

### 3.2 Load from string

Label above a `<textarea>`: 3 rows, width 100%, 12px monospace, `var(--text)` on
`var(--given-bg)`, 1px solid `var(--btn-border)`, radius 4px, padding 6px 8px, vertical resize
only. Focus: 2px solid `var(--accent)` outline, offset 1px.

### 3.3 Step list

`<ol>`, max-height 260px, vertical scroll, 1px solid `var(--border)`, radius 4px,
`padding-left: 0`, list numbering rendered by a counter in a 34px gutter.

Each step button: full width, left-aligned, 12px monospace, padding 4px 8px, transparent
background, no border, `var(--text)`.

| State | Style |
|---|---|
| Hover | `var(--btn-hover)` background |
| Focus-visible | 2px solid `var(--accent)` outline, offset -2px |
| Selected (`aria-pressed="true"`) | `var(--accent)` background, `var(--surface)` text |

### 3.4 Grid highlight (selected step)

Applied to `.cell` elements as extra classes; inset rings so the 1px cell borders and the
selection/conflict backgrounds stay visible.

| Role | Class | Style |
|---|---|---|
| Placement | `dev-hl-place` | `box-shadow: inset 0 0 0 3px var(--win)` |
| Elimination | `dev-hl-elim` | `box-shadow: inset 0 0 0 3px var(--conflict)` |
| Pattern | `dev-hl-pattern` | `box-shadow: inset 0 0 0 2px var(--accent)`, dashed look via `outline: 1px dashed var(--accent); outline-offset: -5px` |

A cell holding more than one role takes the first that applies in the order placement,
elimination, pattern.

### 3.5 Candidate overlay

Uses the existing `.pencil-marks` 3×3 grid and `.pencil-mark` sizing.

| State | Class | Style |
|---|---|---|
| Agree | `dev-cand-agree` | Inherits `.pencil-mark` |
| Missing | `dev-cand-missing` | `var(--accent)`, weight 800, underlined |
| Extra | `dev-cand-extra` | `var(--conflict)`, weight 800, `line-through` |
| Absent | `empty` | Hidden (existing rule) |

Each divergence carries a non-colour cue (underline / strike-through).

The legend under the switch shows three sample marks with their labels, 12px.

The switch (`.dev-switch`) copies the track and thumb dimensions and on/off states of the
header handedness switch (vspec-004 §2) using its own classes in `dev.css`, coloured with
`var(--text)` / `var(--accent)` since it sits on `var(--surface)` rather than the header.
Unlike the header switch it is never hidden by a media query.

### 3.6 Coach JSON

`<pre>`: 11.5px monospace, `var(--text)` on `var(--given-bg)`, 1px solid `var(--border)`,
radius 4px, padding 8px, max-height 320px, both-axis scroll, `tab-size: 2`. Focus-visible
2px solid `var(--accent)`.

### 3.7 Diagnostics

A two-column table: field names 12px `var(--text-muted)`, right padding 16px, top
aligned; values 12px monospace. Row gap 3px. The technique profile is one "name × count"
entry per line.

## 4. Responsive and Handedness

The panel is a full-width block under the game area and wraps naturally; nothing in it
depends on the 720px breakpoint or on `data-hand`. The step list and JSON block scroll
internally so the panel never forces horizontal page scroll.
