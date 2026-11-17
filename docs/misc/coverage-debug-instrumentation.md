# Code Coverage Report — Debug Instrumentation

Coverage tool: c8 via Playwright `page.coverage`, reproduced per `CodeCoverageV2.md` §6.
Method for modified files (tspec-debug-instrumentation §10.1): zero-hit branches and
uncovered lines from lcov intersected with the lines added since the pre-feature commit
(`git diff -U0 a4defe6`).

## Phase 0 + Phase 1 — 2026-11-15

**Test run:** 1237 passing, 0 failing, 10 pending (`npm test`). Starting point before this
phase's tests: 1146 passing, 1 failing (`PERF-NEW-medium` timeout, the known flake), 10
pending. One intermediate run had a lone `PERF-NEW-hard` overrun (2305 ms vs 2000 ms); it
passed on the rerun.

**Project-wide:** 97.19% statements, 95.09% branch.

### Files Phase 1 touched

The intersection with added lines is empty for every file. Every remaining zero-hit
branch is on a line that predates the feature.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/util/events.js` | 96.55% (28/29) | 53 | Pre-existing: `emit` to a type with no listener map (`if (!ls) return`) |
| `js/game/state.js` | 99.09% (328/331) | 95, 96, 455 | Pre-existing: `deriveCoachedCells` `scA`/`scB` loops never non-empty; `PENCIL_TOGGLE` won guard (a won board has no empty cell to select) |
| `js/game/puzzleLoader.js` | 100% | — | — |
| `js/generator/loadPuzzle.js` | 100% | — | `validateGivens` covered by LP1–LP10 (LP11–LP13 are Phase 2) |
| `js/ui/srLive.js` | 87.50% (7/8) | 18 | Pre-existing: `?? document.getElementById` fallback in `mount` |
| `js/ui/dialog.js` | 92.86% (13/14) | 110 | Pre-existing: pre-mount guard in `close` |
| `js/ui/coach.js` | 88.30% (83/94) | 81, 92, 144, 197, 270, 352, 353, 369, 414 | Pre-existing; both new branches (restore with / without a pending recap timer) covered by CO1a/CO1b |
| `js/persist/storage.js` | 100% | — | — |
| `js/util/clipboard.js` | 100% | — | — |
| `js/game/statistics.js` | 100% | — | — |
| `js/providers/cookieStatsStore.js` | 100% | — | — |
| `js/providers/clientGenProvider.js` | 95.24% (40/42) | 68, 167 | Pre-existing: 68 `GEN_ERROR` path — Phase 2 (PP21); 167 the stored-entry version / missing-puzzle gate — no phase assigns it. All three `pregen.*` emits covered by SW1 |
| `js/main.js` | 90.80% (79/87) | 277, 280, 304, 314, 322, 323, 372, 373 | Pre-existing: honest-fallback dialog and generation-error catch (V3 exception) — closed by Phase 1B/2 `foreground.test.js` per aspec §16.5 G3. The added `main.requestForeground` emit line is executed by the existing SHR40/41 tests; its assertion is deferred to Phase 1B |

### Phase 0 baseline

`js/tests/fixtures/state/golden-trace.json` was captured from commit `a4defe6` by
`node js/tests/tools/captureGoldenTrace.js a4defe6` (a `git archive` of `js/` served
under `/head/`; the working tree was not touched). It holds 638 records from 322
dispatches. SG1–SG3 and PR5 compare identically against the working tree.

## Phase 1B (foreground extraction) — 2026-11-15

**Test run:** 1286 passing, 0 failing, 10 pending (`npm test`). Starting point: 1239
passing, 0 failing, 10 pending. One intermediate run had a lone `PERF-NEW-medium` timeout
(the known flake); it passed on the rerun.

**Project-wide:** 97.42% statements, 95.29% branch.

**Tests added (47):** `unit/foreground.test.js` FG1–FG31 (45 cases with the
parameterised families), `unit/arch.test.js` AR-D7 (2). `unit/storage.test.js` LS4 now
restores `localStorage` by deleting its own `setItem` stub; `unit/swallowed.test.js`'s
header points to `foreground.test.js` for the `foreground.request` site (SW2).

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/game/foreground.js` | 100% (43/43) | — | Reached by `foreground.test.js` alone. One function is never called: the `console.error` default of `logError` (every test injects a spy); it is a function, not a branch |
| `js/main.js` | 94.20% (65/69) | 231, 232, 280, 281 | Pre-existing (HEAD lines 318, 319, 368, 369): `_isInProgress` with no puzzle / a won board, and `_saveState` with no puzzle / a handled win. Reaching them needs integration tests that click New Puzzle with no puzzle or on a won board, and that fire the debounced save with no puzzle or after the win is handled. The V3 exception (honest-fallback dialog, generation-error catch) is gone from `main.js`: that code now lives in `foreground.js` at 100% |

