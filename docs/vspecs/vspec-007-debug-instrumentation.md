# Visual Design Spec: Debug Instrumentation
**ID:** vspec-007-debug-instrumentation
**Status:** Final — mockup v1 approved by the Product Director 2026-11-15
**Date:** 2026-11-15
**Author:** Visual Designer
**Based on:** fspec-007-debug-instrumentation; mockup `docs/mockups/debug-instrumentation-v1.html`;
extends vspec-005-dev-mode (and through it vspec-001-v1, vspec-004-left-hand)

---

## 1. Principles

The vspec-005 principles apply unchanged: developer UI is dense, utilitarian, monospace
where data is shown, and coloured only through existing theme custom properties, so no
per-theme colour tables are needed. Every style below is an **addition to `css/dev.css`**;
no other stylesheet changes.

New component styles are introduced only where nothing in the panel fits. Each is listed
in §3 with the reason.

Message and label wording is owned by fspec-007. Strings appear here only to identify an
element; where this document and the fspec differ, the fspec governs (see §11).

## 2. Panel and Tool Order

The developer panel itself (vspec-005 §3) is unchanged: width, padding, border, heading,
note, and the `.dev-tool` disclosure styling. The tools, in order:

1. Load puzzle from string — unchanged
2. Solver step inspector — unchanged
3. Candidate overlay — unchanged
4. Coach step data — unchanged
5. Generation diagnostics — gains seed rows and a Generate-from-seed group (§5)
6. **Session recorder** — new (§4), a `<details class="dev-tool">` like the others,
   collapsed initially

## 3. New Shared Components

### 3.1 Group (`.dev-group`, `.dev-group-title`)

Used where one tool holds several clusters of controls. Nothing existing subdivides a tool.

A group is a `<section class="dev-group" aria-labelledby="…">` whose first child is an
`<h3 class="dev-group-title">`.

| Property | Value |
|---|---|
| Layout | Flex column, gap 8px |
| Separation from a preceding group (`.dev-group + .dev-group`) | `padding-top: 10px`, `border-top: 1px dotted var(--border)` |
| Title | 11px, weight 700, letter-spacing 0.07em, uppercase, `var(--text-muted)` |

A group that is the first group in its tool body has no rule above it. It is separated
only by the tool body's 8px gap.

### 3.2 Labelled field (`.dev-field`, `.dev-field-hint`)

| Element | Value |
|---|---|
| `.dev-field` | Flex column, gap 4px; contains a `<label>` (13px, `var(--text)`, inherited) then the control |
| `.dev-field-hint` | 12px, `var(--text-muted)` |

### 3.3 Text input and textarea (`.dev-input`, `.dev-textarea`)

These generalise the Load-from-string field (vspec-005 §3.2) so that four new fields share one
style.

| Property | Value |
|---|---|
| Width | 100% of the containing field |
| Padding | 6px 8px |
| Font | 12px, `ui-monospace, "Courier New", monospace` |
| Colours | `var(--text)` on `var(--given-bg)` (not `--bg`: see the vspec-005 note on Coffee) |
| Border / radius | 1px solid `var(--btn-border)` / 4px (Terminal: 0) |
| Textarea resize | Vertical only |
| Read-only textarea | `white-space: pre`: lines never wrap; the field scrolls horizontally inside itself |

| State | Style |
|---|---|
| Focus (`:focus`) | 2px solid `var(--accent)` outline, offset 1px |
| Invalid (`[aria-invalid="true"]`, inputs only) | Border `var(--conflict)` plus `box-shadow: inset 0 0 0 1px var(--conflict)`, giving a 2px red edge without changing size. Removed as soon as the field is edited |
| Disabled | Not used |

### 3.4 Inline field row (`.dev-inline`)

A row of short labelled fields ending in a button. Nothing existing places a button beside a field.

| Property | Value |
|---|---|
| Layout | Flex row, `flex-wrap: wrap`, `align-items: flex-end` (button aligns with the controls, not the labels) |
| Gap | 8px vertical, 10px horizontal |
| Buttons | Standard `.btn` reduced to padding 6px 10px, 13px font, the same as `.dev-buttons .btn` |
| Inputs inside a field | `width: 100%` of their field; the field's width sets the input's width |

