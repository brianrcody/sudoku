# Architectural Spec / Implementation Plan — Sudoku v1
**Status:** Final
**Date:** 2026-04-18
**Author:** Architect

---

## Table of Contents

1. [Scope and Inputs](#1-scope-and-inputs)
2. [Technology Stack and Rationale](#2-technology-stack-and-rationale)
3. [File and Directory Structure](#3-file-and-directory-structure)
4. [Module Breakdown and Responsibilities](#4-module-breakdown-and-responsibilities)
5. [Data Models and State Management](#5-data-models-and-state-management)
6. [Persistence Schemas](#6-persistence-schemas)
7. [Key Algorithms](#7-key-algorithms)
8. [Technique Ladder Specification](#8-technique-ladder-specification)
9. [Generation Pipeline and Difficulty Rating](#9-generation-pipeline-and-difficulty-rating)
10. [Worker Protocol](#10-worker-protocol)
11. [Hint Resolution](#11-hint-resolution)
12. [Theme System](#12-theme-system)
13. [UI Layer and Event Flow](#13-ui-layer-and-event-flow)
14. [Accessibility Implementation](#14-accessibility-implementation)
15. [External Dependencies](#15-external-dependencies)
16. [Test Infrastructure](#16-test-infrastructure)
17. [Implementation Sequence](#17-implementation-sequence)
18. [Deployment Procedure](#18-deployment-procedure)
19. [Feasibility Notes and Open Items](#19-feasibility-notes-and-open-items)

---

## 1. Scope and Inputs

This aspec covers the full Sudoku v1 implementation. Authoritative inputs:

- `docs/fspecs/fspec-001-v1.md` — functional behavior
- `docs/vspecs/vspec-001-v1.md` — visual design, including theme color tables and structural overrides
- `docs/aspecs/puzzle-generation-spike.md` — generation approach evaluation
- `docs/aspecs/puzzle-generation-followup.md` — resolved decisions for Approach 1 (client-side generation)

All generation-architecture decisions from the follow-up §5 are fixed and not re-evaluated here: client-side Web Worker generation, up to 5 s Death March cold-start, attempt-budget fallback returns hardest candidate silently, background pre-generation persisted to `localStorage`, seedable PRNG, clean-room MIT implementation from SudokuWiki prose, `SolverHintProvider` in v1.

---

## 2. Technology Stack and Rationale

### 2.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Markup | Vanilla HTML5 | Single `index.html`. No framework, no build step. |
| Styling | Vanilla CSS with CSS Custom Properties | All themes are CSS custom property blocks scoped to a `body.theme-*` class, per vspec §1.1. Additive extensibility without touching existing theme code. |
| Main-thread JS | Vanilla ES2020+ modules (`<script type="module">`) | Native ESM loads correctly from `file://` for local dev in modern browsers and from static HTTP on hosting.com. No bundler required. |
| Worker JS | Vanilla ESM worker (`new Worker(url, { type: 'module' })`) | Permits importing solver/generator modules inside the worker from the same `js/` tree; single source of truth for solver code shared between main thread (hints) and worker (generation). |
| Persistence | `document.cookie` for theme + stats (per fspec §11.3, §12.3); `localStorage` for in-progress puzzle state and pre-generated next-puzzle cache | Cookies are mandated for theme and stats. Puzzle state uses localStorage — see §19.2. |
| Testing | Mocha + Chai running in a headless browser (Playwright) | Zero build step; Mocha's `mocha.js` and Chai's `chai.js` load as plain `<script>` tags. Playwright drives the headless browser so the solver, Worker, and DOM code all run in a real browser identical to production. c8 (native V8 coverage) collects branch coverage with no transpilation. |
| Deployment | Static files uploaded via SFTP/FTP to hosting.com | Pure static assets; no server runtime. |

### 2.2 Why a Web Worker

Per follow-up §2.3 and §4, the solver-based generator blocks the main thread for multiples of seconds in Death March cold-start. Running it on the main thread would freeze input, scroll, and animation for that duration and be perceived as broken regardless of the 5 s tolerance. The Worker:

1. Keeps the main UI responsive while generation runs.
2. Makes cancellation clean via `AbortSignal` on the main side and message-based abort on the Worker side.
3. Runs exactly the same JS modules the main thread uses (`solver/`, `generator/`), because ESM Workers can import from the same tree.

### 2.3 Why no dependencies

All algorithms (logical solver, uniqueness solver, generator, rater, hint resolver, PRNG) fit in vanilla JS. No third-party Sudoku library is used (avoids license contamination with Hodoku GPL and other GPL sources — per follow-up §2.7 and flag 4). Test dependencies (Mocha, Chai, Playwright, c8) are devDependencies only, never shipped.

---

## 3. File and Directory Structure

```
sudoku/
├── index.html                        # Single-page app entry
├── css/
│   ├── base.css                      # Reset, layout, typography (default Minimalist)
│   ├── grid.css                      # Sudoku grid and cells
│   ├── controls.css                  # Number pad, buttons, selectors, modals
│   ├── stats.css                     # Statistics panel
│   └── themes.css                    # All theme body classes + structural overrides
├── js/
│   ├── main.js                       # App bootstrap; wires modules; mounts UI
│   ├── config.js                     # Difficulty config, hint counts, budgets, constants
│   ├── prng.js                       # mulberry32 seedable PRNG
│   ├── util/
│   │   ├── grid.js                   # Index↔(row,col,box), unit iteration, peers
│   │   ├── bitset.js                 # 9-bit candidate sets (bitmask helpers)
│   │   └── events.js                 # Tiny typed event emitter
│   ├── solver/
│   │   ├── uniqueness.js             # Norvig-style constraint-propagation solver
│   │   ├── logical.js                # Logical solver driving the technique ladder
│   │   ├── candidates.js             # Initial candidate computation + maintenance
│   │   └── techniques/
│   │       ├── index.js              # Ordered export: TECHNIQUES[] by rank
│   │       ├── nakedSingle.js
│   │       ├── hiddenSingle.js
│   │       ├── lockedCandidates.js   # Pointing + claiming
│   │       ├── nakedSubsets.js       # Naked pair + naked triple
│   │       ├── hiddenSubsets.js      # Hidden pair + hidden triple
│   │       ├── xWing.js
│   │       ├── swordfish.js
│   │       ├── jellyfish.js
│   │       ├── xyWing.js
│   │       ├── coloring.js           # Simple coloring + multi-coloring
│   │       └── forcingChains.js      # XY-chains + AIC-style forcing chains
│   ├── generator/
│   │   ├── fillGrid.js               # Random filled solution via backtracking
│   │   ├── removeCells.js            # Symmetric-or-random removal with uniqueness guard
│   │   ├── rater.js                  # Runs logical solver, returns tier + trace
│   │   └── pipeline.js               # generateForTier() orchestrator
│   ├── worker/
│   │   ├── generator.worker.js       # Worker entry: receives requests, calls pipeline
│   │   └── protocol.js               # Message-type constants + envelope helpers (shared)
│   ├── providers/
│   │   ├── puzzleProvider.js         # Public facade: requestPuzzle, peekReady, primeNext
│   │   ├── clientGenProvider.js      # Wraps the Worker; manages the pre-gen cache
│   │   ├── hintProvider.js           # SolverHintProvider
│   │   ├── statsProvider.js          # Stats facade; wraps a StatsStore adapter
│   │   └── cookieStatsStore.js       # v1 StatsStore: cookie-backed
│   ├── game/
│   │   ├── state.js                  # In-memory game state reducer
│   │   ├── conflicts.js              # Conflict detection on row/col/box
│   │   ├── correctness.js            # Kiddie/Easy/Medium/Hard/Death March checking
│   │   └── statistics.js             # Stats counters, persistence hook
│   ├── persist/
│   │   ├── cookies.js                # Read/write cookies (theme, stats)
│   │   └── storage.js                # localStorage (puzzle state, pre-gen cache, seen)
│   ├── ui/
│   │   ├── grid.js                   # Renders grid cells; dispatches cell events
│   │   ├── numpad.js                 # Renders pad + buttons; routes input
│   │   ├── controls.js               # New Puzzle, Reset, Difficulty, Check, theme select
│   │   ├── stats.js                  # Stats table renderer
│   │   ├── winBanner.js              # Win overlay + animation trigger
│   │   ├── dialog.js                 # Reusable confirmation dialog
│   │   ├── srLive.js                 # Screen reader live region helper
│   │   ├── themes.js                 # Theme class swap + cookie persistence
│   │   └── keyboard.js               # Desktop keyboard shortcuts
│   └── tests/
│       ├── setup.html                # Mocha/Chai test runner page
│       ├── setup.js                  # Global beforeEach/afterEach, fixtures
│       ├── fixtures/
│       │   ├── puzzles/              # Hand-curated positions per technique
│       │   └── grids/                # Filled solutions for uniqueness tests
│       ├── unit/
│       │   ├── prng.test.js
│       │   ├── grid.test.js
│       │   ├── bitset.test.js
│       │   ├── uniqueness.test.js
│       │   ├── candidates.test.js
│       │   ├── techniques/
│       │   │   ├── nakedSingle.test.js
│       │   │   ├── hiddenSingle.test.js
│       │   │   ├── lockedCandidates.test.js
│       │   │   ├── nakedSubsets.test.js
│       │   │   ├── hiddenSubsets.test.js
│       │   │   ├── xWing.test.js
│       │   │   ├── swordfish.test.js
│       │   │   ├── jellyfish.test.js
│       │   │   ├── xyWing.test.js
│       │   │   ├── coloring.test.js
│       │   │   └── forcingChains.test.js
│       │   ├── logical.test.js
│       │   ├── fillGrid.test.js
│       │   ├── removeCells.test.js
│       │   ├── rater.test.js
│       │   ├── pipeline.test.js
│       │   ├── state.test.js
│       │   ├── conflicts.test.js
│       │   ├── correctness.test.js
│       │   ├── statistics.test.js
│       │   ├── statsProvider.test.js
│       │   ├── cookieStatsStore.test.js
│       │   ├── cookies.test.js
│       │   ├── storage.test.js
│       │   └── hintProvider.test.js
│       └── integration/
│           ├── worker.test.js        # Spawns the real Worker, round-trips messages
│           ├── game-flows.test.js    # Tap→enter→conflict→erase lifecycles
│           ├── persistence.test.js   # Resume behavior round trip
│           └── a11y.test.js          # ARIA/live-region assertions
├── test-runner/
│   ├── run.js                        # Playwright script: boot browser, open tests/setup.html, harvest results + coverage
│   └── serve.js                      # Tiny static file server (Node built-in http) for tests only
├── docs/                             # (existing spec tree)
├── README.md                         # Produced by Implementor
├── LICENSE                           # MIT
└── package.json                      # devDependencies only: playwright, c8, mocha, chai
```

Notes:
- `index.html` pulls in CSS files in order `base.css → grid.css → controls.css → stats.css → themes.css`, then loads `js/main.js` as `type="module"`.
- `js/worker/generator.worker.js` is instantiated with `new Worker('./js/worker/generator.worker.js', { type: 'module' })` from `clientGenProvider.js`. Browsers resolve the relative URL against `index.html` the same way in `file://` and HTTPS.
- `package.json` exists **only** for development tooling (test runner). Production deployment uploads `index.html`, `css/`, `js/`. `node_modules/` and `package.json` are not deployed.
- No bundling, no transpilation. The `js/` tree is what the browser loads verbatim.

---

## 4. Module Breakdown and Responsibilities

### 4.1 `js/main.js`
- Reads theme cookie and applies class before any render (per vspec §1.2).
- Instantiates `ClientGenProvider` and `SolverHintProvider`.
- Instantiates `GameState` (§5.1) and UI modules; wires events.
- Calls `primeNext(currentDifficulty)` on boot.
- Restores in-progress puzzle from `localStorage` per fspec §13.2.
- Owns the top-level coordinator for user actions: New Puzzle, Reset, Difficulty change, Check, Hint, theme change.

### 4.1.1 Bootstrap sequence (`main.js`)

Strict order — no step may be reordered:

1. (Inline head script from §12.3 has already set the body theme class before this module runs.)
2. `initTheme()` — reconcile cookie with `classList` in case of drift between inline script and module load.
3. Construct persistence primitives: `cookieStatsStore`, `createStatsProvider(cookieStatsStore)`, `createStatistics(provider)`; `await stats.init()` — so the stats panel renders with real values on first paint.
4. Construct `clientGenProvider` (spawns the Worker) and `puzzleProvider`.
5. Construct `SolverHintProvider`.
6. Construct `GameState` via `createGameState({ stats, hintProvider, puzzleProvider })`.
7. Attempt to restore `sudoku.state.v1` via `persist/storage.js`. If present and valid, dispatch `PUZZLE_LOADED` from the restored blob. If absent, read `sudoku.currentDifficulty.v1` (default `'easy'`), dispatch `SET_GENERATING` true, call `puzzleProvider.requestPuzzle({ difficulty })`, then dispatch `PUZZLE_LOADED` on resolution.
8. Mount UI modules in order: `srLive`, `themes` (select control), `controls`, `grid`, `numpad`, `stats`, `winBanner`, `dialog`, `keyboard`.
9. Subscribe the persistence writer (§5.5) to state `'changed'` events.
10. Call `puzzleProvider.primeNext(currentDifficulty)`.

### 4.2 `js/config.js`
Frozen constant tables:
- `DIFFICULTY_ORDER = ['kiddie','easy','medium','hard','death-march']`
- `HINT_LIMITS = { kiddie: Infinity, easy: 3, medium: 1, hard: 0, 'death-march': 0 }`
- `CHECK_VISIBLE = { kiddie: false, easy: true, medium: true, hard: false, 'death-march': false }`
- `CORRECTNESS_MODE = { kiddie: 'realtime', easy: 'on-demand', medium: 'on-demand', hard: 'on-complete', 'death-march': 'on-complete-silent' }`
- `GIVEN_COUNT_TARGET`: soft targets per tier — Kiddie 45–50, Easy 36–42, Medium 30–34, Hard 26–30, Death March 22–26. These are guidance for the removal loop; the rater decides the final tier.
- `ATTEMPT_BUDGET`: `{ kiddie: 20, easy: 30, medium: 60, hard: 150, 'death-march': 300 }` — max candidate puzzles attempted before returning the hardest-so-far (follow-up §2.2, flag 1).
- `WORKER_URL = './js/worker/generator.worker.js'`
- `CHECK_HIGHLIGHT_MS = 3000`
- `THEME_CLASSES = ['theme-minimalist','theme-coffee','theme-school','theme-terminal','theme-mountain']`
- `DEFAULT_THEME = 'theme-minimalist'`

### 4.3 `js/prng.js`
- Exports `mulberry32(seed: uint32) → () → float in [0,1)`.
- Exports `randomSeed() → uint32` using `crypto.getRandomValues`.
- Exports `shuffle(arr, rng) → arr` (Fisher-Yates using the supplied rng).

### 4.4 `js/util/grid.js`
- Exports index helpers: `rowOf(i)`, `colOf(i)`, `boxOf(i)`, `cellIndex(r,c)`.
- Exports `PEERS[i]` — precomputed length-20 array of peer indices per cell.
- Exports `UNITS` — 27 length-9 arrays (9 rows + 9 cols + 9 boxes).
- Exports `UNITS_OF[i]` — 3 units each cell belongs to.

### 4.4a `js/util/events.js`

Tiny typed event emitter. Exports a single factory:

```js
createEmitter() → {
  on(type: string, listener: (payload: any) => void) → () => void,
  off(type: string, listener: Function) → void,
  emit(type: string, payload?: any) → void,
  clear(type?: string) → void,   // clear one type, or all types if omitted
}
```

Semantics:
- `on` returns an unsubscribe function. Calling it more than once is a no-op.
- `emit` invokes listeners synchronously in registration order with a single `payload` argument.
- Listeners added during an `emit` call do **not** fire for the in-flight emission.
- Listeners removed during an `emit` call (including via their own returned unsubscribe) do not fire for the remainder of the in-flight emission if they have not yet been called.
- Re-entrant `emit` calls from within a listener are allowed and run to completion before the outer `emit` resumes.
- If a listener throws, the error is caught, logged via `console.error`, and remaining listeners for that emission still fire. The error does not propagate out of `emit`.
- Emitting to a type with no listeners is a no-op; unknown types are not errors.

Consumers that wish to expose `.on`/`.off` on their own object (e.g. `GameState`, `Statistics`) compose by holding an emitter instance internally and delegating:

```js
const e = createEmitter();
return { ...api, on: e.on, off: e.off };  // emit stays private to the owner
```

### 4.5 `js/util/bitset.js`
- 9-bit candidate set helpers over JS numbers: `has`, `add`, `remove`, `count`, `iterate`, `fromDigits(arr)`, `ALL = 0b111111111`.

### 4.6 `js/solver/uniqueness.js`
Norvig-style solver. One public function:
- `countSolutions(givens: Uint8Array(81), cap=2) → { count, solution }` — returns 0, 1, or 2+ (capped). If `count === 1`, `solution` is the 81-cell solved grid. Used only for uniqueness checking during generation.

### 4.7 `js/solver/candidates.js`
- `initialCandidates(board) → Uint16Array(81)` — bitsets.
- `applyPlacement(candidates, cellIndex, digit)` — eliminates digit from peers; mutates in place.

### 4.8 `js/solver/techniques/*` and `js/solver/techniques/index.js`
Each technique module exports a pure function:
```js
apply(state) → { placements: [{cellIndex, digit}], eliminations: [{cellIndex, digit}], technique: string } | null
```
- `state = { board: Uint8Array(81), candidates: Uint16Array(81) }`.
- `null` means the technique made no progress.
- Returns on the **first** progress found; the driver re-enters from the top of the ladder.

`index.js` exports the ordered array:
```js
TECHNIQUES = [
  nakedSingle,        // rank 1
  hiddenSingle,       // rank 2
  lockedCandidates,   // rank 3
  nakedPair,          // rank 4
  hiddenPair,         // rank 5
  nakedTriple,        // rank 6
  hiddenTriple,       // rank 7
  xWing,              // rank 8
  swordfish,          // rank 9
  jellyfish,          // rank 10
  xyWing,             // rank 11
  simpleColoring,     // rank 12
  multiColoring,      // rank 13
  xyChain,            // rank 14
  forcingChain,       // rank 15
];
```

### 4.9 `js/solver/logical.js`
- `solveLogically(board, { techniqueLimit }) → { solved: bool, board, candidates, trace: Step[], hardestRank: int }` — drives the ladder.
- `Step = { cellIndex, digit | null, technique, eliminations?: [{cellIndex, digit}] }`.
- `techniqueLimit` optional — cap at rank N (used by rater to check "is this puzzle solvable by tier T?").

### 4.10 `js/generator/fillGrid.js`
- `fillGrid(rng) → Uint8Array(81)` — random-digit, peer-constrained backtracking to produce a full valid solution.

### 4.11 `js/generator/removeCells.js`
- `buildMinimalPuzzle(solution, rng, targetGivens) → Uint8Array(81)` — iterate cells in shuffled order; tentatively remove; call `countSolutions` (cap=2); if still unique, accept; else restore. Stop when no further removals are possible or `targetGivens` is reached.

### 4.12 `js/generator/rater.js`
- `rate(givens) → { tier: Tier, hardestRank: int, trace: Step[], solved: bool }` — invokes `solveLogically` with no limit; derives tier from `hardestRank` via the mapping in §8.5.

### 4.13 `js/generator/pipeline.js`
- `generateForTier(tier, { rng, budget, onProgress, abortSignal }) → Puzzle` — the orchestrator described in §9.
- Handles attempt-budget fallback per follow-up flag 1.

### 4.14 `js/worker/generator.worker.js`
- Message-driven entry. Imports `pipeline.js`, `prng.js`. Protocol defined in §10.

### 4.15 `js/worker/protocol.js`
Shared constants for messages:
```js
MSG.GEN_REQUEST, MSG.GEN_PROGRESS, MSG.GEN_RESULT, MSG.GEN_ERROR, MSG.GEN_ABORT
```

### 4.16 `js/providers/puzzleProvider.js`
Public facade conforming to follow-up §3.1:
- `requestPuzzle({ difficulty, signal }) → Promise<Puzzle>`
- `peekReady(difficulty) → Puzzle | null`
- `primeNext(difficulty) → void`

Internally delegates to `clientGenProvider.js`. The module exports an instance (constructed with the single Worker).

**`Puzzle` shape** (returned by `requestPuzzle` and `peekReady`; matches `state.puzzle` in §5.1):

```js
Puzzle = {
  id: string,               // FNV-1a hex per §9.1 toPuzzle
  difficulty: Tier,         // actual rated tier; may differ from requested on fallback (§9.1)
  givens: Uint8Array(81),   // 0 = empty
  solution: Uint8Array(81),
  solveTrace: Step[],       // always present on freshly generated puzzles
}
```

Typed arrays survive `postMessage` structured clone; the worker posts `Uint8Array` directly. The localStorage pregen cache (§6.2) serializes to plain `number[]` on write and restores to `Uint8Array` on read — the provider handles this conversion at the persistence boundary. All consumers always receive `Uint8Array`.

On attempt-budget fallback, `difficulty` reflects the actually-achieved tier, not the requested tier. The provider does not surface `fallback: true` to callers (§9.4 — logged only).

### 4.17 `js/providers/clientGenProvider.js`
- Owns the single `Worker` instance.
- Owns the pre-gen cache (in-memory map `difficulty → Puzzle`, mirrored to `localStorage`).
- On `requestPuzzle`, first checks `peekReady`. If present, returns synchronously (via resolved Promise) and consumes the cache slot. Else, posts `GEN_REQUEST` to worker and returns a Promise.
- `primeNext` posts a `GEN_REQUEST` with flag `background=true`. Result is written to cache + `localStorage`.
- One Worker, one in-flight foreground request at a time. Background requests queue behind foreground.
- Aborts: `AbortSignal` causes a `GEN_ABORT` message and the provider rejects the Promise with `DOMException('aborted','AbortError')`.

### 4.18 `js/providers/hintProvider.js`
`SolverHintProvider`:
- `nextHint(puzzle, playerState, { targetCell } = {}) → { cellIndex, digit, technique } | null`
- If `targetCell` is given, returns `{ cellIndex: targetCell, digit: puzzle.solution[targetCell], technique }` where `technique` is the technique the solver would use to place that cell next given the player's state.
- If `targetCell` is absent, returns the first placement step in the solver trace — the forward-looking interface for future coach/teaching mode.
- The game's hint flow always passes `targetCell = state.selected`.
- Builds a working board from givens + non-conflicting pen entries; pencil marks ignored (candidates recomputed).

### 4.19 `js/game/state.js`
Central state reducer. See §5.1 for shape and §5.2 for actions.

**Factory:**
```js
createGameState({ stats, hintProvider }) → {
  dispatch(action) → void,
  getState() → GameState,          // returns the live object; consumers treat as read-only
  on(type, listener) → unsubscribe // 'changed' event per §5.4
}
```

- `stats` — the `Statistics` instance from §4.22. Used by `PEN_ENTER` / `ON_COMPLETION_EVALUATE` handlers per §5.2.1. Required.
- `hintProvider` — the `SolverHintProvider` from §4.18. Used by the `HINT` action handler. Required.
- `puzzleProvider` is **not** a reducer dependency. `main.js` calls `puzzleProvider.requestPuzzle(...)` and dispatches `PUZZLE_LOADED` (see §4.1.1 step 7). The reducer never initiates puzzle generation.
- Config values (`HINT_LIMITS`, `CHECK_VISIBLE`, `CORRECTNESS_MODE`, `CHECK_HIGHLIGHT_MS`) are imported directly from `js/config.js`, not injected.

**HINT action handler** constructs the `playerState` argument for `nextHint`:
```js
hintProvider.nextHint(
  state.puzzle,
  { pen: state.pen, conflicts: state.conflicts },
  { targetCell: state.selected }
);
```
`conflicts` is required so the hint provider can filter out conflict-flagged pen entries when building the working board (§4.18, §11.1 step 3).

### 4.20 `js/game/conflicts.js`
- `computeConflicts(board) → Set<int>` — indices of all cells participating in any row/col/box duplicate pen digit. Recomputed on every pen-edit event.

### 4.21 `js/game/correctness.js`
- `checkRealtime(state, cellIndex) → flag change` — Kiddie.
- `checkAll(state) → Set<int>` — Easy/Medium Check button.
- `checkOnComplete(state) → { correct: bool, wrong: Set<int> }` — Hard/Death March full-grid.

### 4.22 `js/game/statistics.js`

Factory `createStatistics(provider: StatsProvider) → Statistics`.

Statistics interface:
- `init() → Promise<void>` — loads from provider, caches in memory, emits `'stats-changed'`.
- `get() → StatsMap` — returns the current cached map (synchronous).
- `recordAttemptOnce(difficulty) → Promise<void>` — increments `attempted` for that difficulty, persists via provider, emits `'stats-changed'`. Idempotent safety guard is the caller's responsibility (see §5.2.1 PEN_ENTER gating).
- `recordWin(difficulty) → Promise<void>` — increments `won`, persists, emits `'stats-changed'`.
- `on(type, listener) → unsubscribe` — event subscription (uses `util/events.js`).

This module holds no storage knowledge. All persistence is delegated to the provider (§4.29). Construction and `await stats.init()` happen in `main.js` before UI mount (see §4.1.1 step 3).

### 4.23 `js/persist/cookies.js`
- `get(name)`, `set(name, value, { maxAge, path, sameSite })`, `remove(name)`.
- `maxAge = 60 * 60 * 24 * 365 * 2` (2 years). `path=/`. `SameSite=Lax`.

### 4.24 `js/persist/storage.js`
- Wraps `localStorage` with try/catch (fails silently in private-browsing or disabled storage).
- Keys listed in §6.2.

### 4.25 `js/ui/*`

Each UI module owns exactly one DOM subtree. Each module default-exports a factory:

```js
export default function createXxxUI(/* optional closed-over deps */) → {
  mount(root: HTMLElement, gameState: GameState) → void,
}
```

- `gameState` is the object returned by `createGameState(...)`, exposing `dispatch`, `getState`, and `on`.
- `mount` is called once. The module stores references to `root` and `gameState`, subscribes to events, and performs the first render inline before returning:
  ```js
  function mount(root, gameState) {
    this.#root = root;
    this.#gs = gameState;
    gameState.on('changed', ({ changed }) => {
      if (this.#relevant(changed)) this.#render(gameState.getState());
    });
    this.#render(gameState.getState());  // first render
  }
  ```
- Each module defines its own relevant-keys set and short-circuits on irrelevant changes.
- `dispatch` is accessed via `gameState.dispatch` inside the module — not passed as a separate argument.
- Modules that subscribe to additional emitters (e.g. `ui/stats.js` subscribing to `statistics.on('stats-changed', ...)` per §13.7) receive those instances as constructor arguments to the factory, not via `mount`.
- No UI module imports from `game/*`, `providers/*`, or `persist/*` — all cross-module data flows via `gameState` or its emitter.
- No direct DOM access outside the module's `root`.

### 4.26 `js/ui/srLive.js`
A single hidden `#sr-live` region. Exposes `announce(text)` with the double-frame clear-then-set pattern so repeated messages are re-announced.

### 4.27 `js/ui/keyboard.js`
Global `keydown` handler on `document`. Handles: digits 1–9, Backspace/Delete, arrow keys, P (toggle pen/pencil — only when focus is not in an `input/select/textarea`), Escape (close dialogs).

### 4.28 `js/ui/themes.js`
- `applyTheme(className)` — removes all `THEME_CLASSES` from `<body>`, adds given one; writes cookie; announces via sr-live.
- `initTheme()` — read cookie, apply before first render. Called by `main.js` before DOM is mounted.

### 4.29 `js/providers/statsProvider.js`

Factory `createStatsProvider(store: StatsStore) → StatsProvider`.

StatsStore adapter contract:
- `load() → Promise<StatsMap>` — resolves to stored map, or the zero-initialized default if missing/invalid. Never throws.
- `save(stats: StatsMap) → Promise<void>` — persists; best-effort (swallow I/O errors per persist-layer policy).

StatsProvider is a thin pass-through that currently delegates 1:1 to the store but serves as the stable seam if stats ever move server-side (e.g., retry/backoff, request coalescing would live here without touching `game/statistics.js`).

### 4.30 `js/providers/cookieStatsStore.js`

The v1 StatsStore implementation. Exports `cookieStatsStore` (singleton).
- Owns cookie name `'sudoku.stats'` and the on-the-wire schema from §6.1.
- `load()` reads the cookie via `persist/cookies.js`, URL-decodes, JSON-parses, checks `version === 1`, returns the inner `stats` map; otherwise returns the default zero-counts map for all five difficulties.
- `save(stats)` wraps `{ version: 1, stats }`, JSON-encodes, URL-encodes, calls `cookies.set('sudoku.stats', value, { maxAge: 2y, path: '/', sameSite: 'Lax' })`.

This is the only module outside `persist/cookies.js` that names the stats cookie.

### 4.31 Future stats stores (informational)

A server-backed store (e.g., `serverStatsStore.js`) would implement the same StatsStore contract against `fetch()`. Swapping requires a single edit in `main.js`: replace `cookieStatsStore` with the new store in the `createStatsProvider(...)` call. No other module changes.

---

## 5. Data Models and State Management

### 5.1 In-memory game state

```js
GameState = {
  // Puzzle identity
  puzzle: {
    id: string,
    difficulty: Tier,
    givens: Uint8Array(81),           // 0 = empty
    solution: Uint8Array(81),
    solveTrace: Step[] | undefined,
  } | null,

  // Player entries
  pen: Uint8Array(81),                // 0 = empty
  pencil: Uint16Array(81),            // bitmask of candidate digits

  // UI flags (transient, not persisted)
  selected: int | null,
  activeMode: 'pen' | 'pencil',       // default pen; never persisted
  conflicts: Set<int>,
  incorrect: Set<int>,
  incorrectShownUntil: number | 0,    // timestamp; drives auto-clear

  // Hint / attempt bookkeeping
  hintsRemaining: int,
  attemptRecorded: bool,

  // Completion
  won: bool,
  winHandled: bool,

  // Pregen / async
  generating: bool,
  generatingMessage: string,
};
```

### 5.2 Actions (reducer API)

All state transitions go through `GameState.dispatch(action)`. Action types:

- `PUZZLE_LOADED` — sets puzzle, pen (givens copied), pencil (empty), clears flags.
- `SELECT_CELL` — `{ index }`; ignores givens.
- `DESELECT`
- `ARROW_NAV` — `{ direction }`; computes next player cell with wrap per fspec §4.2.
- `SET_MODE` — `{ mode }`
- `TOGGLE_MODE`
- `PEN_ENTER` — `{ digit }`. Runs steps in fspec §6.2. Triggers conflict recompute, correctness (realtime tier), auto-clear, persist.
- `PENCIL_TOGGLE` — `{ digit }` per fspec §6.3.
- `ERASE` — per fspec §6.4.
- `HINT` — invokes `SolverHintProvider.nextHint(...)`, applies placement via PEN_ENTER path with `fromHint=true`, decrements hints.
- `CHECK` — Easy/Medium; computes `incorrect`; sets `incorrectShownUntil = now + 3000`.
- `ON_COMPLETION_EVALUATE` — triggered after every pen entry when board is full.
- `CLEAR_INCORRECT` — fired by timer when `incorrectShownUntil` elapses.
- `NEW_PUZZLE` — `{ difficulty, puzzle }`.
- `RESET_PUZZLE` — restores givens, clears pen/pencil/flags, restores `hintsRemaining`. Does **not** alter `attemptRecorded`.
- `CHANGE_DIFFICULTY` — `{ difficulty }`.
- `SET_GENERATING` — `{ flag, message }`.

### 5.2.1 Stats wiring inside the reducer

`PEN_ENTER` action handler, immediately after a non-given cell transitions from empty to a non-empty pen value and `action.fromHint !== true`:
```js
if (!state.attemptRecorded) {
  state.attemptRecorded = true;
  stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
}
```

`HINT` action handler, immediately after the hint digit is written to `state.pen`:
```js
if (!state.attemptRecorded) {
  state.attemptRecorded = true;
  stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
}
```

`ON_COMPLETION_EVALUATE` action handler, when evaluation yields `correct === true` and `!state.winHandled`:
```js
state.won = true;
state.winHandled = true;
stats.recordWin(state.puzzle.difficulty); // fire-and-forget
```

`RESET_PUZZLE` does not touch `attemptRecorded` (fspec §10.3 — "no stats impact").
`NEW_PUZZLE` resets `attemptRecorded` to `false`.

### 5.3 Immutability policy

The reducer mutates internal arrays in place for performance. UI modules treat the state object as read-only and subscribe via an emitter.

### 5.4 Event flow summary

```
User gesture / key
    → ui/* module dispatches action
    → state.js reducer mutates state
    → state.js emits 'changed' with { action, changed: Set<string> }
      (keys of GameState that changed)
    → ui/* subscribers re-render affected subtrees
    → persistence subscriber (§5.5) debounces a localStorage write
```

The reducer exposes:
- `dispatch(action) → void`
- `getState() → GameState` (read-only by convention)
- `on('changed', (payload) => {}) → unsubscribe` (built on `util/events.js`)

### 5.5 Persistence writer

Registered from `main.js` step 9. Single subscriber to state `'changed'` events:
- If `changed` intersects `{ puzzle, pen, pencil, hintsRemaining, attemptRecorded }`, schedule a debounced (100 ms) write of `sudoku.state.v1` via `persist/storage.js`.
- If `changed` includes `puzzle.difficulty`, synchronously write `sudoku.currentDifficulty.v1`.
- On `NEW_PUZZLE` action or when `won && winHandled` transitions to `true`, clear `sudoku.state.v1` (puzzle is no longer resumable).

---

## 6. Persistence Schemas

### 6.1 Cookies

`sudoku.theme` — value: one of `minimalist | coffee | school | terminal | mountain`.

`sudoku.stats` — JSON-encoded, URL-encoded:
```json
{
  "version": 1,
  "stats": {
    "kiddie":       { "attempted": 0, "won": 0 },
    "easy":         { "attempted": 0, "won": 0 },
    "medium":       { "attempted": 0, "won": 0 },
    "hard":         { "attempted": 0, "won": 0 },
    "death-march":  { "attempted": 0, "won": 0 }
  }
}
```
Max-age: 2 years. `Path=/; SameSite=Lax`.

### 6.2 localStorage keys

`sudoku.state.v1` — current in-progress puzzle:
```json
{
  "version": 1,
  "difficulty": "hard",
  "puzzle": { "id": "...", "givens": [81 numbers], "solution": [81 numbers] },
  "pen": [81 numbers],
  "pencil": [81 numbers],
  "hintsRemaining": 3,
  "attemptRecorded": true,
  "savedAt": "2026-04-18T12:00:00Z"
}
```

`sudoku.pregen.v1.<difficulty>` — pre-generated next puzzle per tier:
```json
{
  "version": 1,
  "puzzle": { "id": "...", "givens": [...], "solution": [...], "solveTrace": [...] },
  "generatedAt": "2026-04-18T12:00:00Z"
}
```

`sudoku.currentDifficulty.v1` — last selected difficulty.

### 6.3 State migration

Each persisted blob carries `version: 1`. On read, if version is missing or not 1, the blob is discarded and treated as empty. No migration code in v1.

---

## 7. Key Algorithms

### 7.1 Uniqueness check (Norvig constraint propagation)

Chosen over DLX: smaller code (~250 lines vs. ~500), integrates naturally with the candidate-bitset representation used elsewhere, solves any Sudoku in well under 10 ms in JS.

Algorithm:
1. Initialize `candidates[i]` = 1..9 for empty cells, {v} for filled cells.
2. For each filled cell, call `assign(i, v)` which removes `v` from peers and recursively propagates.
3. If propagation detects a contradiction, return 0 solutions.
4. If all cells are filled, record the solution and return.
5. Otherwise, pick the empty cell with fewest candidates and try each, recursively. Stop when `count` reaches `cap` (2).

### 7.2 Logical solver loop

```js
function solveLogically(board, { techniqueLimit = Infinity }) {
  let candidates = initialCandidates(board);
  const trace = [];
  let hardestRank = 0;

  while (not fully solved) {
    let progressed = false;
    for (let rank = 0; rank < TECHNIQUES.length && rank < techniqueLimit; rank++) {
      const result = TECHNIQUES[rank]({ board, candidates });
      if (result) {
        applyResult(board, candidates, result);
        trace.push({ rank, ...result });
        hardestRank = Math.max(hardestRank, rank + 1);
        progressed = true;
        break;  // restart from rank 0
      }
    }
    if (!progressed) break;
  }

  return { solved: isFull(board), board, candidates, trace, hardestRank };
}
```

Restart from rank 0 on every progress step so easier techniques always run before harder ones on the transformed board. This is what makes the hardest-rank report accurate.

### 7.3 Filled-grid generation

`fillGrid(rng)`: recursively find next empty cell, compute candidate set, shuffle candidates with `rng`, try each in order, backtrack on failure. Returns on first success (~1–5 ms).

### 7.4 Cell removal with uniqueness guard

`buildMinimalPuzzle(solution, rng, targetGivens)`: shuffle 81 indices; for each, tentatively remove and call `countSolutions(givens, 2)`. Keep removal if unique; restore if not. Stop at `targetGivens` or no safe removals remain.

### 7.5 Difficulty rating

`rate(givens)`: run `solveLogically` with no limit. Map `hardestRank` to tier via §8.5. If not solved, return `beyond-death-march` (pipeline rejects and retries).

---

## 8. Technique Ladder Specification

All techniques implemented clean-room from SudokuWiki prose descriptions. No line-level reference to GPL code.

### 8.1 Tier → technique map

| Tier | Requires hardest rank | Techniques permitted |
|---|---|---|
| Kiddie | 1 | Naked Single |
| Easy | 2 | + Hidden Single |
| Medium | 3–7 | + Locked Candidates, Naked Pair, Hidden Pair, Naked Triple, Hidden Triple |
| Hard | 8–11 | + X-Wing, Swordfish, Jellyfish, XY-Wing |
| Death March | 12–15 | + Simple Coloring, Multi-Coloring, XY-Chain, Forcing Chain (AIC) |

Naked/hidden quads are not implemented in v1.

### 8.2 Technique definitions (rank order)

Each entry: rank, name, SudokuWiki reference, pattern.

1. **Naked Single** — Single-candidate cell. sudokuwiki.org/Getting_Started
2. **Hidden Single** — In a unit, a digit has exactly one candidate cell. sudokuwiki.org/Hidden_Candidates
3. **Locked Candidates** — Pointing + claiming; candidates confined to one row/col within a box eliminate from the rest of that row/col. sudokuwiki.org/Intersection_Removal
4. **Naked Pair** — Two cells in a unit with the same two candidates. sudokuwiki.org/Naked_Candidates
5. **Hidden Pair** — Two digits whose only candidate cells in a unit are the same two cells. sudokuwiki.org/Hidden_Candidates
6. **Naked Triple** — Three cells in a unit sharing three candidates total. sudokuwiki.org/Naked_Candidates
7. **Hidden Triple** — Three digits confined to the same three cells in a unit. sudokuwiki.org/Hidden_Candidates
8. **X-Wing** — Digit D confined to same two columns in two rows; eliminate from rest of those columns. sudokuwiki.org/X_Wing_Strategy
9. **Swordfish** — 3×3 fish. sudokuwiki.org/Sword_Fish_Strategy
10. **Jellyfish** — 4×4 fish. sudokuwiki.org/Jelly_Fish_Strategy
11. **XY-Wing** — Three bivalue cells (XY hinge, XZ and YZ wings); eliminate Z from cells seeing both wings. sudokuwiki.org/Y_Wing_Strategy
12. **Simple Coloring** — Bilocation chain; two same-colored cells that see each other make the color false. sudokuwiki.org/Singles_Chains
13. **Multi-Coloring** — Multiple colored chains interacting. sudokuwiki.org/Colors_Strategies
14. **XY-Chain** — Chain of bivalue cells alternating on a shared digit. sudokuwiki.org/XY_Chains
15. **Forcing Chain (AIC)** — Alternating Inference Chain combining strong/weak links. sudokuwiki.org/Alternating_Inference_Chains

Each technique module signature:
```js
export default function technique(state) {
  // Returns { placements, eliminations, technique } on first progress, or null.
}
```

### 8.3 Technique test policy

Every technique has a dedicated test file with:
- At least three curated positions from SudokuWiki examples where the technique finds progress.
- At least one position where the technique must **not** fire (easier technique applicable).
- At least one position where no technique fires (null return).

Positions stored as fixtures under `js/tests/fixtures/puzzles/`.

### 8.4 Elimination-only techniques and the trace

Techniques from rank 3 upward often produce only eliminations. The trace records them with `digit: null`. The outer loop restarts from rank 0 where simpler techniques frequently fire against the reduced candidates.

### 8.5 Rank-to-tier function

```js
function tierForRank(rank) {
  if (rank === 0)   return null;
  if (rank <= 1)   return 'kiddie';
  if (rank <= 2)   return 'easy';
  if (rank <= 7)   return 'medium';
  if (rank <= 11)  return 'hard';
  if (rank <= 15)  return 'death-march';
  return 'beyond-death-march';
}
```

---

## 9. Generation Pipeline and Difficulty Rating

### 9.1 `generateForTier(tier, opts)` algorithm

```js
let best = null;
let attempts = 0;
const budget = opts.budget ?? ATTEMPT_BUDGET[tier];
const target = GIVEN_COUNT_TARGET[tier];

while (attempts < budget) {
  opts.abortSignal?.throwIfAborted();
  attempts++;
  opts.onProgress?.({ attempts, budget });

  const solution = fillGrid(opts.rng);
  const givens   = buildMinimalPuzzle(solution, opts.rng, target);
  const result   = rate(givens);

  if (!result.solved) continue;

  if (tierForRank(result.hardestRank) === tier) {
    return toPuzzle(givens, solution, tier, result.trace, opts.rng);
  }

  if (!best || result.hardestRank > best.result.hardestRank) {
    best = { givens, solution, result };
  }
}

// Budget exhausted: return hardest-so-far (silent fallback per flag 1).
console.warn('[dev] Generation budget exhausted', { tier, attempts, bestRank: best.result.hardestRank });
return toPuzzle(best.givens, best.solution, tierForRank(best.result.hardestRank), best.result.trace, opts.rng);
```

`toPuzzle` computes `id` using FNV-1a 32-bit hash of `givens || solution || seed`, encoded as hex.

### 9.2 Death March tuning

After `buildMinimalPuzzle`, if `hardestRank` is clearly below the target tier's floor, skip running at technique limit — short-circuit to reject. Reduces wasted solver time on hopeless candidates.

### 9.3 Cancellation

`abortSignal.throwIfAborted()` checked between attempts. Each attempt runs to completion (fast enough at <50 ms typically).

### 9.4 Fallback reporting

Worker posts `GEN_RESULT` with `fallback: true` and rank delta. Provider logs via `console.warn` only; no UI signal.

---

## 10. Worker Protocol

### 10.1 Messages

Main → Worker:
```js
{ type: 'GEN_REQUEST', id, tier, seed, background: bool, budget? }
{ type: 'GEN_ABORT', id }
```

Worker → Main:
```js
{ type: 'GEN_PROGRESS', id, attempts, budget }
{ type: 'GEN_RESULT', id, puzzle, fallback: bool }
{ type: 'GEN_ERROR', id, message }
```

### 10.2 Worker lifecycle

- Single Worker instance, instantiated at app boot inside `clientGenProvider.js`.
- One foreground request at a time; if a background request is active when foreground arrives, current attempt finishes, Worker aborts, starts foreground. Background resumes after.
- On `GEN_ABORT`, internal abort flag checked between attempts.

### 10.3 Progress throttling

`GEN_PROGRESS` posted at most every 100 ms. Used only for cold-start progress indicator.

---

## 11. Hint Resolution

### 11.1 Flow (fspec §8)

When `HINT` action fires:
1. Guard: enabled state per fspec §8.1 checked in reducer.
2. Call `SolverHintProvider.nextHint(state.puzzle, { pen: state.pen }, { targetCell: state.selected })`.
3. Provider builds working board: start with `puzzle.givens`, overlay `state.pen` values that are non-zero and not conflict-flagged.
4. Run `solveLogically(board)`.
5. Derive `technique`: scan the solver trace for the first `Step` where `cellIndex === targetCell` and `digit !== null` (a placement step). Return that step's `technique` name. If no such step exists (the target appears only in elimination steps, or the solver did not reach it), return `'solution-lookup'`. Return `{ cellIndex: targetCell, digit: puzzle.solution[targetCell], technique }`.
6. Reducer applies digit via PEN_ENTER path with `fromHint=true`, decrements hints, re-evaluates conflicts and correctness.

### 11.2 Coach mode hook

The `targetCell`-absent form of `nextHint` returns the first placement step from the solver trace — the forward-looking interface for future `CoachProvider` or `ExplanationProvider` implementations. No changes to game logic or UI are required to introduce these future providers.

---

## 12. Theme System

### 12.1 Structure

Every theme is two CSS blocks in `css/themes.css`:
1. `body.theme-<name> { --var: value; ... }` — all custom properties.
2. Optional structural override blocks for elements that differ from Minimalist (Coffee dark header, Terminal square buttons + scanlines, School ruled paper, Mountain gradient).

`:root` sets Minimalist values as fallback defaults.

### 12.2 Switching

```js
function applyTheme(newClass) {
  for (const c of THEME_CLASSES) document.body.classList.remove(c);
  document.body.classList.add(newClass);
  cookies.set('sudoku.theme', newClass.replace('theme-', ''));
  srLive.announce(`Theme changed to ${displayNameOf(newClass)}.`);
}
```

### 12.3 First paint (no flash)

Tiny inline `<script>` in `<head>`, before CSS links:
```html
<script>
  (function() {
    var m = document.cookie.match(/(?:^|; )sudoku\.theme=([^;]+)/);
    var v = m ? decodeURIComponent(m[1]) : 'minimalist';
    document.documentElement.setAttribute('data-theme', v);
    document.addEventListener('DOMContentLoaded', function() {
      document.body.className = 'theme-' + v;
    });
  })();
</script>
```

### 12.4 Adding a theme (extensibility constraint)

Three additions, zero edits to existing code:
1. Add `body.theme-new { ... }` block in `css/themes.css`.
2. Add `<option value="new">New</option>` to the theme `<select>` in `index.html`.
3. Add `'theme-new'` to `THEME_CLASSES` in `js/config.js`.

This constraint is documented in `README.md` under "Adding a theme" and enforced by code review.

---

## 13. UI Layer and Event Flow

### 13.0 `index.html` mount point skeleton

The Implementor creates the following container IDs in `index.html`. UI modules mount to these exact IDs; tests reference them.

| ID | Mounted by |
|---|---|
| `#app-root` | Outermost wrapper |
| `#grid-root` | `ui/grid.js` |
| `#numpad-root` | `ui/numpad.js` |
| `#controls-root` | `ui/controls.js` (New Puzzle, Reset, Difficulty, Theme) |
| `#stats-root` | `ui/stats.js` |
| `#win-banner-root` | `ui/winBanner.js` — absolute-positioned over grid; empty until won |
| `#dialog-root` | `ui/dialog.js` — modal container; empty until opened |
| `#sr-live` | `ui/srLive.js` — `aria-live` region |

No UI module queries the DOM outside its own root.

### 13.1 Module boundaries

Each `js/ui/*` module owns exactly one DOM subtree. Mount returns nothing; render is driven by subscriptions to the state emitter.

### 13.2 Grid

- `ui/grid.js` creates 81 `<div role="gridcell">` elements inside `<div role="grid" aria-label="Sudoku puzzle" tabindex="0">`.
- Click dispatches `SELECT_CELL`. Arrow keydown dispatches `ARROW_NAV`.
- All visual state (conflict, incorrect, pencil marks, pen digit) derived from `state` on re-render.

### 13.3 Number pad

- Digit buttons dispatch `PEN_ENTER`/`PENCIL_TOGGLE` based on active mode.
- Check button has `display: none` via `.hidden-tier` class for Kiddie/Hard/Death March.
- Mode toggle has `aria-pressed` reflecting current mode.

### 13.4 Controls

- Owns New Puzzle, Reset, Difficulty selector, theme selector.
- New Puzzle and Reset open confirmation dialogs via `ui/dialog.js` when preconditions apply.

### 13.5 Dialog

- Exposes `open({ title, body, confirmLabel, onConfirm })`.
- Traps focus. Escape dismisses. Enter on confirm button confirms.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.

### 13.6 Win banner

- Absolute overlay on the grid wrapper.
- On `won` state, grid wrapper gets class `.won`: CSS fades in the banner over 400 ms with a subtle pulsing scale on given cells.

### 13.7 Statistics

- `ui/stats.js` mounts at `#stats-root`, renders a 5-row table from `stats.get()` on first mount, and subscribes to `statistics.on('stats-changed', ...)` for subsequent renders.
- Also subscribes to state-level `'changed'` events; when `payload.changed` includes `puzzle` (difficulty change or new puzzle), it recomputes the `.active-diff` row marker. This marker is driven by `state.puzzle.difficulty`, not by statistics.
- Row order follows `DIFFICULTY_ORDER` from `config.js`.

### 13.8 SR live region

Single hidden `#sr-live` with `aria-live="assertive" aria-atomic="true" role="status"`. Double-frame clear-then-set pattern for repeated messages.

---

## 14. Accessibility Implementation

- Grid root: `role="grid"`, cells: `role="gridcell"`. Selected cell: `tabindex="0"`, others `tabindex="-1"`.
- Given cells: `aria-readonly="true"`.
- Cell `aria-label` constructed from `[row, col, contents, state]`, updated on render.
- Dialogs: focus trap, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Win banner: `aria-hidden="true"` when not shown; on show, focus moves to New Puzzle button (fspec §14.4).
- Every announcement in fspec §14.3 implemented by a corresponding `srLive.announce()` call in the matching action handler.

---

## 15. External Dependencies

**Runtime: none.** No libraries, CDNs, or external fonts. System font stacks only.

**Dev only (not deployed):**
- `mocha`, `chai` — test runner + assertions
- `playwright` — headless browser driver
- `c8` — V8 native coverage

---

## 16. Test Infrastructure

### 16.1 Choice and rationale

Mocha + Chai run as plain `<script>` tags in a test HTML page. ESM imports match production. Playwright launches real Chromium, opens the page via a local static server, harvests results and V8 coverage. c8 computes branch coverage. Web Workers are real Workers — no stubs. No build step required.

### 16.2 Coverage

c8 with `--include=js/**` and `--exclude=js/tests/**`. Target: **100% branch coverage** (per CLAUDE.md). Runs fail below 100%.

### 16.3 Test categories

- **Unit:** every function in solver, generator, rater, reducer, conflicts, correctness, statistics, persistence, PRNG, and bitset utilities.
- **Technique unit:** per §8.3 (three positive cases, one non-fire guard, one null case).
- **Integration:**
  - `worker.test.js` — real Worker round-trip.
  - `game-flows.test.js` — full select/enter/conflict/erase/resume lifecycles.
  - `persistence.test.js` — localStorage and cookie round-trips.
  - `a11y.test.js` — ARIA attributes and live-region announcements.

### 16.4 Determinism

All tests that invoke the generator pass an explicit seed; behavior is fully reproducible.

---

## 17. Implementation Sequence

**Phase 1 — Foundations**
1. `prng.js`, `util/grid.js`, `util/bitset.js`
2. `solver/uniqueness.js` + tests
3. `solver/candidates.js` + tests

**Phase 2 — Technique ladder** (one technique at a time, with tests at each step)
4. Naked Single
5. Hidden Single
6. Locked Candidates
7. Naked Pair, Hidden Pair, Naked Triple, Hidden Triple
8. X-Wing, Swordfish, Jellyfish
9. XY-Wing
10. Simple Coloring, Multi-Coloring
11. XY-Chain, Forcing Chain
12. `solver/logical.js` loop + rank-to-tier mapping + tests

**Phase 3 — Generator**
13. `generator/fillGrid.js` + tests
14. `generator/removeCells.js` + tests
15. `generator/rater.js` + tests
16. `generator/pipeline.js` + tests (attempt budget, fallback, abort)

**Phase 4 — Worker**
17. `worker/protocol.js`
18. `worker/generator.worker.js` + integration test
19. `providers/puzzleProvider.js` + `clientGenProvider.js` + tests

**Phase 5 — Game core**
20. `game/state.js` reducer + tests
21. `game/conflicts.js`, `correctness.js` + tests
22. `persist/cookies.js`, `storage.js` + tests
23. `providers/cookieStatsStore.js` + tests
24. `providers/statsProvider.js` + tests
25. `game/statistics.js` (emitter + wiring) + tests
26. `providers/hintProvider.js` + tests
27. Re-visit `game/state.js` to integrate stats wiring per §5.2.1 + tests

**Phase 6 — UI**
28. `index.html` skeleton + all CSS files
29. `ui/themes.js`, `srLive.js`, `dialog.js`, `keyboard.js`
30. `ui/grid.js`, `numpad.js`, `controls.js`, `stats.js`, `winBanner.js`
31. `main.js` bootstrap (follow §4.1.1 order exactly)

**Phase 7 — Polish and validation**
32. Integration tests (game-flows, persistence, a11y)
33. Performance validation: <1 s for all non-generation actions; Death March cold-start <5 s on mid-range device baseline
34. README and deployment documentation

**Milestone exits:**
- Phase 2: solver correctly rates 100% of a curated 50-puzzle regression set at known difficulty.
- Phase 3: `generateForTier` produces a correctly-rated puzzle for all five tiers within budget.
- Phase 4: Worker round-trip integration test passes.
- Phase 6: game-v3.html mockup behavior reproduced in the app (visual parity).

---

## 18. Deployment Procedure

### 18.1 What gets deployed

```
index.html
css/
js/           (excluding js/tests/)
```

Not deployed: `node_modules/`, `package.json`, `test-runner/`, `js/tests/`, `docs/`, `coverage/`, `.git/`.

A `deploy.txt` manifest at the repo root enumerates what to upload.

### 18.2 Local preview

```bash
# Direct file open (fastest)
xdg-open index.html

# Local HTTP (closer to production)
python3 -m http.server 8080
```

Both modes must behave identically; validated during acceptance.

### 18.3 Upload to hosting.com

SFTP to hosting.com document root (`public_html/` or `httpdocs/`). Upload files listed in `deploy.txt`, preserving directory structure. Verify in a private browsing window after upload.

A helper script `scripts/deploy.sh` using `lftp` or `rsync` over SFTP can be added post-v1.

---

## 19. Feasibility Notes and Open Items

### 19.1 Resolved generation flags

All eight flags in `puzzle-generation-followup.md` §5 are incorporated.

### 19.2 Persistence storage split — resolved

**Resolution (confirmed by user).** The user defers fully to the Architect on cookie vs. localStorage decisions; localStorage for puzzle state is approved, and the Architect has authority to move any or all persistence to localStorage if appropriate.

**Current plan (§6.1, §6.2):** cookies for theme and stats (small, naturally session-spanning); localStorage for puzzle state, pre-gen cache, and current difficulty (larger, client-only). This split is final. No further user confirmation required on storage decisions.

### 19.3 Completion animation

Fspec leaves animation to the Visual Designer; vspec defines the banner but not the animation motion. Implementor will ship the default in §13.6 (400 ms fade + pulse). User may adjust at UX review.

### 19.4 Low-end-device Death March tail

On throttled budget Android phones, Death March cold-start could occasionally exceed 5 s. Mitigated by attempt budget, background pre-generation, and localStorage persistence. Documented for awareness; no action required.

### 19.5 No other feasibility concerns

All other fspec and vspec requirements map cleanly onto this plan.