`main.js` also has one never-called function, the `onConfirm` of the "Start a new
puzzle?" dialog (line 198; HEAD line 214): no integration test confirms New Puzzle
mid-game. It is not a branch.

## Phase 2 (seed plumbing and the Unrated fallback) — 2026-11-15

**Test run:** 1360 passing, 0 failing, 10 pending (`npm test`), three consecutive runs.
Starting point: 1286 passing, 0 failing, 10 pending.

**Project-wide:** 97.59% statements, 95.42% branch.

**Tests added (74):** `unit/pipeline-diagnostics.test.js` PD9–PD12 and PR4 (18; PD2 and
PD7 extended per tspec §3.1); `unit/protocol.test.js` WP4–WP6 (6; WP2 extended);
`unit/loadPuzzle.test.js` LP11–LP12 (8); `unit/loadProvider.test.js` LV8–LV11 (5);
`unit/puzzleProvider.test.js` PP12–PP22 (14, fake worker through `createWorker`);
`unit/inspect.test.js` IN36–IN39 and GD1 (`generationDiagnostics`, aspec §11.4) (10; IN35
extended); `unit/foreground.test.js` FG32–FG41, the Phase 2 rows of aspec §9.4 (13).
PD13 and LP13 are the existing PD1/PD6 and LP1–LP10, unchanged and passing.

`integration/perf.test.js` `PERF-NEW-*`: no longer waits on the achieved tier (a Medium
request falls back to another tier in about 7% of runs). The untimed difficulty change is
repeated until the puzzle is at the tier, and the timed New Puzzle completes on any new
puzzle.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/generator/pipeline.js` | 96.87% | 172 | Pre-existing (HEAD): `tierForRank(best…) ?? tier` on the non-degenerate fallback; `best` is always a solved candidate, so the `?? tier` arm is unreachable. Both arms of the new `result.solved ? … : UNRATED` covered by PD11/PD12 |
| `js/generator/loadPuzzle.js` | 100% | — | `validateGivens`, `checkGivens`: LP11, LP12 |
| `js/worker/protocol.js` | 100% | — | WP4–WP6 |
| `js/providers/loadProvider.js` | 100% | — | LV8–LV11 |
| `js/providers/clientGenProvider.js` | 96.66% | 102, 204 | Pre-existing: 102 the `\|\| 'Worker error'` fallback for an `onerror` without a message (the line moved, the expression is HEAD's); 204 the stored-entry version / missing-puzzle gate. Every added arm (seeded vs not, kind, `gen?.seed`, `gen ?? {}`, fallback event, Unrated discard, abort/error events) is covered by PP12–PP22 and SW1 |
| `js/game/foreground.js` | 100% | — | FG1–FG41. One never-called function: the `console.error` default of `logError` (not a branch) |
| `js/dev/inspect.js` | 100% | — | IN32–IN39, GD1 |
| `js/worker/generator.worker.js` | — | — | Outside the collector (worker). `CHECK_REQUEST` exercised through the real worker by LV11; `seeded` and `elapsedMs` forwarding are asserted end to end by DBG-G / DBG-L2 (Phase 6/8); the pipeline and protocol code it calls is covered by direct import |

## Phase 3 (codec and machine) — 2026-11-16

**Test run:** 1759 passing, 0 failing, 10 pending (`npm test`). Starting point: 1360 passing, 0 failing, 10
pending. The new files take about 2 s in isolation; the whole run took 328 s before and 327 s after
(within run-to-run noise). The pre-existing `reading 'includes'` browser errors are unchanged (6).

**Tests added (399):** `unit/sessionCodec.test.js` (387) and `unit/machine.test.js` (12),
with shared builders in `helpers/codecFixtures.js`; both registered in `setup.html`.
SC1–SC35 and PR1 (3 seeds × 600 actions plus 14 hand-built edge states, at the strategy's
sizes) and MC1–MC10. Beyond the strategy's rows, for the per-kind and settled-point
requirements and for branch coverage: optional fields present and absent for every kind
that has one (16), `encodeAction` refusals (17), `validateActionItem` check order (15),
`isInformational` (4), `buildDocument` entries (3), `encodePosition` refusals (6).
`sessionDriver.js` is unchanged: no Phase 3 case needs a kind it does not produce.

**Project-wide:** 97.79% statements, 95.97% branch.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/sessionCodec.js` | 100% | — | — |
| `js/dev/machine.js` | 100% | — | Two functions are never called: the null statistics object's `recordAttemptOnce` and `recordWin`. The machine passes `statsSuppressed: () => true`, so the reducer never calls them; they are functions, not branches |

