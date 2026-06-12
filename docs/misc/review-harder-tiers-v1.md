# Review Report — Harder Difficulty Tiers (V3), v1
**Date:** 2026-06-12
**Reviewer:** Uber Developer (Reviewer stage)
**Scope:** Implementation vs. fspec-003-harder-tiers, vspec-003-harder-tiers,
aspec-harder-tiers; plus the incidental forcingChains soundness fix
(`bugs-forcing-chains-soundness.md`).

---

## Verdict: SIGN-OFF

The implementation matches all three specs. One fspec gap found during this review
(§9.3 focus handoff to the Cancel button) was fixed and tested (UB8) before sign-off.
Non-blocking observations in §4.

## 1. Functional spec fidelity (fspec-003)

| Section | Status | Evidence |
|---|---|---|
| §2 Tier structure/naming, 7-option selector, no "Death March" string | ✓ | `config.js` `DIFFICULTY_ORDER`/`TIER_LABELS`; controls/stats render from config; repo-wide grep clean (comments only); live Playwright check of the selector |
| §3 Migration (stats fold-in, diff pref, in-progress blob, cache discard, idempotence) | ✓ | `persist/migrate.js`, `cookieStatsStore.load()`; tests MG1–6, CS8–9. Deviation noted in aspec §4.2: stateless idempotence instead of a version marker (same observable behavior) |
| §4 Per-tier behavior (hints/Check/correctness; coach at all tiers) | ✓ | config maps; no tier gating in `coach.js` |
| §5.1–5.2 Busy card + progress line ≥3 s, top tiers only | ✓ | `ui/busy.js` (`PROGRESS_DELAY_MS`, `PROGRESS_TIERS`); UB1–5 |
| §5.3 Cancel restores prior state | ✓ | `main.js` `_cancelForeground` + AbortController; UB6; worker abort path pre-existing (W4) |
| §5.4 Honest fallback dialog, true-tier labeling, stats attribution | ✓ | `main.js` `_requestForeground`; wording matches fspec verbatim; `NEW_PUZZLE` uses `puzzle.difficulty`; W8 (worker), PP10 (provider shape) |
| §5.5 Pre-generation extends to new tiers | ✓ | provider iterates `DIFFICULTY_ORDER`; `primeNext` unchanged |
| §6 Coach texts/visuals for 6 new techniques | ✓ | analyzer mappers match fspec §6 strings verbatim; analyzer tests assert content |
| §7 Fidelity policy (per-technique; ALS limited; coach never acts) | ✓ | ALS mapper: no arrows + acknowledged note; live check on a Nightmare board showed full Hidden Single coaching (§7.3) |
| §8 Statistics | ✓ | 7 rows, Expert legacy fold-in (CS8/9), US1–5 |
| §9 A11y | ✓ | native select; SR throttle 10 s (busy.js); Cancel `aria-label` + focus handoff (UB8, fixed during review); dialog component reused; fin non-color distinguishers; note in SR flow (existing coach.js path) |
| §10 Edge cases | ✓ | mid-gen difficulty change aborts (main.js `CHANGE_DIFFICULTY` listener); legacy-board no-technique path unchanged; storage failures tolerated (silent persist layer) |

## 2. Visual spec fidelity (vspec-003)

- Fin treatment (`.coached-fin`): `--coach-mid` fill, 2px dotted `--coach` ring, "fin"
  tag, selected override — matches §6 exactly; composes existing theme tokens (no new
  properties), so all five themes inherit it. ✓
- Busy card: spinner/title/progress/Cancel sizes and tokens per §4, Terminal
  square-corner override included. ✓
- Dialog: existing component verbatim. ✓
- Technique compositions reuse existing primitives only (connector-chain, chain-edge,
  dashed-arrow, scA/scB) per §7. ✓
- Tier names plain text everywhere (mockup's "new" pills correctly not shipped). ✓

## 3. Architectural fidelity (aspec-harder-tiers)

- File structure matches §3/§4/§5 (new modules exactly where specified; no new
  dependencies; no server code). ✓
- Ladder order and `tierForRank` boundaries match §2; rating invariants hold (Kiddie–Hard
  fixtures rate identically — existing rater/logical tests pass unmodified except the two
  that were re-fixtured for documented reasons). ✓
- `CoachStep` sealed-schema amendment implemented as specified (`roles.fin` everywhere,
  rank 1–21, six canonical names); amendment note added to `aspec-coach-analyzer.md`. ✓
- Budgets/targets per §4.1 (expert 300, diabolical 2000, nightmare 300; strip-to-minimal
  targets for the new tiers). ✓
- Increments were implemented in one pass rather than three suite-green checkpoints
  (single-agent pipeline; the staged exit criteria were verified once at the end).
  Process deviation, no spec impact.

## 4. Non-blocking observations

1. **Sound XY-Chains are almost always "long."** The sound DFS is depth-biased, so
   `complexity.acknowledged` will be true for nearly all XY-Chain coach steps (mining
   20k+ boards found no short-chain first-fire). The short-arm mapper code is retained
   and correct but effectively dormant; documented as a coverage exception. If short-chain
   coaching matters, a future change could make the DFS prefer shortest chains
   (breadth-first), which would also produce friendlier coaching.
2. **`main.js` fallback/cancel wiring is unit-untested** (bootstrap file; historically
   exception-listed). Validated manually via Playwright (selector, nightmare generation,
   coach) and covered indirectly by W8/PP/UB tests at the layers below.
3. The pre-V3 `rank14Short`/L3/R3 fixtures were retained in renamed/re-mined form; their
   original "passing" status was an artifact of conditional assertions — see
   `bugs-forcing-chains-soundness.md` §6 follow-ups, all of which are now done (sweep
   promoted, permissive AIC tests replaced by mined-fixture assertions, FC chain shapes
   re-validated).
4. Curated "Death March" (Step 3 / V4) deliberately untouched; nothing in V3 precludes it.
