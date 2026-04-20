# Test Strategy Specification — Sudoku v1 (tspec-001-v1)

**Status:** Final
**Date:** 2026-04-19
**Author:** QE Strategist
**Authoritative inputs:** aspec-001-v1, fspec-001-v1
**Coverage target:** 100% branch coverage (c8)

---

## 1. Overview

### 1.1 Philosophy

This strategy is **unit-heavy by design**. The aspec decomposes cleanly into small pure modules (solver techniques, reducer, bitset utilities, PRNG, persistence adapters). Pure functions are the cheapest path to 100% branch coverage. Integration tests exist only where unit tests cannot adequately exercise real-seam behavior: the Worker `postMessage` round-trip (structured clone + async), full game lifecycles that combine reducer + providers + UI dispatch, persistence round-trips through real `document.cookie` and `localStorage`, and a11y assertions that require real DOM. System tests are reserved for end-to-end user flows where the entire stack must cooperate.

### 1.2 Why branch coverage not statement coverage

Statement coverage would let conditionals pass with one arm covered. The solver and reducer are dominated by conditional logic (technique preconditions, tier mapping, action dispatch, mode gating). Only branch coverage forces both arms of every predicate. Aspec §16.2 makes this the fail gate.

### 1.3 Determinism discipline

Every test that touches the generator must pass an explicit seed to `mulberry32` (aspec §16.4). Every test that touches time (auto-clear, debounced persistence) uses Mocha's fake timers via `sinon`-style fakes or Playwright's clock API. No `setTimeout` races.

### 1.4 Fixture discipline

Per aspec §8.3, each technique has curated SudokuWiki positions as fixtures. All fixtures live under `tests/unit/fixtures/` and are plain JS modules exporting `Uint8Array(81)` — no JSON parsing at test time, no file I/O in the browser.

### 1.5 Test taxonomy

| Type | Where | What | Volume |
|---|---|---|---|
| Unit | `tests/unit/**/*.test.js` | Individual functions and modules in isolation | ~85% |
| Integration | `tests/integration/*.test.js` | Worker round-trip, game flows, persistence, a11y | ~12% |
| System | One-per-major-flow | End-to-end solve of a Kiddie fixture, resume across reload | ~3% |

### 1.6 Test-double policy

- **Real Web Worker** for integration only (aspec §16.1 "no stubs").
- **Real `document.cookie`** and **real `localStorage`** in all tests — clear them in `beforeEach`.
- **Fake providers** used only in reducer unit tests: `FakeHintProvider`, `FakeStatsProvider` with recorded calls. These isolate the reducer from async provider latency.
- **No network** ever. No fetch mocking needed.
- **DOM** is real in every test (Mocha runs in Chromium via Playwright). No jsdom.

### 1.7 Performance assertions

Per aspec §17 phase 7: all non-generation actions must complete in <1 s; Death March cold-start <5 s. Enforce:
- Reducer actions: <10 ms each (asserted with `performance.now()` bracket).
- `computeConflicts(board)`: <5 ms.
- `solveLogically` on a Death March fixture: <1 s.
- `generateForTier('death-march')` with seed and modest attempt budget: <5 s ceiling; record actual in test output.
- `nextHint` on Hard fixture: <500 ms.

These are *flag* assertions — they fail the build when regressions approach the 1-second wall. A separate `tests/perf/` folder is appropriate; if time is tight, co-locate in the relevant unit file with a `[perf]` tag.

---

## 2. Test Inventory

Format: table per module. "Branches" column lists the explicit branch pairs each test exercises. "Type" is U = unit, I = integration, S = system.

### 2.1 `js/prng.js` — `tests/unit/prng.test.js`

| # | Test | Type | What it covers | Input | Expected |
|---|---|---|---|---|---|
| P1 | mulberry32 is deterministic | U | Same seed → same sequence | seed=42, 1000 draws | identical sequences across two invocations |
| P2 | mulberry32 returns [0,1) | U | Value range | seed=1, 10000 draws | min ≥ 0, max < 1 |
| P3 | mulberry32 rejects bad seed type | U | Input validation branch (if any) | seed='abc' | throws or coerces per aspec contract |
| P4 | randomSeed returns uint32 | U | crypto path | 100 calls | all integers in [0, 2^32) |
| P5 | shuffle is deterministic given rng | U | Fisher-Yates correctness | arr=[1..9], seed=7 | stable permutation across runs |
| P6 | shuffle handles empty array | U | Length-0 branch | [] | returns [] |
| P7 | shuffle handles length-1 array | U | Length-1 branch | [5] | returns [5] |
| P8 | shuffle preserves multiset | U | No element loss/dup | arr=[1..9], various seeds | sorted result equals input |

### 2.2 `js/util/grid.js` — `tests/unit/grid.test.js`

| # | Test | Type | What it covers | Input | Expected |
|---|---|---|---|---|---|
| G1 | rowOf/colOf/boxOf for all 81 indices | U | Index math | i=0..80 | matches precomputed table |
| G2 | cellIndex inverse of rowOf/colOf | U | Round-trip | all (r,c) | cellIndex(rowOf(i), colOf(i)) === i |
| G3 | PEERS[i] has length 20 | U | Peer count invariant | i=0..80 | len === 20, no duplicates, excludes i |
| G4 | UNITS has 27 length-9 arrays | U | Structural | — | 9 rows, 9 cols, 9 boxes |
| G5 | UNITS_OF[i] returns the 3 units of i | U | Membership | i=0, 40, 80 | each contains i, union covers peers ∪ {i} |
| G6 | Boundary indices 0, 8, 72, 80 | U | Corner branches | specific i | correct row/col/box |

### 2.3 `js/util/bitset.js` — `tests/unit/bitset.test.js`

| # | Test | Type | What it covers | Input | Expected |
|---|---|---|---|---|---|
| B1 | ALL is 0b111111111 (511) | U | Constant | — | 511 |
| B2 | has returns true/false correctly | U | Both branches | (5, 3), (5, 2) | true for set digit, false for unset |
| B3 | add is idempotent | U | Already-set branch | add(ALL, 5) | ALL |
| B4 | add on empty sets single bit | U | Empty branch | add(0, 5) | 0b000010000 |
| B5 | remove on present bit clears it | U | Present branch | remove(0b11, 1) | 0b10 |
| B6 | remove on absent bit is no-op | U | Absent branch | remove(0b10, 1) | 0b10 |
| B7 | count for 0, ALL, and random sets | U | Popcount | 0, 511, 0b10101 | 0, 9, 3 |
| B8 | iterate yields digits ascending | U | Iterator | 0b010100001 | [1,3,5] (1-based digits) |
| B9 | iterate on 0 yields nothing | U | Empty iterator | 0 | [] |
| B10 | fromDigits([]) | U | Empty input | [] | 0 |
| B11 | fromDigits([1,2,3]) | U | Multi-digit | [1,2,3] | 0b000000111 |
| B12 | fromDigits with duplicates | U | Dedup branch | [1,1,2] | 0b11 |

### 2.4 `js/util/events.js` — `tests/unit/events.test.js`