## Phase 4 (recording) — 2026-11-16

**Test runs:** 1919 passing, 0 failing, 10 pending (`npm test`), three consecutive full runs
(346 s, 338 s, 337 s). Starting point: 1760 passing, 0 failing, 10 pending in 343 s. The new
unit files take about 5 s in isolation (real IndexedDB, one database per test) and the
integration group about 9 s (DBG-B7 waits 3.5 s on the real check-highlight timer); the
whole run is within run-to-run noise. The six `reading 'includes'` browser errors are gone:
GF17 and GF22 now give their hand-built coach steps `roles.fin` (`fin: []`).

**Project-wide:** 97.97% statements, 96.32% branch.

**Tests added (159):** `unit/recorderStore.test.js` RS1–RS23 (38, with
`helpers/fakeIdb.js`), `unit/recorder.test.js` RC1–RC33 (52; RC22b is in `devBoot`),
`unit/devLog.test.js` DL1–DL9 (27), `unit/devBoot.test.js` DB1–DB9 and RC22b (21),
`unit/devMode.test.js` DM10–DM15 (9), `integration/debug.test.js` DBG-B1–B7 (7),
plus `integration/devmode.test.js` DVI2 extended with the six boot-time modules
(tspec §3.1). `setup.js` gains a global `afterEach` that deletes `sudoku-dev-recorder`.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/recorderStore.js` | 100% | — | — |
| `js/dev/recorder.js` | 99.21% | 374 | Unreachable: `errorsSince`'s `seen.has(entry)` skip. `raised` receives each error entry exactly once (only when `captureError` creates it), so no entry can appear twice in `raised.slice(mark)` |
| `js/dev/devLog.js` | 100% | — | — |
| `js/dev/devBoot.js` | 100% | — | — |
| `js/dev/devMode.js` | 100% | — | DM10–DM15 |
| `js/main.js` | 94.8% | 242, 243, 291, 292 | Pre-existing (Phase 1B lines 231, 232, 280, 281, moved by the step 1.5–7 changes): `_isInProgress` with no puzzle / a won board, `_saveState` with no puzzle / a handled win. Every added arm (`devBoot` present vs absent at steps 1.5, 5, 6, 7) is covered by DBG-B1–B7 and the existing dev-off integration tests |

## Phase 5 (replay engine and fixtures) — 2026-11-16

**Test runs:** 2119 passing, 0 failing, 10 pending (`npm test`), two consecutive full runs
after the last change (360 s and 378 s), no browser console errors. Starting point: 1918 passing, 1 failing
(PERF-NEW-hard, "Timed out waiting for predicate"; a timing flake that did not recur in any
later run), 10 pending. The new files take about 11 s in the full run, almost all of it the
fidelity sweep with PERF-D2u (`[PERF] Fidelity sweep` 10.6–11.2 s).

**Tests added (200):** `unit/replay.test.js` RP1–RP40 (157), `unit/replayFixture.test.js`
RF1–RF8 and the upgrade note (12), `unit/session-fixtures.test.js` FX1–FX7, FX9 (15),
`unit/fidelity-sweep.test.js` PR2 (5 runs), PR3 (4), PERF-D2u (1), with
`helpers/fakeClock.js`; all registered in `setup.html`. Phase 4 corrections:
`unit/recorderStore.test.js` +2 (the second `swallowed` event's message for an unreadable
history and for a newer build), `unit/recorder.test.js` +4 (boot position that cannot be
encoded: empty start with the error kept, a saved history overwritten, a valid export; and
a store throwing during the hand-over, which the correction made the only route into
`ready`'s catch). No existing assertion needed changing.

**Fidelity sweep:** seeds 1–3 × 1,500 actions at capacity 5,000, seed 4 × 3,000 at
capacity 50, seed 5 × 300 at capacity 1; PR3 seeds 11–14 × 600 at capacities 1, 2, 7, 50
against an unbounded twin. No divergence. PERF-D2u: 5,000 actions (191 coach starts,
218 hints), `run` + `replaceHistory` 75–147 ms against a 500 ms bound.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/replay.js` | 100% | — | RP1–RP40 |
| `js/dev/recorder.js` | 100% | — | The unreachable `errorsSince` check is gone |
| `js/dev/recorderStore.js` | 100% | — | — |
| `js/tests/helpers/replayFixture.js` | — | — | Test code, excluded from the report; every path exercised by RF1–RF8 |
**Project-wide:** 98.16% statements, 96.64% branch.

