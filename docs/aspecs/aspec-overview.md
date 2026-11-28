# Architectural Spec — Overview and Cross-Cutting Concerns
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** All agents — load this spec first. Contains the master directory tree, implementation sequence, and cross-cutting architecture. Every agent needs §3 (directory tree) and §5 (event flow summary).

---

## Table of Contents

1. [Scope and Inputs](#1-scope-and-inputs)
2. [Technology Stack and Rationale](#2-technology-stack-and-rationale)
3. [File and Directory Structure](#3-file-and-directory-structure)
4. [Immutability Policy](#4-immutability-policy)
5. [Event Flow Summary](#5-event-flow-summary)
6. [External Dependencies](#6-external-dependencies)
7. [Test Infrastructure](#7-test-infrastructure)
8. [Implementation Sequence](#8-implementation-sequence)
9. [Deployment Procedure](#9-deployment-procedure)
10. [Feasibility Notes](#10-feasibility-notes)
11. [Feature Spec Index](#11-feature-spec-index)

---

## 1. Scope and Inputs

This aspec covers the full Sudoku v1 implementation. Authoritative inputs:

- `docs/fspecs/fspec-001-v1.md` — functional behavior
- `docs/vspecs/vspec-001-v1.md` — visual design, including theme color tables and structural overrides
- `docs/aspecs/puzzle-generation-spike.md` — generation approach evaluation
- `docs/aspecs/puzzle-generation-followup.md` — resolved decisions for Approach 1 (client-side generation)

All generation-architecture decisions from the follow-up §5 are fixed and not re-evaluated here: client-side Web Worker generation, up to 5 s Death March cold-start, attempt-budget fallback returns hardest candidate silently, background pre-generation persisted to `localStorage`, seedable PRNG, clean-room MIT implementation from SudokuWiki prose, `SolverHintProvider` in v1.

> **V3 terminology note (2026-06-12):** "Death March" in the historical sections of this
> file refers to the tier renamed **Expert** in V3, which also added **Diabolical** and
> **Nightmare** above it (`aspec-harder-tiers.md`). The 5 s cold-start figure and the
> silent attempt-budget fallback apply to Expert and below; the V3 tiers have their own
> envelope (≤120 s approved; ~5–10 s expected), a progress/cancel card, and an honest
> fallback dialog instead of silent mislabeling.

---

## 2. Technology Stack and Rationale

### 2.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Markup | Vanilla HTML5 | Single `index.html`. No framework, no build step. |
| Styling | Vanilla CSS with CSS Custom Properties | All themes are CSS custom property blocks scoped to a `body.theme-*` class, per vspec §1.1. Additive extensibility without touching existing theme code. |
| Main-thread JS | Vanilla ES2020+ modules (`<script type="module">`) | Native ESM loads correctly from `file://` for local dev in modern browsers and from static HTTP on hosting.com. No bundler required. |
| Worker JS | Vanilla ESM worker (`new Worker(url, { type: 'module' })`) | Permits importing solver/generator modules inside the worker from the same `js/` tree; single source of truth for solver code shared between main thread (hints) and worker (generation). |
| Persistence | `document.cookie` for theme + stats (per fspec §11.3, §12.3); `localStorage` for in-progress puzzle state and pre-generated next-puzzle cache | Cookies are mandated for theme and stats. Puzzle state uses localStorage — see §10.2. |
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
│   ├── menu.css                      # V4: header menu button + hamburger menu (aspec-hamburger-menu.md)
│   ├── stats.css                     # Statistics table; V4: Statistics dialog (was the on-page panel)
│   ├── themes.css                    # All theme body classes + structural overrides
│   └── dev.css                       # V4: developer-mode styles; injected by devPanel.js only
├── js/
│   ├── main.js                       # App bootstrap; wires modules; mounts UI
│   ├── config.js                     # Difficulty config, hint counts, budgets, constants; V4: UNRATED, SHARE_PARAM
│   ├── prng.js                       # mulberry32 seedable PRNG
│   ├── util/
│   │   ├── grid.js                   # Index↔(row,col,box), unit iteration, peers
│   │   ├── bitset.js                 # 9-bit candidate sets (bitmask helpers)
│   │   ├── events.js                 # Tiny typed event emitter
│   │   ├── puzzleString.js           # V4: 81-cell puzzle-string codec (aspec-puzzle-sharing.md)
│   │   └── clipboard.js              # V4: clipboard write with boolean outcome
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
│   │       ├── xyzWing.js            # V3 (aspec-harder-tiers.md)
│   │       ├── wxyzWing.js           # V3
│   │       ├── finnedFish.js         # V3: finned X-Wing + finned Swordfish
│   │       ├── coloring.js           # Simple coloring + multi-coloring
│   │       ├── forcingChains.js      # XY-chains + AIC-style forcing chains
│   │       ├── uniqueRectangle.js    # V3: UR Types 1/2/4
│   │       └── alsXz.js              # V3: ALS-XZ
│   ├── generator/
│   │   ├── fillGrid.js               # Random filled solution via backtracking
│   │   ├── removeCells.js            # Symmetric-or-random removal with uniqueness guard
│   │   ├── rater.js                  # Runs logical solver, returns tier + trace
│   │   ├── pipeline.js               # generateForTier() orchestrator; V4: source/gen diagnostics
│   │   └── loadPuzzle.js             # V4: givens → validated, rated Puzzle (aspec-puzzle-sharing.md)
│   ├── worker/
│   │   ├── generator.worker.js       # Worker entry: receives requests, calls pipeline
│   │   └── protocol.js               # Message-type constants + envelope helpers (shared)
│   ├── providers/
│   │   ├── puzzleProvider.js         # Public facade: requestPuzzle, peekReady, primeNext
│   │   ├── clientGenProvider.js      # Wraps the Worker; manages the pre-gen cache
│   │   ├── loadProvider.js           # V4: dedicated worker for validating/rating loaded puzzles
│   │   ├── hintProvider.js           # SolverHintProvider
│   │   ├── statsProvider.js          # Stats facade; wraps a StatsStore adapter
│   │   └── cookieStatsStore.js       # v1 StatsStore: cookie-backed
│   ├── game/
│   │   ├── state.js                  # In-memory game state reducer
│   │   ├── puzzleLoader.js           # V4: the one loader — parse, rate, confirm, PUZZLE_LOADED
│   │   ├── foreground.js             # V4: foreground generation — busy lifecycle, cancel, honest/Unrated fallback,
│   │   │                             #   tier preference, seeded runs; extracted from main.js (aspec-debug-instrumentation.md §9.4)
│   │   ├── conflicts.js              # Conflict detection on row/col/box
│   │   ├── correctness.js            # Per-tier checking (realtime/on-demand/on-complete[-silent])
│   │   └── statistics.js             # Stats counters, persistence hook
│   ├── persist/
│   │   ├── cookies.js                # Read/write cookies (theme, stats)
│   │   ├── storage.js                # localStorage (puzzle state, pre-gen cache, seen)
│   │   └── migrate.js                # V3: death-march → expert tier-ID migration
│   ├── ui/
│   │   ├── grid.js                   # Renders grid cells; dispatches cell events
│   │   ├── numpad.js                 # Renders pad + buttons; routes input
│   │   ├── controls.js               # Difficulty selector; V4: next-game cluster incl. New Puzzle
│   │   ├── stats.js                  # Stats table; V4: Statistics dialog (aspec-hamburger-menu.md §5)
│   │   ├── winBanner.js              # Win overlay + animation trigger
│   │   ├── dialog.js                 # Reusable confirmation dialog
│   │   ├── srLive.js                 # Screen reader live region helper
│   │   ├── themes.js                 # Theme class swap + cookie persistence; V4: THEME_OPTIONS for the menu
│   │   ├── handedness.js             # V4: left-hand layout preference (aspec-left-hand.md); toggled from the menu
│   │   ├── keyboard.js               # Desktop keyboard shortcuts
│   │   ├── coach.js                  # Coach button, panel, recap, toast, lifecycle (aspec-coach-ui.md)
│   │   ├── coachOverlay.js           # SVG arrow overlay renderer (aspec-coach-ui.md)
│   │   ├── busy.js                   # V3: generation progress card + Cancel (aspec-harder-tiers.md §5.3)
│   │   ├── notice.js                 # V4: notice card under the board (aspec-puzzle-sharing.md §7)
│   │   ├── share.js                  # V4: share action + share-link builder (invoked from the menu)
│   │   ├── menu.js                   # V4: hamburger menu — button, roving focus, items (aspec-hamburger-menu.md §4)
│   │   └── requestFocus.js           # V4: focus policy when a New Puzzle / Difficulty request ends (§6)
│   ├── coach/
│   │   └── analyzer.js               # Pure-function coach analyzer (aspec-coach-analyzer.md)
│   ├── dev/                          # V4 developer mode (aspec-dev-mode.md)
│   │   ├── devMode.js                # Flag: ?dev=1/0 + localStorage. Always loaded
│   │   ├── inspect.js                # Pure helpers: inspector, candidate diff, diagnostics. Lazy
│   │   ├── devPanel.js               # Panel UI, badge, grid decorator. Lazy (import() when flag on)
│   │   ├── devBoot.js                # V4 debug instrumentation (aspec-debug-instrumentation.md); all lazy:
│   │   │                             #   early dev bootstrap, awaited at step 1.5 when the flag is on
│   │   ├── sessionCodec.js           #   position/action/document codec, fingerprint, validation
│   │   ├── machine.js                #   headless game machine; verbatim action application
│   │   ├── recorder.js               #   session history: dispatch tap, capacity, error entries, export
│   │   ├── recorderStore.js          #   IndexedDB persistence + tab ownership
│   │   ├── devLog.js                 #   logging switches and console writers
│   │   ├── replay.js                 #   replay run, divergence comparison, report
│   │   ├── devSession.js             #   controller shared by the panel and the API
│   │   ├── devApi.js                 #   window.sudokuDev
│   │   └── recorderPanel.js          #   Session recorder tool
│   └── tests/
│       ├── setup.html                # Mocha/Chai test runner page
│       ├── setup.js                  # Global beforeEach/afterEach, fixtures
│       ├── fixtures/
│       │   ├── puzzles/              # Hand-curated positions per technique
│       │   │   └── coach/            # Coach-specific fixtures (rank-is-minimum guaranteed)
│       │   ├── grids/                # Filled solutions for uniqueness tests
│       │   └── sessions/             # V4: session-document fixtures (aspec-debug-instrumentation.md §13)
│       ├── helpers/
│       │   └── replayFixture.js      # V4: replays a session document inside the suite
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
│       │   ├── hintProvider.test.js
│       │   ├── ui-handedness.test.js # V4 (aspec-left-hand.md §9)
│       │   ├── (V4 loading/sharing)  # config, puzzleString, clipboard, loadPuzzle, loadProvider,
│       │   │                         #   puzzleLoader, state-unrated, ui-notice, ui-share
│       │   ├── (V4 developer mode)   # devMode, inspect, devPanel, pipeline-diagnostics
│       │   ├── (V4 debug instrumentation) # sessionCodec, machine, recorder, recorderStore, devLog, replay,
│       │   │                         #   devSession, devApi, recorderPanel, state-devtools, session-fixtures, foreground
│       │   ├── (V4 hamburger menu)   # ui-menu, ui-requestFocus; reworked ui-stats, ui-share (aspec-hamburger-menu.md §13–14)
│       │   └── coach/
│       │       ├── analyzer.test.js  # Coach analyzer unit tests (aspec-coach-analyzer.md §13)
│       │       └── session.test.js   # CoachSession reducer unit tests (aspec-coach-ui.md §16.1)
│       └── integration/
│           ├── worker.test.js        # Spawns the real Worker, round-trips messages
│           ├── game-flows.test.js    # Tap→enter→conflict→erase lifecycles
│           ├── persistence.test.js   # Resume behavior round trip
│           ├── a11y.test.js          # ARIA/live-region assertions
│           ├── coach.test.js         # Full coach flow integration tests (aspec-coach-ui.md §16.2)
│           ├── _app.js               # V4: shared iframe helpers (sized frames, precise waits, seeding)
│           ├── sharing.test.js       # V4: share links, Unrated, Share action (tspec-puzzle-sharing.md)
│           ├── devmode.test.js       # V4: developer mode end to end (tspec-dev-mode.md)
│           └── debug.test.js         # V4: recorder, replay, seeded generation, API end to end
├── test-runner/
│   ├── run.js                        # Playwright script: boot browser, open tests/setup.html, harvest results + coverage
│   └── serve.js                      # Tiny static file server (Node built-in http) for tests only
├── docs/                             # (existing spec tree)
├── README.md                         # Produced by Implementor
├── LICENSE                           # MIT
└── package.json                      # devDependencies only: playwright, c8, mocha, chai
```

Notes:
- `index.html` pulls in CSS files in order `themes.css → base.css → grid.css → controls.css → menu.css → stats.css`, then loads `js/main.js` as `type="module"`.
- `js/worker/generator.worker.js` is instantiated with `new Worker('./js/worker/generator.worker.js', { type: 'module' })` from `clientGenProvider.js`. Browsers resolve the relative URL against `index.html` the same way in `file://` and HTTPS.
- `package.json` exists **only** for development tooling (test runner). Production deployment uploads `index.html`, `css/`, `js/`. `node_modules/` and `package.json` are not deployed.
- No bundling, no transpilation. The `js/` tree is what the browser loads verbatim.

---

## 4. Immutability Policy

The reducer mutates internal arrays in place for performance. UI modules treat the state object as read-only and subscribe via an emitter.

---

## 5. Event Flow Summary

```
User gesture / key
    → ui/* module dispatches action
    → state.js reducer mutates state
    → state.js emits 'changed' with { action, changed: Set<string> }
      (keys of GameState that changed)
    → ui/* subscribers re-render affected subtrees
    → persistence subscriber (see aspec-persistence.md §5) debounces a localStorage write
```

The reducer exposes:
- `dispatch(action) → void`
- `getState() → GameState` (read-only by convention)
- `on('changed', (payload) => {}) → unsubscribe` (built on `util/events.js`)

**V4 debug instrumentation (`aspec-debug-instrumentation.md` §4).** The flow above is
unchanged. Two seams sit beside it, both inert when developer mode is off:

- `createGameState` accepts an optional `tap`. The public `dispatch` calls `tap.begin` /
  `tap.end` around the reducer; the reducer's own nested dispatches do not. With no tap
  the cost is one null comparison per dispatch.
- `util/events.js` exports a shared `diagnostics` emitter. Always-loaded modules emit
  `swallowed` (from silent `catch` blocks), `generation`, and `listener-error` on it. It
  has no listeners unless developer mode is on.

---

## 6. External Dependencies

**Runtime: none.** No libraries, CDNs, or external fonts. System font stacks only.

**Dev only (not deployed):**
- `mocha`, `chai` — test runner + assertions
- `playwright` — headless browser driver
- `c8` — V8 native coverage

---

## 7. Test Infrastructure

### 7.1 Choice and rationale

Mocha + Chai run as plain `<script>` tags in a test HTML page. ESM imports match production. Playwright launches real Chromium, opens the page via a local static server, harvests results and V8 coverage. c8 computes branch coverage. Web Workers are real Workers — no stubs. No build step required.

### 7.2 Coverage

c8 with `--include=js/**` and `--exclude=js/tests/**`. Target: **100% branch coverage** (per CLAUDE.md). Runs fail below 100%.

---

## 8. Implementation Sequence

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
27. Re-visit `game/state.js` to integrate stats wiring per aspec-persistence.md §3 + tests

**Phase 6 — UI**
28. `index.html` skeleton + all CSS files
29. `ui/themes.js`, `srLive.js`, `dialog.js`, `keyboard.js`
30. `ui/grid.js`, `numpad.js`, `controls.js`, `stats.js`, `winBanner.js`
31. `main.js` bootstrap (follow aspec-game-state.md §1.2 order exactly)

**Phase 7 — Polish and validation**
32. Integration tests (game-flows, persistence, a11y)
33. Performance validation: <1 s for all non-generation actions; Death March cold-start <5 s on mid-range device baseline
34. README and deployment documentation

**Phase 8 — Coach Mode** (see `aspec-coach-analyzer.md`, `aspec-coach-ui.md`)
35. `coach/analyzer.js` + unit tests
36. `ui/coach.js`, `ui/coachOverlay.js` + integration tests

**Phase 9 — One-level Undo** (see `aspec-undo.md`)
37. `game/state.js` — `undoSnapshot` field, `UNDO` action, snapshot lifecycle
38. `ui/numpad.js` — Undo button; `ui/keyboard.js` — Ctrl/Cmd+Z

**Phase 10 — Erase All Pencil** (see `aspec-erase-pencil.md`)
39. `game/state.js` — `ERASE_ALL_PENCIL` action, `_hasNoPencil()` helper
40. `ui/numpad.js` — "Erase all pencil" button; `css/controls.css` — 2-column undo row

**Phase 11 — Harder Difficulty Tiers (V3)** (see `aspec-harder-tiers.md`)
41. Technique modules ranks 12–15, 20, 21 + 21-rank ladder + `tierForRank`
42. Tier IDs (`expert`/`diabolical`/`nightmare`), config, `persist/migrate.js`
43. Provider `{puzzle, fallback}` + progress; `ui/busy.js`; main.js cancel/fallback flows
44. Coach mappers + sealed-schema `fin` amendment; soundness sweep in permanent suite

**Phase 12 — Left-Hand Layout (V4)** (see `aspec-left-hand.md`)
45. `ui/handedness.js`
46. `index.html` head script + header switch; `base.css` swap rule; `controls.css` switch styles
47. `main.js` wiring (steps 2 and 8)
48. Unit, arch, and system tests

**Phase 13 — Puzzle Loading, Sharing, and Developer Mode (V4)** (see `aspec-puzzle-sharing.md`, `aspec-dev-mode.md`)
49. Unrated tier; puzzle-string codec; `loadFromGivens`; load protocol + dedicated worker; `puzzleLoader`
50. Stats gating + Unrated guards in `state.js`; `dialog.js` `onCancel`
51. `notice.js`, `share.js`, markup, CSS; Unrated presentation in controls/numpad/coach; keyboard text-field guard
52. `devMode.js`; pipeline diagnostics; grid decorator seam; `inspect.js`; `devPanel.js` + `dev.css`
53. `main.js` wiring: generation tier, loader, link handling, lazy dev import

**Phase 14 — Debug Instrumentation (V4)** (see `aspec-debug-instrumentation.md` §15)
54. Seams: `diagnostics` emitter, reducer tap / timers / `HINT.hint` / `DEV_*` actions, swallowed-exception emits
54b. `game/foreground.js`: foreground generation extracted from `main.js`, behaviour-preserving; `foreground.test.js`
55. Seed plumbing: pipeline `gen.seed`, protocol, worker, provider `seed`; foreground seeded runs; Unrated fallback; no-rating puzzle check
56. `sessionCodec.js`, `machine.js`
57. `recorderStore.js`, `recorder.js`, `devLog.js`, `devBoot.js`; `main.js` boot wiring
58. `replay.js`; fixture helper and first fixtures
59. `devSession.js`; `devApi.js`
60. `recorderPanel.js`; Generation diagnostics additions; `dev.css`
61. Integration, a11y, and performance tests

**Phase 15 — Hamburger Menu and Control Consolidation (V4)** (see `aspec-hamburger-menu.md` §15)
62. `foreground.startNew` `onOutcome`; `ui/requestFocus.js`
63. `themes.js` `THEME_OPTIONS`/`currentTheme`; `handedness.js` `toggleHandedness`; `dialog.js` `beforeOpen`
64. `ui/stats.js` → Statistics dialog; `ui/share.js` → `share()`; `ui/menu.js` + `css/menu.css`
65. `controls.js` next-game cluster; `numpad.js` two-column tool block; `index.html`, `base.css` grid layout, focus-ring CSS (R14, R15)
66. `main.js` wiring; `keyboard.js` grid-container arrow focus
67. Test updates (removed action row, stats panel, theme select, hand switch, toolbar role), dev scripts, README

**Milestone exits:**
- Phase 2: solver correctly rates 100% of a curated 50-puzzle regression set at known difficulty.
- Phase 3: `generateForTier` produces a correctly-rated puzzle for all five tiers within budget.
- Phase 4: Worker round-trip integration test passes.
- Phase 6: game-v3.html mockup behavior reproduced in the app (visual parity).

---

## 9. Deployment Procedure

### 9.1 What gets deployed

```
index.html
css/
js/           (excluding js/tests/)
```

Not deployed: `node_modules/`, `package.json`, `test-runner/`, `js/tests/`, `docs/`, `coverage/`, `.git/`.

A `deploy.txt` manifest at the repo root enumerates what to upload.

### 9.2 Local preview

```bash
# Direct file open (fastest)
xdg-open index.html

# Local HTTP (closer to production)
python3 -m http.server 8080
```

Both modes must behave identically; validated during acceptance.

### 9.3 Upload to hosting.com

SFTP to hosting.com document root (`public_html/` or `httpdocs/`). Upload files listed in `deploy.txt`, preserving directory structure. Verify in a private browsing window after upload.

A helper script `scripts/deploy.sh` using `lftp` or `rsync` over SFTP can be added post-v1.

---

## 10. Feasibility Notes

### 10.1 Resolved generation flags

All eight flags in `puzzle-generation-followup.md` §5 are incorporated.

### 10.2 Persistence storage split — resolved

**Resolution (confirmed by user).** The user defers fully to the Architect on cookie vs. localStorage decisions; localStorage for puzzle state is approved, and the Architect has authority to move any or all persistence to localStorage if appropriate.

**Current plan:** cookies for theme and stats (small, naturally session-spanning); localStorage for puzzle state, pre-gen cache, and current difficulty (larger, client-only). This split is final. No further user confirmation required on storage decisions.

### 10.3 Completion animation

Fspec leaves animation to the Visual Designer; vspec defines the banner but not the animation motion. Implementor will ship the default in aspec-ui.md §6 (400 ms fade + pulse). User may adjust at UX review.

### 10.4 Low-end-device Death March tail

On throttled budget Android phones, Death March cold-start could occasionally exceed 5 s. Mitigated by attempt budget, background pre-generation, and localStorage persistence. Documented for awareness; no action required.

### 10.5 No other feasibility concerns

All other fspec and vspec requirements map cleanly onto this plan.

---

## 11. Feature Spec Index

| File | Contents | Loaded by |
|---|---|---|
| `aspec-overview.md` | This file — stack, directory tree, event flow, test infra, deployment, sequence | All agents |
| `aspec-solver.md` | Grid utilities, events emitter, bitset, uniqueness solver, candidates, logical solver, key algorithms §7.1–7.2 | Implementor (Phase 1–2), QE |
| `aspec-techniques.md` | Technique ladder, all 21 techniques (V3), test policy, rank-to-tier | Implementor (Phase 2), QE |
| `aspec-generation.md` | Generator, rater, pipeline, Worker, puzzle providers, key algorithms §7.3–7.5, generation pipeline §9, worker protocol §10 | Implementor (Phase 3–4), QE |
| `aspec-game-state.md` | main.js bootstrap, config, PRNG, game state shape, all actions, conflicts, correctness | Implementor (Phase 5–6), Reviewer, QE |
| `aspec-hints.md` | Hint provider, hint flow, hint button state rules | Implementor (Phase 5), Reviewer, QE |
| `aspec-persistence.md` | Statistics, cookies, storage, statsProvider, cookieStatsStore, persistence schemas, stats wiring | Implementor (Phase 5), Reviewer, QE |
| `aspec-ui.md` | All UI modules, event flow, accessibility, SR announcements, focus management | Implementor (Phase 6), Reviewer, QE |
| `aspec-themes.md` | Theme system, CSS structure, applyTheme, no-flash script, extensibility | Implementor (Phase 6), Reviewer, QE |
| `aspec-coach-analyzer.md` | Coach Mode analyzer — pure function returning CoachStep; sealed schema consumed by aspec-coach-ui.md | Implementor (Phase 8a), Reviewer, QE |
| `aspec-coach-ui.md` | Coach Mode UI — CoachSession state, all COACH_* actions, pencil revert, coach.js, coachOverlay.js, CSS, a11y, tests | Implementor (Phase 8b), Reviewer, QE |
| `aspec-undo.md` | One-level undo — `undoSnapshot` field, `UNDO` action, numpad button, Ctrl/Cmd+Z | Implementor (Phase 9), Reviewer, QE |
| `aspec-harder-tiers.md` | V3 harder tiers — 21-rank ladder, tier IDs/migration, generation progress/cancel/fallback, coach mappers + `fin` role | Implementor (Phase 11), Reviewer, QE |
| `aspec-erase-pencil.md` | Erase-all-pencil — `ERASE_ALL_PENCIL` action, numpad button, 2-column undo row | Implementor (Phase 10), Reviewer, QE |
| `aspec-left-hand.md` | V4 left-hand layout — `<html data-hand>`, `ui/handedness.js`, head-script extension, CSS column swap, header switch | Implementor (Phase 12), Reviewer, QE |
| `aspec-puzzle-sharing.md` | V4 puzzle loading and sharing — the Unrated tier, the single loader (codec → worker → `puzzleLoader`), load protocol, statistics gating, Share UI, notice, link handling | Implementor (Phase 13), Reviewer, QE |
| `aspec-dev-mode.md` | V4 developer mode — flag, lazy loading, grid decorator seam, `inspect.js`, `devPanel.js`, generation diagnostics data | Implementor (Phase 13), Reviewer, QE |
| `aspec-hamburger-menu.md` | V4 hamburger menu and control consolidation — `ui/menu.js` (roving focus, type-ahead, shortcut suppression), Statistics dialog, next-game cluster, number pad regrouping, request-end focus policy (`ui/requestFocus.js`), grid/Coffee focus rings, test impact | Implementor (Phase 15), Reviewer, QE |
| `aspec-debug-instrumentation.md` | V4 debug instrumentation — dispatch tap, session recorder and IndexedDB store, session document format, headless replay and divergence report, `window.sudokuDev`, seeded generation, logging and error capture, regression-fixture helper | Implementor (Phase 14), Reviewer, QE |