| # | Test | Type | What it covers | Input | Expected |
|---|---|---|---|---|---|
| EV1 | on/emit basic delivery | U | Happy path | one listener | listener called with payload |
| EV2 | Listener added during emit not fired for current emit | U | Late-add branch | add in listener | not called this pass |
| EV3 | Listener removed during emit does not fire if not yet called | U | Concurrent-remove branch | remove next listener | not called |
| EV4 | Re-entrant emit runs to completion | U | Reentrant branch | listener emits same type | inner completes before outer resumes |
| EV5 | Listener throw logged; remaining listeners still fire | U | Error branch | throwing listener + good listener | good listener called, console.error called |
| EV6 | Emit to unknown type is no-op | U | Unknown-type branch | emit 'foo' with no listeners | no throw |
| EV7 | unsubscribe is idempotent | U | Double-remove | call twice | no error, listener gone |
| EV8 | off by reference | U | off | add+off | not called |
| EV9 | clear() clears all types | U | Clear-all branch | two types | both gone |
| EV10 | clear(type) clears one type only | U | Clear-one branch | clear 'a', emit 'b' | 'b' still fires |

### 2.5 `js/solver/uniqueness.js` — `tests/unit/uniqueness.test.js`

| # | Test | Type | What it covers | Input | Expected |
|---|---|---|---|---|---|
| U1 | countSolutions on valid unique puzzle | U | Unique path | known-unique fixture | count=1, solution matches |
| U2 | countSolutions on multi-solution board | U | Non-unique path, cap=2 | hand-crafted 2-solution board | count=2 |
| U3 | countSolutions on contradictory board | U | Zero branch | board with row-duplicate given | count=0 |
| U4 | countSolutions respects cap parameter | U | Cap branch | board with many solutions, cap=2 | count=2 |
| U5 | countSolutions on empty board | U | All-empty branch | Uint8Array(81).fill(0) | count=2 (capped) |
| U6 | countSolutions on fully solved board | U | All-filled branch | valid full grid | count=1 |
| U7 | countSolutions completes <10 ms | U | Perf flag | fixture | <10 ms |
| U8 | Propagation contradiction detected | U | Propagation branch | partially filled board with forced conflict | count=0 |
| U9 | MRV cell selection | U | Heuristic branch | board where MRV matters | returns correct solution |

### 2.6 `js/solver/candidates.js` — `tests/unit/candidates.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| C1 | initialCandidates on empty cell sets ALL | U | Empty branch | board[i]=0 | candidates[i] === 511 |
| C2 | initialCandidates on filled cell sets just that digit | U | Filled branch | board[i]=5 | candidates[i] === bit for 5 |
| C3 | initialCandidates eliminates from peers | U | Peer elimination | 1 cell filled | peer cells lose that digit |
| C4 | applyPlacement updates candidate sets | U | Mutation | place digit | cell set to bit; peers lose that digit |
| C5 | applyPlacement is idempotent on already-solved cell | U | Re-apply branch | place same digit twice | no change second time |

### 2.7 Technique unit tests — `tests/unit/techniques/*.test.js`

Per aspec §8.3, each of the 15 techniques requires: ≥3 positive cases, ≥1 non-fire guard, ≥1 null return. Each technique exports `apply(state) → {placements, eliminations, technique} | null`; tests exercise both branches.

#### nakedSingle.test.js

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| NS1 | Single-candidate cell flagged | U | Positive 1 | fixture with one cell of cardinality 1 | returns placement |
| NS2 | Multiple naked singles — returns first | U | Positive 2 + first-progress branch | fixture with 3 singles | returns first by index |
| NS3 | Naked single discovered after propagation | U | Positive 3 | fixture needing prior placement | correct placement |
| NS4 | Does not fire on board with no singles | U | Null branch | fixture with cardinality≥2 everywhere | returns null |
| NS5 | Returns the `technique: 'nakedSingle'` field | U | Metadata | any positive case | technique matches |

#### hiddenSingle.test.js

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| HS1 | Hidden single in row | U | Row branch | curated fixture | correct placement |
| HS2 | Hidden single in column | U | Column branch | curated fixture | correct placement |
| HS3 | Hidden single in box | U | Box branch | curated fixture | correct placement |
| HS4 | Returns null on no hidden singles | U | Null branch | fixture with none | null |

#### lockedCandidates.test.js

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| LC1 | Pointing pair eliminates from row | U | Pointing row branch | fixture | eliminations |
| LC2 | Pointing pair eliminates from column | U | Pointing col branch | fixture | eliminations |
| LC3 | Claiming eliminates from box | U | Claiming branch | fixture | eliminations |
| LC4 | Non-fire when technique does not apply | U | Guard | fixture | null |
| LC5 | Returns elimination-only step (digit:null) | U | Elimination-only | positive case | step.digit === null |

#### nakedSubsets.test.js (pair + triple)

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| NP1 | Naked pair in row eliminates | U | Row branch | fixture | eliminations |
| NP2 | Naked pair in column eliminates | U | Col branch | fixture | eliminations |
| NP3 | Naked pair in box eliminates | U | Box branch | fixture | eliminations |
| NT1 | Naked triple in unit | U | Triple branch | fixture | eliminations |
| NT2 | Naked triple with 2-2-3 pattern variant | U | Alt pattern | fixture | eliminations |
| NP/NT-null | No subset → null | U | Null branch | fixture | null |

#### hiddenSubsets.test.js (pair + triple)

HP1–HP3 (row/col/box pairs), HT1–HT2 (triples), null case. Analogous structure to nakedSubsets.

#### xWing.test.js

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| XW1 | Row-based X-Wing | U | Row orientation | SudokuWiki example | eliminations from columns |
| XW2 | Column-based X-Wing | U | Col orientation | fixture | eliminations from rows |
| XW3 | X-Wing when four corners are bivalue | U | Bivalue edge case | fixture | eliminations |
| XW4 | Non-fire when only 3 corners | U | Guard | near-miss fixture | null |
| XW5 | Non-fire on no X-Wing | U | Null | random fixture | null |

#### swordfish.test.js

SF1 row 3×3; SF2 col 3×3; SF3 irregular fish (2-3-3 row counts); SF4 non-fire (2×3 only); SF5 null.

#### jellyfish.test.js

JF1 row 4×4; JF2 col 4×4; JF3 non-fire (3×4); JF4 null. (Jellyfish positions are scarcer; three distinct row orientations satisfy ≥3 positive requirement.)

#### xyWing.test.js

XYW1 hinge in row, wings row+box; XYW2 hinge in col, wings col+box; XYW3 hinge in box, wings row+col; XYW4 non-fire when not all bivalue; XYW5 null.

#### coloring.test.js (simple + multi)

SC1 simple coloring — two same-color cells see each other; SC2 simple coloring — "color sees both" elimination; SC3 positive variant; MC1 multi-coloring joining two chains; MC2 non-fire; null case.

#### forcingChains.test.js (XY-chain + AIC)

XYC1 length-4 chain; XYC2 length-6 chain; XYC3 non-fire; AIC1 short AIC; AIC2 long AIC; null case.

#### techniques/index.test.js

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| TI1 | TECHNIQUES has exactly 15 entries | U | Length invariant | — | 15 |
| TI2 | Ordering matches aspec §4.8 | U | Ordering | — | rank array matches spec |