## Phase 6 (controller and API) — 2026-11-16

**Test runs:** 2437 passing, 0 failing, 12 pending (`npm test`), two consecutive full runs
after the last change (408 s and 400 s), no browser console output. Starting point: 2119
passing, 0 failing, 10 pending (379 s). The new tests add about 30 s: the unit files about
14 s (most of it the seeded runs through the real pipeline), the Phase 6 integration group
about 16 s.

**Tests added (318, 2 of them skipped pending production fixes):**
`unit/devSession.test.js` DS1–DS37 plus the replay-against-a-live-game and real-pipeline
seeded-generation cases (197), `unit/devApi.test.js` DA1–DA5 plus hostile arguments and
failure-leaves-state cases over a real controller (106), `unit/devPanel.test.js` DP70–DP71
(2; its `afterEach` now deletes `window.sudokuDev`, which every mount installs),
`integration/debug.test.js` Phase 6 group: dev-off / dev-on API presence, DBG-G1–G8 (15).
New helper `helpers/devSessionRig.js`. Both unit files registered in `setup.html`.

**Skipped pending a production fix:**

1. `devSession.test.js` "D-34: marks restored by ending the session to a cell that now
   holds a digit are counted". KIDDIE loaded; r1c3 marked 1; `COACH_START` with
   `eliminationStep()` (reveals 4, 9 in r1c3 and 2, 6 in r1c4); `PEN_ENTER 4` with
   `fromHint: true` in r1c3 (the session continues); `fillPencilMarks()`. Ending the
   session restores mark 1 to r1c3, which now holds a digit: 50 cells' marks differ,
   `cellsChanged` is 49. `fillPencilMarks` counts empty cells only. For empty cells the
   count is right, including revealed marks (the passing D-34 case).
