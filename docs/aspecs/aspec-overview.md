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
- `index.html` pulls in CSS files in order `themes.css → base.css → grid.css → controls.css → stats.css`, then loads `js/main.js` as `type="module"`.
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
| `aspec-techniques.md` | Technique ladder, all 15 techniques, test policy, rank-to-tier | Implementor (Phase 2), QE |
| `aspec-generation.md` | Generator, rater, pipeline, Worker, puzzle providers, key algorithms §7.3–7.5, generation pipeline §9, worker protocol §10 | Implementor (Phase 3–4), QE |
| `aspec-game-state.md` | main.js bootstrap, config, PRNG, game state shape, all actions, conflicts, correctness | Implementor (Phase 5–6), Reviewer, QE |
| `aspec-hints.md` | Hint provider, hint flow, hint button state rules | Implementor (Phase 5), Reviewer, QE |
| `aspec-persistence.md` | Statistics, cookies, storage, statsProvider, cookieStatsStore, persistence schemas, stats wiring | Implementor (Phase 5), Reviewer, QE |
| `aspec-ui.md` | All UI modules, event flow, accessibility, SR announcements, focus management | Implementor (Phase 6), Reviewer, QE |
| `aspec-themes.md` | Theme system, CSS structure, applyTheme, no-flash script, extensibility | Implementor (Phase 6), Reviewer, QE |