### 2.8 `js/solver/logical.js` — `tests/unit/logical.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| L1 | Solves Kiddie fixture (NS only) | U | Fully-solved branch | fixture | solved=true, hardestRank=1 |
| L2 | Solves Easy fixture (NS+HS) | U | Rank-2 path | fixture | solved=true, hardestRank=2 |
| L3 | Solves Medium fixture | U | Rank≤7 path | fixture | solved=true, hardestRank ∈ [3..7] |
| L4 | Solves Hard fixture | U | Rank≤11 path | fixture | solved=true, hardestRank ∈ [8..11] |
| L5 | Solves Death March fixture | U | Rank≤15 path | fixture | solved=true, hardestRank ∈ [12..15] |
| L6 | Returns unsolved on impossible fixture | U | `!progressed` break branch | fixture requiring naked quad | solved=false |
| L7 | techniqueLimit caps solver | U | Limit branch | Easy fixture with limit=1 | solved=false (no HS allowed) |
| L8 | techniqueLimit=Infinity (default) | U | Default branch | any fixture | same as no limit |
| L9 | Restart-from-rank-0 behavior | U | Progress-break branch | fixture where LC unblocks NS | trace order shows NS steps after LC |
| L10 | Trace includes elimination-only steps with digit:null | U | Elim-only branch | LC-solvable fixture | trace[k].digit === null for LC step |
| L11 | hardestRank 0 when board already solved | U | Trivial branch | full grid | hardestRank=0, trace=[] |
| L12 | Perf on Death March <1 s | U | Flag | fixture | elapsed <1000 ms |

### 2.9 `js/generator/fillGrid.js` — `tests/unit/fillGrid.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| FG1 | Produces valid full grid | U | Success path | seed=1 | all 81 filled, no row/col/box dups |
| FG2 | Deterministic given seed | U | PRNG path | seed=42 twice | identical output |
| FG3 | Different seeds → different grids | U | Entropy | seed 1 vs 2 | grids differ |
| FG4 | Completes <10 ms | U | Perf flag | seed=1 | <10 ms |
| FG5 | Backtrack branch exercised | U | Backtracking path | seed chosen to force backtrack | still completes successfully |

### 2.10 `js/generator/removeCells.js` — `tests/unit/removeCells.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| RC1 | Produces a unique puzzle | U | Uniqueness guard | valid solution, targetGivens=30 | countSolutions(result)===1 |
| RC2 | Stops at targetGivens reached | U | Target-hit branch | target=50 | givens count ≥ 50, ≤ 81 |
| RC3 | Stops when no safe removal remains | U | Exhaustion branch | target=17 (likely unreachable) | at least 17 givens, terminates |
| RC4 | Restores cell when removal creates non-unique | U | Restore branch | craft situation | cell restored, count still 1 |
| RC5 | Deterministic given seed | U | PRNG | seed=1 twice | identical |
| RC6 | Preserves solution matching | U | Invariant | — | puzzle's unique solution === original solution |

### 2.11 `js/generator/rater.js` — `tests/unit/rater.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| R1 | Rates Kiddie fixture as 'kiddie' | U | Tier=kiddie | fixture | tier='kiddie', hardestRank=1 |
| R2 | Rates Easy fixture as 'easy' | U | Tier=easy | fixture | tier='easy' |
| R3 | Rates Medium fixture as 'medium' | U | Tier=medium | fixture | tier='medium' |
| R4 | Rates Hard fixture as 'hard' | U | Tier=hard | fixture | tier='hard' |
| R5 | Rates Death March fixture as 'death-march' | U | Tier=deathmarch | fixture | tier='death-march' |
| R6 | Returns 'beyond-death-march' on unsolved | U | Beyond branch | craft unsolvable-by-ladder fixture | tier='beyond-death-march', solved=false |
| R7 | tierForRank 0 returns null | U | rank=0 branch | rank=0 | null |
| R8 | tierForRank boundary ranks (1,2,3,7,8,11,12,15,16) | U | Every tier boundary | ranks 1..16 | correct tier per §8.5 |
| R9 | Trace returned alongside tier | U | Metadata | fixture | trace.length > 0 |

### 2.12 `js/generator/pipeline.js` — `tests/unit/pipeline.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| PL1 | Produces correctly-tiered puzzle for each tier | U | Success branch × 5 | seed, tier | rate(result.givens).tier === tier |
| PL2 | Honors onProgress callback | U | Progress branch | onProgress spy | called ≥1 with {attempts, budget} |
| PL3 | Respects abortSignal | U | Abort branch | pre-aborted signal | throws AbortError |
| PL4 | Abort between attempts | U | Abort-during branch | abort after 1 attempt via async | throws AbortError |
| PL5 | Attempt-budget fallback returns hardest-so-far | U | Fallback branch | budget=1, targeting lower tier | returns with actual difficulty, logs warn |
| PL6 | Skips unsolved candidates via `!result.solved` continue | U | Continue branch | seed producing unsolvable intermediate | continues loop, eventually returns |
| PL7 | toPuzzle id is FNV-1a hex | U | ID formation | known bytes | hash matches FNV reference |
| PL8 | Death March short-circuit reject | U | Short-circuit branch | low-rank candidate for DM | continues without running full rate |
| PL9 | Budget default is ATTEMPT_BUDGET[tier] when opts.budget absent | U | Default branch | no budget | uses config value |
| PL10 | Puzzle shape conforms to aspec §4.16 | U | Schema | any | keys match |
| PL11 | Perf: DM generation <5 s with default budget | U | Flag | seed, DM | <5000 ms |

### 2.13 `js/worker/protocol.js` — `tests/unit/protocol.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| WP1 | MSG constants exported | U | Export surface | — | GEN_REQUEST etc. strings |
| WP2 | Envelope helpers round-trip | U | Helpers | build+parse | identity |

### 2.14 `js/worker/generator.worker.js` — `tests/integration/worker.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| W1 | GEN_REQUEST → GEN_RESULT round-trip | I | Happy path | real Worker, tier=kiddie, seed | GEN_RESULT with valid Puzzle |
| W2 | GEN_PROGRESS emitted during generation | I | Progress branch | tier=hard | ≥1 GEN_PROGRESS received |
| W3 | GEN_PROGRESS throttled to 100 ms | I | Throttle branch | long generation | no two GEN_PROGRESS within <100 ms |
| W4 | GEN_ABORT cancels in-flight request | I | Abort branch | post ABORT mid-flight | promise rejects AbortError; no GEN_RESULT |
| W5 | Background request queues behind foreground | I | Queue branch | post BG then FG | FG completes first, BG resumes |
| W6 | GEN_ERROR on worker exception | I | Error branch | inject malformed request | GEN_ERROR received |
| W7 | Uint8Array survives structured clone | I | Data type | — | result.givens instanceof Uint8Array |
| W8 | Fallback puzzle returned with fallback:true | I | Fallback flag | force budget exhaustion via small budget | GEN_RESULT.fallback === true |
| W9 | Multiple sequential requests share one worker | I | Lifecycle | 3 requests | all fulfilled, one Worker instance |

### 2.15 `js/providers/puzzleProvider.js` + `clientGenProvider.js` — `tests/unit/puzzleProvider.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| PP1 | requestPuzzle returns cached when peekReady | U | Cache-hit branch | primed cache | fast resolution, cache cleared |
| PP2 | requestPuzzle falls through to Worker when empty | U | Cache-miss branch | empty cache | Worker called |
| PP3 | primeNext posts background=true | U | BG flag | call primeNext | message has background=true |
| PP4 | AbortSignal propagates to Worker | U | Abort path | aborted signal | GEN_ABORT posted; promise rejects AbortError |
| PP5 | peekReady returns null when cache empty | U | Null branch | empty | null |
| PP6 | localStorage mirror on cache write | U | Persist branch | fake worker resolves | `sudoku.pregen.v1.<tier>` written |
| PP7 | localStorage restore on boot | U | Restore branch | pre-written localStorage | peekReady returns puzzle |
| PP8 | Uint8Array ↔ number[] conversion at persistence boundary | U | Conversion branches | round-trip | types correct each side |
| PP9 | One foreground in-flight at a time | U | Queue branch | two concurrent requestPuzzle | second awaits first |
| PP10 | Provider does not expose fallback flag | U | Spec §4.16 | fallback=true result | Puzzle has no .fallback |
| PP11 | Corrupt localStorage entry treated as empty | U | Version/parse fail | bad JSON | peekReady null, no throw |

