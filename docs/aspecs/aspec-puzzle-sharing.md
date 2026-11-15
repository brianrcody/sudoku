# Architectural Spec — Puzzle Loading and Sharing (V4)
**Status:** Final
**Date:** 2026-11-13
**Author:** Uber Developer (Architect stage)
**Inputs:** `fspec-006-puzzle-sharing.md`, `vspec-006-puzzle-sharing.md`, handoff brief
`docs/misc/v4-devmode-sharing-brief.md` §2 and §5
**Loaded by:** Implementor (Phase 13), Reviewer, QE. `aspec-dev-mode.md` depends on §3–§6.

> **Also load:** `aspec-overview.md`, `aspec-generation.md` (worker protocol),
> `aspec-game-state.md` (reducer, bootstrap order), `aspec-persistence.md`.

---

## Table of Contents

1. [Approach](#1-approach)
2. [Files Touched](#2-files-touched)
3. [The Unrated Tier](#3-the-unrated-tier)
4. [The Loader](#4-the-loader)
5. [Worker Protocol](#5-worker-protocol)
6. [Statistics Gating](#6-statistics-gating)
7. [Share UI and Notice](#7-share-ui-and-notice)
8. [Bootstrap Wiring](#8-bootstrap-wiring)
9. [Persistence](#9-persistence)
10. [Supporting Changes](#10-supporting-changes)
11. [Test Infrastructure](#11-test-infrastructure)
12. [Implementation Sequence](#12-implementation-sequence)
13. [Feasibility and Decisions](#13-feasibility-and-decisions)

---

## 1. Approach

There is exactly one path from a puzzle string to a `Puzzle` in the game: 

```
text ──parsePuzzleString──► givens ──rateGivens (worker)──► loadFromGivens
     (util/puzzleString)             (providers/loadProvider)   (generator/loadPuzzle)
                                                                   │ computeConflicts
                                                                   │ countSolutions
                                                                   │ rate
                                                                   ▼ toPuzzle
   game/puzzleLoader.load() ◄──────────── { ok, puzzle | reason } ─┘
        │ hasProgress → confirm
        │ beforeReplace()
        ▼ dispatch PUZZLE_LOADED
```

Share links and developer mode's load-from-string both call `puzzleLoader.load()`. No
server code. No new runtime dependencies.

## 2. Files Touched

| File | Change |
|---|---|
| `js/config.js` | `UNRATED`, `SHARE_PARAM`, `isRatedTier()`; `unrated` rows in the per-tier tables |
| `js/util/puzzleString.js` | **New.** `parsePuzzleString`, `encodeGivens` |
| `js/util/clipboard.js` | **New.** `copyText` |
| `js/generator/loadPuzzle.js` | **New.** `loadFromGivens` (pure; runs in the worker) |
| `js/generator/pipeline.js` | `source`/`gen` diagnostics on generated puzzles (aspec-dev-mode §8) |
| `js/worker/protocol.js` | `LOAD_REQUEST` / `LOAD_RESULT` + envelope helpers (additive) |
| `js/worker/generator.worker.js` | Handle `LOAD_REQUEST` |
| `js/providers/loadProvider.js` | **New.** Lazy dedicated worker; `rateGivens` |
| `js/game/puzzleLoader.js` | **New.** `createPuzzleLoader`, `hasProgress`, message builders |
| `js/game/state.js` | Stats gating; Unrated guards in `COACH_START`, `CHANGE_DIFFICULTY` |
| `js/ui/notice.js` | **New.** Notice card |
| `js/ui/share.js` | **New.** Share button behavior, `buildShareUrl` |
| `js/ui/dialog.js` | Optional `onCancel` |
| `js/ui/controls.js` | "Unrated" option; resync after generation ends |
| `js/ui/numpad.js` | Hint presentation for Unrated |
| `js/ui/coach.js` | Coach disabled/announcement for Unrated |
| `js/ui/keyboard.js` | Board shortcuts ignored in text fields |
| `js/main.js` | Loader wiring, link handling, generation tier, persistence of `source`/`gen` |
| `index.html` | `#btn-share`, `#notice-root` |
| `css/controls.css` | `.action-row` span rule, `.notice*` |

## 3. The Unrated Tier

`config.js`:

```js
export const UNRATED = 'unrated';
export const SHARE_PARAM = 'p';
export function isRatedTier(difficulty) { return DIFFICULTY_ORDER.includes(difficulty); }
```

`Puzzle.difficulty` is one of the seven tier IDs or `UNRATED`. `UNRATED` is **not** in
`DIFFICULTY_ORDER` (which keeps meaning "tiers that can be generated, selected, and have
statistics"), `GIVEN_COUNT_TARGET`, or `ATTEMPT_BUDGET`. It **is** a key of the
behavior tables so every existing `TABLE[puzzle.difficulty]` lookup stays total:

| Table | `unrated` value | Consequence |
|---|---|---|
| `TIER_LABELS` | `'Unrated'` | Labels |
| `HINT_LIMITS` | `0` | `HINT` reducer guard and button disable work unchanged |
| `CHECK_VISIBLE` | `true` | Check shown |
| `CORRECTNESS_MODE` | `'on-demand'` | Win detection through the existing branch |

Every site that assumed `difficulty ∈ DIFFICULTY_ORDER`, and its resolution:

| Site | Resolution |
|---|---|
| `state.js` stats calls (`cache[difficulty]` would throw) | §6 gate |
| `state.js` `COACH_START` | Break when Unrated |
| `state.js` `CHANGE_DIFFICULTY` (relabels the puzzle) | When Unrated: no relabel, bare emit; `main.js` starts a new puzzle (§8.4). *Since 2026-11-14 this is the behaviour for every puzzle, rated or not — see aspec-game-state `CHANGE_DIFFICULTY`* |
| `main.js` New Puzzle / `primeNext` / restore (`generateForTier('unrated')` would misbehave) | `_generationTier()` (§8.3) |
| `controls.js` select value | Dynamic option (§10.2) |
| `numpad.js` hint label | §10.3 |
| `coach.js` button/shortcut | §10.4 |
| `stats.js` active row | No change needed: no row matches |
| `busy.js` `TIER_LABELS[tier]` | Unreachable: generation is never requested for Unrated |
| `clientGenProvider.js` cache | Unreachable: keyed by `DIFFICULTY_ORDER` |

## 4. The Loader

### 4.1 `js/util/puzzleString.js`

```js
/** @returns {{ok:true, givens:Uint8Array} | {ok:false, reason:'chars'} | {ok:false, reason:'length', length:number}} */
export function parsePuzzleString(text)
/** @returns {string} 81 digits, '0' for empty */
export function encodeGivens(givens)
```

`parsePuzzleString` strips `/\s+/g`, fails `chars` unless the remainder matches
`/^[0-9.]*$/`, then fails `length` unless it is 81 long.

### 4.2 `js/generator/loadPuzzle.js`

```js
/**
 * @returns {{ok:true, puzzle:Puzzle} |
 *           {ok:false, reason:'contradiction'|'complete'|'no-solution'|'multiple'}}
 */
export function loadFromGivens(givens)
```

Order: `computeConflicts(givens).size > 0` → `contradiction`; no zero cell → `complete`;
`countSolutions(givens, 2)` → `no-solution` (0) or `multiple` (2); `rate(givens)`;
`difficulty = solved ? (tierForRank(hardestRank)) : UNRATED`;
`puzzle = { ...toPuzzle(givens, solution, difficulty, solved ? trace : [], 0), source: 'loaded' }`.

A unique-solution puzzle with at least one empty cell always needs at least one
technique, so `tierForRank` cannot return `null` here.

The seed argument is `0`: a loaded puzzle's `id` is a pure function of its givens and
solution, so the same shared puzzle always has the same id.

### 4.3 `js/providers/loadProvider.js`

```js
/** @param {{createWorker?: function(): Worker}} [deps] */
export function createLoadProvider(deps)   // → { rateGivens(givens): Promise<LoadResult> }
```

- Owns a **dedicated** `Worker(WORKER_URL)` — a second instance of the generator worker
  script — created on the first `rateGivens` call and kept.
- `rateGivens` posts `LOAD_REQUEST`, resolves on the matching `LOAD_RESULT`.
- `worker.onerror` rejects every pending request and discards the worker, so the next
  call spawns a fresh one.

### 4.4 `js/game/puzzleLoader.js`

```js
export function hasProgress(state)              // player digit or pencil mark, not won
export function rejectionMessage(reason, length)
export function loadedMessage(difficulty)
/**
 * @param {{
 *   gameState,
 *   rateGivens: function(Uint8Array): Promise<LoadResult>,
 *   confirm: function({title, body, confirmLabel}): Promise<boolean>,
 *   beforeReplace: function(): void,
 * }} deps
 */
export function createPuzzleLoader(deps)        // → { load(text, {source, onChecking}) }
```

`load` resolves — never rejects — with:

```
{ status: 'loaded',   puzzle, message }
{ status: 'declined', message }
{ status: 'rejected', reason, message }
```

Sequence: parse (sync; reject) → `onChecking?.()` → `await rateGivens`
(catch → `rejected/error`) → `ok:false` → rejected →
`hasProgress(getState())` → `await confirm(...)` → `false` → declined →
`beforeReplace()` → `dispatch({type:'PUZZLE_LOADED', puzzle:{...puzzle, source}})` →
loaded.

`source` is `'link'` or `'string'`; it selects the dialog title and is stored on the
puzzle.

There is no supersession logic. Overlapping loads run independently and the last to
dispatch wins; a second confirmation replaces the first through `dialog.open`, whose
`onCancel` resolves the first as declined (§10.1). A token scheme was rejected because a
later load that is itself rejected would silently void an earlier one the player had
already confirmed.

## 5. Worker Protocol

Additive; existing messages and their handling are untouched.

```js
MSG.LOAD_REQUEST = 'LOAD_REQUEST'   // Main → Worker: { type, id, givens }
MSG.LOAD_RESULT  = 'LOAD_RESULT'    // Worker → Main: { type, id, result }
makeLoadRequest({ id, givens })
makeLoadResult({ id, result })
```

`generator.worker.js` answers `LOAD_REQUEST` synchronously inside `onmessage`, outside
the generation queue.

**Why a dedicated worker instance.** `generateForTier` is synchronous, so the worker
cannot service messages while a generation is running (`GEN_ABORT` only takes effect
between requests). A load sent to the generation worker would wait behind boot-time
generation or a Diabolical pre-generation — seconds — violating rspec-006 R12. A second
instance of the same script answers immediately. Cost: one extra module-worker startup on
the first load only; nothing when no puzzle is ever loaded.

## 6. Statistics Gating

`createGameState({ stats, hintProvider, statsSuppressed = () => false })`.

```js
function _statsEligible() {
  return state.puzzle.difficulty !== UNRATED && !statsSuppressed();
}
```

- `PEN_ENTER` and `HINT`: `attemptRecorded` is set and `recordAttemptOnce` called only
  when eligible. An ineligible first move therefore leaves `attemptRecorded` false, so
  the attempt is recorded on the first eligible player move (fspec-006 §7.1).
- `ON_COMPLETION_EVALUATE` (all three win arms): `recordWin` only when eligible.

`main.js` passes `statsSuppressed: isDevMode`.

## 7. Share UI and Notice

### 7.1 `js/ui/notice.js`

```js
export function mount(root)                                   // #notice-root
export function show(text, { variant = 'info', timeoutMs = 0, onDismiss } = {})
export function showLink(text, url, { onDismiss } = {})       // returns the <input>
export function hide()
```

Renders `<div class="notice notice-<variant>">` with a `.notice-message`, an optional
`<input class="notice-field" readonly>`, and (except `progress`) a
`<button class="btn notice-dismiss" aria-label="Dismiss message">`. One timer; `show`
and `hide` clear it. The root is `hidden` when empty. `hide` requires `mount` to have run
(it always has: `main.js` mounts the notice before anything can call it). Not a live region — callers use
`srLive.announce`.

### 7.2 `js/ui/share.js`

```js
export function buildShareUrl(givens, href)
export function mount(button, gameState, { copy = copyText, getHref = () => location.href } = {})
```

`buildShareUrl`: `new URL(href)`, clear `search` and `hash`, set `SHARE_PARAM` to
`encodeGivens(givens)`. Using `URL` rather than `origin + pathname` keeps `file://` and
sub-path hosting correct.

`mount` disables the button while `state.puzzle === null` (subscribes to `puzzle`), and
on click runs fspec-006 §2.3. On `NEW_PUZZLE` it hides the notice (fspec §8).

### 7.3 `js/util/clipboard.js`

```js
export async function copyText(text, clipboard = navigator.clipboard)  // → boolean
```

`false` when the API is missing or `writeText` rejects. No `execCommand` fallback: the
selectable field is the specified fallback.

### 7.4 Markup and CSS

`index.html`: `<div id="notice-root" hidden></div>` after `#busy-root`;
`<button class="btn" id="btn-share" aria-label="Share puzzle link">Share</button>` as the
third child of `.action-row`. `css/controls.css` gains `#btn-share { grid-column: 1 / -1 }`,
the `#notice-root` width rule, and the `.notice` rules of vspec-006 §3. The link field's
class is `notice-field` (not `notice-link`, which is the card's variant class).

## 8. Bootstrap Wiring

Changes to `main.js`, keeping the aspec-game-state §1.2 step order.

### 8.1 Step 1.5 — dev flag

`const devMode = initDevMode(location.search)` before the stats stack (aspec-dev-mode §3).

### 8.2 Step 6

`createGameState({ stats, hintProvider, statsSuppressed: isDevMode })`.

### 8.3 Generation tier

`preferredTier` = the validated `DIFF_KEY` preference (default `'easy'`), updated on
`CHANGE_DIFFICULTY` and on honest-fallback acceptance.

```js
function _generationTier(state) {
  const d = state.puzzle?.difficulty;
  return isRatedTier(d) ? d : preferredTier;
}
```

Used by New Puzzle and by `primeNext` at step 10. The restore path sets the puzzle's
difficulty from the blob verbatim (`unrated` included) and reads `HINT_LIMITS` for it.

### 8.4 Persistence listener

On `CHANGE_DIFFICULTY`: persist and update `preferredTier`, then call
`_startNewPuzzle(action.difficulty, 'difficulty-select')` — for every puzzle, superseding
any foreground request in flight (revised 2026-11-14; originally this cancelled a pending
request and started a puzzle only when the current one was Unrated).

### 8.5 Loader and link (after step 8 mounts)

```js
const loader = createPuzzleLoader({
  gameState,
  rateGivens: createLoadProvider().rateGivens,
  confirm: opts => new Promise(res => openDialog({ ...opts,
            onConfirm: () => res(true), onCancel: () => res(false) })),
  beforeReplace() { _genAbort?.abort(); _genAbort = null; closeDialog(); },
});
```

`beforeReplace` implements "the shared puzzle wins": aborting makes the in-flight
`requestPuzzle` promise reject with `AbortError` (already swallowed), and
`_genAbort = null` makes a result that still resolves fail the existing
`_genAbort !== controller` staleness check. `PUZZLE_LOADED` itself resets `generating`.

Link handling:

```js
const shared = new URLSearchParams(location.search).get(SHARE_PARAM);
if (shared !== null) {
  loader.load(shared, { source: 'link', onChecking: () => notice.show('Checking puzzle…', {variant:'progress'}) })
    .then(outcome => { /* report, then strip */ });
}
```

`load` never rejects, so a single `then` suffices. It shows and announces
`outcome.message` — `error` variant (sticky) for rejected, `info` with 4000 ms otherwise —
then strips the parameter: `new URL(location.href)`, `searchParams.delete(SHARE_PARAM)`,
`history.replaceState(history.state, '', url)`.

## 9. Persistence

`_saveState` adds `source` and `gen` to the saved `puzzle` object; restore copies them
back. `difficulty` already round-trips as a string, so `unrated` needs no schema change
and the blob stays `version: 1` (older blobs simply lack the two optional fields).

A loaded puzzle is saved by the existing debounced writer because `PUZZLE_LOADED`
changes `puzzle`. `DIFF_KEY` is not written by a load.

## 10. Supporting Changes

### 10.1 `dialog.js`

`open({ …, onCancel })`. `close()` invokes and clears a pending `onCancel`;
`_handleConfirm` clears it before closing; `open` over an already-open dialog fires the
previous `onCancel` first. Existing callers pass none and are unaffected.

### 10.2 `controls.js`

`_update`: returns early while `state.generating`; adds an `<option value="unrated">`
when the puzzle is Unrated and removes it otherwise; then sets the value.
`RELEVANT_KEYS` gains `generating`, so the selector resyncs when a generation ends or is
cancelled.

### 10.3 `numpad.js`

When `difficulty === UNRATED`: badge "–", `aria-label` "Hint — unavailable for unrated
puzzles". The existing `exhausted` logic already disables the button.

### 10.4 `coach.js`

`_renderButton`: disabled additionally when Unrated, with `aria-label`
"Coach — unavailable for unrated puzzles". `_onCoachPressed`: when Unrated, announce
"Coach is unavailable for unrated puzzles." and return.

### 10.5 `keyboard.js`

After the Escape branch: when the active element is an `INPUT` or `TEXTAREA`, the digit,
erase, and arrow branches are skipped. (`SELECT` keeps its existing behavior.)

## 11. Test Infrastructure

Unchanged tooling. New unit files: `puzzleString`, `clipboard`, `loadPuzzle`,
`loadProvider` (fake worker injected), `puzzleLoader` (all deps faked), `ui-notice`,
`ui-share`. Extended: `config`-dependent suites, `state`, `protocol`, `ui-dialog`,
`ui-controls`, `ui-numpad`, `ui-keyboard`, `arch` (new UI modules), coach integration.
New integration file `sharing.test.js` loads `index.html?p=…` in iframes — sized
≥ 721px wide where header controls matter, and always selecting controls by id.

Worker-side code (`loadFromGivens`) is covered by direct import, per the existing
worker-coverage policy (test-runner/run.js header).

## 12. Implementation Sequence

1. `config.js`, `util/puzzleString.js`, `util/clipboard.js`
2. `generator/loadPuzzle.js`, protocol, worker, `providers/loadProvider.js`
3. `state.js` gating and guards
4. `dialog.js`, `game/puzzleLoader.js`
5. `notice.js`, `share.js`, markup, CSS
6. `controls.js`, `numpad.js`, `coach.js`, `keyboard.js`
7. `main.js` wiring

## 13. Feasibility and Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Parameter name `p` | Shortest unambiguous name; brief left it open |
| D2 | Dedicated loader worker (departure from "the worker" singular in the brief) | §5; the synchronous generator would block loads for seconds |
| D3 | Rate before confirming | An invalid link never asks the player to give up progress |
| D4 | Unrated uses on-demand checking with Check visible | rspec-006 R7 lists mistake checking among features that work; with hints and coach gone it is the only aid |
| D5 | Changing difficulty on an Unrated puzzle generates a new puzzle | The existing relabel would turn an Unrated puzzle into a rated one, leaking it into statistics and re-enabling coach |
| D6 | `attemptRecorded` stays false while ineligible | Prevents a win being recorded without its attempt after dev mode is turned off |
| D7 | A fully filled grid is rejected | Nothing to play; `rate` would label it Kiddie |
| D8 | Notice is not a live region | The app's single assertive region already carries announcements; a second region double-announces |

**Performance.** Measured in Node on 1,500 seeded minimal puzzles (101 unrateable):
rating p50 0.2 ms, p99 95 ms, max 317 ms; uniqueness ≤ 15 ms on the classic hardest
puzzles. The 1 s target of R12 holds with margin for rateable and unrateable input, and
the work is off the UI thread either way. Final numbers are recorded in
`docs/misc/v4-devmode-sharing-report.md`.
