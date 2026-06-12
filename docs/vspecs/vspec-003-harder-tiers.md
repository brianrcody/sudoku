# Visual Design Spec: Harder Difficulty Tiers
**ID:** vspec-003-harder-tiers
**Status:** Approved
**Date:** 2026-06-12
**Author:** Uber Developer (Visual Designer stage)
**Based on:** fspec-003-harder-tiers
**Approved mockup:** docs/mockups/harder-tiers-v1.html (approved by Product Director 2026-06-12, no flags)

---

## 1. Scope

Visual deltas only. Everything not specified here inherits vspec-001 (game) and vspec-002
(coach) unchanged. **No new theme custom properties are introduced** — all new visuals
compose existing per-theme tokens, so every theme works without per-theme additions.

## 2. Tier Names

Display strings: `Kiddie, Easy, Medium, Hard, Expert, Diabolical, Nightmare` — used
verbatim in the difficulty selector (this order), statistics table, dialogs, and SR
announcements. Plain text; no badges or iconography in production (the "new" pill in the
mockup is mockup-only annotation).

## 3. Statistics Table

Seven rows in selector order. No visual change to the table itself; new rows render
identically to existing ones, with em-dash for empty best-time (existing convention).

## 4. Generation Progress (Diabolical/Nightmare only)

Rendered inside the existing busy/generating surface:

- **Spinner:** 22px circle, 3px ring, `border-color: var(--accent-light)`,
  `border-top-color: var(--accent)`, rotation 0.9s linear infinite.
- **Title:** existing "Generating puzzle…" text, 15px / 600.
- **Progress line** (appears after 3 s): 13px, `var(--text-muted)`, min-height 18px to
  prevent layout shift; text per fspec §5.2 ("Searching for a worthy puzzle… (attempt N
  of M)").
- **Cancel button:** standard `.btn` (existing token set), centered below the progress
  line, 16px top gap.
- Container: existing busy presentation; if the current implementation has no card, use
  `var(--surface)` background, 1px `var(--border)` border, 10px radius, 22×24px padding,
  centered text, width matching the coach panel (414px desktop, 100% mobile).

## 5. Honest-Fallback Dialog

Uses the existing modal component and tokens verbatim (`.modal-backdrop`, `.modal`,
`.modal-actions`, `.btn`, `.btn-primary`). Title: `No ⟨Tier⟩ puzzle found`. Body and
buttons per fspec §5.4. Confirm (`Play ⟨ActualTier⟩`) is the primary button, right-aligned
(existing dialog convention).

## 6. New Coach Cell Role: Fin (`.coached-fin`)

| Property | Value |
|---|---|
| Background | `var(--coach-mid)` |
| Ring | `outline: 2px dotted var(--coach); outline-offset: -3px` |
| Tag | `::after` content `"fin"`, absolutely positioned top-right (top 1px, right 2px), system-ui 7.5px / 700, color `var(--coach)`, letter-spacing 0.02em |
| Pencil marks | inherit cell pencil colors; coached digit uses `var(--coach)` bold (existing auto-reveal convention) |
| Selected/focused | same override pattern as `.coached-elim-target` (dashed/dotted ring replaced by solid `var(--accent)` outline when selected) |

The dotted ring + text tag are the non-color distinguishers (fspec §9.5): dotted ≠ dashed
(elimination) ≠ solid (cause), and the tag is readable irrespective of palette.

## 7. Technique Visual Compositions (no new primitives)

- **XYZ-Wing / WXYZ-Wing:** `.coached-cause` cells + existing `chain-edge` arrows
  (pivot→wings, solid/strong) + `dashed-arrow` pointers to `.coached-elim-target` cells.
  Identical primitives to XY-Wing (vspec-002 §5/§6).
- **Finned X-Wing / Finned Swordfish:** existing `connector-chain` closed outline through
  the base corner cells + `.coached-fin` cell(s) + `dashed-arrow` from the fin to each
  elimination cell.
- **Unique Rectangle (all coached types):** four `.coached-cause` cells joined by a
  `connector-chain` closed rectangle; elimination cells additionally get
  `.coached-elim-target` (a cell may carry both, as in the mockup's roof cell — cause fill
  with dashed ring on top).
- **ALS-XZ (limited):** Set A = `.coached-sc-a`, Set B = `.coached-sc-b`,
  eliminations = `.coached-elim-target`. **No arrows of any kind.** Panel shows the
  acknowledgment note styled as the existing `.coach-panel-note`.

## 8. Responsive / Themes

No new breakpoints. All compositions reuse cell-level classes and the existing SVG overlay,
which already scale with the grid. All five themes get the new visuals for free via the
existing `--coach*` custom properties; verify Terminal's square-corner overrides apply to
the busy card (inherit the existing `body.theme-terminal` modal/panel rules where the
busy card is implemented).

## 9. Accessibility Notes (visual layer)

- Fin tag text stays ≥ 7.5px only because it is supplementary; the SR path announces "fin"
  via supporting text, never via the tag.
- Progress line color `var(--text-muted)` meets contrast on `var(--surface)` in all five
  themes (same pairing already used for dialog body text).