### 2.16 `js/providers/hintProvider.js` — `tests/unit/hintProvider.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| HP1 | targetCell provided → returns placement for that cell | U | targetCell branch | puzzle, pen, targetCell=12 | {cellIndex:12, digit=solution[12], technique} |
| HP2 | targetCell absent → returns first placement in trace | U | Coach branch | puzzle, no target | trace[0] as placement |
| HP3 | Filters out conflict-flagged pen entries | U | Filter branch | pen has conflict, conflicts contains it | working board excludes it |
| HP4 | Includes non-conflict pen entries | U | No-filter branch | pen clean | working board includes all |
| HP5 | Pencil marks ignored | U | Ignore branch | pencil set | result independent of pencil |
| HP6 | technique falls back to 'solution-lookup' | U | Fallback branch | target not in placement trace | technique==='solution-lookup' |
| HP7 | Returns null when no progress possible | U | Null branch | fully solved or contradictory | null — **see §4.1 risk** |
| HP8 | Perf <500 ms on Hard fixture | U | Flag | — | <500 ms |

### 2.17 `js/game/state.js` — `tests/unit/state.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| S1 | PUZZLE_LOADED initializes state | U | Load branch | puzzle | pen=givens, pencil=empty, flags reset |
| S2 | SELECT_CELL on player cell sets selected | U | Selectable branch | index=non-given | state.selected===index |
| S3 | SELECT_CELL on given cell ignored | U | Given-guard branch | given index | state.selected unchanged |
| S4 | DESELECT clears selected | U | Deselect | after select | selected=null |
| S5 | ARROW_NAV wraps at edges per fspec §4.2 | U | Wrap branches (r→, r←, c↓, c↑) | each direction | lands on nearest player cell with wrap |
| S6 | ARROW_NAV skips given cells | U | Skip branch | row with givens | skips to nearest player cell |
| S7 | ARROW_NAV with selected=null picks first player cell | U | No-selection branch | selected=null | first non-given |
| S8 | SET_MODE to 'pen' and 'pencil' | U | Mode branches | each mode | activeMode updated |
| S9 | TOGGLE_MODE flips mode | U | Toggle | pen→pencil→pen | correct sequence |
| S10 | PEN_ENTER on empty cell commits digit | U | Empty-to-pen branch | digit=5 | pen[i]=5 |
| S11 | PEN_ENTER on cell with pencil clears pencil | U | Clear-pencil branch | pencil set | pencil[i]=0 |
| S12 | PEN_ENTER same digit is no-op | U | Idempotent branch | existing digit | no change, no persist |
| S13 | PEN_ENTER different digit replaces | U | Replace branch | existing digit | new digit committed, conflicts recomputed |
| S14 | PEN_ENTER on given cell ignored | U | Given-guard branch | given index | unchanged |
| S15 | PEN_ENTER with fromHint=true skips attempt increment (HINT action records it instead) | U | fromHint branch | hint flow | stats.recordAttemptOnce NOT called via PEN_ENTER |
| S16 | PEN_ENTER first user entry increments attempt once | U | attemptRecorded=false branch | first user digit | stats.recordAttemptOnce called with difficulty |
| S17 | PEN_ENTER subsequent entries do not re-increment | U | attemptRecorded=true branch | already recorded | stats.recordAttemptOnce NOT called again |
| S18 | PEN_ENTER triggers auto-clear of peer pencil marks | U | Auto-clear branch | peers have that pencil | peers updated |
| S19 | PEN_ENTER triggers Kiddie realtime correctness | U | Kiddie branch | difficulty=kiddie wrong digit | incorrect set updated |
| S20 | PEN_ENTER on non-Kiddie skips realtime correctness | U | Non-Kiddie branch | difficulty=easy | incorrect unchanged |
| S21 | PENCIL_TOGGLE adds missing candidate | U | Add branch | empty pencil | candidate added |
| S22 | PENCIL_TOGGLE removes present candidate | U | Remove branch | pencil has digit | candidate removed |
| S23 | PENCIL_TOGGLE ignored when pen digit present | U | Pen-guard branch | pen[i] set | no change |
| S24 | ERASE on pen-digit cell clears it | U | Erase-pen branch | pen[i]=5 | pen[i]=0, conflicts recomputed |
| S25 | ERASE on pencil-only cell clears pencil | U | Erase-pencil branch | pencil[i]=bits | pencil[i]=0 |
| S26 | ERASE on empty cell no-op | U | Erase-empty branch | empty | no change |
| S27 | ERASE on given cell no-op | U | Given-guard | given | no change |
| S28 | HINT action invokes hintProvider with correct args | U | Hint branch | selected=i | provider called with (puzzle, {pen, conflicts}, {targetCell:i}) |
| S29 | HINT applies via PEN_ENTER fromHint=true | U | Hint-wiring | hint succeeds | fromHint flow |
| S30 | HINT decrements hintsRemaining | U | Decrement | hints=3 | hints=2 |
| S31 | HINT disabled when hintsRemaining===0 | U | Guard | hints=0 | no-op |
| S32 | HINT disabled when selected is given or has pen | U | Fspec §8.1 guard | given/pen | no-op |
| S33 | HINT disabled when hintsRemaining===0 permanently (Hard/DM) | U | Config limit | difficulty=hard | HINT_LIMITS used |
| S33a | HINT records attempt on first hint | U | attemptRecorded=false branch | first hint | stats.recordAttemptOnce called with difficulty |
| S33b | HINT does not double-record attempt | U | attemptRecorded=true branch | second hint | stats.recordAttemptOnce NOT called again |
| S34 | CHECK on Easy/Medium flags incorrect | U | Check branch | wrong digits | incorrect set populated |
| S35 | CHECK sets incorrectShownUntil = now+3000 | U | Timer branch | — | timestamp set |
| S36 | CLEAR_INCORRECT clears incorrect set | U | Timer-expiry | after 3s | incorrect=∅ |
| S37 | ON_COMPLETION_EVALUATE on full-correct → won | U | Win branch | full correct | state.won=true, winHandled=true |
| S38 | ON_COMPLETION_EVALUATE on full-incorrect (Hard) flags wrongs | U | Hard-on-complete branch | full wrong | incorrect populated |
| S39 | ON_COMPLETION_EVALUATE on full-incorrect (DM) no highlight | U | DM branch | full wrong, DM | incorrect=∅, message only |
| S40 | ON_COMPLETION_EVALUATE on full-correct calls stats.recordWin once | U | Win-stats branch | complete | recordWin called once |
| S41 | ON_COMPLETION_EVALUATE idempotent on winHandled | U | winHandled guard | already handled | no double recordWin |
| S42 | NEW_PUZZLE resets attemptRecorded=false | U | Reset-flag branch | — | flag false |
| S43 | RESET_PUZZLE preserves attemptRecorded | U | Preserve branch | recorded=true | still true after reset |
| S44 | RESET_PUZZLE restores hints to HINT_LIMITS | U | Hint-restore | — | hints=limit |
| S45 | RESET_PUZZLE restores givens, clears pen/pencil | U | Reset | — | pen=givens copy, pencil=0 |
| S46 | RESET_PUZZLE clears incorrect/conflicts | U | Flag-clear | — | sets empty |
| S47 | CHANGE_DIFFICULTY updates puzzle.difficulty | U | Change | — | field updated |
| S48 | SET_GENERATING sets flag+message | U | Flag branch | — | generating=true, message set |
| S49 | SET_GENERATING false clears | U | Clear branch | flag=false | generating=false |
| S50 | 'changed' event emits Set of changed keys | U | Event | any action | payload.changed is Set |
| S51 | Listener added during emit does not fire for current emit | U | Emitter semantics | see §4.4a | not fired |
| S52 | Listener throw does not break other listeners | U | Emitter robustness | throwing listener | others still called, console.error called |
| S53 | HINT emits sr-live announcement data in 'changed' payload | U | a11y branch | — | payload includes hint info |
| S54 | Exactly one emit per dispatch | U | Emit-count invariant | any action | listener called exactly once |

