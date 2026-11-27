# Architectural Spec — Debug Instrumentation (V4)
**Status:** Final — §16.1 feasibility concerns resolved 2026-11-15 (FC-1 accepted by the Product Director; FC-2 to FC-7 resolved by the Orchestrator; all are reflected in fspec-007 §14)
**Date:** 2026-11-15
**Author:** Architect
**Inputs:** `fspec-007-debug-instrumentation.md`, `vspec-007-debug-instrumentation.md`,
`rspec-007-debug-instrumentation.md`, mockup `debug-instrumentation-v1.html`
**Loaded by:** Implementor (Phase 14), Reviewer, QE.
**Amended:** 2026-11-15, after the QE Strategist's review (`tspec-debug-instrumentation.md`
§12) and the Phase 1 implementation. Foreground generation is extracted to
`js/game/foreground.js` (§9.4, new Phase 1B); test seams added (§14.6); fspec
disagreements corrected (§8.3, §11); the Strategist's gaps are resolved in §16.5. The body
has been edited in place: there is no separate addendum to reconcile.

> **Also load:** `aspec-overview.md`, `aspec-dev-mode.md` (the feature extended here),
> `aspec-game-state.md` (reducer, bootstrap order), `aspec-generation.md` (pipeline, worker,
> provider), `aspec-puzzle-sharing.md` (loader, load worker, Unrated),
> `aspec-coach-analyzer.md` §3 (sealed `CoachStep` schema).

---

## Table of Contents