### 3.5 Dev-sized select (`.dev-select`)

This is the panel's first select. It takes the look of the difficulty selector (`#difficulty-select`,
vspec-001) reduced to panel size.

| Property | Value |
|---|---|
| Padding | 5px 26px 5px 8px |
| Font | 13px, inherited family |
| Colours | `var(--text)` on `var(--surface)` |
| Border / radius | 1px solid `var(--btn-border)` / 5px (Terminal: 0, border `var(--accent)`) |
| Appearance | `appearance: none`; a 10×6 downward triangle SVG as the background image, no-repeat, `right 8px center` |
| Arrow fill | As `#difficulty-select` per theme: Minimalist `#7a7570`, Coffee `#8c6642`, School `#718096`, Mountain `#4d7a99`, Terminal `#39ff14` (see §11 on the mockup) |
| Cursor | Pointer |
| Focus (`:focus`) | 2px solid `var(--accent)` outline, offset 2px |

Rendered size in Chrome with the label "Easy" is about 96×27px.

### 3.6 Danger button (`.dev-btn-danger`) and end alignment (`.dev-btn-end`)

The panel had no destructive action. The danger button is an outline variant of `.btn`
inside `.dev-buttons`, so it carries less visual weight than a filled button while being
clearly marked.

| State | Style |
|---|---|
| Default | Text `var(--conflict)`, background transparent, border 1px `var(--conflict)`; size, radius, and font as `.dev-buttons .btn` and the theme's `.btn` rules |
| Hover | Background `var(--conflict-bg)`; border and text unchanged |
| Focus-visible | Standard `.btn` ring: 2px solid `var(--accent)`, offset 2px |
| Active | No special style (as `.btn`) |
| Disabled | Not used (Clear history is always enabled) |

Selectors must out-rank the theme `.btn` rules: `.dev-buttons .btn.dev-btn-danger` and
`.dev-buttons .btn.dev-btn-danger:hover`. That keeps the red border in Terminal, whose
`.btn` and `.btn:hover` rules otherwise set it to `--border` / `--accent`.

`.dev-btn-end` sets `margin-left: auto`, pushing the button to the far end of its
`.dev-buttons` row.

### 3.7 Small in-table button (`.dev-btn-sm`)

Used for Copy seed. A full `.btn` would make its table row taller than the others.

| Property | Value |
|---|---|
| Base | `.btn` (theme radius and shadow apply) |
| Padding | 2px 8px |
| Margin | `margin-left: 10px` from the seed value |
| Font | 12px, `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`, set explicitly because the `<td>` is monospace. Terminal: `"Courier New", Courier, monospace`, 11px (still uppercase via the Terminal `.btn` rule) |
| Vertical alignment | `baseline` |
| Rendered size | About 75×18px (Minimalist, Chrome) |
| Focus-visible | Standard `.btn` ring |
| Disabled | Standard `.btn:disabled`: opacity 0.38, `cursor: not-allowed`; the `disabled` attribute exposes the state |

### 3.8 Storage callout (`.dev-callout`)

The storage line reports a standing condition, not the transient outcome of an action. The
muted status-line style would understate it, and the error style would misreport it as a
failure of the last action.

| Property | Value |
|---|---|
| Padding | 5px 8px |
| Font | 12px, line-height 1.4, `var(--text)` |
| Background | `var(--conflict-bg)` |
| Left edge | `border-left: 3px solid var(--conflict)`; no other border |
| Radius | 0 4px 4px 0 (Terminal: 0) |
| Empty (`:empty`) | `display: none`: no space is reserved when history is being saved normally |

The element is `role="status"` and stays in the DOM while empty, so later messages are announced.

## 4. Session Recorder

### 4.1 Order and grouping

The tool body (`.dev-tool-body`: flex column, gap 8px) holds three groups (§3.1), in this
order. Replay is last so that a long report never pushes the switches out of view.

**1. History** (`<h3>` "History")