### 2.18 `js/game/conflicts.js` — `tests/unit/conflicts.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| CF1 | No conflicts on empty board | U | Empty branch | zeros | ∅ |
| CF2 | Row duplicate detected | U | Row branch | two 5s in row | both cells in set |
| CF3 | Column duplicate detected | U | Col branch | two 5s in col | both in set |
| CF4 | Box duplicate detected | U | Box branch | two 5s in box | both in set |
| CF5 | Triple conflict: all three flagged | U | Multi-conflict | three 5s in row | all three in set |
| CF6 | Pencil marks never flagged | U | Pen-only branch | pencil dupes | ∅ |
| CF7 | Mixed row+col conflict | U | Both branches | one digit conflicts on both axes | both peers flagged |
| CF8 | Conflict cleared on erase | U | Re-eval | erase one duplicate | remaining solo cell not flagged |
| CF9 | Perf <5 ms on full board | U | Flag | full valid board | <5 ms |

### 2.19 `js/game/correctness.js` — `tests/unit/correctness.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| CR1 | checkRealtime flags wrong digit | U | Wrong branch | cell with wrong | flag applied |
| CR2 | checkRealtime clears on correct | U | Correct branch | cell with correct | flag cleared |
| CR3 | checkAll returns all wrong cells | U | Bulk | board with 3 wrongs | 3 in set |
| CR4 | checkAll ignores empty cells | U | Empty branch | empty cells | not in set |
| CR5 | checkOnComplete correct=true when matches solution | U | Win branch | solved board | {correct:true, wrong:∅} |
| CR6 | checkOnComplete correct=false with wrong set | U | Lose branch | full but wrong | {correct:false, wrong:[...]} |

### 2.20 `js/game/statistics.js` — `tests/unit/statistics.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| ST1 | init loads from provider and emits | U | Load branch | provider.load resolves | cache populated, 'stats-changed' emitted |
| ST2 | init handles missing/default map | U | Default branch | load returns zeros | all 5 tiers at 0 |
| ST3 | get returns cached map synchronously | U | Sync branch | after init | map equals loaded |
| ST4 | recordAttemptOnce increments attempted | U | Increment branch | tier='easy' | attempted +1, persisted |
| ST5 | recordAttemptOnce emits 'stats-changed' | U | Event | — | listener fired |
| ST6 | recordWin increments won | U | Win branch | tier='hard' | won +1, persisted |
| ST7 | Concurrent recordAttempt+recordWin both persist | U | Race branch | fire both | both reflected |
| ST8 | Provider save errors swallowed | U | Error-swallow branch | provider.save rejects | no throw, in-memory still updated |
| ST9 | on/off subscription | U | Emitter | subscribe then unsubscribe | only pre-unsubscribe events received |
| ST10 | Initial emit on init when no listener — no throw | U | No-listener branch | — | ok |

### 2.21 `js/providers/statsProvider.js` — `tests/unit/statsProvider.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| SP1 | load() delegates to store.load | U | Pass-through | — | store called |
| SP2 | save() delegates to store.save | U | Pass-through | — | store called |

### 2.22 `js/providers/cookieStatsStore.js` — `tests/unit/cookieStatsStore.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| CS1 | load() returns default map when cookie absent | U | Absent branch | clear cookie | zero map, 5 tiers |
| CS2 | load() parses valid cookie | U | Parse branch | preset cookie | map matches |
| CS3 | load() returns default on invalid JSON | U | Parse-error branch | cookie='not-json' | zero map, no throw |
| CS4 | load() returns default on version!==1 | U | Version branch | cookie with version:2 | zero map |
| CS5 | load() returns default on missing 'stats' key | U | Shape branch | cookie without stats | zero map |
| CS6 | save() writes URL-encoded JSON | U | Write | map | cookie string round-trippable |
| CS7 | save() uses maxAge 2y, path=/, sameSite=Lax | U | Options | — | attributes present |

### 2.23 `js/persist/cookies.js` — `tests/unit/cookies.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| CK1 | get returns value when set | U | Present branch | set then get | matches |
| CK2 | get returns null when absent | U | Absent branch | fresh | null |
| CK3 | get decodes URL-encoded value | U | Decode | value='a b' | 'a b' after round-trip |
| CK4 | set writes with default options | U | Defaults | — | cookie present, path=/ |
| CK5 | set honors maxAge | U | maxAge branch | 1 hr | expiration set |
| CK6 | remove deletes | U | Remove | after set | get returns null |
| CK7 | Multiple cookies isolated | U | Isolation | set two | both readable |

### 2.24 `js/persist/storage.js` — `tests/unit/storage.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| LS1 | setItem + getItem round-trip | U | Happy path | JSON | object equal |
| LS2 | getItem missing returns null | U | Absent branch | fresh | null |
| LS3 | getItem bad JSON returns null | U | Parse-error branch | corrupt entry | null, no throw |
| LS4 | setItem swallows quota errors | U | Error branch | stub throwing | no throw |
| LS5 | Version-gate discards old versions | U | Version branch | version:0 | null |
| LS6 | removeItem | U | Remove | after set | gone |

### 2.25 `js/ui/grid.js` — `tests/unit/ui-grid.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UG1 | mount creates 81 gridcells | U | Structure | mount | 81 elements with role=gridcell |
| UG2 | Given cells marked aria-readonly | U | A11y branch | givens | attribute set |
| UG3 | Selected cell has tabindex=0 | U | Selection branch | select | correct tabindex shift |
| UG4 | Click dispatches SELECT_CELL | U | Event | click cell | dispatch called with {index} |
| UG5 | Arrow keydown dispatches ARROW_NAV | U | Event | keydown | dispatch called with {direction} |
| UG6 | Conflict class applied to conflict cells | U | Render branch | state with conflicts | class present |
| UG7 | Incorrect class applied to incorrect cells | U | Render branch | state with incorrect | class present |
| UG8 | Pen digit rendered | U | Render pen | pen[i]=5 | text='5' |
| UG9 | Pencil marks rendered | U | Render pencil | pencil[i]=bits | small digits |
| UG10 | aria-label constructed from row/col/contents/state | U | A11y label | conflict cell | label includes "conflict" term |
| UG11 | Re-render skipped when changed keys irrelevant | U | Short-circuit branch | change to stats only | no DOM writes |
| UG12 | Outside-grid click deselects | I | §4.2 deselection | click body | DESELECT dispatched |