1. [Approach](#1-approach)
2. [Files Touched](#2-files-touched)
3. [Loading and the Dev-Off Guarantee](#3-loading-and-the-dev-off-guarantee)
4. [Seams in Always-Loaded Modules](#4-seams-in-always-loaded-modules)
5. [Data Models](#5-data-models)
6. [Recorder](#6-recorder)
7. [Storage and Multi-Tab Ownership](#7-storage-and-multi-tab-ownership)
8. [Replay](#8-replay)
9. [Seed Plumbing and Seeded Generation](#9-seed-plumbing-and-seeded-generation)
10. [Logging and Error Capture](#10-logging-and-error-capture)
11. [Controller and `window.sudokuDev`](#11-controller-and-windowsudokudev)
12. [Panel Markup and CSS](#12-panel-markup-and-css)
13. [Regression Fixtures](#13-regression-fixtures)
14. [Test Plan Inputs](#14-test-plan-inputs)
15. [Implementation Sequence](#15-implementation-sequence)
16. [Feasibility and Decisions](#16-feasibility-and-decisions)

---

## 1. Approach

Five ideas carry the design.

**A tap on public dispatch.** `createGameState` takes an optional `tap`. The public
`dispatch` brackets the reducer with `tap.begin(action)` / `tap.end(action)`; the reducer's
own nested dispatches call the inner `_reduce` and never reach the tap. A top-level action
is a `begin` at tap depth 0. Everything inside it is a consequence: reducer-internal
consequences are invisible to the tap (replay reproduces them by running the reducer), and
re-entrant public dispatches made by listeners (depth > 0) are stored on the entry as
*follow-ups*.

**Replay runs on a headless machine.** Recorded actions are never applied to the live
store. A second `createGameState` instance — no listeners, null statistics, inert timers, a
hint provider that never computes — is set to the starting position and fed the actions.
The live game then receives exactly one dispatch, `DEV_RESTORE_POSITION`, carrying the
final position. No side effect outside the reducer can fire during the burst because
nothing is subscribed to the machine; the UI renders once.

**Computed results ride on the action.** `COACH_START` already carries the analyzer result.
`HINT` gains an optional `hint` field; the recorder learns the live hint by wrapping the
hint provider, and replay dispatches `HINT` with the recorded hint so the solver is not
consulted.

**The history lives in IndexedDB, one record per entry.** Writes are incremental,
asynchronous, and transactional; ownership is a field checked inside every write
transaction. `localStorage` is rejected because the history would share the game's 5 MB
quota and could make the game's own silent-failure saves start failing (§16 D2).

**One diagnostics channel.** `util/events.js` exports a shared emitter, `diagnostics`.
Always-loaded modules emit `swallowed`, `generation`, and `listener-error` events on it;
with developer mode off it has no listeners, and every emit site is inside a `catch` block
or a per-generation event, never on the action path.

No server-side code. No build step. No new runtime dependency.

## 2. Files Touched

### 2.1 New files

Every file below is lazy and never loads with developer mode off, with one exception:
`js/game/foreground.js` is always loaded. It is not instrumentation. It is the existing
foreground-generation code moved out of `main.js` so that it can be tested (§9.4).

| File | Responsibility |
|---|---|
| `js/game/foreground.js` | **Always loaded.** Foreground puzzle requests: busy lifecycle, cancel, supersession, honest fallback, Unrated fallback, tier preference, seeded runs. Extracted from `main.js` |
| `js/dev/devBoot.js` | Early developer bootstrap: builds logging, store, recorder, error capture. Imported by `main.js` at step 1.5 |
| `js/dev/sessionCodec.js` | Pure. Position, puzzle, and action encoding; fingerprint; document build, read, upgrade, validation; `describeState` |
| `js/dev/machine.js` | Pure. Headless game machine and verbatim action application |
| `js/dev/recorder.js` | The history: tap, entries, capacity, starting position, error entries, export |
| `js/dev/recorderStore.js` | IndexedDB persistence and tab ownership |
| `js/dev/devLog.js` | Logging switches and console writers |
| `js/dev/replay.js` | Pure/async. Run, divergence comparison, report object, message text |
| `js/dev/devSession.js` | Controller shared by the panel and the API: replay, clear, export, seeded generation, load, pencil operations |
| `js/dev/devApi.js` | `window.sudokuDev` |
| `js/dev/recorderPanel.js` | Session recorder tool DOM and wiring |
| `js/tests/helpers/replayFixture.js` | Test helper (§13). Test tree only |
| `js/tests/fixtures/sessions/*.json` | Session-document fixtures |

### 2.2 Changed files

| File | Change | Loaded when dev off |
|---|---|---|
| `js/util/events.js` | `diagnostics` emitter; `createEmitter({ reportErrors })` | Yes |
| `js/game/state.js` | `tap`, `timers` deps; public/inner dispatch split; `HINT.hint`; `DEV_SET_PENCIL`, `DEV_FILL_PENCIL`, `DEV_RESTORE_POSITION` | Yes |
| `js/main.js` | Dev boot, boot bracket, dev deps; foreground generation moves out to `game/foreground.js` (§9.4) | Yes |
| `js/dev/devMode.js` | Purge the saved history on `?dev=0`; `isFreshDevSession`; `RECORDER_DB` | Yes |
| `js/generator/pipeline.js` | `gen.seed`, `gen.seedBy`; Unrated label in the degenerate path (§9.5) | Yes (worker) |
| `js/generator/loadPuzzle.js` | `validateGivens`, `checkGivens` | Yes (worker) |
| `js/worker/protocol.js` | `seeded` on `GEN_REQUEST`; `elapsedMs` on `GEN_RESULT`; `CHECK_REQUEST` / `CHECK_RESULT` | Yes |
| `js/worker/generator.worker.js` | Pass `seeded`; measure `elapsedMs`; answer `CHECK_REQUEST` | Yes (worker) |
| `js/providers/clientGenProvider.js` | `seed` / `budget` on `requestPuzzle`; `createWorker` parameter; diagnostics emits; discard Unrated background results (§9.5) | Yes |
| `js/providers/loadProvider.js` | `checkPuzzles` (it already takes `createWorker`) | Yes |
| `js/game/puzzleLoader.js` | Per-call `confirm`; `rejectionDetail`; diagnostics emit | Yes |
| `js/persist/storage.js`, `js/util/clipboard.js`, `js/game/statistics.js`, `js/providers/cookieStatsStore.js` | One `diagnostics.emit('swallowed', …)` in each silent `catch` | Yes |
| `js/ui/srLive.js` | `muted(fn)` | Yes |
| `js/ui/dialog.js` | `aria-describedby="modal-body"` (vspec §6) | Yes |
| `js/ui/coach.js` | Restart the recap timer on `DEV_RESTORE_POSITION` | Yes |
| `js/dev/inspect.js` | `generationDiagnostics`; seed rows in `describeGeneration` | No |
| `js/dev/devPanel.js` | Async `mount`; sixth tool; Generation diagnostics additions; API install | No |
| `css/dev.css` | vspec-007 additions | No |
| `js/tests/unit/arch.test.js`, `js/tests/setup.html` | See §14.4 | — |

No change to `index.html`.

### 2.3 Import rules

| Module | May import |
|---|---|
| `game/foreground.js` | `config.js` only. The provider, dialog, game state, preference storage, `announce`, and `diagnostics` are parameters. It touches no DOM and no storage directly |
| `sessionCodec.js` | `config.js`, `util/bitset.js`, `game/state.js` (`deriveCoachedCells` only), `game/conflicts.js`, `dev/inspect.js` (`cellRef`) |
| `machine.js` | `game/state.js`, `sessionCodec.js` |
| `recorderStore.js` | `util/events.js`, `dev/devMode.js` (`RECORDER_DB`) |
| `devLog.js` | `util/events.js`, `persist/storage.js` |
| `recorder.js` | `sessionCodec.js`, `machine.js` |
| `devBoot.js` | `recorder.js`, `recorderStore.js`, `devLog.js`, `dev/devMode.js`, `util/events.js` |
| `replay.js` | `sessionCodec.js`, `machine.js`, `config.js`, `game/puzzleLoader.js` (`rejectionDetail`). The analyzer, hint provider, and puzzle check are injected |
| `devSession.js` | `replay.js`, `sessionCodec.js` (`describeState`), `inspect.js`, `devLog.js` (`CATEGORIES`), `machine.js` (`createMachine`, the default `makeMachine`), `solver/candidates.js`, `solver/logical.js` (`tierForRank`), `generator/rater.js` (`rate`), `coach/analyzer.js`, `providers/hintProvider.js`, `game/puzzleLoader.js` (`hasProgress`), `ui/srLive.js`, `ui/dialog.js` (`close`, for a superseded replay's dialog, §11.3), `util/clipboard.js`, `util/events.js` (`diagnostics`), `config.js` |
| `devApi.js` | `devSession.js` (`validateGenerateArgs`). Everything else goes through the session instance passed to `install` |
| `recorderPanel.js` | `devSession.js` (through the instance passed in), `replay.js` (`count`, `formatReportLines`), `ui/srLive.js` |
| `devPanel.js` | As today, plus `recorderPanel.js`, `devApi.js`, `devSession.js`, `config.js` (`DIFFICULTY_ORDER`, `TIER_LABELS`) |

No module outside `js/dev/` and `js/tests/` imports any file in `js/dev/` other than
`devMode.js`. `devMode.js` imports only `persist/storage.js`, as today.

## 3. Loading and the Dev-Off Guarantee

`main.js` gains one guarded dynamic import and keeps the existing one:

```js
// Step 1.5
const devMode = initDevMode(location.search);
const devBoot = devMode ? (await import('./dev/devBoot.js')).boot() : null;
…
// Step 12 — the existing form, which arch test AR-D2 matches, is kept verbatim
if (devMode) {
  import('./dev/devPanel.js').then(dev => dev.mount({ … }));
}
```

`main.js` already uses top-level `await` (`await stats.init()`), so the early import needs
no restructuring. With the flag off both branches are skipped: no lazy file in §2.1 is
requested (`game/foreground.js` is the one always-loaded addition, and holds only code that
`main.js` already ran), `window.sudokuDev` is never assigned, no dev DOM or stylesheet exists, the
`diagnostics` emitter has no listeners, and `tap` is `null`.

The guarantee is enforced three ways:

1. **Arch tests** (§14.4): no always-loaded file statically imports anything under
   `js/dev/` except `devMode.js`; both dynamic imports sit behind `devMode`.
2. **Integration test**: `index.html` without the flag — `performance.getEntriesByType
   ('resource')` contains no `/js/dev/` entry other than `devMode.js` and no `dev.css`;
   `'sudokuDev' in window` is false; `indexedDB.databases()` does not list `RECORDER_DB`.
3. **Residual cost with the flag off**, exhaustively: one `tap === null` comparison per
   public dispatch; one `action.hint !== undefined` comparison per `HINT`; three new
   `case` labels in the reducer switch; a `Map` lookup that returns `undefined` at each
   `diagnostics.emit` (reached only inside `catch` blocks and at generation events, about
   ten per generation run); `performance.now()` twice per generation in the worker; one
   `_muteDepth > 0` comparison per `announce` call in `srLive.js`; one
   `action.type === 'DEV_RESTORE_POSITION'` comparison per `changed` emit in `coach.js`;
   one extra module fetch (`game/foreground.js`) at boot, offset by the same code leaving
   `main.js`. Off the per-action path: the reducer's clock and timeouts go through the
   `timers` object (one property call where `setTimeout` / `Date.now` were called directly,
   at each check-highlight schedule or clear); `puzzleLoader.load` evaluates
   `confirmOnce ?? confirm` once per load; `loadProvider`'s `onmessage` compares the
   message type against `LOAD_RESULT` and `CHECK_RESULT` once per worker reply;
   `foreground.request` tests its `fallback` policy once per honest fallback and sets and
   tests its `delivered` flag once per request.

## 4. Seams in Always-Loaded Modules

### 4.1 `js/util/events.js`

```js
/** @param {{ reportErrors?: boolean }} [opts] */
export function createEmitter({ reportErrors = true } = {})

/** Process-wide diagnostics channel. No listeners unless developer mode is on. */
export const diagnostics = createEmitter({ reportErrors: false });
```

In `emit`'s existing `catch`: `console.error(err)` stays first; then
`if (reportErrors) diagnostics.emit('listener-error', { error: err, type, payload })`.
The `diagnostics` emitter itself is built with `reportErrors: false`, so an exception in a
diagnostics listener is logged and goes no further — this is the structural half of
"capturing never triggers further capture" (§10.3).

Diagnostics events:

| Event | Payload | Emitted by |
|---|---|---|
| `swallowed` | `{ where: string, error }` | Every silent `catch` (§10.2) |
| `generation` | `{ event, … }` (§10.1) | `clientGenProvider.js`, `game/foreground.js` |
| `listener-error` | `{ error, type, payload }` | `createEmitter` |

### 4.2 `js/game/state.js`

```js
createGameState({ stats, hintProvider, statsSuppressed = () => false,
                  tap = null, timers = DEFAULT_TIMERS })

const DEFAULT_TIMERS = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: id => clearTimeout(id),
};
```

**Dispatch split.** The existing `switch` body becomes `_reduce(action)`. Every nested
dispatch inside the reducer (`ON_COMPLETION_EVALUATE`, `COACH_END`, `COACH_FILL_RECAP`)
calls `_reduce`. The exported function is:

```js
function dispatch(action) {
  if (tap === null) { _reduce(action); return; }
  tap.begin(action);
  try { _reduce(action); } finally { tap.end(action); }
}
```

The check-highlight timer callback in `_scheduleClearIncorrect` calls the public `dispatch`
— `CLEAR_INCORRECT` is a time-driven action and must be recorded (fspec §3.1). The `tap`
contract is that `begin` and `end` never throw; the recorder guarantees it (§6.2).

**Timers.** All three `Date.now()` uses and every `setTimeout` / `clearTimeout` in the file
go through `timers`. Normal behaviour is unchanged; the headless machine passes inert
timers (§8.1).

**`HINT`.** `const hint = action.hint !== undefined ? action.hint
: hintProvider.nextHint(…)`. The guards before it and everything after it are unchanged.
No UI dispatches `HINT` with a `hint` field.

**New actions.**

| Action | Behaviour |
|---|---|
| `DEV_SET_PENCIL { index, mask }` | Ignored when: no puzzle, won, generating, the cell holds a given or pen digit, or `pencil[index] === mask`. Else `_captureUndoSnapshot()`, `pencil[index] = mask`, run the elimination-completion check, emit `pencil`, `undoSnapshot`. Selection and mode untouched |
| `DEV_FILL_PENCIL { pencil: Uint16Array(81) }` | Ignored when: no puzzle, won, generating. Else: if a coach session is active, `_reduce({ type: 'COACH_END', reason: 'erase' })` first; then `_captureUndoSnapshot()`; then for every cell with `pen[i] === 0`, `pencil[i] = action.pencil[i]`; emit `pencil`, `undoSnapshot` |
| `DEV_RESTORE_POSITION { position: InternalPosition }` | Replaces the whole state (below) |

The elimination-completion check now in `PENCIL_TOGGLE` is extracted to
`_checkElimComplete()` and called from both `PENCIL_TOGGLE` and `DEV_SET_PENCIL`.

`DEV_RESTORE_POSITION` copies every field of `InternalPosition` (§5.2) into `state`.
Everything mutable is copied, never aliased: the typed arrays, `incorrect`, `genProgress`,
the undo snapshot's arrays, and the coach session's `coachedCells`, `pencilSnapshot`,
`coachRevealedBits`, and `eliminationTargets`. The puzzle object and `coachSession.step`
are shared by reference; both are immutable by contract (the reducer never writes to
either), and `coach.js` relies on the step's identity to avoid re-rendering. This is the
Phase 1 implementation and is confirmed. It sets `winHandled = won`, recomputes
`conflicts` with `computeConflicts(pen)`, clears `clearIncorrectTimer`, and when
`position.highlightPending` sets `incorrectShownUntil = timers.now() + CHECK_HIGHLIGHT_MS`
and calls `_scheduleClearIncorrect()` (otherwise `incorrectShownUntil = 0`). It emits the
same full key list as `PUZZLE_LOADED`. It records no statistics and runs no completion
check. It has no guards: any position is accepted, including `puzzle: null`.

### 4.3 `js/main.js`

Step order is unchanged. Changes:

- **Step 1.5:** `devBoot` as in §3.
- **Step 5:** `const hintProvider = devBoot ? devBoot.wrapHintProvider({ nextHint })
  : { nextHint };`
- **Step 6:** `createGameState({ stats, hintProvider, statsSuppressed: isDevMode,
  tap: devBoot?.tap ?? null })`.
- **Step 7:** the restore burst runs first, exactly as today. Then
  `devBoot?.bootComplete(gameState)`. Then, only when nothing was restored, the boot
  request `foreground.request(…)`. The `if / else` becomes `if (restorable) { …restore… }`,
  `bootComplete`, `if (!restorable) { …request… }`.
- **Foreground generation** leaves `main.js` for `game/foreground.js` (§9.4). `main.js`
  keeps only the construction of the generator, the button wiring, and the callbacks that
  touch the DOM or `STATE_KEY`.
- **Loader:** `beforeReplace` calls `foreground.abort('replaced')` and `closeDialog()`.
- **Persistence listener:** no change. `DEV_RESTORE_POSITION` falls through to the
  existing won-check and debounced save, which is the required behaviour (fspec §5.6).
- **Step 12:**

```js
if (devMode) {
  import('./dev/devPanel.js').then(dev => dev.mount({
    gameState,
    loadPuzzle: (text, opts) => loader.load(text, { source: 'string', ...opts }),
    dev: devBoot,
    confirm,                       // the dialog promise wrapper already built for the loader
    generateSeeded: foreground.generateSeeded,
    getGenerationTier: () => foreground.generationTier(gameState.getState()),
    beforeReplace: () => { foreground.abort('replaced'); closeDialog(); },
    checkPuzzles: loadProvider.checkPuzzles,
  }));
}
```

`createLoadProvider()` is hoisted to a `const loadProvider` so the loader and the dev
tooling share one load worker. `confirm` is hoisted to a named `const`.

### 4.4 Other always-loaded modules

| Module | Change |
|---|---|
| `puzzleLoader.js` | `load(text, { source, onChecking, confirm: confirmOnce })` uses `confirmOnce ?? confirm`. New export `rejectionDetail(reason, length)` returning the sentence after "This puzzle can't be loaded. "; `rejectionMessage` is rewritten on top of it. The `rateGivens` catch binds the error and emits `swallowed` (`puzzleLoader.rateGivens`). Done in Phase 1. `rejectionDetail` knows only the fspec-006 reasons and stays that way: `solution-mismatch` can never come from the loader, and its wording belongs to fspec-007, so it lives in `replay.js` (§8.3, Phase 5) |
| `loadPuzzle.js` | `validateGivens(givens) → { ok: true, solution } \| { ok: false, reason }` holds the conflict / complete / uniqueness checks; `loadFromGivens` calls it and then rates (done in Phase 1). `checkGivens(givens, solution) → { ok: true } \| { ok: false, reason }` calls `validateGivens` and adds reason `'solution-mismatch'` when the unique solution differs from `solution`; no rating (Phase 2, with the worker message that uses it) |
| `loadProvider.js` | `checkPuzzles(list: Array<{givens: Uint8Array, solution: Uint8Array}>) → Promise<Array<{ok}>>` posts one `CHECK_REQUEST`; `onmessage` resolves with `msg.result` for `LOAD_RESULT` and `msg.results` for `CHECK_RESULT`. Its existing `createWorker` parameter is the test seam; nothing to add |
| `clientGenProvider.js` | `createClientGenProvider({ createWorker = () => new Worker(WORKER_URL, { type: 'module' }) } = {})`, the same shape as `loadProvider`. `puzzleProvider.js` calls it with no argument, as today (Phase 2) |
| `srLive.js` | `export function muted(fn)` — runs `fn` synchronously with `announce` a no-op, restoring the previous state in `finally`; nests safely via a counter. It returns nothing, and no later phase needs it to: its only caller is the replay commit (§11.3), which wraps a `dispatch` |
| `dialog.js` | The backdrop element gains `aria-describedby="modal-body"` |
| `coach.js` | The `changed` listener destructures `action`; when `action.type === 'DEV_RESTORE_POSITION'` it clears `_recapTimer` (if set) before `_render`, so a recap in the restored position gets a full 2.5 s (fspec §5.6) |
| `devMode.js` | `export const RECORDER_DB = 'sudoku-dev-recorder'`. On `?dev=0`: `try { indexedDB.deleteDatabase(RECORDER_DB); } catch { /* storage unavailable: nothing to purge */ }`. This catch stays silent: developer mode is being turned off, so there is nothing to report to. On `?dev=1`: `_fresh = getItem(KEY) !== true` is computed before `setItem`. `export function isFreshDevSession()` returns `_fresh` (false on every other path) |

## 5. Data Models

All document and stored data is plain JSON. Cells are indices 0–80, row-major. A *board
string* is 81 characters `0`–`9`. *Marks* are 81 arrays of digits 1–9. The encoder always
writes them ascending and without repeats. The validator accepts any order and repeats (the
decoder folds them into a bitmask), so a hand-edited document is not rejected for ordering.

### 5.1 Puzzle and position (document form)

```js
PuzzleDoc = {
  givens: string,            // board string
  solution: string,          // board string, no zeros
  tier: string,              // tier ID or "unrated"
  origin: "generated" | "link" | "string" | "unknown",
  id: string,
  gen?: {                    // origin "generated" only, and only when recorded
    requestedTier: string,
    seed: number | null,     // null when the puzzle predates this feature
    seedBy: "random" | "developer" | null,
    budget: number, attempts: number,
    rejected: { unsolved: number, wrongTier: number, byTier: { [tier]: number } },
    fallback: boolean,
  },
}

PositionDoc = {
  puzzle: PuzzleDoc | null,
  board: string,                       // givens and pen digits
  pencil: number[][],                  // marks
  selected: number | null,
  mode: "pen" | "pencil",
  hintsRemaining: number | "unlimited",
  attemptRecorded: boolean,
  won: boolean,
  incorrect: number[],                 // cells flagged incorrect, ascending
  highlightPending: boolean,           // a check highlight is waiting to expire
  completionMessage: string,
  undo: null | { board: string, pencil: number[][],
                 hintsRemaining: number | "unlimited", attemptRecorded: boolean },
  generating: null | { message: string, difficulty: string | null,
                       progress: null | { attempts: number, budget: number } },
  coach: null | {
    step: CoachStep,                   // verbatim
    recap: null | "normal" | "error" | "elim",
    focused: number | null,
    pencilSnapshot: number[][],        // marks before auto-reveal
    revealed: number[][],              // marks the coach added
  },
}
```

Mapping from `state.puzzle`: `origin` is `source`, with `'loaded'` and `undefined` mapped to
`"unknown"`; `tier` is `difficulty`; `solveTrace` is dropped and restored as `[]`.
`conflicts` is derived and never stored. `winHandled` equals `won` in every reachable
state and is not stored. `coachedCells` and `eliminationTargets` are derived on decode:
`coachedCells = recap === null ? deriveCoachedCells(step) : ∅`; `eliminationTargets` is
rebuilt from `step.eliminations` when `step.type === 'elimination'`, else `null`.

### 5.2 Internal position

`InternalPosition` is the payload of `DEV_RESTORE_POSITION`. It is flat and uses the
`GameState` field names, so restoring is a field-by-field copy. The typedef lives in
`state.js` (Phase 1):

```js
InternalPosition = {
  puzzle: object | null,
  pen: Uint8Array, pencil: Uint16Array,
  selected: number | null,
  activeMode: 'pen' | 'pencil',
  incorrect: Set<number>,
  highlightPending: boolean,
  hintsRemaining: number,              // Infinity for unlimited
  attemptRecorded: boolean,
  won: boolean,
  generating: boolean, generatingMessage: string,
  generatingDifficulty: string | null,
  genProgress: { attempts, budget } | null,
  completionMessage: string,
  coachSession: CoachSession | null,   // full session, derived fields included
  undoSnapshot: UndoSnapshot | null,
}
```

`conflicts`, `winHandled`, and `incorrectShownUntil` are not in it; the reducer derives
them. The document form nests what this form keeps flat: `PositionDoc.generating` is
`null` when `generating` is false, else `{ message: generatingMessage, difficulty:
generatingDifficulty, progress: genProgress }`; `mode` is `activeMode`; `undo` is
`undoSnapshot`; `coach` is `coachSession`.

**`highlightPending`** is derived when encoding as `state.incorrectShownUntil > 0`. That
field is set by `CHECK` and by a failed completion check, and zeroed by `CLEAR_INCORRECT`,
a puzzle load, reset, undo, and `DEV_SET_BOARD`; real-time (Kiddie) incorrect flags never
set it. On a machine, whose clock reads 0, a pending highlight is `0 +
CHECK_HIGHLIGHT_MS`, still positive, so the rule holds there too.

`sessionCodec.js` converts in both directions. The round-trip law, tested as a property,
is: for any reachable state `S`, a machine restored from
`decodePosition(encodePosition(S))` has the same fingerprint (§6.3) as `S`.

### 5.3 History entry

```js
ActionEntry = { seq: number, t: number, a: ActionDoc, nc?: true, f?: ActionDoc[] }
ErrorEntry  = { seq: number, t: number, n: number,
                e: { kind: "uncaught" | "rejection" | "listener",
                     message: string, stack: string | null, source: string | null,
                     action: string | null } }       // action type, listener errors only
```

`t` is epoch milliseconds. `seq` is assigned when the entry is handed to the store and is
strictly increasing across reloads. `nc` marks "changed nothing". `f` holds follow-ups.
`n` is the repeat count. `ActionDoc` is `{ type, …fields }` per §8.2.

### 5.4 Session document, format version 1

```json
{
  "format": "sudoku-session",
  "version": 1,
  "exportedAt": "2026-11-15T14:03:22.118Z",
  "seed": 3141592653,
  "tier": "hard",
  "start": {
    "puzzle": {
      "givens": "003020600900305001001806400008102900700000008006708200002609500800203009005010300",
      "solution": "483921657967345821251876493548132976729564138136798245372689514814253769695417382",
      "tier": "hard", "origin": "generated", "id": "f115a966",
      "gen": { "requestedTier": "hard", "seed": 3141592653, "seedBy": "random",
               "budget": 150, "attempts": 12,
               "rejected": { "unsolved": 0, "wrongTier": 11, "byTier": { "medium": 11 } },
               "fallback": false }
    },
    "board": "003020600900305001001806400008102900700000008006708200002609500800203009005010300",
    "pencil": [[], [], [], "… 81 arrays …"],
    "selected": null, "mode": "pen", "hintsRemaining": 0, "attemptRecorded": false,
    "won": false, "incorrect": [], "highlightPending": false, "completionMessage": "",
    "undo": null, "generating": null, "coach": null
  },
  "actions": [
    { "at": "2026-11-15T14:01:07.412Z", "action": { "type": "SELECT_CELL", "index": 0 } },
    { "at": "2026-11-15T14:01:08.020Z", "action": { "type": "PEN_ENTER", "digit": 4 } },
    { "at": "2026-11-15T14:01:09.377Z", "action": { "type": "UNDO" } },
    { "at": "2026-11-15T14:01:09.801Z", "action": { "type": "UNDO" }, "noChange": true },
    { "at": "2026-11-15T14:01:12.150Z",
      "action": { "type": "COACH_START", "result": { "technique": "Naked Single", "…": "…" } } },
    { "at": "2026-11-15T14:01:13.004Z", "action": { "type": "SELECT_CELL", "index": 3 },
      "then": [ { "type": "COACH_FOCUS_COACHED_CELL", "index": 3 } ] }
  ],
  "errors": [
    { "at": "2026-11-15T14:01:08.021Z", "afterAction": 2, "kind": "listener",
      "message": "x is undefined", "stack": "…", "source": null,
      "action": "PEN_ENTER", "count": 1 }
  ]
}
```

Schema, version 1:

| Field | Type | Required | Rule |
|---|---|---|---|
| `format` | `"sudoku-session"` | Yes | Anything else → "The JSON is not a session document." |
| `version` | integer ≥ 1 | Yes | Greater than `FORMAT_VERSION` → version rejection with *V* = the number. Missing, or not an integer ≥ 1 → version rejection with *V* shown as "unknown" |
| `exportedAt` | ISO-8601 UTC string | Yes | Must parse as a date; used only as the fallback timestamp of §8.3 |
| `seed`, `tier` | number, tier ID | Both or neither | Written exactly when `start.puzzle.gen.seed` is a number; `tier` is `gen.requestedTier`. On read, one without the other is a shape failure. They are informational and are not cross-checked against `start` |
| `start` | object | Yes | A non-object is a shape failure; its contents are validated as the starting position (§8.3) |
| `actions` | array | Yes | Each `{ at: ISO string, action: ActionDoc, noChange?: true, then?: ActionDoc[] }` |
| `errors` | array | Yes | Each `{ at, afterAction: integer ≥ 0, kind, message, stack, source, action, count }` |

**Shape failures.** A value that is not a plain object, a wrong `format`, a missing or
unparseable `exportedAt`, a non-object `start`, a non-array `actions` or `errors`, a
malformed `errors` item, or `seed` without `tier` (or the reverse) are all reported as
"The JSON is not a session document." `format` is checked before `version`, and `version`
before the rest of the shape, so a newer document is reported by its version even if its
shape has changed.

`afterAction` is the count of action entries preceding the error. Action numbers are
1-based positions in `actions`. Unknown extra properties are ignored on read, at every
level, so a later minor addition does not need a version bump.

### 5.5 Format upgrades

`sessionCodec.js` holds `FORMAT_VERSION = 1` and `UPGRADERS = {}`, a map from version *v*
to a pure function `doc_v → doc_{v+1}`.

```js
readDocument(input, { current = FORMAT_VERSION, upgraders = UPGRADERS } = {})
  → { ok: true, doc, readAs: number, writtenAs: number } | { ok: false, reason: string }
```

It walks `while (doc.version < current) doc = upgraders[doc.version](doc)`. When version 2
arrives the Implementor adds `UPGRADERS[1]` and never edits version 1's reader; the
validator and decoder only ever see the current layout. `writtenAs !== readAs` produces the
report note "Document format version *v* was read as version *S*." The injectable
parameters exist so the loop and the note are covered today with a synthetic version 2
(§14.3). `prepare`, `replayFixture`, and `createDevSession` each accept the same two
options and pass them through (§14.6), so the note's whole path — reader, report, status
line — is testable before a real version 2 exists. `js/tests/fixtures/sessions/format-v1-baseline.json` is frozen at this release and
must replay unchanged in every later build.

### 5.6 Stored form

IndexedDB database `sudoku-dev-recorder`, version 1.

| Store | Key | Value |
|---|---|---|
| `meta` | `'history'` | `{ form: 1, owner: string, start: PositionDoc }` |
| `entries` | `seq` (keyPath) | `ActionEntry` or `ErrorEntry` (§5.3) |

`form` is the stored-form number. It is independent of the document format version and is
bumped whenever the entry or position encoding changes. Stored histories are never
migrated: an unknown `form` is discarded (fspec §3.4). Logging switches are stored
separately in `localStorage` under `sudoku.dev.logging.v1` as
`{ generation: boolean, swallowed: boolean, actions: boolean }` and survive `?dev=0`.

### 5.7 Report object

```js
Report = {
  applied: number, total: number,
  compared: number,                    // k
  counts: { coach: number, hint: number },
  divergences: Array<{ action: number, kind: "coach" | "hint", time: string,   // ISO, from the document
                       differences: Array<{ part: string, recorded: any, current: any }>,
                       technique?: string,   // coach only: the recorded technique, for the report line
                       cell?: number }>,     // hint only: the cell the hint was asked for
  notCompared: Array<{ action: number, kind: "coach" | "hint", reason: string }>,   // action 0 = starting position
  errors: { recorded: ErrorItem[], raised: ErrorItem[] },
  notes: string[],
  stopped: null | { at: number, message: string },
}
ErrorItem = { kind, afterAction: number, message: string, count: number }
```

`time` is the ISO string from the document so the object is identical in every time zone;
only the panel formats it as local `HH:MM:SS.mmm`.

## 6. Recorder

### 6.1 `js/dev/recorder.js`

```js
export const RECORDER_CAPACITY = 5000;

createRecorder({ store, log, opened, capacity = RECORDER_CAPACITY, now = Date.now,
                 clock = () => performance.now() })
  // opened: the store's open() promise; `ready` merges the saved history once it settles
  → {
    tap,                               // { begin(action), end(action) } — never throws
    noteHint(hint),                    // called by the wrapped hint provider
    bootComplete(gameState),           // ends boot suppression; fixes the boot position
    ready,                             // Promise<void>: saved history merged or absent
    captureError(e),                   // { kind, message, stack, source, action }
    counts(),                          // { actions, errors, capacity, atCapacity }
    storageStatus(),                   // the store's status(), §7.3
    exportDocument(),                  // SessionDocument (object)
    clear(),                           // { actions, errors } removed
    replaceHistory(start, entries),    // replay hand-over
    silently(fn),                      // the next depth-0 action is not recorded
    errorsSince(mark), mark(),         // for the replay report
    snapshot(),                        // { start, entries }: the store's snapshot collaborator
    storageChanged(status),            // the store's onStatus collaborator; emits 'storage'
    on(event, fn),                     // 'change' (counts), 'storage' (status)
  }
```

`boot()` in `devBoot.js` takes no `storage` default of its own: the logging switches'
storage is defaulted in `createDevLog`, and `boot` passes its option through.

### 6.2 Tap behaviour

`begin` and `end` wrap their bodies in `try / catch`; a caught error goes to
`captureError` under the guard of §10.3 and the game action proceeds unaffected. Every
collaborator the tap calls is injected (`now`, `clock`, `log`, `store`), and those are what
the isolation tests make throw; the codec is a static import and is not stubbed (§14.3).

A frame marked unrecorded drops its follow-ups as well: a depth > 0 `begin` inside it
records nothing.

| Call | Depth 0 | Depth > 0 |
|---|---|---|
| `begin(action)` | Encode the action (§8.2). Unknown `type` or a payload that fails its schema: mark the frame unrecorded, capture one `uncaught` error "Unrecordable action: *type*". Otherwise append `{ t: now(), a }` to the history immediately, take the *before* fingerprint, start the clock | Encode and push onto the open entry's `f` |
| `end(action)` | Take the *after* fingerprint; set `nc` (§6.3); trim to capacity (§6.4); hand the entry to the store; write the action trace (§10.1); emit `change` | Nothing |

Appending at `begin` is what places an error captured during the action after that action
(fspec §8.3) while keeping issue order. Entries are replayed in `begin` order with each
entry's follow-ups applied directly after it. This is exact as long as no listener
dispatches in response to an emit after which its reducer case keeps mutating; that holds
for every listener today (`coach.js` focus tracking, and `main.js`'s `CHANGE_DIFFICULTY`
listener, which starts a foreground request) and
is guarded by the fidelity sweep (§14.2).

While suppressed (before `bootComplete`), the tap tracks depth and records nothing.
`silently(fn)` suppresses only the next depth-0 frame; public dispatches nested inside it
are recorded as ordinary top-level entries.

`noteHint(hint)` sets `a.hint` on the open depth-0 entry when its type is `HINT`.
`wrapHintProvider(p)` in `devBoot.js` returns
`{ nextHint: (...args) => { const h = p.nextHint(...args); recorder.noteHint(h); return h; } }`.
A `HINT` whose guards failed never reaches the provider and is stored without `hint`.

### 6.3 Fingerprint and "changed nothing"

`sessionCodec.fingerprint(state) → { [part]: string }` with parts `puzzle` (id, tier,
givens), `board`, `pencil`, `selected`, `mode`, `hints` (remaining, `attemptRecorded`),
`won`, `highlight` (incorrect set, pending flag, message), `undo`, `generating`, `coach`
(step identity by technique and target, recap, focused, snapshot, revealed). It costs
7 µs (measured, §16.3). An entry is marked `nc` when every part is equal before and after
and the action is not informational. Informational actions are `COACH_NO_TECHNIQUE` and a
`COACH_START` whose `result.type` is `'no-technique'`: they are the coach's answer, change
no state by design, and must stay comparable (fspec §5.8). The reducer's emit key list is
not used — several ignored actions emit a full key list (`PEN_ENTER` on a given) and others
emit nothing.

The parts that differ are the "which parts of the game state it changed" of the action
trace.

### 6.4 Starting position and capacity

The recorder owns a *base machine* (`machine.js`, §8.1) set to the starting position.
When an append takes the entry count over `capacity`, the oldest entry is removed; if it
is an action it is applied to the base machine with `applyEntry`, and the starting position
becomes `encodePosition(base.getState())`. The store receives the new entry, the deletion,
and the new `start` in one transaction (§7.2). Applying the discarded entry with the same
code replay uses is what makes "the remaining entries still reproduce every later position
exactly" hold by construction.

### 6.5 Boot (feasibility question 1)

The recorder is created, suppressed, before the game state exists, so no dispatch can
precede it. Sequence:

1. `devBoot.boot()`: build `devLog`, the store, and the recorder; install error capture;
   call `store.open()` (asynchronous). The recorder keeps boot-time entries in memory.

   ```js
   boot({ win = window, idb = globalThis.indexedDB, dbName = RECORDER_DB,
          storage = { getItem, setItem }, out = console, now = Date.now,
          fresh = isFreshDevSession(), capacity = RECORDER_CAPACITY } = {})
     → { tap, recorder, log, wrapHintProvider(provider), bootComplete(gameState), dispose() }
   ```

   `main.js` calls `boot()` with no argument. `dispose()` removes the two `win` listeners
   and the three `diagnostics` subscriptions, calls `log.dispose()`, and closes the
   store's connection, so a unit test leaves nothing behind. Production never calls it.
2. `main.js` runs the restore burst. The tap sees it and records nothing.
3. `bootComplete(gameState)`: encode the live position as `P₀`, end suppression.
4. Everything dispatched from here on — including the boot `SET_GENERATING` — is recorded.
5. When `store.open()` settles, the recorder merges and resolves `ready`:

| `open()` result | History becomes |
|---|---|
| `loaded { start, entries }` | `start`; `entries` + one `PAGE_RELOADED { position: P₀ }` entry stamped with the boot time + everything recorded since step 4; base machine set to `start`; then trimmed to capacity |
| `empty`, `unavailable` | Start `P₀`; the entries recorded since step 4 |
| `discarded` | As `empty`; storage status `discarded` until the next page load |
| `open()` rejects (a defect, not an expected path) | As `unavailable`; the rejection is emitted as `swallowed` (`recorder.open`) |

When `isFreshDevSession()` is true the store is opened with `{ discard: true }` and reports
`empty` (fspec §3.3: turning the mode on starts a new history). Nothing is handed to the
store before the merge.

**First write after the merge.** The merged history reaches disk in one call, made by the
recorder immediately before it resolves `ready`:

| `open()` result | First write |
|---|---|
| `loaded` | One incremental `store.write({ put: [the PAGE_RELOADED entry, …post-boot entries], removeBelow, start })`. The stored entries are already on disk and are not rewritten. `removeBelow` and `start` are set only when the merge trimmed to capacity |
| `empty`, `discarded` | `store.replaceAll(P₀, entries)`, which also writes the first `meta` record |
| `unavailable` | None |

Entries recorded after `ready` follow the normal path of §6.2. `devPanel.mount` awaits `ready` before building the panel or
installing the API, so no user-visible operation observes the unmerged state. The store
gives up after 2 s and reports `unavailable`, so `ready` always settles.

### 6.6 Other operations

- **`captureError`**: if the last entry is an `ErrorEntry` with equal `kind`, `message`,
  `stack`, and `source`, increment `n` and re-put it; else append a new `ErrorEntry`.
  Counts toward capacity.
- **`exportDocument`**: `{ format, version, exportedAt: new Date(now()).toISOString(),
  seed?, tier?, start, actions, errors }`, deep-copied; `afterAction` is computed by
  counting.
- **`clear`**: entries emptied; start = current position; base machine reset; store
  `replaceAll`.
- **`replaceHistory(start, entries)`**: same, with the given content; `seq` continues.

## 7. Storage and Multi-Tab Ownership

### 7.1 `js/dev/recorderStore.js`

```js
createRecorderStore({ idb = globalThis.indexedDB, dbName = RECORDER_DB, ownerId,
                      snapshot, onStatus, openTimeoutMs = 2000 })
  → {
    open({ discard = false }),         // Promise<{ status, start?, entries? }>; never rejects
    write({ put = [], removeBelow = null, start = null }),
    replaceAll(start, entries),
    status(),                          // 'ok' | 'failing' | 'lost' | 'discarded' | 'unavailable'
    close(),                           // closes the connection; used by devBoot.dispose
  }
```

`ownerId` is a random token made once per page load by `devBoot`. `snapshot()` returns the
recorder's current `{ start, entries }` for full rewrites. `dbName` exists so each unit
test uses its own database; production never passes it, and `devMode.js` always purges
`RECORDER_DB`.

### 7.2 Write strategy (feasibility question 6)

- **Incremental.** A normal append is one `put`; at capacity it is a `put`, a
  `delete(IDBKeyRange.upperBound(removeBelow, true))`, and a `put` of `meta`. All in one
  `readwrite` transaction over both stores, so `start` and `entries` are never mutually
  inconsistent on disk.
- **Coalesced.** One transaction is in flight at a time. Writes requested meanwhile are
  merged into a single pending batch that runs when the transaction completes. Every entry
  therefore triggers a save (fspec §3.4) without a transaction per `GEN_PROGRESS`.
- **Recovery.** A failed or aborted transaction sets status `failing` and a `dirty` flag.
  The next write is a full rewrite from `snapshot()` (`clear` both stores, put everything).
  Success returns the status to `ok`. Clear history calls `replaceAll`, which is the same
  path — the retry fspec §3.4 requires.

| Quantity | Value |
|---|---|
| Plain action entry (select, digit, erase) | ≈ 55 bytes of JSON (measured: 5,000 → 275 KB) |
| Puzzle-carrying entry | ≈ 0.5 KB |
| `COACH_START` entry | ≈ 1.1–1.2 KB (largest step observed across Hard–Nightmare walks) |
| `PAGE_RELOADED` entry | ≈ 1.5–3 KB |
| History at capacity, typical play | 0.3–0.5 MB |
| History at capacity, coach-heavy (500 coach starts, 50 puzzles) | ≈ 1.2 MB |
| Absurd upper bound (5,000 coach starts) | ≈ 6 MB |
| IndexedDB quota | Hundreds of MB at minimum in every current browser; not shared with `localStorage` |
| Main-thread cost per action | One structured clone of one small record, well under 1 ms; the write itself is off-thread |
| Main-thread cost of a full rewrite | One clone of the history, ≈ 5–20 ms at capacity; only after a failure, Clear history, or a replay |

### 7.3 Failure behaviour

| Condition | Store status | Storage line (fspec §3.4, §3.5) |
|---|---|---|
| `idb` undefined, `open` errors, or times out | `unavailable` | "History is not being saved — it will be lost on reload." |
| A write transaction fails | `failing` until one succeeds | Same message; cleared on success |
| `meta.form !== 1`, `meta` absent while entries exist, a malformed record (an entry with neither `a` nor `e`), a read error after a successful open, or `VersionError` (database newer than this build: `deleteDatabase`, reopen once; a failed reopen is `unavailable`) | `discarded` | "The saved history couldn't be read and was discarded." |
| Ownership lost | `lost`, permanent | "Another tab has taken over the saved history. This tab's history is kept until it is closed or reloaded." |

`meta` absent and no entries is `empty`, not a failure.

**Precedence.** The store keeps two things: its save state (`ok`, `failing`, `lost`,
`unavailable`) and a `discardedThisLoad` flag that, once set, stays set until the page is
reloaded. `status()` reports the first that applies:

1. `lost`
2. `unavailable`
3. `failing`
4. `discarded` (the flag is set and saving is otherwise working)
5. `ok`

So the "discarded" line shows for the rest of the page load, as fspec §3.4 says, except
while a more urgent condition holds; when a failing save recovers, the line returns to the
"discarded" message rather than going empty. `onStatus` fires only when `status()` changes.

Every failure is emitted as `diagnostics.emit('swallowed', { where: 'recorder.open' |
'recorder.write', error })`. None is passed to `captureError`. Recording continues in
memory in every case. `recorderPanel` announces each storage-line message once, when the
status changes to it.

### 7.4 Ownership (feasibility question 7)

- `open()` runs one `readwrite` transaction: read `meta`, read all entries, then write
  `meta.owner = ownerId`. The read and the claim are atomic, so two tabs loading at once
  serialise: the later one reads what the earlier wrote and takes over.
- Every later write transaction first reads `meta`; if `meta.owner !== ownerId` it aborts
  itself and the status becomes `lost`. The check and the write share a transaction, so a
  tab that has lost ownership can never add or delete a record: entries never interleave.
- The connection's `onversionchange` handler closes it and sets `lost`; this is what lets
  another tab's `?dev=0` delete the database.
- Loss is detected at the losing tab's next entry, not at the instant of takeover. An idle
  background tab shows the message as soon as it next records anything. No
  `BroadcastChannel` is used; it would add a second, weaker mechanism to keep in step with
  the transactional one.

## 8. Replay

### 8.1 `js/dev/machine.js`

```js
/** A game store with no listeners, no statistics, no timers, and no solver. */
createMachine(position: PositionDoc) → { getState, dispatch }
applyEntry(machine, entry: { a: ActionDoc, f?: ActionDoc[] })   // may throw
snapshot(machine) → InternalPosition                             // deep enough to restore
```

`createMachine` calls `createGameState` with `stats: { recordAttemptOnce() {},
recordWin() {} }`, `hintProvider: { nextHint: () => null }`, `statsSuppressed: () => true`,
`tap: null`, and `timers: { now: () => 0, set: () => 0, clear: () => {} }`, then dispatches
`DEV_RESTORE_POSITION` with the decoded position. Nothing ever subscribes to it. With inert
timers a `CHECK` on the machine schedules nothing, and time-dependent state reduces to the
`highlightPending` boolean.

`applyEntry` dispatches `decodeAction(entry.a)` and then each of `entry.f` in order.

### 8.2 Action kinds and verbatim application

The kind of an `ActionDoc` is its `type`. The table is the encoder's schema, the
validator's schema, and the decoder, all in `sessionCodec.js` as one `KINDS` map of
`{ encode(action), validate(doc), decode(doc) }`. Fields not listed are not recorded.

| Kind | Document fields | Dispatched on the machine |
|---|---|---|
| `PUZZLE_LOADED` | `puzzle: PuzzleDoc` | Same type; `puzzle` decoded, `solveTrace: []` |
| `NEW_PUZZLE` | `difficulty: string`, `puzzle: PuzzleDoc` | Same |
| `SELECT_CELL` | `index: 0–80` | Same |
| `DESELECT`, `SELECT_FIRST_CELL`, `TOGGLE_MODE`, `ERASE`, `ERASE_ALL_PENCIL`, `UNDO`, `CHECK`, `ON_COMPLETION_EVALUATE`, `CLEAR_INCORRECT`, `RESET_PUZZLE`, `COACH_FOCUS_OFF` | — | Same |
| `ARROW_NAV` | `direction: string` | Same |
| `SET_MODE` | `mode: "pen" \| "pencil"` | Same |
| `PEN_ENTER` | `digit: 1–9`, `fromHint?: boolean` | Same |
| `PENCIL_TOGGLE` | `digit: 1–9` | Same |
| `HINT` | `hint?: null \| { cellIndex: 0–80, digit: 1–9, technique: string }` | `{ type: 'HINT', hint }` when the field is present — the recorded digit goes in the recorded cell; `{ type: 'HINT' }` when absent — the machine's provider returns `null` |
| `CHANGE_DIFFICULTY` | `difficulty: string` | Same. Reducer effect only (ends a coach session). The generation start that followed it live is in `then` |
| `RESTORE_SESSION` | `attemptRecorded?: boolean`, `hintsRemaining?: number \| "unlimited"` | Same, `"unlimited"` → `Infinity` |
| `DEV_SET_BOARD` | `pen: board string`, `pencil?: marks` | Same, typed arrays |
| `DEV_SET_PENCIL` | `index: 0–80`, `digits: number[]` | `{ index, mask }` |
| `DEV_FILL_PENCIL` | `pencil: marks` | `{ pencil: Uint16Array }` |
| `SET_GENERATING` | `flag: boolean`, `message?: string`, `difficulty?: string` | Same. State only; no generation exists on a machine |
| `GEN_PROGRESS` | `attempts: number`, `budget: number` | Same |
| `COACH_START` | `result`: a `CoachStep` deep copy, or `{ type: "no-technique", reason }` | Same, with the recorded result |
| `COACH_NO_TECHNIQUE` | `reason: string` | Same |
| `COACH_END` | `reason?: string` | Same |
| `COACH_FILL_RECAP` | `variant: "normal" \| "error" \| "elim"` | Same |
| `COACH_FOCUS_COACHED_CELL` | `index: 0–80` | Same |
| `PAGE_RELOADED` | `position: PositionDoc` | `DEV_RESTORE_POSITION` |
| `DEV_RESTORE_POSITION` | `position: PositionDoc` | Same |

A `CoachStep` validates when it has: `technique` string; `type` `"placement"` or
`"elimination"`; `digits` array; `roles` with `target` (index or null) and the arrays
`cause`, `elimTarget`, `unitMember`, `scA`, `scB`, `fin` (the renderer reads `fin` too); `eliminations` array of
`{ cellIndex, digit }`; `autoReveal` with `required` and `cells` of
`{ cellIndex, candidates }`; `supportingText` string; `complexity` object. These are the
fields the reducer and `coach.js` read. Other fields pass through untouched.

`PAGE_RELOADED` is never dispatched live: it is synthesised at boot (§6.5). An action
issued through `window.gameState` is recorded like any other when it matches a kind; one
that does not is unrecordable (§6.2, §16 D9).

### 8.3 `js/dev/replay.js`

```js
prepare(input, { stopAfter, checkPuzzles, current, upgraders })
  → Promise<{ ok: true, doc, n, total, notes } | { ok: false, message }>
run(doc, n, { makeMachine = createMachine } = {})
  → { position: InternalPosition, applied, entries, stopped, jobs, notes }
compare(jobs, { analyze, nextHint, yieldEvery = 12, pause })
  → Promise<{ divergences, notCompared, compared, counts }>
buildReport(parts) → Report
outcomeMessage(report) → { text: string, error: boolean }       // fspec §5.9
formatReportLines(report, formatTime) → structured lines for the panel   // fspec §5.8
```

**`prepare`** implements fspec §5.3 in its stated order:

1. Text: empty or only whitespace → reject; `JSON.parse` fails → reject. An object input
   is deep-copied.
2. `readDocument(value, { current, upgraders })` (§5.5): not a document; version. `current`
   and `upgraders` are passed straight through and default, inside `readDocument`, to the
   production values.
3. Validate `start` structurally. Validate every action structurally, remembering the
   first failure without rejecting yet.
4. Collect every distinct puzzle (keyed by `givens + solution`) from `start`, from every
   structurally valid `PUZZLE_LOADED`, `NEW_PUZZLE`, `PAGE_RELOADED`, and
   `DEV_RESTORE_POSITION`, and `await checkPuzzles(list)` — one worker round trip.
5. Report the first failure in fspec order: starting position (structure, then its
   puzzle); the lowest-numbered invalid action (structure or puzzle); the stop value; the
   end-with-no-puzzle rule; and, for anything thrown, "The session couldn't be checked."

   **Details.**

   | Failure | Detail |
   |---|---|
   | An action (or a follow-up in its `then`) whose `type` is not a kind of §8.2, or an entry with no `action` object | "it is not a recognised action" |
   | A known kind whose fields fail its schema; a bad `at`, `noChange`, or `then` | "its data is incomplete or invalid" |
   | The starting position's structure | "its data is incomplete or invalid" |
   | A puzzle that fails checking, fspec-006 reasons | `rejectionDetail(reason)` from `puzzleLoader.js` |
   | A puzzle whose recorded solution is not its solution | "The recorded solution is not the puzzle's solution." |

   The `solution-mismatch` sentence is a constant in `replay.js`; `puzzleLoader.js` has
   no text for that reason and gets none (§4.4).

   **Stop value.** `undefined`, `null`, or a string that is empty after trimming
   surrounding whitespace means all. A string is trimmed and must then match `/^\d+$/`. A
   number must be a non-negative integer. Anything else is rejected with "Stop after must
   be a whole number, 0 or greater." The panel field does not filter keystrokes.

   **End with no puzzle** is decided statically: among `start` and the first `n` actions,
   the last one that sets a puzzle sets `null`.

**`run`** creates a machine with `makeMachine(doc.start)` and, for each of the first `n`
actions: takes `snapshot(machine)`; calls `applyEntry` in a `try`; and only when that
returns, if the action is `COACH_START`, `COACH_NO_TECHNIQUE`, or a `HINT`, adds a compare
job holding the pre-action snapshot's `puzzle`, `pen`, `pencil`, `conflicts`, and
`selected`, the action, its number, and its `noChange` flag. An action that throws is
therefore never compared: comparison covers the actions applied (fspec §5.9). On a throw
`run` restores nothing — it returns the pre-action snapshot as `position`, with
`stopped: { at, message }` and `applied = at − 1`. A coach session present in `doc.start`
adds the fixed not-compared item of fspec §5.8. If the final state has `generating`, `run`
applies one extra `SET_GENERATING { flag: false }`, appends it to `entries`, and adds the
note "Replay ended during a puzzle generation; the busy state was cleared." The extra
entry is stamped with the time of the last applied action, or with `doc.exportedAt` when
no action was applied (`n = 0` on a generating start); both come from the document, so the
result stays deterministic. The extra entry keeps the replaced history
coherent with the live game, which would otherwise ignore actions the history says were
applied while generating.

### 8.4 Divergence comparison (feasibility question 5)

Runs on the main thread, time-sliced: jobs are processed until `yieldEvery` milliseconds
have been used, then `await pause()` (default `() => new Promise(r => setTimeout(r, 0))`).
Per job:

| Case, checked in this order | Result |
|---|---|
| Puzzle tier is `unrated` | Not compared: "hints and coach are unavailable on an Unrated puzzle" |
| Entry has `noChange` | Not compared: "the recorded action changed nothing" |
| Current code throws | Not compared: "the current code raised an error: *message*" |
| Otherwise | Compared; counted in `k` |

Coach: `analyze(puzzle, { pen, conflicts, pencil })`. Hint:
`nextHint(puzzle, { pen, conflicts }, { targetCell: selected })`. A `HINT` entry with no
`hint` field always carries `noChange`.

Coach parts, each compared by canonical (key-sorted) JSON equality:

| Part name | Value |
|---|---|
| `technique` | `step.technique`; for a no-technique answer, `"none (" + reason + ")"` |
| `type` | `step.type` |
| `rank` | `step.rank` |
| `digits` | `step.digits` |
| `unit` | `step.unit` |
| `placement` | `{ cell: roles.target, digit: digits[0] }` for a placement, else `null` |
| `eliminations` | `step.eliminations` sorted by cell, then digit |
| `roles` | `step.roles` |
| `arrows` | `step.arrows` |
| `text` | `{ supportingText, note: complexity.note }` |
| `complexity` | `{ acknowledged, endpoints }` |
| `autoReveal` | `step.autoReveal` |

When one side is a step and the other a no-technique answer, only `technique` is reported.
Hint parts: `cell`, `digit`, `technique`.

**Message text.** `replay.js` has one helper, `count(n, noun)`, that every count in the
status line and the report goes through: "1 action" / "2 actions", "1 error", "1
divergence", "1 computed result", "1 coach step", "1 hint". " *u* not compared." takes no
noun and is unchanged. The same helper is exported for the recorder counts line, the
confirmation dialog bodies, and the API messages that quote counts.

The divergence summary has four forms. With *k* the number compared and *u* the number
not compared:

| *k* | *u* | Report summary | Status line tail |
|---|---|---|---|
| > 0, none differ | any | "No divergences: all *k* computed results match the current code (…)." | "No divergences in *k* computed results." |
| > 0, *d* differ | any | "*d* of *k* computed results differ from the current code:" | "*d* divergences in *k* computed results." |
| 0 | 0 | "No computed results to compare: the replayed actions contain no coach steps or hints." | "No computed results to compare." |
| 0 | > 0 | "No computed results could be compared." | "No computed results could be compared." |

Each is followed by " *u* not compared." when *u* > 0, per fspec §5.9.

**Why the main thread.** Measured over full solution walks (Node 22, this machine):
`analyze` averages 0.4–2.0 ms and peaks at 55 ms (Nightmare); `nextHint` peaks at 54 ms.
A worker would need a new entry file, a second copy of the comparison protocol, and would
fall outside the coverage collector (worker code is covered only by direct import). The
worst single item blocks for well under 100 ms, and items are otherwise interleaved with
input. The same function serves the test helper with `pause` set to a resolved promise.

### 8.5 The 1-second bound

Steps 5–6 of fspec §5.2 are one synchronous block:

| Work for a 5,000-entry document | Cost |
|---|---|
| Decode and apply 5,000 actions on a machine | 34 ms measured for 5,000 mixed reducer actions |
| 5,000 pre-action snapshots (≈ 400 bytes of typed-array copies each) | ≈ 10 ms |
| `replaceHistory` (in-memory swap; the IndexedDB rewrite is asynchronous) | ≈ 5–20 ms clone |
| One `DEV_RESTORE_POSITION` and one full render | Same as a `PUZZLE_LOADED` render today |
| **Total** | **Well under 150 ms** |

Puzzle checking is before this block and off-thread (0.2–0.3 ms per puzzle measured for
uniqueness without rating). Comparison is after it.

## 9. Seed Plumbing and Seeded Generation

### 9.1 End to end

| Stage | Where | What |
|---|---|---|
| Chosen | `clientGenProvider.requestPuzzle` / `primeNext` | `randomSeed()` as today, or `opts.seed` for a seeded run |
| Carried to the worker | `makeGenRequest({ id, tier, seed, background, budget, seeded })` | `seeded` is a new boolean, default `false` |
| Used | `generator.worker.js` | `mulberry32(req.seed)`; passes `seeded: req.seeded` in the pipeline options |
| Stored with the puzzle | `pipeline.js` `finish()` | `gen: { requestedTier, seed: opts.seed, seedBy: opts.seeded ? 'developer' : 'random', budget, attempts, rejected, fallback }` |
| Returned | `GEN_RESULT` (structured clone) | Unchanged envelope plus `elapsedMs` |
| Saved game | `main.js` `_saveState` / restore | Already writes and reads `gen` whole — no change |
| Pre-generation cache | `clientGenProvider._saveToStorage` / `_loadFromStorage` | Already writes and reads `gen` whole — no change. A cached puzzle therefore shows the seed of the run that made it. `_loadFromStorage` runs on the provider's first use (any public method or worker message), not at construction, so a corrupt entry's `pregen.load` event reaches the developer log (revised 2026-11-26, open item §1.1) |
| Session document | `PuzzleDoc.gen` | §5.1 |
| Shown | `inspect.describeGeneration` | Two leading rows (§12.2) |
| Old data | A saved game or cached puzzle written before this change has `gen` without `seed` | `seed === undefined` → `PuzzleDoc.gen.seed = null` → "Not recorded", "—" |

No RNG call is added, removed, or reordered; the fixed-seed regression test in
`pipeline.test.js` continues to pin givens, solution, tier, trace, and `id`.

### 9.2 `clientGenProvider.requestPuzzle({ difficulty, signal, onProgress, seed, budget })`

When `seed !== undefined` the cache is bypassed in both directions: `peekReady` is not
consulted, nothing is removed from the cache, and because the request has a `pending`
entry its result is delivered to the caller and never cached. The request is posted with
`background: false`, `seeded: true`, and `budget` (normally `undefined`, so the worker uses
`ATTEMPT_BUDGET[tier]`). `budget` exists for §16 FC-1.

`createClientGenProvider` takes `{ createWorker }` (§4.4). Provider unit tests pass a fake
worker and drive `GEN_RESULT`, `GEN_PROGRESS`, `GEN_ERROR`, and `onerror` by hand.

### 9.3 Determinism (feasibility question 10)

- `generateForTier` draws randomness only from `opts.rng`. Its one clock read throttles
  progress posts and influences nothing else; the timing and number of progress updates
  are outside the promise (fspec §7.4).
- Budget exhaustion is as deterministic as success: the `best` candidate is chosen by a
  strict `>` on rank over a fixed attempt sequence. Verified by running the same tier,
  seed, and budget twice and comparing puzzle, `gen`, and `id` (§16.3).
- `id` is a hash of givens, solution, and seed, so it reproduces too.
- `seedBy` is `'developer'` for every seeded run. A seeded reproduction of a randomly
  generated puzzle therefore matches it in every field except "Seed chosen by" (§16 FC-4).
- The worker's `fallback` flag is `puzzle.difficulty !== req.tier`, a pure function of the
  result.

### 9.4 `js/game/foreground.js` — foreground generation, extracted

Decided by the Product Director on 2026-11-15. Everything `main.js` does today to request
a puzzle in the foreground moves into one always-loaded module that receives its
collaborators as parameters, so a unit test can drive it with a fake provider and a fake
dialog and reach every branch. This is what closes the coverage exception that the
honest-fallback dialog has carried since V3 (§14.3); integration tests through the real
worker cannot reach that dialog deterministically (§16.1 FC-1).

```js
/**
 * @param {object} deps
 * @param {{ dispatch: function }} deps.gameState
 * @param {function} deps.requestPuzzle      puzzleProvider.requestPuzzle
 * @param {function} deps.openDialog         ui/dialog.js open
 * @param {function(string): void} deps.announce
 * @param {{ read: function(): *, write: function(string): void }} deps.preference
 *        The saved tier preference (DIFF_KEY in main.js).
 * @param {{ emit: function }} deps.diagnostics
 * @param {function} [deps.logError]         Defaults to (...a) => console.error(...a).
 */
export function createForegroundGenerator(deps) → {
  request(difficulty, onLoaded, opts = REQUEST_DEFAULTS),
  abort(reason),                 // 'replaced' | 'cancelled'; no-op when idle
  cancel(),                      // the busy card's Cancel
  startNew(difficulty, afterLoad = () => {}),
  generateSeeded({ tier, seed, fallback, budget }),   // → Promise<SeededOutcome>
  chooseTier(tier),              // persist and remember the player's choice
  preferredTier(),               // → string
  generationTier(state),         // → string
}

const REQUEST_DEFAULTS = { seed: undefined, budget: undefined, fallback: 'ask',
                           onOutcome: () => {} };
```

The module imports `config.js` only (`TIER_LABELS`, `UNRATED`, `isRatedTier`). It reads no
DOM, no storage, and no global. `HONEST_FALLBACK_TIERS` moves here from `main.js`.

**State.** `_gen = { controller, onOutcome } | null` (replacing `_genAbort`) and
`_preferred`, initialised as `isRatedTier(preference.read()) ? that : 'easy'`.

**`request`**, in order:

1. `abort('replaced')`.
2. Create an `AbortController`; set `_gen`; dispatch `SET_GENERATING` true with the
   existing message and `difficulty`.
3. `requestPuzzle({ difficulty, signal, seed: opts.seed, budget: opts.budget, onProgress })`;
   `onProgress` dispatches `GEN_PROGRESS` only while this request is still `_gen`.
4. On resolve: return if superseded. Clear `_gen`. Then:

| Case | Behaviour |
|---|---|
| Not a fallback, or the requested tier is not an honest-fallback tier | `onLoaded(puzzle)`; `onOutcome({ status: 'loaded', puzzle, fallback })` |
| Honest fallback, `opts.fallback === 'ask'` (default; every UI path) | Dispatch `SET_GENERATING` false; `openDialog` with `onConfirm: accept` and `onCancel: () => onOutcome({ status: 'fallback-declined' })`. Title, body, and label as today, or the Unrated wording of §9.5. If `openDialog` throws: `logError`, emit `generation` `failed`, `onOutcome({ status: 'failed' })` (revised 2026-11-26, open item §1.2) |
| Honest fallback, `'accept'` (API `acceptFallback: true`) | `accept()` directly; no dialog |
| Honest fallback, `'refuse'` (API without the flag) | Dispatch `SET_GENERATING` false; `onOutcome({ status: 'needs-accept-fallback', puzzle })`; nothing loads |

   `accept()` is: unless the puzzle is Unrated, `chooseTier(puzzle.difficulty)`; then
   `onLoaded(puzzle)`; then `onOutcome({ status: 'loaded', puzzle, fallback: true })`.
   A throwing `chooseTier` is caught and emitted as `swallowed`
   (`foreground.chooseTier`); the puzzle still loads, and only the saved preference is
   lost. A throwing `onLoaded` ends the request as `failed` (revised 2026-11-26, open
   item §1.2).

5. On reject with `AbortError`: emit `swallowed` (`foreground.request`) and return; the
   outcome was already reported by `abort`.
6. On any other rejection: `logError('[main] Failed to generate puzzle:', err)` (the text
   is unchanged); and, only if this request is still `_gen`: clear it, dispatch
   `SET_GENERATING` false, emit the `generation` event `failed`, and
   `onOutcome({ status: 'failed' })`.

**`abort(reason)`**: when `_gen` is set — take it, clear it, abort its controller, call its
`onOutcome({ status: reason })`. **`cancel()`**: when `_gen` is set — `abort('cancelled')`,
dispatch `SET_GENERATING` false, `announce('Puzzle search cancelled.')`.

**`startNew(difficulty, afterLoad)`**: `request(difficulty, puzzle => { dispatch NEW_PUZZLE
{ difficulty: puzzle.difficulty, puzzle }; announce(…); afterLoad(puzzle); })`. The
announcement is "New puzzle started.", or the §9.5 sentence for an Unrated puzzle.

**`generateSeeded`** returns a promise resolved by `onOutcome`. Its `onLoaded` dispatches
`NEW_PUZZLE` and nothing else: it does not announce and does not move focus (the controller
announces, §11.4), and the saved game is cleared by `main.js`'s existing `NEW_PUZZLE`
persistence branch. It writes the preference only through `accept()`.

```js
SeededOutcome =
  | { status: 'loaded', puzzle, fallback: boolean }
  | { status: 'needs-accept-fallback', puzzle }
  | { status: 'fallback-declined' } | { status: 'cancelled' }
  | { status: 'replaced' } | { status: 'failed' }
```

**`chooseTier(tier)`**: `_preferred = tier`; `preference.write(tier)`. The in-memory
choice is set first, so it holds for the session even if the write throws.
**`generationTier(state)`**: the body of today's `_generationTier`.

**What stays in `main.js`.**

```js
const foreground = createForegroundGenerator({
  gameState,
  requestPuzzle: puzzleProvider.requestPuzzle,
  openDialog, announce, diagnostics,
  preference: { read: () => getItem(DIFF_KEY), write: tier => setItem(DIFF_KEY, tier) },
});
```

built directly after step 6. `main.js` keeps: the restore burst (using
`foreground.preferredTier()` where it read `preferredTier`); the boot request
`foreground.request(foreground.preferredTier(), puzzle => dispatch PUZZLE_LOADED)`; the New
Puzzle and Reset button handlers and `_isInProgress`; the `afterLoad` callback
(`removeItem(STATE_KEY)` and focusing the originating control); `mountBusy(…, { onCancel:
foreground.cancel })`; the persistence listener, whose `CHANGE_DIFFICULTY` branch becomes
`foreground.chooseTier(action.difficulty); foreground.startNew(action.difficulty, …)`;
`primeNext(foreground.generationTier(…))`; and the loader's `beforeReplace`. `main.js`
no longer contains `_requestForeground`, `_cancelForeground`, `_startNewPuzzle`'s body,
`_generationTier`, `preferredTier`, `_genAbort`, or `HONEST_FALLBACK_TIERS`.

**Phasing.** Phase 1B moves the code with no change in behaviour: `request` with the
`'ask'` policy only, `abort`, `cancel`, `startNew`, `chooseTier`, `preferredTier`,
`generationTier`, and the `onOutcome` plumbing (which nothing yet observes). Phase 2 adds
`seed`, `budget`, the `'accept'` and `'refuse'` policies, `generateSeeded`, and the Unrated
arms of §9.5. Two details differ from today's code and are deliberate: the dialog gains an
`onCancel` (it reports an outcome nobody listens to until Phase 2), and the swallowed-abort
event is renamed (§15, Phase 1 follow-ups).

**Unit tests (`foreground.test.js`).** Collaborators: a fake `requestPuzzle` returning a
deferred promise and recording its arguments, including the `signal`; a fake `openDialog`
that captures its options so the test can call `onConfirm` or `onCancel`; a recording
`gameState.dispatch`; an in-memory `preference`; spies for `announce` and `logError`; a
real `createEmitter()` as `diagnostics`.

| Branch | Reached by |
|---|---|
| Plain load; progress while current; progress after supersession ignored | Resolve `{ puzzle, fallback: false }`; call the captured `onProgress` before and after a second `request` |
| Silent fallback, Kiddie–Expert | Resolve `{ fallback: true }` for `easy`: no dialog, `onLoaded` called |
| Honest-fallback dialog, Play | Resolve `{ fallback: true }` for `nightmare`; assert title, body, label; call `onConfirm`; assert `preference.write`, `onLoaded`, outcome `loaded` |
| Honest-fallback dialog, declined | Same, call `onCancel`; assert nothing loaded, preference untouched, outcome `fallback-declined` |
| Unrated dialog; "Play Unrated" leaves the preference | Resolve a puzzle with `difficulty: 'unrated'` for `diabolical`; assert the fspec §7.5 body and label; `onConfirm`; assert no `preference.write` |
| Unrated announcement after New Puzzle | `startNew('expert')` resolving an Unrated fallback; assert the §7.5 announcement; and the ordinary announcement otherwise |
| `'accept'` and `'refuse'` | `generateSeeded` with each policy; rated and Unrated puzzles |
| Cancellation | `cancel()` while pending: signal aborted, `SET_GENERATING` false, announcement, outcome `cancelled`; `cancel()` when idle does nothing |
| Supersession | A second `request` while the first is pending: first outcome `replaced`; its late resolve and late reject are both ignored |
| `abort` when idle | No effect |
| Abort rejection | Reject with an `AbortError`: `swallowed` emitted, no dispatch |
| Generator failure, current | Reject with an `Error`: `logError`, `SET_GENERATING` false, `generation` `failed`, outcome `failed` |
| Generator failure, superseded | Reject the first request after a second has started: logged, nothing else |
| Preference | `preference.read()` returning a rated tier, `'unrated'`, and `null`; `chooseTier`; `generationTier` for generating, rated, Unrated, and no puzzle |
| Seed and budget forwarded | Assert the arguments the fake provider received |

`main.js` is left with wiring only, covered by the existing integration tests and the new
ones of §14.1.

### 9.5 Unsolvable fallback puzzle (fspec §7.5, rspec R16)

Added by the Orchestrator on 2026-11-15 after the Product Director approved the fix;
corrected in the amendment of the same date. It changes normal-mode behaviour and is
implemented in Phase 2. Every Unrated consumer in the app already keys on
`puzzle.difficulty === UNRATED` regardless of `source` (statistics gate and `COACH_START`
guard in `state.js`, `controls.js`, `numpad.js`, `coach.js`, `HINT_LIMITS.unrated`), and
`generationTier` already falls back to the preferred tier for an Unrated puzzle, so a
generated Unrated puzzle needs changes in three places only.

| File | Change |
|---|---|
| `js/generator/pipeline.js` | Import `UNRATED` from `config.js` (the worker already loads it through `loadPuzzle.js`). In the `if (!best)` branch: `const fallbackTier = result.solved ? tierForRank(result.hardestRank) : UNRATED;`. The trace passed to `toPuzzle` stays the partial trace. The non-degenerate return is unchanged: `best` is only ever a solved candidate |
| `js/providers/clientGenProvider.js` | In the background branch of `onmessage`: when `puzzle.difficulty === UNRATED`, do not `cache.set` and do not `_saveToStorage`; emit the `generation` event `discarded` with `requestedTier` and `seed`. Without this the puzzle would be stored under the key `unrated`, which nothing reads |
| `js/game/foreground.js` | In the `'ask'` case, when `puzzle.difficulty === UNRATED`: the title is unchanged; the body is "The generator couldn't find a *Tier* puzzle this time. The best it found can't be rated, so hints and coach are unavailable. Play it?"; `confirmLabel` is "Play Unrated". `accept()` skips `chooseTier` for an Unrated puzzle, on every policy, so the saved preference never becomes Unrated. `startNew` announces "New puzzle started. It could not be rated, so hints and coach are unavailable." for an Unrated puzzle |

The worker's `fallback` flag (`puzzle.difficulty !== req.tier`) is already true for an
Unrated result. `describeGeneration` already renders `TIER_LABELS[difficulty]`, so the
diagnostics show "Unrated" with no change. `devSession` builds the seeded status and the
API `needs-accept-fallback` message from fspec §7.5 when the delivered tier is Unrated.

**Tests.** `rate` is a static import of `pipeline.js` and cannot be stubbed, so the
degenerate path is reached with pinned seeds, found by a one-off seed search against the
current generator (not by the fidelity sweep, which replays sessions and never generates):

| Call | Result today | Result after the fix |
|---|---|---|
| `generateForTier('expert' \| 'diabolical' \| 'nightmare', { seed: 223 or 307, budget: 1 })` | Both attempts unsolvable; labelled `nightmare` | `difficulty === UNRATED`, `gen.fallback === true`, `gen.attempts === 2` |
| The same call with `budget: 0` and a seed whose single degenerate attempt solves | Real tier | Unchanged: real tier, `gen.fallback === true`, `gen.attempts === 1` |

These pins depend on the generator, like the existing fixed-seed test, and are re-pinned
if it changes. No Hard-tier seed hit the path in 400 tried, so the lower-tier case is
pinned on Expert.

- `clientGenProvider` (fake worker through `createWorker`): an Unrated background result
  leaves the cache and storage untouched and emits `discarded`.
- `foreground` (fake provider): the Unrated rows of the §9.4 table. These are unit tests
  and need no seed.
- Integration, real worker: `sudokuDev.generate('expert', 223, { budget: 1, replace: true })`
  loads silently as Unrated (selector shows Unrated, hints "–", saved preference
  unchanged); `sudokuDev.generate('nightmare', 223, { budget: 1 })` returns
  `needs-accept-fallback` with the §7.5 message, and with `acceptFallback: true` loads as
  Unrated and leaves the preference unchanged.

## 10. Logging and Error Capture

### 10.1 `js/dev/devLog.js`

```js
createDevLog({ out = console, storage = { getItem, setItem } })
  → { get(), set(category, on) → boolean /* changed */, on(event, fn),
      action(entry, changedParts, ms), dispose() }
```

`CATEGORIES = { generation: { tag: '[dev:gen]', label: 'Generation worker', def: true },
swallowed: { tag: '[dev:swallowed]', label: 'Swallowed exceptions', def: true },
actions: { tag: '[dev:action]', label: 'Action trace', def: false } }`. State is read once
from `sudoku.dev.logging.v1`, each missing or non-boolean key taking its default, and
written on every change. It emits `change` so the panel switch and the API stay in step.

| Source | Output when the category is on |
|---|---|
| `diagnostics.on('generation')` | `out.log('[dev:gen]', event, data)` |
| `diagnostics.on('swallowed')` | `out.warn('[dev:swallowed]', where, error)` |
| `recorder` at `end` (depth 0) | `out.log('[dev:action]', type, actionDoc, changedParts.length ? changedParts : 'no change', ms.toFixed(1) + ' ms')` |

`ms` is `clock()` at `end` minus `clock()` at `begin`, which spans the reducer and every
synchronous listener, i.e. all DOM updates. Follow-ups are in `actionDoc.then`.

Generation events:

| `event` | Emitted in | Data |
|---|---|---|
| `request` | `requestPuzzle`, `primeNext`, when a request is posted | `tier`, `seed`, `kind: 'foreground' \| 'background' \| 'seeded'` |
| `cache-hit` | `requestPuzzle`, cached branch | `tier`, `seed` (`puzzle.gen?.seed`) |
| `cache-miss` | `requestPuzzle`, uncached, unseeded | `tier` |
| `progress` | `GEN_PROGRESS` handler | `attempts`, `budget` |
| `result` | `GEN_RESULT` handler, foreground and background | `requestedTier`, `tier`, `seed`, `attempts`, `elapsedMs` |
| `fallback` | `GEN_RESULT` handler when `msg.fallback` | `requestedTier`, `tier`, `seed` |
| `cancelled` | The abort listener | `tier`, `reason` |
| `failed` | `GEN_ERROR`, `worker.onerror`; the `foreground.js` catch only after the puzzle was delivered, so a worker failure is logged once | `message` |
| `discarded` | Background `GEN_RESULT` with an Unrated puzzle (§9.5) | `requestedTier`, `seed` |

`elapsedMs` is measured in the worker around `generateForTier` and added to the
`GEN_RESULT` envelope, not to the puzzle, so it cannot disturb reproducibility.

### 10.2 Swallowed-exception sites (feasibility question 8)

Each `catch` binds its error and emits; nothing else in the block changes.

| `where` | Site |
|---|---|
| `storage.getItem`, `storage.setItem`, `storage.removeItem` | `persist/storage.js` |
| `clipboard.copyText` | `util/clipboard.js` |
| `statistics.save` | `game/statistics.js`, both `.catch` handlers |
| `cookieStatsStore.load`, `cookieStatsStore.save` | `providers/cookieStatsStore.js` |
| `pregen.load`, `pregen.save`, `pregen.clear` | `providers/clientGenProvider.js` |
| `puzzleLoader.rateGivens` | `game/puzzleLoader.js` |
| `foreground.request` | `game/foreground.js`, the `AbortError` branch. Phase 1 emits it from `main.js` as `main.requestForeground`; Phase 1B moves and renames it |
| `foreground.chooseTier` | `game/foreground.js`, `accept()`: a failed tier-preference write (added 2026-11-26, open item §1.2) |
| `recorder.open`, `recorder.write` | `dev/recorderStore.js` |
| `replay.prepare` | `dev/devSession.js`: an exception while checking a replay document (`prepare` returns `error`) |

The always-loaded code has thirteen silent sites, not ten: three in `storage.js`, one in
`clipboard.js`, two in `statistics.js` (sharing one name), two in `cookieStatsStore.js`,
three in `clientGenProvider.js`, one in `puzzleLoader.js`, and the `AbortError` branch.
Phase 1 instrumented all thirteen; `foreground.chooseTier`, added 2026-11-26, makes
fourteen. The two `recorder.*` sites and `replay.prepare` are dev-only and arrive in
Phase 4. The hook
is the `diagnostics` emitter of §4.1: no new file, no import cycle (`events.js` is a
leaf), nothing executed outside `catch` blocks.

### 10.3 Error capture (feasibility question 9)

Installed by `devBoot.boot()`:

| Source | Becomes |
|---|---|
| `window` `error` event | `{ kind: 'uncaught', message: e.message, stack: e.error?.stack ?? null, source: e.filename ? \`${e.filename}:${e.lineno}:${e.colno}\` : null, action: null }` |
| `window` `unhandledrejection` | `{ kind: 'rejection', message: String(e.reason?.message ?? e.reason), stack: e.reason?.stack ?? null, source: null, action: null }` |
| `diagnostics` `listener-error` | `{ kind: 'listener', message, stack, source: null, action: payload?.action?.type ?? null }` |

Neither window handler calls `preventDefault`, so the browser reports the error exactly as
before. `events.js` still logs and contains listener exceptions.

"Capturing never triggers further capture" is guaranteed by three independent layers:

1. `recorder.captureError` runs inside a re-entrancy flag and a `try / catch`; an error
   thrown while capturing is dropped, and a capture requested while one is in progress is
   dropped.
2. The tap's own `try / catch` (§6.2) routes a recorder failure to `captureError` once and
   never to the caller.
3. The `diagnostics` emitter does not report its own listeners' errors (§4.1), and store
   failures go only to `swallowed`.

Errors thrown before `devBoot.js` has loaded (a module that fails to import) are not
captured; nothing can be.

## 11. Controller and `window.sudokuDev`

### 11.1 `js/dev/devSession.js`

```js
createDevSession({ gameState, dev, loadPuzzle, confirm, generateSeeded,
                   beforeReplace, checkPuzzles, copy = copyText,
                   analyzeStep = analyze, hint = nextHint,
                   makeMachine = createMachine,          // passed to run()
                   pause, yieldEvery,                    // passed to compare()
                   current, upgraders })                 // passed to prepare()
```

The last five parameters are test seams with production defaults (the three for `compare`
and `prepare` default inside those functions). `devPanel.mount` passes none of them.

One instance, built in `devPanel.mount`, used by `recorderPanel.js`, the Generation
diagnostics wiring, and `devApi.js`. Every operation takes an `intent` describing how
confirmations are answered: `{ ask: true }` (panel: use `confirm`) or
`{ ask: false, replace, discardHistory, acceptFallback }` (API). Each returns a result
object `{ ok, reason?, message, … }`; the panel renders `message`, the API returns the
object. Mirroring is therefore structural: there is one implementation of each rule.

It emits `replay-status`, `replay-report`, `cleared`, and `cleared-fallback` events for
the panel. It emits nothing for `generate`: the panel that started a run renders that
run's result from the promise it awaited, so an API run never touches the panel's
Generate status line or focus.

**Announcements and focus.** The controller is the only place that announces an
operation's outcome; the panel never announces a controller result itself, so each outcome
is announced exactly once whichever caller started it. The controller never moves keyboard
focus except to restore it after the replay commit (§11.3). Focus moves that belong to a
panel control (returning to Generate, focusing the copy-fallback field) are made by the
panel, and therefore only for panel-initiated operations.

### 11.2 Operations

| Operation | Implementation |
|---|---|
| `state()` | `describeState(gameState.getState(), recorder.counts())` (below) |
| `load(text, intent)` | Non-string → `invalid-argument`. `loadPuzzle(text, intent.ask ? {} : { confirm: async () => intent.replace === true })`. `loaded` → ok with `tier`; `rejected` → `rejected`; `declined` → panel: declined; API: `needs-replace` with the declined message plus "Pass replace: true to replace a game with progress." |
| `inspect()` | No puzzle → `no-puzzle`. `runInspector(state.pen)`; `summary: summarize(r)`, `solved`, `unsolvedCells: r.remaining`, `hardestRank` and `tier` (`tierForRank`) or `null`, `steps` mapped to `{ number, technique, text, placement: { cell, digit } \| null, eliminations: [{ cell, digit }], pattern: [cell] }` with cell references. Touches no panel state |
| `coachStep()` | From `state.coachSession` |
| `candidates()` | No puzzle → `no-puzzle`. `initialCandidates(state.pen)` → 81 digit lists, empty for filled cells |
| `setPencilMarks(cell, digits)` | Checks in fspec §6.7 table order: `no-puzzle`, `game-won`, `busy`, `invalid-cell` (`/^r[1-9]c[1-9]$/`), `cell-filled`, `invalid-digits`. Then `dispatch({ type: 'DEV_SET_PENCIL', index, mask })`. Returns `cell`, `digits`, and `message: "Pencil marks set in *cell*."`. The message is announced when the marks changed; when they were already as requested the call still succeeds and returns the message, the dispatch is still made (and recorded as having changed nothing), and nothing is announced |
| `fillPencilMarks()` | First three checks. `pencil = initialCandidates(pen)`; `dispatch({ type: 'DEV_FILL_PENCIL', pencil })`. `cellsChanged` is the number of the 81 cells whose marks differ after the dispatch from before it, so marks reverted by ending a coach session count (fspec D-34). Returns `cellsChanged` and `message: "Pencil marks filled in *n* cells."` ("1 cell" for one), with *n* thousands-separated. Announced unless `cellsChanged` is 0 (fspec §6.7) |
| `exportSession()` | `recorder.exportDocument()` |
| `copySession()` | Panel only. `copy(JSON.stringify(doc, null, 2))` → status text per fspec §4.2 |
| `replay(input, { stopAfter }, intent, via)` | §11.3 |
| `clearHistory(intent)` | `busy` when applying. Counts > 0 and no consent → panel: dialog (§10.1.1 wording) / API: `needs-discard-history`. Then `recorder.clear()`, emit `cleared`, announce "History cleared." |
| `generate(tier, seed, intent)` | §11.4 |
| `logging()`, `setLogging(category, on)` | Category must be an own key of `CATEGORIES`; `on` must be `true` or `false` (checked second). `devLog.set`; announce only when it changed; message "*Label* logging on." / "… off." either way |

`describeState` (in `sessionCodec.js`, shared with the fixture helper) returns the fspec
§6.2 object. `hintsRemaining` is `null` when the puzzle is Unrated, `"unlimited"` for
`Infinity`. `conflicts` and `flaggedIncorrect` are ascending cell references. `text` is
eleven lines joined by `\n`: each board row as `d d d | d d d | d d d` with `.` for empty,
and the line `------+-------+------` after rows 3 and 6.

Every game-changing operation fails with `busy` ("A replay is running.") while the
controller's `applying` flag is set. Because applying is synchronous this is reachable
only re-entrantly, from a listener running during the commit dispatch; it is specified and
tested for that case (fspec §12, `clearHistory` during a replay).

### 11.3 Replay flow (feasibility question 3)

Phases: `checking` → `confirming` → `applying` → `comparing`.

| Arrival | Rule |
|---|---|
| API call, any replay in flight | `busy` |
| Panel, earlier panel replay in `checking` or `confirming` | The earlier one is superseded: its promise resolves with the declined result, its dialog (if open) is closed explicitly through the injected `closeDialog` (default `ui/dialog.js` `close`), counting as declined, rather than left to be replaced by a newer dialog that may never open, and from that moment it emits no status, no report, and no announcement. The status line and report belong to the newer run |
| Panel, earlier replay in `applying` or `comparing`, or an API replay in any phase | Waits for it to finish, then proceeds |

Each run holds a token. After every `await` it checks that the token is still current; if
not, it returns the declined result without emitting or announcing anything.

1. Status "Checking session…" (emitted; the panel shows it, unannounced).
   `await prepare(input, { stopAfter, checkPuzzles, current, upgraders })`. Rejected →
   emit an empty report, status as an error, announce, return `rejected`.
2. Evaluate `hasProgress(gameState.getState())` and `recorder.counts()` now. Panel:
   `await confirm({ title: 'Replay this session?', body, confirmLabel: 'Replay' })` when
   either holds. API: compute `missing`; non-empty → the `needs-*` result of fspec §6.8.
3. Synchronous block, `applying = true`:
   1. `beforeReplace()` — aborts any generation as `replaced`, closes any dialog.
   2. Emit an empty report and `cleared-fallback`.
   3. `const mark = recorder.mark()`; `const r = run(doc, n, { makeMachine })`.
   4. `recorder.replaceHistory(doc.start, r.entries)`.
   5. If `r.stopped`: `recorder.captureError({ kind: 'uncaught', … })`.
   6. Remember `document.activeElement`. Then
      `muted(() => recorder.silently(() => gameState.dispatch({ type:
      'DEV_RESTORE_POSITION', position: r.position })))`.
   7. `requestAnimationFrame`: if focus has moved, return it to the remembered element.
      This undoes the win banner's deferred focus move and keeps focus on Replay (panel)
      or wherever it was (API).
   8. `applying = false`.
4. Status "Comparing with current code…". `await compare(r.jobs, { analyze: analyzeStep,
   nextHint: hint, pause, yieldEvery })`. `r.jobs` holds applied actions only (§8.3), so a
   stopped replay compares everything before the failing action and not the action itself.
5. `buildReport` with `errors.recorded` = document errors whose `afterAction ≤ applied`,
   `errors.raised` = `recorder.errorsSince(mark)`. Emit report and status; announce
   `outcomeMessage(report).text`; resolve.

What runs, and when:

| Concern | During the burst | At the single commit |
|---|---|---|
| Reducer | Machine only | Live store, one action |
| Listeners and rendering | None — the machine has none | Every subscriber once, with the full key list |
| Real generation, saved tier preference | Impossible: `main.js` is not subscribed to the machine | `main.js` sees `DEV_RESTORE_POSITION`, which matches none of its special cases |
| Persisting the game | — | The existing debounced save (or removal, on a won board) |
| Statistics | Null object | Reducer records none for this action; dev mode suppresses them anyway |
| Dialogs | None | None |
| Announcements | None | Muted; the outcome is announced once, at step 5 |
| Recap timer | Inert | `coach.js` starts a fresh 2.5 s timer if the position is in a recap |
| Check-highlight timer | Inert | The reducer schedules a fresh one when `highlightPending` |
| Inspector, overlay, coach data, diagnostics tools | — | Their existing `changed` handling: the inspector goes stale and drops its applied step; the others re-render from state |
| Recording | — | Suppressed for the commit; the history was already replaced |

### 11.4 Seeded generation flow

`generate(tier, seed, intent)`:

1. Tier: API lower-cases and checks `DIFFICULTY_ORDER` → `invalid-tier`. Seed: a string is
   trimmed and must match `/^\d{1,10}$/` with value ≤ 4294967295; a number must be an
   integer in range → otherwise `invalid-seed`, "Seed must be a whole number from 0 to
   4294967295." Budget (API only, checked in `devApi.js`, §11.5).
2. Progress: panel → `confirm({ title: 'Generate from this seed?', body: 'Your current
   progress will be lost.', confirmLabel: 'Generate' })`, declined → "No puzzle generated.
   Your game continues."; API → `needs-replace`.
3. `await generateSeeded({ tier, seed, fallback: intent.ask ? 'ask' : intent.acceptFallback
   ? 'accept' : 'refuse', budget: intent.budget })`. `intent.onStart`, when given, is
   called just before; the panel uses it to show "Generating from seed *S*…".
4. Map the outcome:

| Outcome | Result and message |
|---|---|
| `loaded`, no fallback | ok; "Generated from seed *S*: *Tier* puzzle." |
| `loaded`, fallback | ok, `fallback: true`; "Generated from seed *S*: *ActualTier* puzzle. No *Tier* puzzle was found within the budget." *ActualTier* is "Unrated" for the §9.5 case |
| `needs-accept-fallback` | `needs-accept-fallback`, fspec §6.9 message; the fspec §7.5 message when the puzzle is Unrated |
| `fallback-declined` | Panel: "No puzzle generated. Your game continues." (API cannot reach this) |
| `cancelled` | `cancelled`; "Generation cancelled." |
| `replaced` | `cancelled`; "Generation replaced by another request." |
| `failed` | `failed`; "The puzzle couldn't be generated." |

**Announcing.** One rule for both callers, applied in the controller: every outcome of a
run that started (every row of the table) is announced once, with its message. Results
returned before a run starts are announced for the panel only (seed validation error; the
declined progress confirmation) and never for the API (`invalid-*`, `needs-replace`),
which changed nothing. `foreground.generateSeeded` does not announce, so "New puzzle
started." is never heard alongside the seeded message.

**Focus.** The controller moves none. `devPanel.js` focuses `#dev-gen-run` after its own
awaited `generate` call resolves, whatever the outcome; an API run leaves focus alone.

**API `diagnostics`.** Built by a new pure function in `inspect.js`, which
`describeGeneration` also uses for its rows so the panel table and the API cannot drift:

```js
generationDiagnostics(puzzle, getTrace) → {
  seed: number | null,
  seedBy: 'random' | 'developer' | null,
  requestedTier: string,
  tier: string,                         // achieved: puzzle.difficulty, 'unrated' included
  fallback: boolean,
  attempts: number, budget: number,
  rejected: { unsolved: number, wrongTier: number, byTier: { [tier]: number } },
  techniqueProfile: Array<{ technique: string, count: number }>,
}
```

These are the fields of fspec-005 §8 (requested tier, achieved tier, fallback, attempts,
both rejection counts, technique profile) plus the two seed rows. It is returned for
`loaded` and for `needs-accept-fallback`. It is never raw `puzzle.gen`.

### 11.5 `js/dev/devApi.js`

`install(session) → void` assigns `window.sudokuDev`, a frozen object whose methods call
the controller with `{ ask: false, … }` and `via: 'api'`. Each method body is wrapped so
that an unexpected exception becomes `{ ok: false, reason: 'failed', message }`; none
throws or rejects. `replay` passes `input` as given (object or text). `generate` validates
`budget` after tier and seed: when given and not a positive integer it returns
`{ ok: false, reason: 'invalid-budget', message: 'Budget must be a whole number of 1 or more.' }`
(fspec §6.9); otherwise it forwards it (§16 FC-1). No method moves keyboard focus.

## 12. Panel Markup and CSS

### 12.1 Session recorder — `recorderPanel.js`

```js
mount(panel: HTMLElement, { session, recorder, log })
```

The panel root itself carries `data-keep-selection` (set in `devPanel.mount`, fspec D-35 e),
so no control anywhere in the panel triggers the grid's outside-click `DESELECT`; without
it, using the panel would record deselects, a cleared history would not stay empty, and a
replay straight after Clear history would always ask. The per-element
`data-keep-selection` attributes on Clear history, Replay, Restore board and the step list
predate the root attribute and are now redundant; they are harmless and may be removed.

Appended to the panel markup after `#dev-gen`:

```html
<details class="dev-tool" id="dev-rec">
  <summary>Session recorder</summary>
  <div class="dev-tool-body">

    <section class="dev-group" aria-labelledby="dev-rec-history-title">
      <h3 class="dev-group-title" id="dev-rec-history-title">History</h3>
      <p class="dev-counts" id="dev-rec-counts"></p>
      <p class="dev-callout" id="dev-rec-storage" role="status"></p>
      <div class="dev-buttons">
        <button type="button" class="btn" id="dev-rec-copy"
                aria-label="Copy session document">Copy session</button>
        <button type="button" class="btn dev-btn-danger dev-btn-end"
                id="dev-rec-clear">Clear history</button>
      </div>
      <p class="dev-status" id="dev-rec-history-status" role="status"></p>
      <div class="dev-field" id="dev-rec-fallback" hidden>
        <label for="dev-rec-fallback-text">Session document</label>
        <textarea class="dev-textarea" id="dev-rec-fallback-text" rows="6" readonly
                  spellcheck="false" autocomplete="off"></textarea>
      </div>
    </section>

    <section class="dev-group" aria-labelledby="dev-rec-log-title">
      <h3 class="dev-group-title" id="dev-rec-log-title">Console logging</h3>
      <div class="dev-switches">
        <button type="button" class="dev-switch" id="dev-log-generation" role="switch" aria-checked="true">
          <span class="dev-switch-track" aria-hidden="true"><span class="dev-switch-thumb"></span></span>
          <span>Log generation worker</span>
          <span class="dev-switch-tag" aria-hidden="true">[dev:gen]</span>
        </button>
        <!-- #dev-log-swallowed "Log swallowed exceptions" [dev:swallowed] -->
        <!-- #dev-log-actions   "Log action trace"         [dev:action]    -->
      </div>
    </section>

    <section class="dev-group" aria-labelledby="dev-rec-replay-title">
      <h3 class="dev-group-title" id="dev-rec-replay-title">Replay</h3>
      <div class="dev-field">
        <label for="dev-rec-doc">Session document to replay</label>
        <textarea class="dev-textarea" id="dev-rec-doc" rows="4" spellcheck="false"
                  autocomplete="off" placeholder="Paste a session document (JSON)"></textarea>
      </div>
      <div class="dev-inline">
        <div class="dev-field">
          <label for="dev-rec-stop">Stop after action</label>
          <input class="dev-input" id="dev-rec-stop" type="text" inputmode="numeric"
                 pattern="[0-9]*" spellcheck="false" autocomplete="off"
                 aria-describedby="dev-rec-stop-hint">
        </div>
        <button type="button" class="btn" id="dev-rec-replay">Replay</button>
      </div>
      <p class="dev-field-hint" id="dev-rec-stop-hint">Optional. Leave empty to replay every action.</p>
      <p class="dev-status" id="dev-rec-replay-status" role="status"></p>
      <div class="dev-report" id="dev-rec-report" role="region"
           aria-label="Replay report" tabindex="0"></div>
    </section>

  </div>
</details>
```

Report contents, built from `formatReportLines` into `#dev-rec-report` (emptied with
`replaceChildren()` so `:empty` hides it):

```html
<p class="dev-report-scope">…</p>
<p class="dev-report-summary">…</p>
<ul>
  <li class="dev-diverge">
    <details>
      <summary>Action 41 — coach step at 14:01:12.150: technique — recorded X, current Y.
        <span class="dev-report-also">Also differs: roles, arrows.</span></summary>
      <div class="dev-compare">
        <div class="dev-compare-label">Recorded</div>
        <pre class="dev-json" tabindex="0" role="region" aria-label="Recorded values"></pre>
        <div class="dev-compare-label">Current</div>
        <pre class="dev-json" tabindex="0" role="region" aria-label="Current values"></pre>
      </div>
    </details>
  </li>
</ul>
<h4>Not compared</h4>
<ul><li>…</li></ul>
<p class="dev-report-errors">Errors: …</p>
<ul><li class="dev-error-item">…</li></ul>
```

A hint divergence with several differing parts is one `<li>` holding one full sentence
per part (`divergenceText`), not one item per part.

Each `<pre>` holds `JSON.stringify` (2-space) of an object keyed by the differing part
names. Divergence time is formatted with `Date` local getters, zero-padded.

Wiring:

- **Counts**: on recorder `change`, coalesced with `requestAnimationFrame` so a burst of
  progress entries costs one text update per frame. Numbers get an en-US thousands
  separator from `count()` (§8.4), which also supplies the nouns: "1 action, 1 error
  recorded." The capacity sentence is a `<span class="dev-capacity">`.
- **Storage line**: on recorder `storage`; text set in place, announced when it changes to
  a non-empty message. A message already in force when the panel mounts is announced once
  at mount (fspec D-35 d).
- **Copy session**: on failure unhide `#dev-rec-fallback`, set the text, `focus()`,
  `select()`, `scrollTop = 0`. Hidden again by the next Copy session, by `cleared`, and by
  `cleared-fallback`.
- **Replay**: `session.replay(doc.value, { stopAfter: stop.value }, { ask: true },
  'panel')`. The stop value is passed as typed; trimming and the digits-only rule are in
  `prepare` (§8.3). The field is `inputmode="numeric"` and does not filter keystrokes. Status and report arrive through controller events, so an API replay fills
  the same elements.
- **Clear history**: `session.clearHistory({ ask: true })`; writes "History cleared." or
  "History not cleared." to `#dev-rec-history-status`. The API path emits `cleared`
  without a status message, so the status line is untouched (fspec §6.10).
- **Switches**: click → `session.setLogging`. `aria-checked` is set from `log` `change`
  events only, which also covers API changes.

Status elements are never removed or re-created.

### 12.2 Generation diagnostics — `devPanel.js`, `inspect.js`

`describeGeneration` returns `seed: number | null` alongside `rows`, and prepends:
`['Seed', seed === null ? 'Not recorded' : String(seed)]` and `['Seed chosen by',
seedBy === 'developer' ? 'Developer (seeded run)' : seedBy === 'random' ? 'Generator
(random)' : '—']`.

`#dev-gen-body` becomes three permanent children; only the first is re-rendered:

```html
<div id="dev-gen-info"><!-- table.dev-table, or p.dev-status message --></div>
<p class="dev-status" id="dev-gen-copy-status" role="status"></p>
<section class="dev-group" aria-labelledby="dev-gen-seeded-title">
  <h3 class="dev-group-title" id="dev-gen-seeded-title">Generate from seed</h3>
  <div class="dev-inline">
    <div class="dev-field">
      <label for="dev-gen-tier">Tier</label>
      <select class="dev-select" id="dev-gen-tier"><!-- seven tiers --></select>
    </div>
    <div class="dev-field dev-field-seed">
      <label for="dev-gen-seed">Seed</label>
      <input class="dev-input" id="dev-gen-seed" type="text" inputmode="numeric"
             spellcheck="false" autocomplete="off">
    </div>
    <button type="button" class="btn" id="dev-gen-run"
            aria-label="Generate from seed">Generate</button>
  </div>
  <p class="dev-status" id="dev-gen-status" role="status"></p>
</section>
```

The Seed row's value cell is `<span id="dev-gen-seed-value">…</span><button type="button"
class="btn dev-btn-sm" id="dev-gen-copy" aria-label="Copy seed">Copy seed</button>`,
`disabled` when the seed is `null`. The tier select is initialised from
`getGenerationTier()` at mount. On a seed validation error the input gets
`aria-invalid="true"` and `aria-describedby="dev-gen-status"`; its `input` event removes
both. When a run the panel started ends, by any outcome, the panel focuses `#dev-gen-run`;
it does so after its own awaited `session.generate(…)` call, never in response to a
controller event, so a run started through the API moves no focus (fspec §6.1). The panel
writes the returned `message` to `#dev-gen-status` and does not announce it; the
controller already has (§11.4).

### 12.3 `css/dev.css`

Add, exactly as vspec-007 §3–§5 and §9–§10 specify: `.dev-group`, `.dev-group-title`,
`.dev-field`, `.dev-field-hint`, `.dev-field-seed`, `.dev-input`, `.dev-textarea`,
`.dev-inline`, `.dev-select`, `.dev-buttons .btn.dev-btn-danger` (and `:hover`),
`.dev-btn-end`, `.btn.dev-btn-sm`, `.dev-callout`, `.dev-counts`, `.dev-capacity`,
`.dev-switches`, `.dev-switch-tag`, `.dev-report` and its parts, `.dev-diverge`,
`.dev-error-item`, `.dev-report-also`, `.dev-compare`, `.dev-compare-label`, the
`main.dev-host .dev-report` rule inside the existing 1400px query, the Terminal radius
additions, the per-theme select arrows, and `.dev-panel [hidden] { display: none; }`.
No other stylesheet changes.

### 12.4 `devPanel.mount`

Becomes `async`. Its first statement is `await deps.dev.recorder.ready`; the rest runs as
today, then builds the controller, mounts `recorderPanel`, wires Generation diagnostics,
and calls `devApi.install(session)` last, so the API appears with the panel (fspec §6.1).
The existing tests' `mount` calls gain an `await` and a `dev` stub.

## 13. Regression Fixtures

`js/tests/helpers/replayFixture.js`:

```js
/**
 * Replay a session document against the current code.
 * @param {object|string} document
 * @param {{ stopAfter?: number|string, makeMachine?: function,
 *           current?: number, upgraders?: object }} [opts]
 *   The last three are for the helper's own tests: `makeMachine` reaches the
 *   stopped outcome, `current` / `upgraders` the format-upgrade note.
 * @returns {Promise<{ state: object, report: Report, applied: number, total: number }>}
 * @throws {Error} With the fspec §5.9 rejection message when the document is rejected.
 */
export async function replayFixture(document, { stopAfter, makeMachine, current, upgraders } = {})

/** Fetch a fixture from js/tests/fixtures/sessions/. */
export async function loadSessionFixture(name)
```

It calls the same functions as the app: `prepare` with `checkPuzzles` bound to the
synchronous `checkGivens` (same rules as the worker, no worker); `run`; `compare` with the
real `analyze` and `nextHint` and `pause: () => Promise.resolve()`; `buildReport`. `state`
is `describeState(machineStateOf(run.position), { actions: applied, errors: 0, capacity:
RECORDER_CAPACITY })`. A stopped replay resolves normally with `report.stopped` set and
`state` at the position reached. `makeMachine` is forwarded to `run`, and `current` /
`upgraders` to `prepare`; fixture tests pass none of them.

It is deterministic by construction: the machine has an inert clock and timers; recorded
times are carried, never read; nothing touches `localStorage`, IndexedDB, the DOM, a
dialog, statistics, or the generator. It never dispatches to a live store.

Fixtures are `.json` files under `js/tests/fixtures/sessions/`, served by the existing
test server and fetched as text. Tests that use them live in
`js/tests/unit/session-fixtures.test.js`. To add one: copy a session from the panel, save
it under that directory, and assert on `state.text`, `state.pencilMarks`, and
`report.divergences`.

## 14. Test Plan Inputs

### 14.1 Unit versus integration

| Behaviour | Level |
|---|---|
| Codec: encode / decode of every kind, position round trip, fingerprint parts, `describeState`, document validation, each rejection | Unit (`sessionCodec.test.js`) |
| Machine and `applyEntry` for every kind; inert timers | Unit (`machine.test.js`) |
| Recorder: depth rule, follow-ups, `nc`, informational actions, capacity and start advance, error dedup, boot merge for each `open` result, `silently`, export | Unit (`recorder.test.js`) with a fake store and a real `createGameState` |
| Store: load, claim, append, trim, coalescing, failure and recovery, discard, lost ownership, version change, timeout | Unit (`recorderStore.test.js`) against real IndexedDB with a per-test database name, plus fakes for failure |
| Logging switches, persistence, console output per category | Unit (`devLog.test.js`) with an injected `out` |
| `prepare`, `run`, `compare`, `buildReport`, message text | Unit (`replay.test.js`) |
| Controller: every result row of fspec §6, intent handling, replay phases, busy | Unit (`devSession.test.js`) with fake `generateSeeded`, `confirm`, `checkPuzzles`, `copy` |
| API surface: every method returns an object, never throws | Unit (`devApi.test.js`) |
| Panel: DOM, ARIA, status lines, fallback field, report rendering, switches following the log | Unit (`recorderPanel.test.js`, extended `devPanel.test.js`) |
| Reducer: tap split, timers, `HINT.hint`, three new actions | Unit (extended `state.test.js`, new `state-devtools.test.js`) |
| `events.js` diagnostics; each swallowed site emits | Unit (extended existing files) |
| Pipeline `gen.seed` / `seedBy`; provider `seed` bypasses the cache; protocol; `checkGivens` | Unit (extended existing files) |
| Foreground generation: every branch of §9.4, including the honest-fallback and Unrated dialogs, decline, cancel, supersession, and failure | Unit (`foreground.test.js`) with a fake provider and dialog |
| Dev-off guarantee; recording across a real reload; replay end to end including persistence of the replayed game; seeded generation with the busy card and Cancel, and the API fallback flags through the real worker; ownership across two iframes; a11y of the new controls; performance | Integration (`debug.test.js`, extended `a11y.test.js`, `perf.test.js`) |

### 14.2 Required property tests

- **Fidelity sweep.** A seeded pseudo-random driver issues a few thousand mixed actions
  (all recordable kinds, including coach starts with real analyzer results and hints)
  against a real store with the real `coach.js` listener mounted. At intervals:
  export, replay through `replayFixture`, and assert the resulting `state` equals
  `describeState` of the live game, and that the report has no divergences. This is the
  test that guards the follow-up ordering rule of §6.2 and the position round trip, in
  the spirit of the solver soundness sweep. Run it once with capacity 50 so the starting
  position advances hundreds of times. The sweep uses fixed puzzles and never generates;
  it is not a source of generator seeds.
- **Seed reproducibility.** For each tier, one seed generated twice gives deep-equal
  puzzles and `gen`. Include `('easy', 26, budget 30)`, which exhausts its budget and
  falls back to Hard in ≈ 240 ms (30 was Easy's real budget until 2026-11-21, when it
  rose to 60 and no practical seed exhausts it) (measured against the current generator; if a generator
  change invalidates it the test must be re-pinned, as with the existing fixed-seed
  test), and `('nightmare', 1, budget 3)`, which falls back to Easy.

### 14.3 Reaching 100% branch coverage in the hard places

| Path | How it is reached |
|---|---|
| Storage unavailable at load | `createRecorderStore({ idb: undefined })`; and a fake `idb` whose `open` fires `onerror`. Every store test passes its own `dbName` |
| Open timeout | Fake `idb` whose request never settles, `openTimeoutMs: 10` |
| Write failure and recovery | Fake transaction that fires `onabort` with a `QuotaExceededError` once, then succeeds; assert status `failing` → `ok` and a full rewrite |
| Unreadable saved history | Pre-seed the real database with `meta.form: 99`; with a malformed entry; and open a database created at version 2 for the `VersionError` branch |
| Multi-tab ownership | Two store instances with different `ownerId` on one database in one page: the second `open` takes over; the first's next `write` yields `lost` and adds nothing. One integration test with two iframes confirms the storage line |
| `onversionchange` | Call `indexedDB.deleteDatabase` while a store is open |
| Format upgrade loop and its note | `readDocument(doc, { current: 2, upgraders: { 1: fake } })`; and the same two options through `prepare`, `replayFixture`, and `createDevSession`, asserting the note in the report and the status line |
| Worker failure | `foreground.test.js`: the fake provider rejects with an `Error`, both while current and after supersession. Provider: a fake worker through `createWorker` posts `GEN_ERROR` and fires `onerror`. Controller: `generateSeeded` resolving `{ status: 'failed' }` |
| Honest fallback: the dialog, Play, and decline; the Unrated dialog and "Play Unrated"; the Unrated New Puzzle announcement | `foreground.test.js` with a fake provider and a captured dialog (§9.4). This closes the coverage exception the fallback block has carried since V3: the code is no longer in `main.js`, and every arm is reached without the real generator |
| Honest fallback: `'accept'` / `'refuse'` end to end | Also integration: `sudokuDev.generate('nightmare', 1, { budget: 3 })` with and without `acceptFallback`; and the pinned Unrated seeds of §9.5 |
| Cancelled and replaced runs | `foreground.test.js` (deferred fake provider). One integration test each for the busy card's Cancel and for New Puzzle over a real Nightmare seeded run |
| `busy` | Unit: a `changed` listener calls `clearHistory` during the commit dispatch |
| Tap failure isolation | Recorder unit tests in which an injected collaborator throws: `now` (inside `begin`), `log.action` and `store.write` (inside `end`). Assert one error entry and an unaffected dispatch. The codec is a static import and is not stubbed |
| Capture re-entrancy | `captureError` invoked from inside a store callback that itself throws |
| Unrecordable action | Dispatch `{ type: 'NOPE' }` and a `PEN_ENTER` with a non-digit |
| Compare: current code throws | Injected `analyze` that throws |
| Comparison yielding | Injected `pause` spy with `yieldEvery: 0` |
| Clipboard failure | Injected `copy` resolving `false` |
| Replay stopped by an error | Validation is meant to make this unreachable from a document alone, so the tests inject a machine factory whose `dispatch` throws at a chosen action: `run(doc, n, { makeMachine })`, `replayFixture(doc, { makeMachine })`, and `createDevSession({ …, makeMachine })` for the API's `reason: 'stopped'`. Each asserts the failing action is absent from the comparison |
| `devMode.js` `deleteDatabase` throwing | Stub `indexedDB` with a throwing `deleteDatabase` for one test |
| Worker-side changes | Not collected by the page coverage tool (existing policy); `checkGivens`, the pipeline, and protocol helpers are covered by direct import |

The seams these rows rely on are listed together in §14.6.

### 14.4 Arch tests

- **AR-D1** (done, Phase 1): the pattern rejects any static import from `/dev/` other than
  `devMode.js`. Its file list is hand-maintained; Phase 1B adds `game/foreground.js`. It
  may instead reuse AR-D5's crawl, which would make the list self-maintaining.
- **AR-D2** stays as written (the step-12 form is preserved).
- **AR-D3** (done): gains `sudokuDev`, `dev-rec`, `devBoot`.
- **AR-D4** (Phase 4, with the code it checks): `main.js` contains
  `devMode ? (await import('./dev/devBoot.js'))`.
- **AR-D5** (done): no always-loaded module mentions `indexedDB`. Implemented as a crawl of
  the import graph from `main.js` and `generator.worker.js`, following static and dynamic
  imports and skipping `js/dev/` and `js/tests/`, because the test server has no directory
  listing. `devMode.js` is exempt by being under `js/dev/`. This is the specified form.
- **AR-D6** (Phase 1B): `game/foreground.js` imports nothing but `config.js`, and contains
  none of `document`, `window`, `localStorage` (its one global is the `console.error`
  default of `logError`).

### 14.5 Performance checks

| Check | Bound |
|---|---|
| Digit entry with all three logging switches on and the history at capacity | < 1 s (expected: a few ms) |
| Replay of a 5,000-action document, steps 5–6 | < 1 s (expected: < 150 ms) |
| Recorder overhead per action at capacity (tap + fingerprints + trim) | Report only; expected < 0.1 ms |

### 14.6 Test seams

Every seam is an optional parameter with a production default. None adds a module, a
branch on the action path, or any cost with developer mode off; the two in always-loaded
files replace a hard-coded constructor with a defaulted parameter.

| Seam | Signature | Default | Used for |
|---|---|---|---|
| Store database name | `createRecorderStore({ dbName })` | `RECORDER_DB` | A database per test |
| Store close | `store.close()` | — | `devBoot.dispose`; lets a test delete its database without waiting |
| Dev boot dependencies | `boot({ win, idb, dbName, storage, out, now, fresh, capacity })` | `window`, `indexedDB`, `RECORDER_DB`, `storage.js`, `console`, `Date.now`, `isFreshDevSession()`, `RECORDER_CAPACITY` | Unit tests of error capture and the boot merge |
| Dev boot teardown | `boot(…).dispose()` | — | Removes window listeners and diagnostics subscriptions |
| Generation worker | `createClientGenProvider({ createWorker })` | `new Worker(WORKER_URL, { type: 'module' })` | Driving results, errors, and background Unrated results by hand |
| Load worker | `createLoadProvider({ createWorker })` | Exists today | `CHECK_RESULT` handling |
| Foreground collaborators | `createForegroundGenerator({ gameState, requestPuzzle, openDialog, announce, preference, diagnostics, logError })` | Supplied by `main.js` | §9.4 |
| Format version | `prepare(input, { current, upgraders })`, `replayFixture(doc, { current, upgraders })`, `createDevSession({ current, upgraders })` | `FORMAT_VERSION`, `UPGRADERS` (inside `readDocument`) | The upgrade note end to end |
| Machine factory | `run(doc, n, { makeMachine })`, `replayFixture(doc, { makeMachine })`, `createDevSession({ makeMachine })` | `createMachine` | The stopped outcome at every level |
| Comparison pacing | `compare(jobs, { pause, yieldEvery })`, `createDevSession({ pause, yieldEvery })` | A zero-delay timeout; 12 ms | Holding a replay in `comparing` while another arrives |
| Recorder collaborators | `createRecorder({ store, log, now, clock, capacity })` | As §6.1 | Tap failure isolation: each can be made to throw |
| Log output | `createDevLog({ out, storage })` | `console`, `storage.js` | Asserting console lines |

## 15. Implementation Sequence

Each phase ends with the full suite passing and coverage at 100% for the files it touches.

| # | Phase | Content | Size |
|---|---|---|---|
| 1 | Seams — **done** | §4.1, §4.2, §4.4 except `devMode.js`, `checkGivens`, and the `createWorker` parameter; swallowed emits (§10.2); arch tests AR-D1, AR-D3, AR-D5. No behaviour change with the tap null | M |
| 1B | Foreground extraction | `game/foreground.js` with `request` (`'ask'` only), `abort`, `cancel`, `startNew`, `chooseTier`, `preferredTier`, `generationTier`, and the `onOutcome` plumbing; `main.js` reduced to wiring (§9.4); `foreground.test.js`; AR-D1 list, AR-D6. Behaviour-preserving in every mode: same dispatches, dialog text, announcements, console output, and preference writes | M |
| 2 | Seed plumbing | §9.5 (Unrated fallback, fspec §7.5) in the pipeline, the provider, and `foreground.js`; §9.1–9.3: pipeline, protocol, worker, provider `seed` / `budget` / `createWorker` and generation diagnostics events; `foreground.js` `seed`, `budget`, `'accept'` / `'refuse'`, `generateSeeded`; `checkGivens`, `CHECK_REQUEST`, `loadProvider.checkPuzzles`; `generationDiagnostics` and the `describeGeneration` seed rows | M |
| 3 | Codec and machine | `sessionCodec.js`, `machine.js`; position round-trip property | L |
| 4 | Recording | `recorderStore.js`, `recorder.js`, `devLog.js`, `devBoot.js`; `main.js` steps 1.5, 5, 6, 7; `devMode.js` purge and fresh flag; AR-D4. The app now records and persists, with no UI | L |
| 5 | Replay engine and fixtures | `replay.js` (including the `solution-mismatch` wording and `count()`); `replayFixture.js`; first fixtures including `format-v1-baseline.json`; fidelity sweep | L |
| 6 | Controller and API | `devSession.js`; `devApi.js`; `devPanel.mount` async with the API installed; step 12 passes `foreground.generateSeeded` | L |
| 7 | Panel | `recorderPanel.js`; Generation diagnostics additions; `dev.css` | M |
| 8 | End to end | Integration, a11y, and performance tests; README section on session documents and fixtures | M |

Phase 1B needs only Phase 1 and must land before Phase 2, whose seeded and Unrated work
is written against the extracted module. 3 needs 1. 4 needs 3. 5 needs 3. 6 needs 2, 4,
and 5. 7 needs 6. Phases 1B–2 and 3 can proceed in parallel. Phase numbers 2–8 are
unchanged, so the tspec's phase references still hold; 1B is the only insertion.

**Follow-up changes to code Phase 1 already wrote.**

| Phase | File | Change |
|---|---|---|
| 1B | `js/main.js` | The `AbortError` branch that Phase 1 instrumented moves to `game/foreground.js` with the rest of `_requestForeground`; its `swallowed` event is renamed from `main.requestForeground` to `foreground.request`. `main.js` drops its `diagnostics` use in that branch but still imports `diagnostics` to pass it in |
| 1B | `js/tests/unit/arch.test.js` | AR-D1's file list gains `/js/game/foreground.js`; AR-D6 added |
| 1B | The Phase 1 test that asserts the `main.requestForeground` event | Asserts `foreground.request`, and moves to `foreground.test.js` |
| 2 | `js/generator/loadPuzzle.js` | Adds `checkGivens` beside the `validateGivens` Phase 1 wrote. No change to existing functions |
| 2 | `js/providers/clientGenProvider.js` | Adds the `createWorker` parameter. The three `pregen.*` emits Phase 1 wrote are untouched |

Nothing else from Phase 1 changes: the `InternalPosition` shape, the aliasing rule in
`DEV_RESTORE_POSITION`, `muted`, `rejectionDetail`, the `coach.js` listener, and the
emitter are confirmed as implemented.

## 16. Feasibility and Decisions

### 16.1 Feasibility concerns for the Orchestrator

| # | Requirement | Problem | Proposed alternative | Specified meanwhile |
|---|---|---|---|---|
| FC-1 | rspec-007 §5: with a chosen seed, the honest-fallback path "can be exercised deterministically"; fspec §7.2 fixes the run to the tier's own budget | A seed that exhausts the real budget is impractical to find and slow to use. Nightmare: 0 fallbacks in 122 seeds, and an exhausting run takes ≈ 7.5 s (300 attempts at ≈ 25 ms); the miss probability the budgets were sized for is below 0.01%, so finding one costs CPU-hours. Diabolical is worse (2,000 attempts, ≈ 50 s per run) | An attempt-budget override for seeded runs. API only; the panel is unchanged | `sudokuDev.generate(tier, seed, { budget })` accepts an optional positive integer and is otherwise exactly as fspec §6.9. Reproducibility then holds per tier, seed, and budget. Needs a line in the fspec or a decision to keep it undocumented |
| FC-2 | fspec §7.3: after budget exhaustion the diagnostics show "attempts equal to the budget" | In the pipeline's degenerate path (no candidate solved at all) one extra unconstrained attempt is made, so attempts = budget + 1. Existing behaviour, deterministic | Relax the sentence to "attempts at least the budget", or leave the pipeline alone and accept the wording gap | Pipeline unchanged |
| FC-3 | fspec §5.3: a puzzle failure's detail "is the fspec-006 §4.2 message" | A recorded solution that is not the puzzle's solution has no fspec-006 message | Add the wording | "The recorded solution is not the puzzle's solution." |
| FC-4 | fspec §7.4: same tier and seed give the same diagnostics, "every field of §7.1" | "Seed chosen by" necessarily differs between a random run and its seeded reproduction | Read §7.4's first bullet as comparing two seeded runs; or drop "Seed chosen by" from the promise | `seedBy` is `'developer'` for every seeded run; all other fields reproduce |
| FC-5 | fspec §6.8 and §12: an API replay returns `busy` when "another replay is running"; a second panel replay replaces or waits | The spec does not say what an API replay returns if a panel replay supersedes it mid-check | — | An API replay is never superseded: a panel replay waits for it. An API replay returns `busy` whenever any replay is in flight, in any phase |
| FC-6 | fspec §3.4: "saved … after every entry" | IndexedDB commits asynchronously. Every entry triggers a save, but a tab killed within a few milliseconds of an action can lose the last entries. The alternative, synchronous `localStorage`, puts the history in the game's 5 MB quota and risks breaking the game's own saves | Accept best-effort durability for the final few milliseconds | As §7 |
| FC-7 | fspec §3.5: a tab that loses ownership shows its message | Loss is detected at that tab's next entry, not at the moment of takeover | Accept; or add a `BroadcastChannel` notice later | As §7.4 |

None of these blocks implementation; FC-1 and FC-3 add wording or surface that the
Functional Designer should confirm.

### 16.2 Code findings that touch the spec (feasibility question 11)

- **Listener-issued actions.** `coach.js` dispatches `COACH_FOCUS_COACHED_CELL` /
  `COACH_FOCUS_OFF` from inside a `changed` listener, and `main.js` dispatches
  `SET_GENERATING` from its `CHANGE_DIFFICULTY` listener. They are consequences by the
  fspec's definition but the reducer does not produce them, so they are stored as
  follow-ups (`then`) and re-applied verbatim. A difficulty change is thus one entry, and
  "generation started" is a separate entry only when issued on its own (boot, New Puzzle).
- **Malformed console actions.** An action dispatched through `window.gameState` with an
  unknown type or a payload outside its kind's schema cannot be recorded without making
  the export unreplayable. It is not recorded; one error entry notes it. If such an action
  changed state, later entries may no longer reproduce the position. fspec §12's "recorded
  like any other; replayable" holds for well-formed actions.
- **Won-board announcements and focus.** `winBanner.js`, `numpad.js`, and `coach.js`
  announce from `changed` listeners, and the win banner moves focus on the next frame. The
  commit is wrapped in `srLive.muted` and focus is restored one frame later (§11.3).
- **New Puzzle's progress test** (pen digits only) is known and untouched. It does not
  interact: every dev confirmation uses `hasProgress`.
- **Adjacent, not fixed:** `ERASE_ALL_PENCIL` during a coach session clears all marks and
  then ends the session; `_revertPencil` computes `(snapshot & ~revealed) | (current &
  ~revealed)`, and since `revealed` is disjoint from `snapshot` this restores the player's
  pre-coach marks in every cell the coach had revealed into. Erase-all therefore leaves
  marks behind in those cells. `DEV_FILL_PENCIL` ends the session before writing so it is
  unaffected. Worth a bug report against `aspec-erase-pencil.md`.
- **Fixed in this feature (§9.5, fspec §7.5, rspec R16):** in the pipeline's degenerate
  path the final puzzle was returned even when the rater could not solve it, labelled with
  the tier of the partial trace. It is now Unrated.

### 16.3 Measurements

Node 22.22 on the development machine, importing the app's modules unmodified.

| Measurement | Result |
|---|---|
| 5,000 mixed reducer actions (select, pencil, pen, erase) | 34 ms |
| Fingerprint of a state | 7 µs |
| JSON of 5,000 plain entries | 275 KB, 2.6 ms to stringify |
| `analyze`, per call over full solution walks | Hard 0.4 ms avg / 3.7 max; Expert 2.0 / 14.5; Diabolical 1.2 / 28; Nightmare 1.0 / 55 |
| `nextHint`, worst call | Hard 3 ms; Expert 21; Diabolical 25; Nightmare 54 |
| Largest coach step as JSON | 1.2 KB |
| Uniqueness check of one puzzle (no rating) | 0.2–0.3 ms |
| Same tier, seed, and budget run twice (4 pairs) | Identical puzzle, `gen`, `id` |
| Seeds exhausting the real budget | Easy: 2 in 206 (seed 26 → Hard, 237 ms). Kiddie: 0 in 4,000. Hard: 0 in 139. Nightmare: 0 in 122 |
| `('nightmare', 1)` and `('diabolical', 1)` with budget 3 | Fall back to Easy; `('nightmare', 2)` to Medium |

Measured in Chromium after implementation, against the estimates of §8.5 and §14.5. All three
exceed the estimate and all stay far inside the 1-second bound:

| Measurement | Estimate | Browser |
|---|---|---|
| Replay of 5,000 actions (apply and commit) | under 150 ms | 210–233 ms |
| Longest comparison slice between yields | under 100 ms | about 215 ms |
| Recorder cost per action (tap, fingerprint, store hand-off) | under 0.1 ms | about 0.24 ms |

### 16.4 Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Tap on public dispatch; reducer-internal dispatches bypass it | Gives "one entry per issued action" from call structure alone, with no bookkeeping in the reducer. A monkey-patched `dispatch` was rejected: the check-highlight timer calls the inner function and would go unrecorded |
| D2 | IndexedDB, one record per entry, coalesced transactions | O(1) per action; separate, large quota; atomic start-plus-entries; transactional ownership. `localStorage` would rewrite up to a megabyte per action and compete with the saved game for 5 MB |
| D3 | Replay on a headless machine, then one `DEV_RESTORE_POSITION` | Suppression by construction rather than by flags threaded through every listener; rejection and "stopped" semantics fall out for free; the same machine advances the starting position at capacity and powers the test helper |
| D4 | `HINT` carries an optional `hint`; live hints are observed by wrapping the provider | One comparison added to the reducer; normal-mode `HINT` actions are unchanged |
| D5 | "Changed nothing" by state fingerprint, not by emitted keys | The reducer's emit lists are neither minimal nor complete |
| D6 | Comparison on the main thread, time-sliced | Worst item 55 ms; a worker adds a file, a protocol, and uncollected coverage for no visible gain |
| D7 | `diagnostics` emitter in `events.js` | The only way to hook thirteen `catch` sites across five directories with no new always-loaded file and no import cycle |
| D8 | Seed stored in `puzzle.gen` | The saved game, the pre-generation cache, and the session document already carry `gen` whole |
| D9 | Unrecordable actions are dropped with an error entry | Keeps every exported document valid against its own validator |
| D10 | Document times are ISO strings; the report keeps them as ISO | Deterministic report objects for fixtures; only the panel localises |
| D11 | Stored histories are never migrated | fspec §3.4 already defines discard for an unknown stored form; only documents carry a compatibility promise |
| D12 | Follow-ups stored on the parent entry rather than as entries | Keeps action numbers aligned with what the developer did; a click on a coached cell is one action |
| D13 | Puzzle validation for replay uses a new no-rating worker message | fspec forbids re-rating; rating an Unrated puzzle is the slow part of the existing load request |
| D14 | Foreground generation extracted to `game/foreground.js` with injected collaborators (Product Director, 2026-11-15) | The honest-fallback and Unrated dialogs cannot be reached through the real generator in bounded time (FC-1); with a fake provider every branch is a unit test, and the V3 coverage exception closes. The cost is one always-loaded file holding code that already ran |
| D15 | One announcement per outcome, made by the controller; focus moves made only by the panel for its own operations | Gives the fspec's "API calls never move focus" and "announced once" structurally instead of by caller checks scattered through the panel |

### 16.5 Resolution of the QE Strategist's gaps (tspec §12)

| Gap | Resolution | Where |
|---|---|---|
| G1 — `rate` cannot be stubbed | Pinned seeds 223 / 307 at budget 1 for Expert, Diabolical, Nightmare | §9.5 |
| G2 — the fidelity sweep does not generate | Corrected; seeds come from a one-off search | §9.5, §14.2 |
| G3 — fallback dialog, its decline, the Unrated dialog and announcement, and `failed` unreachable | Foreground generation extracted; all reached by `foreground.test.js` with a fake provider. No coverage exception remains for these | §9.4, §14.3 |
| G4 — missing seams | `dbName`, `store.close()`, `boot({ … })` with `dispose()`, `createClientGenProvider({ createWorker })` | §7.1, §6.5, §4.4, §14.6 |
| G5 — upgrade note through `prepare` | `current` / `upgraders` forwarded by `prepare`, `replayFixture`, `createDevSession` | §5.5, §8.3, §14.6 |
| G6 — stopped replay above `run` | `makeMachine` on `replayFixture` and `createDevSession` | §13, §11.1 |
| G7 — codec stub | Withdrawn; isolation tests throw from `now`, `log.action`, `store.write` | §6.2, §14.3 |
| G8 — API `diagnostics` | `generationDiagnostics`: fspec-005 §8 fields plus the seed rows | §11.4 |
| G9 — stop-after input | Trimmed; digits only after trimming; rejection at Replay; no keystroke filter | §8.3, §12.1 |
| G10 — job for a failing action | Jobs are added after `applyEntry` returns | §8.3 |
| G11 — pencil announcements | Messages specified; announced on change only | §11.2 |
| G12 — generate announcements | One rule for both callers | §11.4 |
| G13 — focus on API generate | The panel focuses after its own awaited call only | §11.1, §12.2 |
| G14 — every result not compared | "No computed results could be compared." | §8.4 |
| G15 — pluralisation | `count(n, noun)` everywhere | §8.4 |
| G16 — structural rejection details; top-level shape; missing version | Two details; shape failures are "not a session document"; version shown as "unknown" | §8.3, §5.4 |
| G17 — `n = 0` timestamp | `doc.exportedAt` | §8.3 |
| G17 — status precedence | `lost` > `unavailable` > `failing` > `discarded` > `ok` | §7.3 |
| G17 — `highlightPending` | `incorrectShownUntil > 0` | §5.2 |
| G17 — marks ordering | Written ascending and unique; any order and repeats accepted | §5 |
| G17 — follow-ups of an unrecordable frame | Dropped with it | §6.2 |
| G17 — first write of the merged history | One incremental write after `loaded`; `replaceAll` after `empty` / `discarded` | §6.5 |
| G17 — `meta` absent with entries present | Discarded | §7.3 |
| G18 — superseded replay status | Writes nothing further | §11.3 |
| G19 — arch file lists | AR-D5 is a crawl; AR-D1 may reuse it | §14.4 |
| G20 — IndexedDB across tests | `dbName` per unit test; `store.close()` and the `onversionchange` handler keep a delete from blocking. Clearing `RECORDER_DB` between integration tests is a `setup.js` hook, the Test Writer's | §7.1, §7.4 |
| G21, G22, G24 — fake clock, `coach.js` singleton, real timers | Test technique; nothing to change in the plan | — |
| G23 — golden trace captured before Phase 1 is accepted | Process, for the Orchestrator: capture from `a4defe6` before accepting Phase 1. Phase 1B must not start until it exists, since 1B rewrites `main.js` | — |
| G25 — seed pins | All pins depend on the generator and are re-pinned with it | §9.5, §14.2 |