| # | Element | Style |
|---|---|---|
| 1 | Counts line | §4.2 |
| 2 | Storage line | `.dev-callout` (§3.8); hidden when empty |
| 3 | Button row | `.dev-buttons`: **Copy session** (standard `.btn`, first, left), **Clear history** (`.btn.dev-btn-danger.dev-btn-end`, far right) |
| 4 | History status line | `.dev-status` with `role="status"`. Shared by the Copy session outcomes and the Clear history outcomes. Copy failure uses `.dev-error`; copy success, "cleared", and "not cleared" use the plain style |
| 5 | Copy fallback field | `.dev-field` with label and a read-only `.dev-textarea` of 6 rows; present only after a failed copy (via `hidden`) |

**2. Console logging** (`<h3>` "Console logging")

| # | Element | Style |
|---|---|---|
| 1 | Switch list | §4.3 |

**3. Replay** (`<h3>` "Replay")

| # | Element | Style |
|---|---|---|
| 1 | Document field | `.dev-field`: label, then `.dev-textarea` of 4 rows |
| 2 | Stop-after row | `.dev-inline`: a `.dev-field` (label + `.dev-input`, `inputmode="numeric"`), then the **Replay** button |
| 3 | Stop-after hint | `.dev-field-hint` paragraph directly beneath the row; the input references it with `aria-describedby` |
| 4 | Replay status line | `.dev-status` with `role="status"`. Rejections and "stopped" outcomes use `.dev-error`; all others use the plain style |
| 5 | Report | §4.4 |

The stop-after field column has no explicit width. Its input has no `size` attribute, so
the browser's default text-input width sets the column, about 163px in Chrome. The
document field spans the full panel width.

### 4.2 Counts line

A `<p class="dev-counts">`: 13px, `font-variant-numeric: tabular-nums`, `var(--text)`.
When at capacity, the capacity sentence is a `<span class="dev-capacity">` *inside* the
same paragraph (so it is read in order), displayed as a block: 12px,
`var(--text-muted)`. The counts line is not a live region. Counts use thousands
separators, as in the fspec examples.

### 4.3 Logging switches

Each switch is the existing `.dev-switch` component (vspec-005 §3.5) unchanged, with
`role="switch"`, `aria-checked`, and its visible label. The three sit in a
`<div class="dev-switches">`: flex column, gap 2px.

Each switch adds a trailing tag naming its console prefix, `<span class="dev-switch-tag"
aria-hidden="true">`: 11px, `ui-monospace, "Courier New", monospace`, `var(--text-muted)`.

Within `.dev-switches`, each `.dev-switch` also gets `flex-wrap: wrap`, `column-gap: 8px`,
`row-gap: 0`, and `text-align: left`. When the label and tag do not fit, the tag wraps to
a second line rather than squeezing the label.

States are those of vspec-005 §3.5: off (`var(--btn-bg)` track, `var(--text-muted)`
thumb), on (`var(--accent)` track, `var(--surface)` thumb, translated 14px), and
focus-visible (2px solid `var(--accent)` outline, offset 2px, round the whole switch,
label, and tag).

### 4.4 Replay report

#### Container (`.dev-report`)

| Property | Value |
|---|---|
| Element | `<div role="region" aria-label="Replay report" tabindex="0">` |
| Max height | 340px when stacked (below 1400px); `45vh` when side by side (`main.dev-host .dev-report` inside the ≥1400px query), matching the step list |
| Overflow | `overflow: auto`: scrolls vertically inside itself, and horizontally only if a JSON line is too long for the block |
| Padding | 8px 10px |
| Font | 12px, line-height 1.45, `var(--text)` |
| Border / radius | 1px solid `var(--border)` / 4px (Terminal: 0) |
| Background | None (panel surface) |
| Selection | `user-select: text` |
| Empty (`:empty`) | `display: none` (before the first replay, after a rejection, after Clear history) |
| Focus-visible | 2px solid `var(--accent)` outline, offset 1px |

The report is cleared when a replay proceeds past confirmation, so it stays empty during
"Comparing with current code…" and is refilled with the outcome. A declined confirmation
leaves the previous report in place.