2. `devApi.test.js` "generate with arguments that are not valid fails with busy during a
   replay commit". `devApi.generate` checks tier, seed and budget before the controller's
   `applying` check, so during a commit `generate('bogus', 1)` returns `invalid-tier` and
   `generate('easy', 1, { budget: 0 })` `invalid-budget`, not `busy` (fspec D-34). The
   controller itself puts `busy` first (DS23).

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/devSession.js` | 100% | — | DS1–DS37 |
| `js/dev/devApi.js` | 100% | — | DA1–DA5 |
| `js/dev/devPanel.js` | 100% | — | DP1–DP71 |
| `js/main.js` | 94.73% | 242, 243, 291, 292 | Pre-existing (as Phase 4): `_isInProgress` with no puzzle / a won board, `_saveState` with no puzzle / a handled win. The step 11–12 changes add no branch; `getGenerationTier` is not called until Phase 7 (a function, not a branch) |

**Project-wide:** 98.26% statements, 96.85% branch.

## Phase 7 (panel) — 2026-11-16

**Test runs:** 2598 passing, 0 failing, 10 pending (`npm test`), two consecutive full runs
after the last change (375 s and 371 s), no browser console output. Starting point: 2437
passing, 0 failing, 12 pending (371 s). The new tests add about 13 s: `recorderPanel`
about 8 s, the `devPanel` additions about 2 s, the integration group about 3.5 s.

**Tests added (159), and 2 enabled:**
`unit/recorderPanel.test.js` RPN1–RPN13, RPN15 and the unit side of A23–A36 and A39 (114);
`unit/devPanel.test.js` DP73–DP79, A37–A39 and the API-run focus case (39; DP72 is the
existing DP6); `unit/devSession.test.js` +1 (a panel replay superseded at its confirmation
has the dialog closed as declined; only the newer replay reports);
`integration/devmode.test.js` RPN14 ×4 (keys in the fallback, replay, stop-after and seed
fields never reach the board) and the two `data-keep-selection` cases (Clear history on an
empty history leaves 0 actions; a replay right after Clear history on a board without
progress asks nothing). DVI2 gains the panel-time modules; DVI22 also iterates inputs,
selects and focusable regions, skipping the report while it is empty (`display: none`).
`recorderPanel.test.js` registered in `setup.html`.

**Enabled:** the two Phase 6 skips, `devSession.test.js` "D-34: marks restored by ending
the session to a cell that now holds a digit are counted" and `devApi.test.js` "generate
with arguments that are not valid fails with busy during a replay commit". Both pass
unchanged.

**Placement notes.** RPN14 runs in the app (as DVI15 does) rather than as a unit test:
`ui/keyboard.js` installs a document listener that cannot be removed. Focus rings that use
`:focus-visible` (buttons, switches, report, divergence summaries) are left to A39 in
Phase 8; the `:focus` rings of the new text fields and the tier select are asserted here.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/recorderPanel.js` | 100% | — | RPN1–RPN15 |
| `js/dev/devPanel.js` | 100% | — | DP1–DP79 |
| `js/dev/devSession.js` | 100% | — | DS1–DS37 and the supersede-closes-dialog case |
| `js/dev/devApi.js` | 100% | — | DA1–DA5 |

**Project-wide:** 98.31% statements, 96.91% branch.

## Phase 8 (final) — 2026-11-17

**Test runs:** three consecutive full runs after the last change: 2737 passing, 0 failing,
11 pending (528 s); 2736 / 0 / 12 (525 s); 2737 / 0 / 11 (526 s). No browser console
errors or page errors in any run. Starting point: 2591 passing, 7 failing (FX1 ×5, FX9 ×2,
the re-recorded baseline), 10 pending (372 s). The extra pending test in the second run is
one of the pre-existing conditional `this.skip()` guards in `system.test.js` / `perf.test.js`.
Pending: the 10 pre-existing (SS17 deferred to the undo spec; SYS1 and the conditional
guards) plus DBG-L3 (a), skipped on a confirmed defect (below). The machine carried a load
average of 3.5–4 from other work during these runs (the fidelity sweep took 10.3–10.6 s
against 9.2 s at the starting run); the new tests themselves take about 90 s
(the Phase 8 integration group ≈ 45 s, a11y ≈ 15 s, perf ≈ 17 s, unit additions ≈ 12 s).

