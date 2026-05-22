# Coach Analyzer Review (V2)

Reviewer pass against `docs/fspecs/fspec-002-coach.md` and
`docs/aspecs/aspec-coach-analyzer.md`. Date: 2026-05-22.

## Section 1 — Blockers

**RESOLVED 2026-05-22.** B1 was confirmed a code regression introduced by commit `acaccdf`
(2026-05-16); the claiming text was correct before that commit and was clobbered during its
cause-cell-detection rewrite. Fixed by restoring `analyzer.js:495,510` to the spec text
(matches fspec §545 and aspec §498). No test asserted the wrong string, so the fix is
regression-safe. **Analyzer now signs off clean.**

**BLOCKER 1 (resolved) — Locked Candidates claiming-variant supporting text (fspec §8.3, line 545)**

- *Spec requires:* claiming variant text "`[Digit] in this [row/column] only appears within
  this box — eliminate it from the rest of the box.`"
- *Implementation does* (`js/coach/analyzer.js:495` row, `:510` column): "`[Digit] in this
  [row/column] is confined to this box — eliminate it from the rest of that box.`"
- *Why it matters:* fspec is authoritative for learner-facing copy. The *pointing* variant
  (`:466,:478`) correctly uses "confined to" per fspec line 543; only the *claiming* variant
  diverges, so the two halves of the same technique read inconsistently vs the spec.
- *Suggested fix:* change `:495` and `:510` to "`only appears within this box — eliminate it
  from the rest of the box.`" (Logic, schema, arrows all correct — wording only.)

Verified directly against source by the Orchestrator.

## Section 2 — Fidelity assessment (otherwise clean)

**Functional (fspec-002):** all 15 techniques implemented (ranks 1–15); rank 1–2 are
`placement`, 3–15 `elimination`; CoachStep shape/fields match §8; null cases
(`complete`/`inconsistent`/`error`) per §4.2; auto-reveal false for ranks 1–2, true for
3–15; complexity acknowledgment always-true for Forcing Chain (rank 15), conditional for
XY-Chain (rank 14) above `COMPLEXITY_THRESHOLD`. All supporting-text patterns match
templates **except** Blocker 1.

**Architectural (aspec-coach-analyzer):** module at `js/coach/analyzer.js` (§1.1); single
named export `analyze(puzzle, playerState)` (§2); pure (no DOM/events/persistence/global
state); imports limited to `js/solver/` and `js/util/` (§1.2); CoachStep schema sealed —
all fields present, never undefined (§3); technique names canonicalized (§3.1);
working-board construction per §5; pre-solver error checks (conflicts + non-conflicting
wrong entries) per §9.1; pencil-intersection asymmetry correct (erasures authoritative,
additions cannot expand the logical set, §9.1); `RANK_BY_NAME` complete 1–15.

Per-technique mappers (all 15) reviewed individually — cause-cell selection, arrow
emission, orientation detection (X-Wing/Swordfish/Jellyfish), XY-Wing hinge matching,
Simple Coloring Rule 2/4 distinction, XY-Chain short/long handling, and Forcing Chain
strong/weak link differentiation all match spec.

## Section 3 — Non-blocking observations

- `COMPLEXITY_THRESHOLD = 6` per aspec §7.14 default.
- `deriveChainEdges` correctly identifies bilocation edges and dedups by stringified pair.
- Multi-Coloring technique module returns a structurally odd single-element `colorChains`
  shape with `groupA`/`groupB`; analyzer interprets it correctly. Cosmetic only.
- JSDoc present and accurate; structure is test-friendly (deterministic, side-effect free).