Scrolling is nested: the side-by-side panel scrolls, the report scrolls inside it, and an
expanded JSON block scrolls inside the report. The Product Director accepted this.

#### Contents, in order

| Part | Element | Style |
|---|---|---|
| Scope line (with any notes) | `<p class="dev-report-scope">` | `var(--text-muted)` |
| Divergence summary | `<p class="dev-report-summary">` | margin-top 4px, weight 600 |
| Divergence list | `<ul>` directly after the summary; no heading | List rules below |
| Not-compared part | `<h4>` "Not compared", then `<ul>` | h4: margin-top 10px, 11px, weight 700, letter-spacing 0.07em, uppercase, `var(--text-muted)` |
| Errors part | `<p class="dev-report-errors">` (the counts sentence), then `<ul>`; no separate heading, since the sentence already starts with "Errors:" | p: margin-top 10px, weight 600 |

The not-compared and errors parts are omitted entirely when they have no items (fspec §5.8).

**Lists:** `ul` margin-top 4px, no padding, `list-style: none`. Each `li`: padding 3px 0 3px
8px, a 3px left bar, and 4px between consecutive items.

| Item | Left bar |
|---|---|
| Divergence (`li.dev-diverge`) | 3px solid `var(--conflict)` |
| Not compared (plain `li`) | 3px solid `var(--border)` |
| Error (`li.dev-error-item`) | 3px **dotted** `var(--conflict)` |

#### Divergence item

Each divergence `li` holds a native `<details>`.

**Collapsed:** the `<summary>` shows the native disclosure triangle followed by the
divergence line in 12px, **weight 400**. This overrides the 600 weight that `.dev-tool
summary` would otherwise give it. The cursor is a pointer. When the fspec appends an "Also
differs: …" clause, it sits in the same summary as a `<span class="dev-report-also">` in
`var(--text-muted)`, separated by a space and flowing on the same line. Summary
focus-visible: 2px solid `var(--accent)` outline, offset 1px.

**Expanded:** below the summary, a `<div class="dev-compare">` (flex column, gap 6px,
margin-top 6px) holds two blocks, Recorded then Current, stacked vertically. Side by side
would be too narrow at 480px. Each block contains:

- a label `<div class="dev-compare-label">`: 11px, weight 700, letter-spacing 0.05em,
  uppercase, `var(--text-muted)`;
- a `<pre class="dev-json" tabindex="0" role="region">`, with an accessible label naming
  the side. This is the existing Coach JSON style (vspec-005 §3.6) with
  `max-height: 180px`, `margin-top: 2px`, and `font-size: 11px`. It holds an object keyed
  by the differing part names, pretty-printed with 2-space indentation.

Every divergence item starts collapsed.

## 5. Generation Diagnostics Additions

### 5.1 Body order

The tool body (`.dev-tool-body`, flex column, gap 8px):

| # | Element |
|---|---|
| 1 | The diagnostics table (`.dev-table`), or the existing single-message `.dev-status` paragraph when there is no table (loaded puzzle, no origin) |
| 2 | Seed copy status line: `.dev-status`, `role="status"`; Copy seed failure uses `.dev-error`. Present even when there is no table, so the min-height (18px) space is constant |
| 3 | **Generate from seed** group (§5.3), always present |

### 5.2 Seed rows

**Seed** and **Seed chosen by** are the first two rows of the existing `.dev-table`, styled
as every other row (vspec-005 §3.7).

The Seed value cell holds the seed (or "Not recorded") as a `<span>` of selectable text in
the cell's monospace, followed by the Copy seed button (`.btn.dev-btn-sm`, §3.7) on the
same line. With no seed recorded, the button is disabled (0.38 opacity) and stays visible
in place. When the cell is too narrow (phone widths), the button wraps under the value.

### 5.3 Generate-from-seed group

A `.dev-group` (§3.1) titled "Generate from seed". It is the first group in this tool's
body, so it has no dotted rule above it.