### 2.26 `js/ui/numpad.js` — `tests/unit/ui-numpad.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UN1 | Digit button dispatches PEN_ENTER in pen mode | U | Pen branch | click 5 | PEN_ENTER {digit:5} |
| UN2 | Digit button dispatches PENCIL_TOGGLE in pencil mode | U | Pencil branch | click 5 | PENCIL_TOGGLE {digit:5} |
| UN3 | Erase button dispatches ERASE | U | Erase | click | ERASE |
| UN4 | Mode toggle button dispatches TOGGLE_MODE | U | Toggle | click | TOGGLE_MODE |
| UN5 | aria-pressed reflects current mode | U | A11y branch | mode=pencil | pressed=true |
| UN6 | Check button hidden for Kiddie/Hard/DM | U | CHECK_VISIBLE branch | each difficulty | .hidden-tier present/absent |
| UN7 | Hint button shows remaining count | U | Display | hints=3 | text '3' |
| UN8 | Hint button shows ∞ for Kiddie | U | Infinity branch | hints=Infinity | '∞' |
| UN9 | Hint button disabled when hints=0 | U | Disabled branch | hints=0 | attribute set |
| UN10 | Hint button disabled when selected has pen digit | U | Guard branch | selected with pen | disabled |
| UN11 | Button accessible label includes remaining | U | A11y | — | aria-label contains count |

### 2.27 `js/ui/controls.js` — `tests/unit/ui-controls.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UC1 | New Puzzle with no progress generates immediately | U | No-progress branch | empty puzzle | dispatches directly |
| UC2 | New Puzzle with progress opens dialog | U | In-progress branch | progress state | dialog.open called |
| UC3 | Dialog confirm → NEW_PUZZLE dispatched | U | Confirm branch | click confirm | action dispatched |
| UC4 | Dialog cancel → state unchanged | U | Cancel branch | click cancel | nothing dispatched |
| UC5 | Reset always opens dialog | U | Dialog | any state | dialog opened |
| UC6 | Reset dialog confirm → RESET_PUZZLE | U | Confirm | confirm | dispatched |
| UC7 | Difficulty change with no progress applies directly | U | No-progress branch | pristine | CHANGE_DIFFICULTY dispatched |
| UC8 | Difficulty change with progress opens dialog | U | Progress branch | in progress | dialog opened |
| UC9 | Difficulty dialog cancel reverts selector | U | Revert | cancel | selector value restored |
| UC10 | Theme select triggers applyTheme | U | Theme | change | applyTheme called |

### 2.28 `js/ui/stats.js` — `tests/unit/ui-stats.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| US1 | Renders 5 rows in DIFFICULTY_ORDER | U | Order | — | rows in order |
| US2 | Active-diff marker on current difficulty | U | Active branch | state.puzzle.difficulty=hard | .active-diff on Hard row |
| US3 | Re-renders on stats-changed event | U | Stats subscription | event fire | DOM updated |
| US4 | Re-computes active row on puzzle change event | U | Puzzle subscription | changed includes puzzle | marker moved |
| US5 | Skips render when unrelated changed keys | U | Short-circuit | change pencil | no re-render |

### 2.29 `js/ui/winBanner.js` — `tests/unit/ui-winBanner.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UW1 | Banner hidden initially | U | Initial | — | aria-hidden=true |
| UW2 | Banner shown on won=true | U | Win branch | state.won | aria-hidden=false, class .won on grid |
| UW3 | Focus moves to New Puzzle button | U | Focus management | — | document.activeElement is button |

### 2.30 `js/ui/dialog.js` — `tests/unit/ui-dialog.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UD1 | open sets role, aria-modal, aria-labelledby | U | A11y | open | attrs correct |
| UD2 | Focus traps inside dialog | U | Focus trap | Tab cycles | focus stays inside |
| UD3 | Escape dismisses dialog | U | Cancel branch | Esc | onConfirm not called, dialog closed |
| UD4 | Enter on confirm button confirms | U | Confirm branch | Enter focused confirm | onConfirm called |
| UD5 | Dialog returns focus on close | U | Focus return | opener | activeElement restored |
| UD6 | Cancel button default focus | U | Default focus | open | Cancel focused |

### 2.31 `js/ui/srLive.js` — `tests/unit/ui-srLive.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UL1 | announce writes text to region | U | Base | 'hello' | region text 'hello' |
| UL2 | Double-frame clear-then-set re-announces same message | U | Re-announce branch | announce twice same | region cleared then re-set |
| UL3 | Region attrs aria-live=assertive aria-atomic=true role=status | U | A11y | — | attrs present |

### 2.32 `js/ui/themes.js` — `tests/unit/ui-themes.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UT1 | applyTheme removes existing theme classes | U | Removal loop branch | body has theme-coffee | removed |
| UT2 | applyTheme adds new class | U | Add | — | class present |
| UT3 | applyTheme writes cookie | U | Persist | — | cookie set |
| UT4 | applyTheme announces via srLive | U | a11y | — | announce called |
| UT5 | initTheme reads cookie and applies | U | Init | preset cookie | body class set |
| UT6 | initTheme defaults to minimalist when no cookie | U | Default branch | clear cookie | theme-minimalist |
| UT7 | Inline head script sets class on DOMContentLoaded | I | First-paint flicker prevention | load page | no flash |

### 2.33 `js/ui/keyboard.js` — `tests/unit/ui-keyboard.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| UK1 | Digit 1–9 dispatches PEN_ENTER/PENCIL_TOGGLE by mode | U | Digits | keydown '5' | correct action |
| UK2 | Digit with no cell selected no-ops | U | Guard | no selection | no dispatch |
| UK3 | Backspace dispatches ERASE | U | Erase | keydown | ERASE |
| UK4 | Delete dispatches ERASE | U | Alt key | keydown | ERASE |
| UK5 | Arrow keys dispatch ARROW_NAV | U | Nav | all four | correct direction each |
| UK6 | Arrow with no selection selects first player cell | U | Fspec §5.2 | keydown no selected | SELECT_CELL at first player cell |
| UK7 | P toggles mode when focus not in input | U | P-guard branch | body focus | TOGGLE_MODE |
| UK8 | P ignored when focus is in input/select/textarea | U | P-guard branch | input focus | no dispatch |
| UK9 | Escape closes open dialogs | U | Escape | open dialog | dialog closed |
| UK10 | Tab/Shift+Tab let browser handle (not preventDefault) | U | Pass-through | tab key | not intercepted |

### 2.34 Integration — `tests/integration/game-flows.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| GF1 | Full Kiddie solve via digit keys | S | End-to-end NS-only | Kiddie fixture | win state, recordWin called |
| GF2 | Easy puzzle with wrong entry, Check flags it, auto-clear after 3s | I | Easy+Check flow | Easy fixture | flag present 3s, then cleared |
| GF3 | Medium: consume the 1 hint, button disables | I | Hint exhaustion | Medium | button disabled, hintsRemaining=0 |
| GF4 | Hard: fill all 81 wrong, flags shown, auto-clear 3s | I | Hard-on-complete | Hard fixture | exactly the wrong cells flagged |
| GF5 | Death March: fill all 81 wrong, message only, no cell highlights | I | DM-on-complete | DM fixture | incorrect set empty, announcement only |
| GF6 | Conflict: enter duplicate in row, both flagged; erase, both cleared | I | Conflict round-trip | — | as described |
| GF7 | New Puzzle mid-game triggers dialog; confirm clears state | I | Confirmation flow | in-progress | clear + new puzzle load |
| GF8 | Reset clears entries but preserves attemptRecorded | I | Reset semantics | after first entry | stats unchanged |
| GF9 | Difficulty change mid-game triggers dialog; cancel reverts selector | I | Revert branch | change | selector returns to prior |
| GF10 | Auto-clear of peer pencil marks on pen commit | I | §6.5 | peer pencils | cleared |
| GF11 | Arrow navigation wraps and skips givens across full grid | I | §4.2 | multi-key sequence | lands correctly |
| GF12 | Hint places correct digit and decrements | I | Hint happy path | hint-enabled | cell filled, hints decremented |
| GF13 | Win flow: banner shown, focus to New Puzzle, input disabled | I | §10 end-to-end | complete puzzle | as specified |
| GF14 | Post-win Reset re-enables input without stats change | I | §10.3 | after win, Reset | editable, stats unchanged |