**Tests added (140, one skipped):**
`unit/session-fixtures.test.js` +7 (FX1 re-pinned to the new baseline with the structure
assertions; FX4, FX6, FX7 moved to the baseline, FX6 now over the whole document; FX8 ×3 on
the baseline advanced past its first coach start; FX9 on `first-boot-null-start.json`);
`unit/replay.test.js` +12, `unit/devSession.test.js` +11, `unit/recorderPanel.test.js` +4,
`unit/devPanel.test.js` +2 (D-35 d/e/f, review M5); `unit/foreground.test.js` +36 (a
delivered puzzle that fails to load, on every path, and M4: one `failed` event per failure
through the real provider); `unit/state-golden.test.js` DBG-OFF7; `unit/recorder.test.js`
PERF-D3 and error collapse at capacity; `integration/debug.test.js` Phase 8 group (38:
DBG-OFF1–6, DBG-SYS1 ×5, DBG-SYS2, DBG-R1–R8, D-36 ×2, DBG-M1, `?dev=0` in a second tab,
DBG-L1, DBG-L2 ×3, DBG-L3 ×2, DBG-E1 ×3, DBG-A1, the export → reload → replay round trip,
D-35 e ×3); `integration/a11y.test.js` (19: tab order, Enter/Space, A39 ×10, A33/A35/A38,
A42, A42b, A31, A41); `integration/perf.test.js` (8: PERF-D1, D2, D4, D5, D6, D7, D8 ×2).
New helper `helpers/longSession.js`.

**Skipped on a production defect:** DBG-L3 (a) "a corrupt pre-generation entry at boot is
logged as swallowed at pregen.load". `providers/puzzleProvider.js` creates the generation
provider when the module is evaluated, and `clientGenProvider.js` reads the cache in that
constructor (`_loadFromStorage`, line 47). `main.js` imports it statically, so this runs
before step 1.5 creates `devBoot` and its log subscribes to `diagnostics`; the
`pregen.load` event has no listener and is never logged (fspec §8.1).

**Project-wide:** 98.32% statements, 96.98% branch.

| File | Branch | Zero-hit branch lines | Status |
|---|---|---|---|
| `js/dev/*` (13 files) | 100% | — | `machine.js` functions 80%: the null statistics object's two methods are never called (not branches) |
| `js/game/foreground.js` | 98.43% | 162 | Gap by instruction: the `delivered` arm of the catch is now reached only when the preference write or `openDialog` throws after delivery, which the post-review fix does not cover and which is not to be pinned |
| `js/main.js` | 95% | 242, 243, 291, 292 | Pre-existing (`_isInProgress` / `_saveState` guards) |
| `js/game/state.js` | 99.13% | 95, 96, 455 | Pre-existing |
| `js/providers/clientGenProvider.js` | 96.72% | 102, 204 | Pre-existing expressions (`\|\| 'Worker error'`, the stored-entry gate) |
| `js/generator/pipeline.js` | 96.87% | 172 | Pre-existing, unreachable `?? tier` |
| `js/util/events.js`, `js/ui/srLive.js`, `js/ui/dialog.js`, `js/ui/coach.js` | 96.66%, 88.88%, 92.85%, 88.42% | 53; 18; 110; 81, 92, 144, 197, 270, 352, 353, 369, 414 | Pre-existing; no added line uncovered |
| `js/dev/inspect.js`, `devMode.js`, `devPanel.js`, `puzzleLoader.js`, `loadPuzzle.js`, `loadProvider.js`, `protocol.js`, `storage.js`, `clipboard.js`, `statistics.js`, `cookieStatsStore.js` | 100% | — | — |