| # | Element | Style |
|---|---|---|
| 1 | Field row | `.dev-inline` (§3.4): **Tier** field (label + `.dev-select`, §3.5); **Seed** field (`.dev-field` with class `.dev-field-seed`, `width: 15ch` ≈ 108px; label + `.dev-input`, `inputmode="numeric"`); **Generate** button (`.btn`, accessible name per fspec) |
| 2 | Generate status line | `.dev-status`, `role="status"`. Validation error and generator failure use `.dev-error`; all others use the plain style |

On a validation error the Seed input takes `aria-invalid="true"` (§3.3 invalid state) and
`aria-describedby` points to the status line. Editing the field removes the invalid state.

While a seeded run is generating, the existing busy card (vspec-003 §4) appears in the
game area as for any generation; the panel shows only the status line.

## 6. Dialogs

The Replay, Clear history, and Generate-from-seed confirmations, and the honest-fallback
dialog, use the existing confirmation dialog (`.modal-backdrop` / `.modal`, vspec-001)
**unchanged**. That covers size (max-width 340px), typography, Cancel (`.btn`) and confirm
(`.btn-primary`) buttons, theme overrides, and the backdrop. The longest Replay body (both
progress and history) wraps to three lines in that width; that is expected.

The only change is non-visual: the dialog element gains
`aria-describedby="modal-body"`, so the body is read on open (fspec-007 §11).

## 7. Focus Indicators (summary)

| Control | Indicator |
|---|---|
| Session recorder `summary` | Existing `.dev-tool summary` ring |
| Copy session, Clear history, Replay, Generate, Copy seed | Standard `.btn:focus-visible` ring (2px `var(--accent)`, offset 2px) |
| Text fields and textareas | 2px `var(--accent)` outline, offset 1px (`:focus`) |
| Tier select | 2px `var(--accent)` outline, offset 2px (`:focus`) |
| Logging switches | Existing `.dev-switch:focus-visible` ring |
| Report region | 2px `var(--accent)` outline, offset 1px (`:focus-visible`) |
| Divergence `summary` | 2px `var(--accent)` outline, offset 1px (`:focus-visible`) |
| Recorded / Current JSON blocks | Existing `.dev-json:focus-visible` ring |

## 8. Responsive and Handedness

No new breakpoints. The panel's layout rules (vspec-005 §4) are unchanged.

| Width | Behaviour |
|---|---|
| ≥ 1400px (side by side) | Panel 480px, sticky, scrolls internally. Report `max-height: 45vh`. All rows fit on one line in every theme except where noted below |
| 721–1399px (stacked) | Panel full width under the game (max 860px). Report `max-height: 340px` |
| ≤ 720px (phone) | No phone-specific rules. At 390px the panel content is about 334px wide; the items below wrap. There is no horizontal page scroll |

What wraps when space runs out (all via existing `flex-wrap` or text flow):

- **History button row:** Copy session and Clear history stay on one row at 390px. If they
  ever wrap, Clear history keeps `margin-left: auto` and sits at the right of its own line.
- **Generate row:** the Generate button wraps under the Tier and Seed fields when needed.
  At 390px this happens in Terminal, whose buttons are uppercase and wider.
- **Stop-after row:** the Replay button wraps under the field when needed.
- **Copy seed:** wraps under the seed value inside its table cell.
- **Logging switch tags:** wrap to a second line under their switch.
- **Report:** lines wrap within the box. JSON blocks scroll horizontally inside
  themselves. The copy-fallback textarea never wraps (§3.3).

**Left-handed layout:** nothing in this feature depends on `data-hand`. The panel stays on
the right (side by side) or below (stacked), as in vspec-005 §4. The inner layout is not
mirrored: Copy session stays left, Clear history right.

## 9. Theme Notes

All colours come from theme properties, so most themes need no overrides. Overrides and
inherited theme behaviour:

