# Post-v1 Increments Review (V2)

Reviewer pass over post-v1 incremental changes against `docs/fspecs/fspec-001-v1.md`,
`docs/aspecs/aspec-ui.md`, `docs/vspecs/vspec-002-coach.md`, and
`docs/aspecs/aspec-coach-ui.md`. Date: 2026-05-22.

## Section 1 — Sign-off

All four post-v1 increments **APPROVED — no blockers**.

**1. Home-key shortcut (SELECT_FIRST_CELL)** — `js/ui/keyboard.js:26–38` binds Home with the
`!inInput` guard, `preventDefault`, dispatches `SELECT_FIRST_CELL`, then DOM-focuses via
`requestAnimationFrame`. Reducer `js/game/state.js:266–273` selects the first non-given
(first zero in `givens`), guards `!state.puzzle`. Matches fspec-001 §5.2 / aspec-ui §11.

**2. Simple Coloring rule-text fix** — `js/coach/analyzer.js:1071–1077` detects whether elim
targets are chain members (Rule 2) vs external (Rule 4) and branches the supporting text
accordingly. Correct.

**3. Context-aware error toast (5s)** — `js/ui/coach.js`: 5000ms timeout (`:267–270`);
`_lastSessionHadErrorRecap` flag set when an error recap fires (`:283`), checked on next
press (`:249–250`), cleared after use; tailored "That suggestion didn't work out…" text
only when `reason === 'error' && _lastSessionHadErrorRecap` (`:252–258`). Matches fspec §4.2.

**4. Coached-target focus-visible fix** — `css/grid.css:328–331` applies `outline-color:
var(--coach)` to `.coached-target:not(.selected):focus-visible` (and `.coached-cause`),
so the `.selected` accent outline survives when a coached cell is also selected. Matches
vspec §4.2 / aspec-coach-ui §12.3.

## Section 2 — Non-blocking observations

- **vspec §10 doc bug:** the parenthetical reads "After 3 seconds (per fspec §4.2 — 3s for
  error toasts…)", which is internally contradictory and disagrees with fspec §4.2 (5s).
  Code correctly implements 5s. Fix the vspec text in a doc-cleanup pass; no code change.
- Home key correctly does not create an undo snapshot (selection is not a move, fspec §9.7).
- Coached-cell `aria-describedby="#sr-coached-desc"` wiring in `grid.js` confirmed present.