### 2.35 Integration — `tests/integration/persistence.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| PE1 | State round-trip: enter, reload, restore | I | localStorage flow | enter digits, reload | pen/pencil/hints restored |
| PE2 | Correctness flags NOT restored on reload (§13.2) | I | Non-persist branch | Check then reload | no incorrect set |
| PE3 | Active mode not persisted; resets to pen on reload | I | §13.1 | set pencil, reload | mode=pen |
| PE4 | Theme cookie survives reload | I | Cookie round-trip | set theme, reload | applied |
| PE5 | Stats cookie survives reload | I | Cookie round-trip | recordWin, reload | stats match |
| PE6 | Pregen cache restored on boot | I | localStorage cache | pre-write, boot | peekReady returns |
| PE7 | sudoku.currentDifficulty.v1 persisted on change | I | Difficulty persist | change | key written |
| PE8 | Invalid version in state blob → treated as empty | I | Version-gate | version:2 | no restore, no throw |
| PE9 | State cleared on New Puzzle | I | Clear branch | confirm | key removed |
| PE10 | State cleared on win | I | Clear branch | complete | key removed |
| PE11 | Debounced (100 ms) state write | I | Debounce branch | rapid 10 entries | one write after 100ms |
| PE12 | Disabled localStorage (private browsing) does not crash | I | Error swallow | stub throwing | app functional, in-memory only |

### 2.36 Integration — `tests/integration/a11y.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| A1 | Pen digit entry announces "Cell [row, col]: [digit]" | I | fspec §14.3 | enter | sr-live region updated |
| A2 | Erase announces "Cell [r,c] cleared" | I | §14.3 | erase | as specified |
| A3 | Conflict detected announces full message | I | §14.3 | conflict | as specified |
| A4 | Conflict resolved announces | I | §14.3 | resolve | as specified |
| A5 | Kiddie incorrect announces "Incorrect" | I | §14.3 | wrong | as specified |
| A6 | Check results announce count | I | §14.3 | check | "N cells incorrect" or "All filled cells are correct" |
| A7 | Hint used announcement includes digit/cell/remaining | I | §14.3 | hint | as specified |
| A8 | Hints exhausted announces | I | §14.3 | last hint | "No hints remaining" |
| A9 | Win announces "Puzzle complete! Well done." | I | §14.3 | win | as specified |
| A10 | Grid role="grid", cells role="gridcell" | I | §14.2 | — | attrs present |
| A11 | Given cells aria-readonly=true | I | §14.2 | — | attrs present |
| A12 | Selected cell aria-selected=true | I | §14.2 | select | true on one cell only |
| A13 | Hint button label includes remaining count | I | §14.2 | hints=3 | "Hint, 3 remaining" |
| A14 | Hint button label says "unlimited" for Kiddie | I | §14.2 | — | "Hint, unlimited" |
| A15 | Pen/Pencil toggle label reflects current mode | I | §14.2 | each mode | "Switch to Pencil" / "Switch to Pen" |
| A16 | Dialog role=dialog, aria-modal=true, aria-labelledby | I | §14.2 | open | attrs correct |
| A17 | Dialog open moves focus; close returns focus | I | §14.4 | open+close | as specified |
| A18 | Win moves focus to New Puzzle button | I | §14.4 | win | activeElement |
| A19 | Resume does not auto-focus a cell | I | §14.4 | resume | activeElement is body/wrapper |
| A20 | Double-frame re-announce re-fires live region | I | srLive semantics | announce twice | region clears then sets |

### 2.37 System tests — `tests/integration/system.test.js`

| # | Test | Type | Covers | Input | Expected |
|---|---|---|---|---|---|
| SYS1 | Cold start → select difficulty → New Puzzle → solve → win | S | Full Kiddie happy path | deterministic seed | win in <10 s total, stats +1 attempt +1 won |
| SYS2 | Resume after reload mid-game continues cleanly | S | Resume flow | enter+reload+continue | state preserved, solve completes |
| SYS3 | Death March cold-start completes within 5 s budget | S | Perf gate | deterministic seed | <5 s, puzzle delivered |
| SYS4 | Theme switch across all 5 themes preserves puzzle state | S | Theme extensibility | cycle themes mid-game | no state loss, no flicker |

---

## 3. Coverage Map

### 3.1 §4 Module branches

| Aspec branch | Tests |
|---|---|
| §4.1.1 step 7: saved state present → PUZZLE_LOADED | PE1, S1 |
| §4.1.1 step 7: saved state absent → requestPuzzle path | SYS1 |
| §4.4a emit: listener added during emit | S51, EV2 |
| §4.4a emit: listener removed during emit | EV3 |
| §4.4a emit: listener throws | S52, EV5 |
| §4.4a emit: re-entrant emit | EV4 |
| §4.16 cache hit | PP1 |
| §4.16 cache miss | PP2 |
| §4.17 worker queue FG/BG | W5 |
| §4.17 abort | PP4, W4 |
| §4.18 targetCell provided | HP1 |
| §4.18 targetCell absent | HP2 |
| §4.18 conflict filtering | HP3 |
| §4.19 HINT action wiring | S28, S29 |
| §4.22 stats emit | ST5 |
| §4.25 mount + relevant-keys short-circuit | UG11, US5 |
| §4.30 cookie parse paths | CS1–CS5 |

### 3.2 §5 Reducer branches

Every action in §5.2 has a branch-covering test in §2.17 (S1–S54). Attempt/win gating covered by S15–S17, S40, S41. Persistence writer §5.5 covered by PE11, PE9, PE10.

### 3.3 §6 Persistence branches

§6.3 version migration — PE8, LS5, CS4.

### 3.4 §7 Algorithm branches

| Branch | Test |
|---|---|
| §7.1 contradiction during propagation | U3, U8 |
| §7.1 all filled → record solution | U6 |
| §7.1 MRV pick | U9 |
| §7.1 cap reached | U4 |
| §7.2 progress → restart from rank 0 | L9 |
| §7.2 no progress → break | L6 |
| §7.2 techniqueLimit reached | L7 |
| §7.3 fillGrid backtrack | FG5 |
| §7.4 removal accepted vs restored | RC1, RC4 |
| §7.4 targetGivens reached vs exhaustion | RC2, RC3 |
| §7.5 beyond-death-march | R6 |

### 3.5 §8 Technique ladder branches

Each of 15 techniques has ≥3 positive + ≥1 non-fire guard + ≥1 null per §2.7. Rank-to-tier §8.5 covered by R7, R8 at every boundary (ranks 0,1,2,3,7,8,11,12,15,16).

### 3.6 §9 Generator branches