| Theme | Notes |
|---|---|
| Digital Terminal | `border-radius: 0` on `.dev-callout`, `.dev-input`, `.dev-textarea`, `.dev-select`, `.dev-report` (add them to the existing Terminal radius rule in `dev.css`; `.dev-json` is already in it). `.dev-select` border `var(--accent)` and arrow `#39ff14`. `.dev-btn-sm` uses Courier New 11px. The Terminal `.btn` rules (uppercase, 12px, letter-spacing 0.05em, radius 0, green hover glow) apply to every new button, including the danger button, whose red border and text are preserved (§3.6) |
| Coffee Shop | Theme `.btn` rules (6px radius, soft shadow) apply to the new buttons. Inset fields use `--given-bg` (tan), never `--bg` (dark backdrop). Select arrow `#8c6642` |
| School | `.btn` radius 3px applies. Select arrow `#718096` |
| Mountain | `.btn` radius 6px and shadow apply. Select arrow `#4d7a99` |
| Minimalist | Defaults. Select arrow `#7a7570` |

`prefers-reduced-motion`: the switches already drop their transition (vspec-005). No new
animation is introduced.

## 10. Implementation Notes

- **`hidden` must win over flex.** `.dev-field` (and other new classes) set `display`,
  which defeats the UA `[hidden]` rule. Add `.dev-panel [hidden] { display: none; }` to
  `dev.css`. The copy-fallback field is shown and hidden with the `hidden` attribute.
- **Status lines** reuse `.dev-status` / `.dev-error` unchanged (min-height 18px, so empty
  lines reserve their space, as in the existing tools). The only new non-status message
  element is the storage callout, which collapses when empty.
- **Heading levels:** panel `h2`, group titles `h3`, report sub-heading `h4`.
- **The report and fallback field** are rebuilt or toggled in place. Do not remove and
  re-insert the `role="status"` lines, or announcements may be lost.
- **Copy fallback:** when shown, the field is focused with all its text selected and
  scrolled to the top (`scrollTop = 0` after `select()`). Chrome otherwise scrolls the
  selection to the end.
- **Stop-after and Seed inputs** are `type="text"` with `inputmode="numeric"` (not
  `type="number"`, which accepts signs and exponents and adds spinners). Stop-after also has
  `pattern="[0-9]*"`. Both have `spellcheck="false"` and `autocomplete="off"`. So do the
  textareas.
- **Selector specificity:** see §3.6 for the danger button; `.btn.dev-btn-sm` needs the
  `.btn` compound to beat `.btn`'s padding.

## 11. Mockup-Only Scaffolding and Known Differences

### 11.1 Do not implement

These elements of `debug-instrumentation-v1.html` exist only to review the design:

- The yellow striped **mockup controls bar** (`.mock-bar`, `.mock-grid`, `.mock-info`, all
  `#m-*` controls), its viewport and announcement readout, and the whole "MOCKUP CONTROLS"
  style block.
- The `.dev-new-focus` marker class and the `body.mock-rings` rule that paints every focus
  ring at once.
- The static game area and header (copied from the live app), the sample counts, seeds,
  diagnostics, session documents, report content, and the timers that simulate checking,
  comparing, and generating.

### 11.2 Mockup choices made final

These were mockup v1 choices and are now confirmed in the fspec:

- "History cleared." and "History not cleared." share the Copy session status line, in the
  plain style.
- "Replay stopped…" and the copy-failure messages use the error style.
- The previous report is cleared when a new replay proceeds past confirmation.
- The not-compared part has the sub-heading "Not compared".
- The stop-after hint is a separate line beneath the stop-after row.

### 11.3 Known differences between mockup v1 and the spec (fspec governs)

| Item | Mockup v1 | Governing |
|---|---|---|
| Seeded-generation success status | "Generated a *Tier* puzzle from seed *S*." | fspec-007: "Generated from seed *S*: *Tier* puzzle." |
| Error items in the report | Mostly as specified; the "stopped" sample reads "…uncaught error **at** action 77…" | fspec-007: "Recorded — *kind* after action *n*: *message*" / "Raised during this replay — *kind* after action *n*: *message*" |
| Divergence time | `HH:MM:SS.mmm` | Same, now in fspec-007 |
| Tier select arrow colour | `#7a7570` in every theme except Terminal | §3.5 per-theme fills, matching the difficulty selector. This is the only visual refinement over v1 |
| Replay field placeholder ("Paste a session document (JSON)"), JSON block labels ("Recorded values" / "Current values") | Present in the mockup | Wording for the fspec; use only what it specifies |
