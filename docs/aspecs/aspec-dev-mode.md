# Architectural Spec — Developer Mode (V4)
**Status:** Final
**Date:** 2026-11-13
**Author:** Uber Developer (Architect stage)
**Inputs:** `fspec-005-dev-mode.md`, `vspec-005-dev-mode.md`, handoff brief
`docs/misc/v4-devmode-sharing-brief.md` §5
**Loaded by:** Implementor (Phase 13), Reviewer, QE.

> **Also load:** `aspec-overview.md`, `aspec-puzzle-sharing.md` (the loader, Unrated,
> statistics gating — all prerequisites), `aspec-ui.md` (grid renderer),
> `aspec-coach-analyzer.md` (CoachStep schema), `aspec-generation.md` (pipeline).

---

## Table of Contents

1. [Approach](#1-approach)
2. [Files Touched](#2-files-touched)
3. [`js/dev/devMode.js`](#3-jsdevdevmodejs)
4. [Lazy Loading](#4-lazy-loading)
5. [Grid Decorator Seam](#5-grid-decorator-seam)
6. [`js/dev/inspect.js`](#6-jsdevinspectjs)
7. [`js/dev/devPanel.js`](#7-jsdevdevpaneljs)
8. [Generation Diagnostics Data](#8-generation-diagnostics-data)
9. [Test Infrastructure](#9-test-infrastructure)
10. [Implementation Sequence](#10-implementation-sequence)
11. [Feasibility and Decisions](#11-feasibility-and-decisions)

---

## 1. Approach

Three layers, so that an app with dev mode off pays for one tiny module and nothing else:

| Layer | Module | Loaded |
|---|---|---|
| Flag | `js/dev/devMode.js` | Always (static import from `main.js`) |
| Pure logic | `js/dev/inspect.js` | Only via `devPanel.js` |
| UI | `js/dev/devPanel.js` + `css/dev.css` | `import()` from `main.js` only when the flag is on |

The tools read game state through the public `getState`/`on` API and never dispatch,
with one exception: load-from-string calls the shared loader (aspec-puzzle-sharing §4.4)
through a function injected by `main.js`. The two tools that draw on the grid do so
through a single decorator hook on `ui/grid.js`.

## 2. Files Touched

| File | Change |
|---|---|
| `js/dev/devMode.js` | **New.** `initDevMode`, `isDevMode` |
| `js/dev/inspect.js` | **New.** Pure helpers for the inspector, overlay, and diagnostics |
| `js/dev/devPanel.js` | **New.** Panel DOM, tool wiring, badge, stylesheet injection |
| `css/dev.css` | **New.** All dev styles (vspec-005) |
| `js/ui/grid.js` | `setCellDecorator`, `refresh` |
| `js/generator/pipeline.js` | `source: 'generated'` and `gen` on generated puzzles |
| `js/providers/clientGenProvider.js` | Persist `source`/`gen` in the pre-gen cache |
| `js/main.js` | Flag init, `statsSuppressed`, conditional `import()` |

No change to `index.html`: every dev element is created by `devPanel.js`.

## 3. `js/dev/devMode.js`

```js
const STORAGE_KEY = 'sudoku.dev.v1';
/** Resolve the flag from the query string and storage. Call once at boot. */
export function initDevMode(search)   // → boolean
export function isDevMode()           // → boolean (false before init)
```

`new URLSearchParams(search).get('dev')`: `'1'` → on + `setItem(KEY, true)`; `'0'` → off
+ `removeItem(KEY)`; otherwise `getItem(KEY) === true`. Uses `persist/storage.js`, whose
silent-failure behavior gives the "storage unavailable" rule of fspec-005 §2.

## 4. Lazy Loading

`main.js`, after the UI mounts and the loader is built:

```js
if (devMode) {
  import('./dev/devPanel.js').then(dev => dev.mount({
    gameState,
    loadPuzzle: text => loader.load(text, { source: 'string' }),
  }));
}
```

Not awaited: the game is interactive before the panel arrives. `devPanel.mount` appends
`<link rel="stylesheet" href="…/css/dev.css">` (URL resolved from `import.meta.url`) to
`<head>`, the badge to `<body>`, and the panel `<section id="dev-root" tabindex="-1">` to
`<main>`.

With the flag off there is no request for `devPanel.js`, `inspect.js`, or `dev.css`, and
no dev DOM — verified by an integration test over `performance.getEntriesByType('resource')`.

## 5. Grid Decorator Seam

`ui/grid.js`:

```js
/** Install (or clear, with null) a hook run at the end of every cell update. */
export function setCellDecorator(fn)    // fn(el, index, state); re-renders immediately
export function refresh()               // re-render from current state (requires mount)
```

`_updateCell` ends with `if (_decorator !== null) _decorator(el, i, state);`. Because
`_updateCell` rebuilds `className`, the accessible name, and the content on every render,
whatever the decorator adds is naturally discarded on the next render and re-applied by
the hook — no cleanup protocol is needed. Cost with dev mode off: one null comparison per
cell update.

## 6. `js/dev/inspect.js`

Pure functions; no DOM, no game-state access.

```js
export function cellRef(index)                         // 'r3c7'
export function formatStep(step)                       // fspec-005 §5.1 text
export function stepCells(step)                        // { place:number[], elim:number[], pattern:number[] }
export function runInspector(board)                    // { steps, solved, remaining, hardest, alreadyFull }
export function summarize(result)                      // summary line
export function candidateDiff(pen, pencil)             // Array(81): null | { agree, missing, extra } bitmasks
export function overlayLabel(index, diff)              // accessible-name body for an overlay cell
export function techniqueProfile(trace)                // [{ technique, count }] most-used first
export function describeGeneration(puzzle, getTrace)   // { message } | { rows: [label, value][] }
```

- `runInspector` copies `board`, calls `solveLogically`, and maps the trace to
  `{ index, technique, text, cells }`. `hardest` is the solver's `hardestRank` (0 when no
  technique fired); `summarize` renders it with its tier via `tierForRank` +
  `TIER_LABELS`, so no technique-name↔rank table is needed.
- `stepCells`: `place` = the step's cell when `digit !== null`; `elim` = distinct
  elimination cells; `pattern` = every cell index found under the keys `pivot`, `wings`,
  `cells`, `baseCells`, `fins`, `urCells`, `alsA`, `alsB`, `groupA`, `groupB`, `cell`
  anywhere in the step's pattern fields (recursive walk), minus cells already in `place`
  or `elim`.
- `candidateDiff`: `computed = initialCandidates(pen)`; for each empty cell, with
  `marks = pencil[i]`: when `marks === 0` → `{ agree: computed, missing: 0, extra: 0 }`;
  else `{ agree: computed & marks, missing: computed & ~marks, extra: marks & ~computed }`.
- `describeGeneration`: no puzzle / `source` link or string / no `gen` → `{ message }`;
  else the rows of fspec-005 §8. `getTrace` supplies the solve trace when
  `puzzle.solveTrace` is empty (restored games do not persist it); `devPanel` passes
  `givens => rate(givens).trace`.

## 7. `js/dev/devPanel.js`

```js
/** @param {{ gameState, loadPuzzle: function(string): Promise<Outcome>, copy?: function(string): Promise<boolean> }} deps */
export function mount(deps)
```

Module state: `_overlayOn`, `_inspection` (last `runInspector` result or null),
`_selectedStep` (index or null).

| Tool | Wiring |
|---|---|
| Load | Click → status "Checking puzzle…" → `await loadPuzzle(text)` → status + `announce(message)` |
| Inspector | Run → `runInspector(state.pen)` → render list + summary. Step click → toggle `_selectedStep`, `grid.refresh()`. On `changed` with `pen` or `puzzle` → clear with the stale message |
| Overlay | Switch click → flip `_overlayOn`, `aria-checked`, announce, `grid.refresh()` |
| Coach data | On `changed` with `coachSession` (and at mount) → `<pre>` text = `JSON.stringify(session.step, null, 2)` or the empty message |
| Diagnostics | On `changed` with `puzzle` (and at mount) → `describeGeneration` → table or message |

One decorator, installed at mount, serves both grid tools:

```js
function _decorate(el, i, state) {
  if (_selectedStep !== null) { /* add dev-hl-* class + label suffix by role */ }
  if (_overlayOn && state.pen[i] === 0) { /* replace content with diff marks, set label */ }
}
```

The keyboard guard of aspec-puzzle-sharing §10.5 keeps board shortcuts out of the
textarea.

## 8. Generation Diagnostics Data

`generateForTier` returns the puzzle with two additive fields:

```js
{
  ...toPuzzle(...),
  source: 'generated',
  gen: {
    requestedTier,            // the tier argument
    budget,
    attempts,                 // attempts made, including the degenerate extra one
    rejected: {
      unsolved,               // rater could not solve
      wrongTier,              // solved, other tier
      byTier: { [tier]: n },  // breakdown of wrongTier
    },
    fallback,                 // true on budget exhaustion
  },
}
```

Counters only observe the existing loop; no RNG call is added, removed, or reordered, so
a given seed produces the same givens, solution, tier, trace, and `id` as before (pinned
by a regression test with fixed seeds captured before the change).

The fields ride the existing `GEN_RESULT` envelope (structured clone), the pre-gen cache
(`clientGenProvider._saveToStorage` adds them to its explicit field list), and the saved
game (aspec-puzzle-sharing §9). Loaded puzzles carry `source: 'link' | 'string'` and no
`gen`.

## 9. Test Infrastructure

- `devMode.test.js`, `inspect.test.js` — pure unit tests.
- `devPanel.test.js` — mounts the panel in the Mocha page against a fake game state and
  a real `ui/grid.js` mount, with `loadPuzzle` and `copy` injected.
- `ui-grid.test.js`, `pipeline.test.js`, `puzzleProvider.test.js` — extended.
- `devmode.test.js` (integration) — `index.html?dev=1` / `?dev=0` / no parameter in
  iframes: lazy-load proof, badge, persistence of the flag, statistics suppression,
  load-from-string end to end.

Dev code is inside the `js/**` coverage scope like everything else.

## 10. Implementation Sequence

1. `devMode.js`; pipeline `gen`; provider cache fields
2. `grid.js` seam
3. `inspect.js`
4. `devPanel.js`, `dev.css`
5. `main.js` wiring

## 11. Feasibility and Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Badge fixed to the viewport corner, created by the dev module | Keeps `index.html` and the header free of dev markup; visible at every width where header controls are hidden |
| D2 | Grid decorator hook rather than overlay elements or post-render DOM patching | The overlay must replace cell content and accessible names; a hook inside the renderer is the only place that cannot be raced by a re-render |
| D3 | Inspector and overlay run on the main thread | Rating the hardest known puzzles takes < 60 ms and the worst of 1,500 sampled minimal puzzles 317 ms — inside the 1 s budget; a worker round trip would add complexity for no user-visible gain |
| D4 | The summary reports the hardest *rank and tier*, not a technique name | `solveLogically` returns `hardestRank` but not a per-step rank; naming the technique would need a second name↔rank table that can drift from `solver/techniques/index.js` |
| D5 | Technique profile ordered by count, not ladder rank | Answers "what does this puzzle exercise" and needs no rank table (D4) |
| D6 | The `dev` URL parameter is not stripped | Lets the developer bookmark `?dev=1`; rspec is silent |
| D7 | `gen.byTier` added beyond rspec R9's two rejection reasons | Free to collect and directly useful for budget tuning; additive |