| Branch | Test |
|---|---|
| §9.1 abortSignal.throwIfAborted | PL3, PL4 |
| §9.1 `if (!result.solved) continue` | PL6 |
| §9.1 rated tier matches → return | PL1 |
| §9.1 improve best | PL5 |
| §9.1 budget exhausted → fallback | PL5 |
| §9.2 short-circuit reject | PL8 |
| §9.4 GEN_RESULT fallback flag | W8 |
| toPuzzle FNV-1a id | PL7 |

### 3.7 §10 Worker protocol branches

Every MSG type tested in W1–W9. Throttle branch W3. Error path W6. Abort branch W4. Background queue W5.

### 3.8 §11 Hint resolution branches

| Branch | Test |
|---|---|
| §11.1 step 5 placement found | HP1 |
| §11.1 step 5 no placement → 'solution-lookup' | HP6 |
| §11.1 step 3 conflict filter | HP3 |
| §11.2 coach mode (targetCell absent) | HP2 |

### 3.9 §12 Theme branches

| Branch | Test |
|---|---|
| §12.2 applyTheme removal loop | UT1 |
| §12.2 applyTheme add + cookie + announce | UT2, UT3, UT4 |
| §12.3 inline script no-cookie default | UT6 |
| §12.3 inline script cookie present | UT5, UT7 |

### 3.10 §13 UI branches

| Branch | Test |
|---|---|
| §13.3 Check visibility per tier | UN6 |
| §13.5 dialog focus trap + escape | UD2, UD3 |
| §13.6 won class applied | UW2 |
| §13.7 stats active-diff from state.puzzle.difficulty | US2, US4 |

### 3.11 §14 A11y branches

Every fspec §14.3 announcement mapped in A1–A9. Every ARIA attribute from §14.2 asserted in A10–A16. Focus rules §14.4 in A17–A19.

### 3.12 §16 Test infra

c8 `--include=js/** --exclude=js/tests/**` gate enforced by test runner. `run.js` script fails nonzero below 100%.

### 3.13 §17 Perf gates

| Gate | Test |
|---|---|
| Non-generation action <1 s | CF9, HP8, S-reducer timing bracket |
| Death March cold-start <5 s | PL11, SYS3 |

### 3.14 Fspec-specific branches

| Fspec branch | Test |
|---|---|
| §3.2 difficulty change with/without progress | UC7, UC8 |
| §4.2 wrap right/left/up/down | S5 × 4 directions |
| §4.2 given-skip | S6 |
| §5.2 P key input-focus guard | UK7, UK8 |
| §5.2 arrow with no selection | UK6 |
| §6.2 replace existing pen digit | S13 |
| §6.2 same-digit no-op | S12 |
| §6.3 pencil ignored when pen present | S23 |
| §6.4 erase cases (pen/pencil/empty/given) | S24–S27 |
| §6.5 auto-clear | S18, GF10 |
| §7.1 triple-conflict | CF5 |
| §7.2.2 Check auto-clear 3s | GF2, S35, S36 |
| §7.2.3 Hard re-evaluate after refill | GF4 |
| §7.2.4 DM no highlight | GF5, S39 |
| §8.1 Hint button state matrix | S31–S33, UN9, UN10 |
| §8.3 hint count display formats | UN7, UN8 |
| §9.1 New Puzzle dialog Cancel vs Confirm | UC3, UC4 |
| §9.2 Reset dialog | UC5, UC6 |
| §10.2 post-win input disabled | GF13 |
| §10.3 post-win Reset preserves stats | GF14 |
| §11.1 attempted increment rule | S15–S17, S33a, S33b |
| §13.1 mode not persisted | PE3 |
| §13.2 correctness flags not restored | PE2 |
| §13.3 state invalidation cases | PE9, PE10 |

---

## 4. Risks and Gaps

### 4.1 Spec ambiguities to resolve before implementation

1. **HintProvider null return (HP7).** Aspec §4.18 says `nextHint` may return `null`. Fspec §8.1–§8.2 imply the hint always fills the target cell when the button is enabled. Clarify: when does `nextHint` return null? Proposed resolution: only when puzzle is already solved or target is a given. Shape HP7 around that agreed contract.

2. **HiddenSingle non-fire guard (HS4).** Aspec §8.3 mandates a non-fire test where an easier technique is applicable. The technique module is pure and does not know about easier techniques — the guard is enforced by the `logical.js` driver. Recommendation: the "non-fire when easier applicable" test lives in `logical.test.js` (L9 driver-level); the technique file's non-fire test should be "no hidden singles exist" (HS4 above).

3. **Stats race (ST7).** `recordAttemptOnce` and `recordWin` both persist asynchronously. Test asserts final state (both +1) regardless of order; file a follow-up if races are observed in practice.

4. **Debounce window for persistence (PE11).** Aspec §5.5 says 100 ms. Use `page.clock.install()` for determinism; never use real 100 ms waits.

### 4.2 Coverage edge cases

5. **Worker code coverage.** c8 collects coverage from the main frame. Worker script coverage requires separate instrumentation. Verify Playwright's coverage API captures Worker contexts; if not, add an in-page direct import of worker-side code (without spawning a Worker) to unit-cover its branches, keeping integration tests for the messaging seam only.

6. **Inline head script (§12.3).** Lives in `index.html`, not `js/*`. c8 will not instrument it. Covered functionally by UT7. This file is explicitly exempt from the 100% c8 gate.

### 4.3 Flakiness risks

7. **Auto-clear timer (3 s).** Never use real waits. Use `page.clock.install()` (Playwright).

8. **Debounced persistence.** Same as above.

9. **Worker async messaging.** Integration tests must `await` a promise resolved by the `GEN_RESULT` listener, not `setTimeout` polling. Provide an `expectMessage(type, predicate)` helper in the test harness.

10. **`srLive` double-frame pattern.** Uses `requestAnimationFrame`. In Playwright headless, rAF fires; explicit double-rAF awaits are required before asserting region content.

### 4.4 Fixture construction

11. **Curated SudokuWiki positions.** Source from SudokuWiki (cited in aspec §8.2). Store each as a `fixtures/techniques/<technique>.js` module: `{ board: [...], expected: { placements, eliminations }, source: 'sudokuwiki.org/...' }`.

12. **Death March fixtures.** Generate with a known seed and freeze. Log the seed in the fixture file for reproducibility.

13. **50-puzzle regression set (aspec §17 Phase 2 milestone).** Recommend 10 per tier, mix of SudokuWiki examples and generator-derived seeds.

### 4.5 Perf gate calibration

14. CI perf assertions should target headless Chromium on CI runner baseline. Recommend a `PERF_BUDGET_FACTOR` env var to loosen gates on slow CI hardware without changing code.

### 4.6 Untested by design

15. **Visual design** (colors, motion) — covered by visual designer review, not automation.
16. **Theme visual regressions** — structural class changes asserted; pixel-level diffs out of scope for v1.
17. **Hosting.com deployment mechanics** — manual acceptance only.

### 4.7 Additional invariants for the Test Writer

18. **Every reducer action must emit `'changed'` exactly once per dispatch.** Verify via subscribe-count check (S54).

19. **No UI module should import from `game/*` or `providers/*` directly.** Enforce via a static source scan in `tests/unit/arch.test.js` that greps for forbidden imports.

20. **No duplicate cookie writes.** When stats update, `cookieStatsStore.save` is called once per update. Verify via spy in ST4.

21. **PUZZLE_LOADED must reset `winHandled` and `won`.** Assert explicitly in S1.

22. **`ON_COMPLETION_EVALUATE` trigger cadence.** Must fire after every pen entry in Kiddie (to catch last cell) and on full-fill elsewhere. Test both trigger paths in S37, S38, S39.
