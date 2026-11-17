# Test Strategy — Debug Instrumentation
**Date:** 2026-11-15
**Status:** Draft — for Orchestrator review before hand-off to the QE Test Writer
**Author:** QE Strategist
**Inputs:** aspec-debug-instrumentation (Final), fspec-007-debug-instrumentation,
rspec-007-debug-instrumentation, vspec-007-debug-instrumentation; conventions from
tspec-dev-mode and tspec-puzzle-sharing

---

## 1. Approach

### 1.1 Layers and test levels

The aspec's layering puts nearly all logic behind pure functions or injected
collaborators, so unit tests carry branch coverage on their own for every new module.
Integration tests exist only for what needs the running app: `main.js` wiring, the real
workers, real IndexedDB across page loads and tabs, rendering, focus, and timing.

| Layer | Modules | Level | Real | Stubbed / injected |
|---|---|---|---|---|
| Seams | `events.js`, `state.js`, `srLive.js`, `dialog.js`, silent `catch` sites | Unit | Reducer, emitter | `tap`, `timers`, stats, hint provider; `localStorage` / clipboard / cookie failures by method stubs |
| Pure codec | `sessionCodec.js` | Unit | Everything | Nothing |
| Headless machine | `machine.js` | Unit | Real `createGameState` | Nothing (it builds its own null collaborators) |
| Recorder | `recorder.js` | Unit | Real `createGameState` with the recorder's tap; real codec and machine | Store (in-memory fake), `log`, `now` (counter), `clock` |
| Store | `recorderStore.js` | Unit | **Real IndexedDB**, per-test database name | Failure proxies around real IndexedDB; fully fake `idb` for open errors and hangs |
| Logging | `devLog.js` | Unit | — | `out`, `storage` |
| Boot | `devBoot.js` | Unit | Recorder, store, log | `window` events dispatched synthetically; `idb` (see §12 G4) |
| Replay engine | `replay.js`, `tests/helpers/replayFixture.js` | Unit | Codec, machine, real `analyze` / `nextHint` where the result matters | `checkPuzzles` (synchronous `checkGivens`), `analyze`, `nextHint`, `pause`, `makeMachine` |
| Controller | `devSession.js` | Unit | Real `createGameState`, real recorder (fake store), real `devLog` (fake `out`) | `loadPuzzle`, `confirm`, `generateSeeded`, `beforeReplace`, `checkPuzzles`, `copy`, `analyzeStep`, `hint` |
| API | `devApi.js` | Unit | — | A fake controller (records calls; can throw / reject) |
| Panel | `recorderPanel.js`, `devPanel.js` additions | Unit | Real DOM in the Mocha page, real `srLive` | Fake controller and fake recorder/log emitters; real controller for a few wiring tests |
| App | `main.js`, workers, cross-load and cross-tab behaviour | Integration | Everything, in iframes via `integration/_app.js` | `navigator.clipboard` in the app frame where an outcome is asserted |

System-level coverage is two end-to-end flows in `integration/debug.test.js` (DBG-SYS1,
DBG-SYS2): record → export → replay in a fresh session → identical position and empty
divergence report; and seeded generation reproduced across two page loads.

### 1.2 Harness facts the strategy relies on

- Mocha + Chai in headless Chromium via Playwright; every test file is a
  `<script type="module">` in `js/tests/setup.html`. V8 coverage via c8. Worker scripts
  are not collected; worker-side code (`pipeline.js`, `loadPuzzle.js`, `protocol.js`) is
  covered by direct import, and `generator.worker.js` is exercised behaviourally through
  the real worker.
- `setup.js`'s global `beforeEach` clears `localStorage` and cookies but **not
  IndexedDB**. This feature needs two additions to `setup.js` (§3.1): delete
  `sudoku-dev-recorder` in a global `afterEach`, and `diagnostics.clear()` in the same
  hook so no test leaks a listener on the process-wide channel.
- DOM-mounting modules are tested in the page against `makeFakeGameState` or a real
  store, with `mountSrLive(document.body)` and an `#sr-live` element; announcements are
  observed after two animation frames (`srLive` writes in a `requestAnimationFrame`).
- Integration tests use `createApp`, `waitFor`, `waitForPuzzle`, `waitForDevPanel`,
  `appFrame`, and `seedSavedGame`, and select controls by id. Waits are on conditions,
  never fixed sleeps, except lower-bound "nothing happens" waits (as in SHR15).
- Performance tests time with `performance.now()` in the relevant realm, log a `[PERF]`
  line (relayed by the runner), and assert against the bound.
- Global stubs (`console.*`, `Storage.prototype.*`, `navigator.clipboard`, `window.Worker`)
  are installed in the test and restored in `finally` / `afterEach`, as EV5 does.

### 1.3 New test-support code (written by the QE Test Writer)

| Helper | Purpose |
|---|---|
| `js/tests/helpers/replayFixture.js` | Specified by the aspec (§13); also a production-quality test API |
| `js/tests/helpers/fakeIdb.js` | `failingIdb(realIdb, script)`: proxies a real `IDBFactory`; aborts the *n*-th `readwrite` transaction, fails a chosen request (`getAll`, `get`), or counts transactions. `hangingIdb()`: `open` returns a request that never settles. `erroringIdb()`: `open` fires `onerror` |
| `js/tests/helpers/fakeClock.js` | Manual clock: replaces `setTimeout` / `clearTimeout` / `Date.now` on `window` for the duration of one test, `advance(ms)` runs due callbacks in order; restored in `finally`. Mocha keeps its own references to the real timers, so its timeouts are unaffected |
| `js/tests/helpers/sessionDriver.js` | Seeded (`mulberry32`) action generator used by the fidelity sweep (PR2/PR3), the 5,000-action performance document (PERF-D2), and the round-trip property (PR1). Pure: given a seed and the live state it returns the next action |
| `js/tests/helpers/fakeDev.js` | A minimal `devBoot`-shaped object (`recorder` with `ready`, `counts`, `on`, …; `log`) for `devPanel.test.js`, whose `mount` now awaits `dev.recorder.ready` |
| `js/tests/fixtures/state/golden-trace.json` | Captured once from the pre-change reducer (§3.2) |
| `js/tests/fixtures/sessions/*.json` | §7 |

### 1.4 Writing tests behind the Implementor

Each test is tagged with the phase (aspec §15) that makes it writable. A phase's tests
are written as soon as its code lands and must pass, with 100% branch coverage of the
files the phase touches, before the next phase's tests start. Phase 0 is new: it is the
one task the Test Writer must do *before* the Implementor's Phase 1 is accepted (§3.2).

> Phase 1 code is already partially present in the working tree (uncommitted edits to
> `state.js`, `events.js`, `srLive.js`, `coach.js`, `main.js`, the `catch` sites, and
> `arch.test.js`). HEAD (`a4defe6`) still holds the pre-change reducer. Phase 0 must be
> captured from HEAD, not from the working tree.

---

## 2. Test Inventory

Columns: **ID** · **Type** (U unit, I integration, S system) · **Ph** (phase) ·
**Covers** · **Setup / input** · **Expected**. Rows marked "×n" are parameterised; each
parameter is its own `it`.

### 2.1 Phase 0 — normal-mode baseline capture

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| SG0 | — | 0 | Golden trace capture (a script, not a test) | Check out HEAD in a separate worktree (`git worktree add`), serve it, and run the scripted sequence of SG1 against HEAD's `createGameState`; write `fixtures/state/golden-trace.json` | One record per `changed` emit: `action.type`, sorted `changed` keys, a canonical JSON snapshot of the state (typed arrays as arrays, sets sorted, `incorrectShownUntil` replaced by `incorrectShownUntil > 0`), plus per-call records of `stats.recordAttemptOnce` / `recordWin` and `hintProvider.nextHint` arguments |

### 2.2 Phase 1 — seams in always-loaded modules

#### `unit/state-golden.test.js` — normal mode is unchanged

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| SG1 | U | 1 | Every reducer case and every nested-dispatch site, `tap` null, default timers | The SG0 script: ~250 actions over a Kiddie (realtime correctness), an Easy, and a Hard puzzle. Includes: every action type of the pre-change reducer; `PEN_ENTER` completing the board correctly (win), incorrectly (incorrect highlight), and with a completion message; `PEN_ENTER` / `ERASE` / `ERASE_ALL_PENCIL` / `HINT` / `CHANGE_DIFFICULTY` during a coach session (each `COACH_END` reason and each `COACH_FILL_RECAP` variant); `PENCIL_TOGGLE` completing an elimination step; `CHECK` then a wait past `CHECK_HIGHLIGHT_MS` (real timer) | Emit records, stats calls, and provider calls deep-equal the golden file |
| SG2 | U | 1 | `tap` is transparent | SG1's script with a no-op tap `{ begin(){}, end(){} }` | Identical to the golden file |
| SG3 | U | 1 | Explicit `timers: DEFAULT_TIMERS`-equivalent object | SG1's script with `timers = { now: Date.now, set: setTimeout, clear: clearTimeout }` passed explicitly | Identical to the golden file |

PR5 (§6) is the randomized companion to SG2.

#### `unit/state-devtools.test.js` — the new reducer surface

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| SDT1 | U | 1 | Public dispatch with a tap | Recording tap that logs `begin`/`end`; a `changed` listener logs emits | Order: `begin`, every emit of the action (including nested ones), `end` |
| SDT2 | U | 1 | Nested reducer dispatches bypass the tap | `PEN_ENTER` that completes the board during a coach session (fires `COACH_END` and `ON_COMPLETION_EVALUATE` internally) | Exactly one `begin` / `end` pair |
| SDT3 | U | 1 | Listener re-dispatch is a nested public dispatch | A `changed` listener dispatches `COACH_FOCUS_OFF` once in response to `SELECT_CELL` | `begin(SELECT_CELL)`, `begin(COACH_FOCUS_OFF)`, `end(COACH_FOCUS_OFF)`, `end(SELECT_CELL)` |
| SDT4 | U | 1 | `finally` path | `stats.recordAttemptOnce` throws during `PEN_ENTER` | The error propagates to the caller exactly as before; `tap.end` was still called once |
| SDT5 | U | 1 | Check-highlight timer uses public dispatch | Fake `timers` capturing `set` callbacks; `CHECK` with a wrong digit, then invoke the captured callback | `tap.begin({ type: 'CLEAR_INCORRECT' })` at the top level; highlight cleared |
| SDT6 | U | 1 | `timers.now` / `timers.set` / `timers.clear` in `CHECK` | Fake timers with `now() = 1000`; two `CHECK`s | `incorrectShownUntil === 1000 + CHECK_HIGHLIGHT_MS`; `set` called with `CHECK_HIGHLIGHT_MS`; the second `CHECK` clears the first handle |
| SDT7 ×2 | U | 1 | The two `Date.now` sites in `ON_COMPLETION_EVALUATE` | Fill a board (a) with a wrong digit, (b) into the completion-message branch | Each deadline is `timers.now() + CHECK_HIGHLIGHT_MS` |
| SDT8 ×5 | U | 1 | Every `clearTimeout` site routes through `timers.clear` | Pending highlight, then `PUZZLE_LOADED`, `UNDO`, `NEW_PUZZLE`, `RESET_PUZZLE`, `DEV_SET_BOARD` | `timers.clear` called with the pending handle; callback never fires |
| SDT9 | U | 1 | Inert timers | `timers = { now: () => 0, set: () => 0, clear() {} }`; `CHECK` | Highlight set; nothing is ever scheduled (`window.setTimeout` spy: zero calls) |
| SDT10 | U | 1 | `HINT` with a supplied hint | Provider spy; `HINT { hint: { cellIndex: c, digit: d, technique } }` where `c` is the selected empty cell and `d` differs from the provider's answer | Provider not called; `pen[c] === d`; hints decremented; attempt recorded as for a normal hint; same emit keys as SG1's `HINT` |
| SDT11 | U | 1 | `hint: null` | Same setup, `hint: null` | Provider not called; state unchanged; no emit |
| SDT12 ×2 | U | 1 | `hint` absent and `hint: undefined` | Same setup | Provider called once with the pre-change arguments; result as before |
| SDT13 ×6 | U | 1 | Guards precede the supplied hint | `HINT` with a valid `hint` and: no selection; no puzzle; no hints left; given cell; pen cell; won | Ignored; provider not called |
| SDT14 | U | 1 | Verbatim cell | Supplied hint's `cellIndex` ≠ selected cell | The recorded cell receives the digit |
| SDT15 ×6 | U | 1 | `DEV_SET_PENCIL` guards | No puzzle; won; generating; given; pen digit; `mask` equal to current | No emit; `undoSnapshot` unchanged |
| SDT16 | U | 1 | `DEV_SET_PENCIL` applies | Empty cell, new mask | Undo snapshot taken; `pencil[i] === mask`; emitted keys exactly `pencil`, `undoSnapshot`; `selected` and `activeMode` unchanged |
| SDT17 | U | 1 | Undo after `DEV_SET_PENCIL` | SDT16 then `UNDO` | Previous marks restored |
| SDT18 ×3 | U | 1 | Extracted `_checkElimComplete` from `DEV_SET_PENCIL` | Elimination coach session: (a) clear the last indicated candidate; (b) clear a non-final one; (c) no session | (a) recap `elim` via one tap frame; (b) session continues; (c) no recap logic runs |
| SDT19 | U | 1 | `PENCIL_TOGGLE` after extraction | Covered by SG1 and the existing coach-session tests (`unit/coach/session.test.js`) | Unchanged |
| SDT20 ×3 | U | 1 | `DEV_FILL_PENCIL` guards | No puzzle; won; generating | Ignored |
| SDT21 | U | 1 | `DEV_FILL_PENCIL` without a session | Board with pen digits; supplied array has marks for filled cells too | Only cells with `pen[i] === 0` take the supplied marks; emits `pencil`, `undoSnapshot`; one `UNDO` restores |
| SDT22 | U | 1 | `DEV_FILL_PENCIL` during a coach session | Session with coach-revealed marks | `COACH_END { reason: 'erase' }` emitted before the `pencil` emit; revealed marks reverted, then fill applied; one `begin` / `end` pair |
| SDT23 | U | 1 | No aliasing | Mutate the supplied `Uint16Array` after dispatch | State unchanged |
| SDT24 | U | 1 | `DEV_RESTORE_POSITION` copies | Position with every field non-default; mutate its arrays and sets afterwards | State equals the position; later mutation has no effect |
| SDT25 ×2 | U | 1 | `winHandled = won` | `won` true / false | `winHandled` matches |
| SDT26 | U | 1 | Conflicts recomputed | Position whose `pen` has a duplicate in a row; `conflicts` field absent | `conflicts` equals `computeConflicts(pen)` |
| SDT27 | U | 1 | `highlightPending: true` | Fake timers, `now() = 500` | `incorrectShownUntil === 500 + CHECK_HIGHLIGHT_MS`; timer scheduled; firing it dispatches `CLEAR_INCORRECT` through the tap |
| SDT28 | U | 1 | `highlightPending: false` over a pending highlight | `CHECK` (timer pending), then restore | `incorrectShownUntil === 0`; old handle cleared; never fires |
| SDT29 | U | 1 | Emit key list | Compare with the key list a `PUZZLE_LOADED` emits on the same store | Equal |
| SDT30 | U | 1 | No statistics, no completion check | Full, correct board with `won: false` | Not won; stats spies untouched |
| SDT31 ×3 | U | 1 | No guards | `puzzle: null`; while generating; while won | Each accepted |

#### Other Phase 1 seams

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| EV11 | U | 1 | `reportErrors` default | `createEmitter()`; listener throws; spy on `diagnostics` `listener-error` | `console.error` once, then one `listener-error` `{ error, type, payload }`; later listeners still run |
| EV12 | U | 1 | `createEmitter({})` | As EV11 | Same as EV11 (destructuring default) |
| EV13 | U | 1 | `reportErrors: false` | As EV11 | `console.error` once; no `listener-error` |
| EV14 | U | 1 | Order | Log both calls | `console.error` precedes the diagnostics emit |
| EV15 | U | 1 | The diagnostics channel does not report itself | A `diagnostics` listener throws on `swallowed`; a second `listener-error` spy | `console.error` once; no `listener-error` |
| UL4 | U | 1 | `muted` | `announce('x')` inside `muted` | Region unchanged after two frames |
| UL5 | U | 1 | Restored after | `announce` after `muted` returns | Announced |
| UL6 | U | 1 | Restored after a throw | `fn` throws | Error propagates; next `announce` works |
| UL7 | U | 1 | Nesting | `muted(() => { muted(() => {}); announce('x'); })` | Not announced |
| UD13 | U | 1 | Dialog description | Open any dialog | Backdrop has `aria-describedby="modal-body"`; `#modal-body` holds the body text |
| SW1 ×12 | U | 1 | Every swallowed site emits | Spy on `diagnostics` `swallowed`. Triggers: `storage.getItem` (invalid JSON), `storage.setItem` (`Storage.prototype.setItem` throws), `storage.removeItem` (throws), `clipboard.copyText` (refused write), `statistics.save` ×2 (provider `save` rejects, from `recordAttemptOnce` and `recordWin`), `cookieStatsStore.load` (corrupt cookie), `cookieStatsStore.save` (`cookies.set` throws), `pregen.load` (corrupt entry), `pregen.save` (setItem throws during a background result), `pregen.clear` (removeItem throws on a cache hit), `puzzleLoader.rateGivens` (`rateGivens` rejects) | One emit per trigger with the exact `where` and the thrown error object; the function's existing return / fallback is unchanged (the existing LS, CB, ST, CS, PP, PL-L tests still pass) |
| SW2 | I | 1 | `main.requestForeground` | App frame: New Puzzle twice in one task (second aborts the first) | Abort path taken (existing SHR40/41 behaviour); with the flag off the emit has no listener. The emit itself is observed in Phase 8 (DBG-L3b) |
| PL-L25 ×2 | U | 1 | Per-call `confirm` | `load(text, { source, confirm })` with progress; and without `confirm` | The per-call function is used and the loader's default is not; default used when absent |
| PL-L26 ×5 | U | 1 | `rejectionDetail` | Each rejection reason with and without `length` | The sentence after "This puzzle can't be loaded. "; `rejectionMessage(r, l) === prefix + rejectionDetail(r, l)` for every reason |
| CO1 ×2 | I | 1 | `coach.js` recap restart | App frame; reach a recap via `window.gameState`; after 2 s dispatch `DEV_RESTORE_POSITION` with a recap position (a) while the recap timer is pending, (b) after `COACH_END` cleared it | Recap still shown 2.0 s after the restore and gone by 3.0 s; (b) a fresh full period too |
| CO2 | I | 1 | Non-restore actions do not restart | Existing integration `coach.test.js` recap-timeout tests | Unchanged |

### 2.3 Phase 2 — seed plumbing and the Unrated fallback

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| PD9 ×2 | U | 2 | `gen.seed`, `gen.seedBy` | `generateForTier('easy', { rng, seed: 42 })` and with `seeded: true` | `gen.seed === 42`; `seedBy` `'random'` / `'developer'` |
| PD10 | U | 2 | Seeding flag changes nothing else (FC-4) | Same tier and seed, `seeded` false and true | Givens, solution, difficulty, `id`, trace, and every `gen` field equal except `seedBy` |
| PD11 ×2 | U | 2 | §9.5 degenerate unsolvable → Unrated | `('expert', 223, budget 1)` and `('nightmare', 223, budget 1)` (pins found by seed search against the current generator; both attempts are unsolvable by the rater) | `difficulty === 'unrated'`; `gen.fallback`; `gen.attempts === 2` (budget + 1); `gen.rejected.unsolved === 1`; `solveTrace` is the partial trace |
| PD12 | U | 2 | Degenerate but solvable keeps its tier | `('easy', 42, budget 0)` (PD7) | `difficulty === tierForRank(rate(givens).hardestRank)`, not `'unrated'` |
| PD13 | U | 2 | Regression | Existing PD1 pins and PD6 | Unchanged — proves no RNG call was added, removed, or reordered |
| WP4 ×2 | U | 2 | `makeGenRequest` `seeded` | Omitted; `true` | `false`; `true`; other fields as WP2 |
| WP5 | U | 2 | `elapsedMs` on `GEN_RESULT` | `makeGenResult({ …, elapsedMs: 12 })` | Carried on the envelope, not on the puzzle |
| WP6 | U | 2 | `CHECK_REQUEST` / `CHECK_RESULT` | Constants and envelope builders | Strings in frozen `MSG`; envelopes carry `id` and `list` / `results` |
| LP11 ×5 | U | 2 | `validateGivens` | Valid; `contradiction`; `complete`; `no-solution`; `multiple` | `{ ok: true, solution }` / `{ ok: false, reason }` |
| LP12 ×3 | U | 2 | `checkGivens` | Valid with its solution; valid with a different solution; invalid givens | `{ ok: true }`; `solution-mismatch`; the validation reason. No `puzzle` or `difficulty` in the result |
| LP13 | U | 2 | `loadFromGivens` after the refactor | Existing LP1–LP10 | Unchanged |
| LV8 | U | 2 | `checkPuzzles` envelope | Fake worker factory (as LV1–LV6) | One `CHECK_REQUEST` with the whole list |
| LV9 ×2 | U | 2 | Result routing | Reply `CHECK_RESULT`; interleaved `LOAD_RESULT` | Check resolves with `msg.results`; load with `msg.result` |
| LV10 | U | 2 | Worker error | `onerror` with a check and a load pending | Both reject |
| LV11 | U | 2 | Real worker | Real `createLoadProvider().checkPuzzles([valid, mismatch])` | `[{ ok: true }, { ok: false, reason: 'solution-mismatch' }]` |
| PP12–PP22 | U | 2 | `clientGenProvider` seed, budget, diagnostics, Unrated discard | New `describe` in `puzzleProvider.test.js`. `window.Worker` replaced by a `FakeWorker` class (records `postMessage`; the test drives `onmessage` / `onerror`); restored in `afterEach`. Spy on `diagnostics` `generation` | See the sub-table |

PP12–PP22, one `it` each:

| ID | Input | Expected |
|---|---|---|
| PP12 ×2 | Cache hit; cached puzzle with and without `gen` | `cache-hit { tier, seed }` (`seed` undefined without `gen`) |
| PP13 | Cache miss, unseeded | `cache-miss { tier }` then `request { kind: 'foreground' }`; posted `seeded: false`, `budget: undefined` |
| PP14 | `seed: 7, budget: 3` with the cache primed | No `cache-hit` / `cache-miss`; `request { kind: 'seeded', seed: 7 }`; posted `background: false, seeded: true, budget: 3`; `peekReady` still returns the cached puzzle; the result is delivered and never cached or written to storage |
| PP15 | `primeNext` | `request { kind: 'background' }` |
| PP16 | `GEN_PROGRESS` | `progress { attempts, budget }` |
| PP17 ×2 | Foreground `GEN_RESULT` without / with `fallback` | `result { requestedTier, tier, seed, attempts, elapsedMs }`; plus `fallback { requestedTier, tier, seed }` when set |
| PP18 | Background result, rated | Cached and stored (PP6 behaviour); `result` emitted |
| PP19 | Background result, `difficulty: 'unrated'` | Not cached, not stored; the discarded-result `generation` event emitted; the next foreground request for that tier misses the cache |
| PP20 | Abort | `cancelled { tier, reason }` |
| PP21 ×2 | `GEN_ERROR`; `worker.onerror` | `failed { message }`; pending requests rejected (closes the pre-existing uncovered `onerror` path) |
| PP22 | Request with `seed: 0` | Treated as seeded (`seed !== undefined`, not truthiness) |

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| IN36 ×3 | U | 2 | Seed row | `gen.seed` 3141592653; `null`; missing (old data) | `['Seed', '3141592653']`; `'Not recorded'` twice; returned `seed` is the number or `null` |
| IN37 ×4 | U | 2 | Seed-chosen-by row | `seedBy` `'developer'`, `'random'`, `null`, missing | "Developer (seeded run)", "Generator (random)", "—", "—" |
| IN38 | U | 2 | Row order | Generated puzzle | Seed rows first, then the seven existing rows |
| IN39 | U | 2 | Unrated achieved tier | `difficulty: 'unrated'` | "Achieved tier" reads "Unrated" |
| PR4 | U | 2 | Seeded determinism (§6.4) | — | — |

### 2.4 Phase 3 — codec and machine

#### `unit/sessionCodec.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| SC1 | U | 3 | `KINDS` matches the reducer | Fetch `/js/game/state.js` as text; collect every `case '…'` label | Every reducer case is a key of `KINDS`; `KINDS` additionally has exactly `PAGE_RELOADED`; total 33 |
| SC2 ×33 | U | 3 | Encode → validate → decode per kind | One representative live action per kind (§8.2 table) | `validate` passes; decoding and dispatching on a machine gives the same fingerprint as dispatching the original on a twin machine |
| SC3 ×4 | U | 3 | Unlisted fields dropped | `PUZZLE_LOADED` with `solveTrace`; an action with an extra property; `PEN_ENTER` without `fromHint`; `COACH_END` without `reason` | Encoded doc has only the listed fields; optional fields absent when absent |
| SC4 | U | 3 | Rejection per kind | Parameterised table (≈ 60 rows): every required field missing, wrong type, or out of range — index −1 / 81 / 1.5; digit 0 / 10; `mode: 'ink'`; board strings of length 80 or with a letter; marks not 81 lists or containing 0 / 10; `hint.cellIndex` 81; `hint.digit` 0; `hint.technique` non-string; `COACH_FILL_RECAP.variant: 'x'`; `SET_GENERATING.flag: 1`; `GEN_PROGRESS.attempts: '3'`; `RESTORE_SESSION.hintsRemaining: 'lots'`; `DEV_SET_PENCIL.digits: [0]`; invalid nested `PAGE_RELOADED.position` | `{ ok: false, detail }` with a non-empty detail (wording: §12 G16) |
| SC5 ×13 | U | 3 | `CoachStep` validator | Valid step; then one row per required field missing: `technique`, `type` (also `'other'`), `digits`, `roles.target`, each of `cause` / `elimTarget` / `unitMember` / `scA` / `scB`, `eliminations` item shape, `autoReveal.required`, `autoReveal.cells` item shape, `supportingText`, `complexity`; plus `{ type: 'no-technique' }` without `reason` | Valid passes; each other row fails |
| SC6 | U | 3 | `hint: null` and absent | Both | Valid |
| SC7 | U | 3 | Unknown type | `{ type: 'NOPE' }` | Fails |
| SC8 | U | 3 | Unknown extra properties ignored at every level | Extra keys on the document, `start`, `puzzle`, `gen`, an action doc, a coach step | Valid; coach-step extras pass through verbatim to the decoded `COACH_START` |
| SC9 | U | 3 | Deep copy of `COACH_START.result` | Mutate the live step after encoding | Encoded copy unchanged |
| SC10 ×3 | U | 3 | Mask ↔ digits | `DEV_SET_PENCIL` mask `0b100000101`; empty mask; `DEV_FILL_PENCIL` array | Ascending digit lists; decode restores the masks / `Uint16Array` |
| SC11 ×6 | U | 3 | `origin` mapping | `source` `'generated'`, `'link'`, `'string'`, `'loaded'`, `undefined`, and a document `"unknown"` decoded | `generated`, `link`, `string`, `unknown`, `unknown`; decode of `unknown` round-trips |
| SC12 ×3 | U | 3 | `gen` mapping | `gen` with seed; `gen` without `seed` / `seedBy` (old data); no `gen` | Copied; `seed: null, seedBy: null`; absent |
| SC13 | U | 3 | Hints | `Infinity` and a number | `"unlimited"` ↔ `Infinity`; number unchanged |
| SC14 ×2 | U | 3 | `highlightPending` | After `CHECK`; after `CLEAR_INCORRECT` | `true`; `false` (rule pinned to the implementation's definition; §12 G17) |
| SC15 ×4 | U | 3 | Coach decode | Recap `null`; recap `'normal'`; elimination step; placement step | `coachedCells = deriveCoachedCells(step)` vs `∅`; `eliminationTargets` rebuilt vs `null` |
| SC16 ×3 | U | 3 | `undo`, `generating` | `undo` null / present; `generating` null / with `progress` null / with progress | Round-trip exactly |
| SC17 | U | 3 | No aliasing on decode | Decode twice from one doc; mutate the first | Second unaffected; doc unaffected |
| SC18 | U | 3 | Position validation | Parameterised (≈ 20 rows): board length / chars, pencil shape, `selected` 81, `mode`, `hintsRemaining` type, `incorrect` out of range, malformed `coach` / `undo` / `generating`, `solution` containing 0; `puzzle: null` | Each malformed row fails with a detail; `puzzle: null` passes |
| SC19 | U | 3 | Fingerprint parts | `fingerprint(state)` keys | Exactly the 11 parts of aspec §6.3 |
| SC20 ×11 | U | 3 | Each part isolates its fields | Change one field per row (puzzle id, a pen digit, a mark, selection, mode, hints remaining, won, incorrect set, undo, generating, coach focus) | Only that part differs |
| SC21 ×5 | U | 3 | Sub-fields of composite parts | `attemptRecorded` (hints); pending flag and completion message (highlight); coach recap / snapshot / revealed; coach step same technique, different target | Part differs in each case |
| SC22 | U | 3 | `describeState`, no puzzle | Empty state | `puzzle: null`, booleans false, `text` all dots, `recorder` passed through |
| SC23 ×3 | U | 3 | Puzzle fields | Generated with seed; generated with `seed: null`; loaded | `requestedTier`, `seed`, `fallback` present for generated only |
| SC24 ×3 | U | 3 | `hintsRemaining` | 3; `Infinity`; Unrated | `3`; `"unlimited"`; `null` |
| SC25 | U | 3 | Cell references | `selected` 0 / 80 / null; conflicts; flagged incorrect | `"r1c1"`, `"r9c9"`, `null`; ascending reference lists |
| SC26 ×4 | U | 3 | Booleans | `won`, `generating`, `undoAvailable`, `coachActive`, each both ways | Correct |
| SC27 | U | 3 | `text` | A known board | 11 lines; `d d d \| d d d \| d d d`; `.` for empty; `------+-------+------` after rows 3 and 6; givens and pen alike |
| SC28 | U | 3 | `pencilMarks` | Marks in several cells | 81 ascending lists |
| SC29 ×4 | U | 3 | `readDocument`: not a document | `null`; array; number; `format: 'other'` | `{ ok: false }` with "The JSON is not a session document." reason |
| SC30 ×6 | U | 3 | Version | Missing; `"1"`; `0`; `1.5`; `-1`; `2` | Version rejection naming *V* as written and "1 to 1" |
| SC31 | U | 3 | Upgrade loop | `readDocument(v1doc, { current: 2, upgraders: { 1: fake } })` | `fake` called once with the v1 doc; `readAs 2`, `writtenAs 1`; returned doc is the upgrade |
| SC32 | U | 3 | No upgrade needed | v2 doc with `current: 2` | Upgraders not called; `readAs === writtenAs` |
| SC33 | U | 3 | Input not mutated | Object input through SC31 | Caller's object unchanged |
| SC34 ×4 | U | 3 | Top-level shape | Missing `exportedAt`; `actions` not an array; an `errors` item with `afterAction: -1`; `seed` without `tier` | Fails (reason wording: §12 G16) |
| SC35 ×3 | U | 3 | `seed` / `tier` built | Start puzzle with numeric seed; `seed: null`; no puzzle | Both present with `tier = gen.requestedTier`; both absent; both absent |
| PR1 | U | 3 | Position round trip (§6.1) | — | — |

#### `unit/machine.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| MC1 | U | 3 | `createMachine` | A rich `PositionDoc` | Machine fingerprint equals the decoded position's |
| MC2 | U | 3 | Shape | — | Exposes `getState` and `dispatch` only |
| MC3 | U | 3 | Null statistics | Fill a rated board correctly on the machine | `won === true`; no `localStorage` or cookie writes (the machine's own null statistics object is not reachable, so absence of persistence is the observable) |
| MC4 | U | 3 | Null hint provider | `HINT` without `hint` | Nothing changes |
| MC5 | U | 3 | Inert timers | `CHECK` with a wrong digit; spy `window.setTimeout` | Zero calls; `highlightPending` stays true in `snapshot` |
| MC6 | U | 3 | `applyEntry` order | `{ a, f: [x, y] }` with a dispatch spy | `a`, `x`, `y` |
| MC7 | U | 3 | No follow-ups | `{ a }` | One dispatch |
| MC8 | U | 3 | Throw propagates | Entry whose decoded action throws (an `RESTORE_SESSION` with a hostile getter, or a spy `dispatch` that throws) | `applyEntry` throws |
| MC9 | U | 3 | `snapshot` independence | Snapshot, then further actions | Snapshot unchanged; a machine restored from it has the snapshot's fingerprint |
| MC10 | U | 3 | Isolation | Run 200 driver actions on a machine | No `localStorage`, IndexedDB, DOM, or global timer activity (spies) |

### 2.5 Phase 4 — recording

#### `unit/recorderStore.test.js` — real IndexedDB, one database name per test, deleted in `afterEach`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RS1 | U | 4 | Open empty | Fresh DB | `{ status: 'empty' }`; `meta.owner === ownerId`; `status() === 'ok'` |
| RS2 | U | 4 | Persist and load | `open`, `write({ put })` ×3, then a second store instance `open` | `loaded` with `start` and the three entries in `seq` order |
| RS3 | U | 4 | `discard: true` | Pre-populated DB | `empty`; old entries gone |
| RS4 | U | 4 | Trim transaction | `write({ put, removeBelow, start })` | Entries below `removeBelow` deleted, `meta.start` replaced |
| RS5 | U | 4 | Atomic trim | `failingIdb` aborts that transaction | Neither the delete, the put, nor the new `start` is visible |
| RS6 | U | 4 | Coalescing | 50 synchronous `write` calls; transaction counter proxy | ≤ 2 transactions; all 50 entries persisted in order |
| RS7 | U | 4 | Coalesced batch merge | Two pending trims with different `removeBelow` / `start` | Highest `removeBelow` and latest `start` win |
| RS8 | U | 4 | Failure → recovery | Abort the next write (with a `QuotaExceededError`-named error), then write again | `onStatus('failing')`, then a full rewrite from `snapshot()` (both stores cleared and refilled), `onStatus('ok')`; disk equals the snapshot |
| RS9 | U | 4 | Repeated failure | Two failing writes | Status stays `failing`; `onStatus` not repeated |
| RS10 | U | 4 | `replaceAll` | Status `failing`, then `replaceAll` | Full rewrite; `ok` |
| RS11 | U | 4 | `idb` undefined | `createRecorderStore({ idb: undefined })` | `open` → `unavailable`; writes are no-ops; `swallowed` `recorder.open` |
| RS12 | U | 4 | `open` errors | `erroringIdb()` | `unavailable`; `swallowed` |
| RS13 | U | 4 | Timeout | `hangingIdb()`, `openTimeoutMs: 10` | `unavailable` within 100 ms |
| RS14 | U | 4 | Late open after timeout | A fake whose `open` succeeds after 50 ms, timeout 10 | Status stays `unavailable`; the late connection is closed; no write reaches it |
| RS15 | U | 4 | Unknown stored form | Pre-seed `meta.form: 99` | `discarded`; the next write leaves only new content |
| RS16 | U | 4 | Malformed entry | Pre-seed an entry without `a` and without `e` | `discarded` |
| RS17 | U | 4 | Read error after open | `failingIdb` fails the entries `getAll` | `discarded`; `swallowed` |
| RS18 ×2 | U | 4 | `VersionError` | DB pre-created at version 2; (a) delete-and-reopen succeeds; (b) reopen fails | (a) `discarded`; (b) `unavailable` |
| RS19 | U | 4 | Ownership takeover | Stores A and B, same DB, different owners; A opens, B opens, A writes | A's status `lost`; B reads no entry from A's write; A's later writes are no-ops; `lost` survives B closing |
| RS20 | U | 4 | `onversionchange` | A open; `indexedDB.deleteDatabase(name)` | A closes, status `lost`; the delete completes (not `blocked`) |
| RS21 | U | 4 | Failure reporting | Every failure path above | Exactly one `swallowed` per failure with `where` `recorder.open` / `recorder.write`; no `window` error |
| RS22 | U | 4 | `onStatus` only on change | Sequence ok → ok → failing → ok | Called for each transition only |
| RS23 ×2 | U | 4 | `meta` absent | (a) no entries; (b) entries present | (a) `empty`; (b) per §12 G17 |

#### `unit/recorder.test.js` — real `createGameState` with `tap: recorder.tap`; fake store; `now` a counter

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RC1 | U | 4 | Boot suppression | Dispatch (with a listener re-dispatch) before `bootComplete` | Nothing recorded; depth bookkeeping leaves no open frame |
| RC2 | U | 4 | `bootComplete` | After a restore burst | `start` = `encodePosition(live)` |
| RC3 | U | 4 | One entry per top-level action | `SELECT_CELL` | One `{ t, a }`; `t` from `now()` |
| RC4 | U | 4 | Follow-ups | Listener re-dispatches two actions during `SELECT_CELL` | One entry with `f` holding both, in order; action count 1 |
| RC5 | U | 4 | Reducer consequences invisible | `PEN_ENTER` completing the board in a coach session | One entry, no `f` |
| RC6 ×4 | U | 4 | `nc` | `PEN_ENTER` on a given; `UNDO` with nothing; `HINT` with none left; a normal `PEN_ENTER` | `nc` on the first three only |
| RC7 ×3 | U | 4 | Informational actions | `COACH_NO_TECHNIQUE`; `COACH_START` with `result.type 'no-technique'`; `COACH_START` with a step | Never `nc`, though the first two change nothing |
| RC8 ×4 | U | 4 | `noteHint` | Wrapped provider; `HINT` placing a digit; `noteHint` with no open entry; with an open non-`HINT` entry; `HINT` whose guard fails | `a.hint = { cellIndex, digit, technique }`; ignored; ignored; stored without `hint`, `nc` |
| RC9 ×2 | U | 4 | Unrecordable | `{ type: 'NOPE' }`; `PEN_ENTER { digit: 'x' }` | No action entry; one `uncaught` error "Unrecordable action: NOPE" / "…: PEN_ENTER"; the reducer still ran |
| RC10 | U | 4 | Nothing reaches the store before the merge | Record entries, then resolve `open` | No `write` before; afterwards the merged history is handed over |
| RC11 | U | 4 | Capacity | Capacity 3, five actions | Three entries; base machine advanced by two; `start` equals `encodePosition` after the first two; one `write` carrying `put`, `removeBelow`, `start` |
| RC12 | U | 4 | Capacity, oldest is an error | Error then four actions, capacity 3 | Error removed; `start` unchanged by it |
| RC13 | U | 4 | `counts()` | Below and at capacity | `{ actions, errors, capacity, atCapacity }`; errors counted as entries, not repeats |
| RC14 ×3 | U | 4 | Error dedup | Same kind/message/stack/source twice; then one differing field; then same after an action | `n` 2 and the same `seq` re-put; new entry; new entry |
| RC15 | U | 4 | Capture re-entrancy | A recorder `change` listener throws (events.js → `listener-error` → `captureError` while capturing) | Exactly one error entry; no throw |
| RC16 | U | 4 | Capture failure dropped | Store `write` throws inside `captureError` | No exception; recording continues |
| RC17 ×3 | U | 4 | Tap failure isolation | Injected `now` throws in `begin`; `log.action` throws in `end`; store `write` throws in `end` | One error entry each; the dispatch's state change and emits unaffected; caller sees no exception |
| RC18 | U | 4 | Merge `loaded` | Store returns 4 entries (seq 1–4) and a `start` | History: stored `start`, stored entries, `PAGE_RELOADED { position: P₀ }` with the boot time, post-boot entries; new `seq` > 4 |
| RC19 | U | 4 | Merge then trim | `loaded` with capacity − 1 entries plus 3 post-boot | Trimmed; base advanced from the stored `start` |
| RC20 ×2 | U | 4 | `empty`, `unavailable` | — | `start = P₀`; post-boot entries; `storageStatus()` `ok` / `unavailable` |
| RC21 | U | 4 | `discarded` | — | As `empty`; status `discarded` |
| RC22 ×2 | U | 4 | `ready` always settles | `open` resolves; `open` rejects | Resolves both times |
| RC23 | U | 4 | `exportDocument` | History with errors before the first action, after action 2, and with `n > 1`; `nc` and `f` entries | `afterAction` 0 / 2; `count`; `noChange`, `then`; `exportedAt` from `now()`; validates through `readDocument` |
| RC24 | U | 4 | Export is a copy | Mutate the returned doc | Recorder unchanged |
| RC25 | U | 4 | Empty history export | Right after `bootComplete` | Valid document with `actions: []` |
| RC26 | U | 4 | `clear()` | With entries | Returns removed counts; `start` = current live position; `replaceAll` called; `seq` continues |
| RC27 | U | 4 | `replaceHistory` | Given start and entries | Content replaced; `seq` continues; `replaceAll` |
| RC28 | U | 4 | `silently` | `silently(() => dispatch(A))` where a listener re-dispatches B | A not recorded; B recorded as a top-level entry |
| RC29 | U | 4 | `silently` scope | Next top-level dispatch after it | Recorded normally |
| RC30 | U | 4 | `mark` / `errorsSince` | Errors before and after a mark | Only the later ones |
| RC31 ×2 | U | 4 | Events | Action; store status change | `change` with counts; `storage` with status |
| RC32 | U | 4 | Action trace hand-off | Fake `log`, fake `clock` | `log.action(entry, changedParts, ms)` once per top-level entry with the differing parts and `ms = end − begin`; not for follow-ups or unrecorded frames |
| RC33 | U | 4 | `GEN_PROGRESS` at capacity | Capacity 5, 20 progress actions | Each recorded; oldest displaced; `start` advances |

#### `unit/devLog.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DL1 | U | 4 | Defaults | Nothing stored | `{ generation: true, swallowed: true, actions: false }` |
| DL2 ×3 | U | 4 | Per-key defaults | Stored `{ actions: true }`; `{ generation: 'yes' }`; a non-object | Valid keys kept; others default |
| DL3 ×2 | U | 4 | `set` | Change; same value | `true`, stored, `change` emitted; `false`, no write, no emit |
| DL4 | U | 4 | Storage unavailable | `storage.setItem` is the real wrapper with `Storage.prototype.setItem` throwing | Change takes effect for this page |
| DL5 ×2 | U | 4 | Generation output | On / off | `out.log('[dev:gen]', event, data)` / nothing |
| DL6 ×2 | U | 4 | Swallowed output | On / off | `out.warn('[dev:swallowed]', where, error)` / nothing |
| DL7 ×3 | U | 4 | Action trace | On with changed parts; on with none; off | `out.log('[dev:action]', type, doc, parts, '1.2 ms')`; `'no change'`; nothing |
| DL8 | U | 4 | Immediate effect | Toggle between two emits | Second emit follows the new setting |
| DL9 | U | 4 | `dispose` | Dispose, then emit | No output |

#### `unit/devBoot.test.js`

Needs `boot` to accept injected `window` / `idb` or to return a `dispose` (§12 G4). Synthetic events via `window.dispatchEvent(new ErrorEvent(…))` and `new PromiseRejectionEvent(…)`.

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DB1 | U | 4 | Shape | `boot()` | `tap`, `wrapHintProvider`, `bootComplete`, `recorder`, `log` |
| DB2 | U | 4 | `wrapHintProvider` | Provider returning `h` | Returns `h`; `noteHint(h)` called |
| DB3 ×3 | U | 4 | `error` event | With `error` and `filename`; without `filename`; without `error` | `uncaught`; `source "f:l:c"` / `null`; `stack` / `null` |
| DB4 ×3 | U | 4 | `unhandledrejection` | `Error` reason; string reason; `undefined` | `rejection`; `message` from `.message` / `String(reason)`; `stack` / `null` |
| DB5 ×2 | U | 4 | `listener-error` | Payload with `action`; without | `listener` with `action` type / `null` |
| DB6 | U | 4 | No `preventDefault` | DB3 event | `defaultPrevented === false` |
| DB7 ×2 | U | 4 | Fresh session | `isFreshDevSession` true / false | `open({ discard: true })` / `open({ discard: false })` |
| DB8 | U | 4 | `ownerId` | Two boots | Differ |
| DB9 | U | 4 | Capture independent of logging | All switches off | Errors still captured |

#### `unit/devMode.test.js` (extended)

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DM10 | U | 4 | Purge | Create `sudoku-dev-recorder`; `initDevMode('?dev=0')` | `indexedDB.databases()` no longer lists it |
| DM11 | U | 4 | Throwing `deleteDatabase` | Redefine `window.indexedDB` (own configurable property; restored in `finally`) to an object whose `deleteDatabase` throws | No throw; returns `false`; no `swallowed` emit |
| DM12 | U | 4 | `indexedDB` undefined | Redefine to `undefined` | No throw |
| DM13 | U | 4 | Fresh | `?dev=1` with nothing saved | `isFreshDevSession() === true` |
| DM14 ×4 | U | 4 | Not fresh | `?dev=1` when already saved; `''` with saved on; `?dev=0`; `?dev=yes` | `false` |
| DM15 | U | 4 | Constant | — | `RECORDER_DB === 'sudoku-dev-recorder'` |

#### Integration, recording in the app (`integration/debug.test.js`, Phase 4 group)

Phase 4 has no UI. These tests read the recorder database directly from the test page (same
origin) with a small `readRecorderDb()` helper.

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DBG-B1 | I | 4 | Fresh boot with no saved game | `?dev=1` | History starts at the boot position (`puzzle: null`); first entry `SET_GENERATING`; later `GEN_PROGRESS` / `PUZZLE_LOADED` entries |
| DBG-B2 | I | 4 | Restore burst not recorded | `seedSavedGame` with pen and pencil entries | No `SELECT_CELL` / `PEN_ENTER` / `PENCIL_TOGGLE` / `RESTORE_SESSION` entries; `start` holds the restored board |
| DBG-B3 | I | 4 | Reload keeps history | Play 3 moves; reload without the parameter | Earlier entries, then `PAGE_RELOADED` with the restored position; `seq` increasing |
| DBG-B4 | I | 4 | `?dev=0` purges; `?dev=1` restarts | — | DB gone after `?dev=0`; new history after `?dev=1` |
| DBG-B5 | I | 4 | Hint carries its result | UI hint | Entry `HINT` with `hint { cellIndex, digit, technique }` matching the placed digit |
| DBG-B6 | I | 4 | Difficulty change is one entry | Change difficulty | One `CHANGE_DIFFICULTY` with `then: [SET_GENERATING …]` |
| DBG-B7 | I | 4 | Check highlight expiry recorded | Check with a wrong digit; wait 3.5 s | A top-level `CLEAR_INCORRECT` entry |

### 2.6 Phase 5 — replay engine, helper, fixtures, sweep

#### `unit/replay.test.js`

`prepare` — rejection texts are asserted exactly; each is also asserted through
`outcomeMessage` (RP37).

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RP1 | U | 5 | Empty | `''` | "No session document was supplied." |
| RP2 | U | 5 | Not JSON | `'{'` | "The text is not valid JSON." |
| RP3 ×4 | U | 5 | Not a document | `'[]'`, `'3'`, `'null'`, `{ format: 'x' }` | "The JSON is not a session document." |
| RP4 ×5 | U | 5 | Version | Missing, `"1"`, `0`, `1.5`, `2` | "It is format version *V*; this build reads versions 1 to 1." |
| RP5 | U | 5 | Start structure | Malformed `start.board` | "Its starting position is not valid: *detail*." |
| RP6 ×5 | U | 5 | Start puzzle | `checkPuzzles` returns each of `contradiction`, `complete`, `no-solution`, `multiple`, `solution-mismatch` for the start puzzle | Detail is `rejectionDetail(reason)`; for mismatch "The recorded solution is not the puzzle's solution." |
| RP7 ×2 | U | 5 | Lowest-numbered invalid action wins | Structural failure at 5 and puzzle failure at 3; structural at 2 and puzzle at 7 | "Action 3 is not valid: …"; "Action 2 …" |
| RP8 | U | 5 | Validation covers the whole document | Invalid action 9, `stopAfter: 2` | Rejected on action 9 |
| RP9 ×3 | U | 5 | Check order | Start + action + stop all invalid; action + stop; stop + no-puzzle | Start; action; stop |
| RP10 | U | 5 | Stop value | Parameterised: `undefined`, `null`, `''` → all; `'0'` → 0; `'007'` → 7; `3` → 3; `'3.0'`, `'-1'`, `'1e2'`, `'abc'`, `3.5`, `-1`, `NaN`, `Infinity` | Accepted values give the stated `n`; others "Stop after must be a whole number, 0 or greater." |
| RP11 | U | 5 | Stop beyond the end | `stopAfter: 99`, 5 actions | `n = 5`; ok |
| RP12 ×6 | U | 5 | End with no puzzle | Start `null`, `n` 0; start `null` + `PUZZLE_LOADED` at 1, `n` 0 vs 1; `PAGE_RELOADED { puzzle: null }` last within `n`; the same followed by `NEW_PUZZLE` within `n`; `DEV_RESTORE_POSITION { puzzle: null }` last | Reject / reject / ok / reject / ok / reject with "It would end before any puzzle is loaded. Choose a later stopping point." |
| RP13 | U | 5 | One check call, distinct puzzles | Same puzzle in start, `PUZZLE_LOADED`, `PAGE_RELOADED`; a second puzzle in `NEW_PUZZLE` and `DEV_RESTORE_POSITION`; a structurally invalid `PUZZLE_LOADED` | `checkPuzzles` called once with exactly the two valid distinct puzzles |
| RP14 | U | 5 | No puzzles anywhere | Start `null`, no puzzle actions | Not called or called with `[]`; then rejected for no puzzle |
| RP15 ×2 | U | 5 | Internal failure | `checkPuzzles` rejects; `checkPuzzles` throws synchronously | "The session couldn't be checked." |
| RP16 | U | 5 | Object input copied | Object document | Caller's object deep-equals its original after `prepare` and `run` |
| RP17 | U | 5 | Success | Valid doc | `{ ok, doc, n, total, notes }` |
| RP18 | U | 5 | Upgrade note | Needs `prepare` to forward `{ current, upgraders }` (§12 G5) | Note "Document format version 1 was read as version 2." |

`run`, `compare`, report:

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RP19 | U | 5 | `n = 0` | — | Position = start; `applied 0`; `entries []` |
| RP20 | U | 5 | Application | 5 actions with a `then` | Position after all; `entries` have the documents' times; follow-ups applied after their parent |
| RP21 | U | 5 | Jobs | Doc with `COACH_START`, `COACH_NO_TECHNIQUE`, `HINT`, and other kinds | Jobs only for the three kinds, each with the pre-action `puzzle`, `pen`, `pencil`, `conflicts`, `selected`, its number, and `noChange` |
| RP22 | U | 5 | Coach session in the start | — | Not-compared item `{ action: 0, kind: 'coach' }` with the fixed reason |
| RP23 ×2 | U | 5 | Ends generating | Last applied action `SET_GENERATING true`; `n = 0` with a generating start | Extra `SET_GENERATING false` in `entries` with the last action's time and the note; the `n = 0` case per §12 G17 |
| RP24 | U | 5 | Stopped | `makeMachine` whose `dispatch` throws at action 4 | `position` = snapshot before 4; `stopped { at: 4, message }`; `applied 3`; no job for action 4 (§12 G10) |
| RP25 | U | 5 | `noChange` actions applied | — | Applied; result is whatever the reducer does |
| RP26 | U | 5 | No live side effects | Spies on `localStorage`, `window.setTimeout`, a live store | Untouched |
| RP27 ×4 | U | 5 | Not compared, and its order | Unrated job; `noChange` job; `analyze` throws "boom"; Unrated and `noChange` together | The Unrated reason; the noChange reason; "the current code raised an error: boom"; the Unrated reason |
| RP28 | U | 5 | Coach match | Recorded step equals `analyze` | Compared, no divergence |
| RP29 ×12 | U | 5 | Each coach part | `analyze` returns the recorded step with one of `technique`, `type`, `rank`, `digits`, `unit`, placement, `eliminations`, `roles`, `arrows`, text (`supportingText` or `complexity.note`), complexity (`acknowledged` / `endpoints`), `autoReveal` changed | Exactly that part in `differences` with recorded and current values |
| RP30 ×2 | U | 5 | Step vs no-technique | Each direction | Only `technique`, one side `"none (" + reason + ")"` |
| RP31 ×2 | U | 5 | No-technique both sides | Same / different reason | Match / `technique` differs |
| RP32 ×2 | U | 5 | Canonical comparison | Eliminations in another order; object keys in another order | No divergence |
| RP33 ×4 | U | 5 | Hint parts | Differs in cell; digit; technique; current returns `null` | One difference per part; `null` reported as the current value |
| RP34 | U | 5 | Counts | 2 coach + 1 hint compared, 1 not compared | `compared 3`, `counts { coach: 2, hint: 1 }` |
| RP35 ×3 | U | 5 | Yielding | `yieldEvery: 0`; `yieldEvery: 1e9`; default `pause` once | `pause` between jobs; never; the default resolves (real `setTimeout`) |
| RP36 | U | 5 | Call arguments | Spies | `analyze(puzzle, { pen, conflicts, pencil })`; `nextHint(puzzle, { pen, conflicts }, { targetCell: selected })` |
| RP37 ×8 | U | 5 | `outcomeMessage` | No divergences; one and several divergences; nothing to compare; each with not-compared items; stopped; rejected | §5.9 texts exactly; `error: true` for stopped and rejected only |
| RP38 ×2 | U | 5 | Recorded errors range | Errors with `afterAction` equal to and greater than `applied` | Equal included; greater excluded |
| RP39 | U | 5 | `formatReportLines` | Parameterised over: scope line with each note; three summaries; technique-differs item with and without "Also differs:"; same-technique item; hint item (one per part, with the cell reference); not-compared items including "Starting position — coach step: not compared — the position before it is not in the document."; errors sentence and items of each kind with " (×*n*)" only when `count > 1`; parts omitted when empty | §5.8 texts exactly; time via the injected formatter |
| RP40 | U | 5 | Report time stays ISO | — | `divergences[i].time` equals the document's `at` |

#### `unit/replayFixture.test.js`, `unit/session-fixtures.test.js`, `unit/fidelity-sweep.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RF1 | U | 5 | Object and text input | Same doc both ways | Deep-equal results |
| RF2 | U | 5 | Rejection | RP-style invalid docs | Throws `Error` whose message is the §5.9 rejected message |
| RF3 | U | 5 | Stopped | Needs a `makeMachine` pass-through (§12 G6) | Resolves with `report.stopped` and the reached `state` |
| RF4 | U | 5 | Shape | Any doc | `state` has every §6.2 field; `recorder.actions === applied` |
| RF5 | U | 5 | Determinism | Run twice; second run with `Date.now` stubbed far ahead, `localStorage` filled with junk, and a recorder database present | Deep-equal |
| RF6 | U | 5 | No side effects | Snapshot `localStorage`, `indexedDB.databases()`, `document.body.childElementCount`, `window.setTimeout` spy | Unchanged; zero timer calls |
| RF7 | U | 5 | `stopAfter` | — | Honoured |
| RF8 ×2 | U | 5 | `loadSessionFixture` | Existing; missing name | Parsed doc; rejects naming the file |
| FX1–FX9 | U | 5 | Fixtures | §7 | §7 |
| PR2, PR3 | U | 5 | Sweeps | §6 | §6 |

### 2.7 Phase 6 — controller, API, `main.js` foreground options

#### `unit/devSession.test.js`

Real `createGameState`; real recorder (in-memory store) bootstrapped with `bootComplete`;
real `devLog` with a fake `out`; fakes for every injected function. `confirm` is a fake
that models `dialog.js` replacement: opening a second resolves the first with `false`.

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DS1 | U | 6 | `state()` | — | `describeState(live, counts)` |
| DS2 ×3 | U | 6 | `load` argument | Number; `undefined`; object | `invalid-argument` |
| DS3 ×6 | U | 6 | `load` outcomes | Loaded; rejected; panel declined; API with progress, no `replace`; API `replace: true`; API without progress | `ok` + `tier`; `rejected`; declined message; `needs-replace` with "Pass replace: true to replace a game with progress." appended; `loaded` (per-call `confirm` returns `true`); `loaded` with `confirm` never called |
| DS4 ×4 | U | 6 | `inspect` | No puzzle; solvable; stalled; placement and elimination steps | `no-puzzle` "No puzzle loaded."; fields; `hardestRank` / `tier` `null`; step mapping with cell references; game state and dispatch untouched |
| DS5 ×2 | U | 6 | `coachStep` | Active; inactive | `{ active: true, step }`; `{ active: false, step: null, message: 'No active coach session.' }` |
| DS6 ×3 | U | 6 | `candidates` | No puzzle; board; filled cells | `no-puzzle`; basic candidates; `[]` for filled |
| DS7 | U | 6 | `setPencilMarks` failures, in order | Parameterised: no puzzle; won; generating ("A puzzle is being generated."); `'R4C7'`, `'r0c1'`, `'r10c1'`, `4`, `null` (`invalid-cell`, "*value* is not a cell reference such as r4c7."); given; pen digit (`cell-filled`); `[0]`, `[10]`, `[1.5]`, `'123'`, `['1']`, `null` (`invalid-digits`); precedence rows (no puzzle + bad cell → `no-puzzle`; bad cell + bad digits → `invalid-cell`) | Exact reason and message; nothing dispatched |
| DS8 ×3 | U | 6 | `setPencilMarks` success | `[3, 1, 3]`; `[]`; already as requested | `DEV_SET_PENCIL` with the mask; `digits [1, 3]`; cleared; ok with nothing changed (announcement per §12 G11) |
| DS9 ×4 | U | 6 | `fillPencilMarks` | The three failures; success | `cellsChanged` counted against the marks before; one dispatch; second call `cellsChanged: 0` |
| DS10 | U | 6 | `exportSession` | — | `{ ok: true, document }` |
| DS11 ×2 | U | 6 | `copySession` | `copy` true / false | "Session copied: *A* actions, *E* errors."; failure message, error flag, and the document text for the fallback |
| DS12 | U | 6 | Replay rejected | Invalid doc, panel | Empty report then error status emitted; announced; `confirm` never called; game and history untouched |
| DS13 ×4 | U | 6 | Confirmation body | Progress × history (fspec §5.4) | Three bodies exactly, counts as at dialog open; no dialog for neither |
| DS14 | U | 6 | Declined | Panel Cancel | Declined message; no empty report emitted; no `cleared-fallback`; game and history unchanged |
| DS15 ×5 | U | 6 | API intent | Missing `replace`; missing `discardHistory`; both; flags present but unneeded; invalid doc with all flags | Exact `reason`, `missing`, and message of fspec §6.8 (including the counts); ok; `rejected` |
| DS16 | U | 6 | Proceed order | Spies on every collaborator | `beforeReplace` → empty report + `cleared-fallback` → `replaceHistory(doc.start, entries)` → one `DEV_RESTORE_POSITION` inside `muted` and `silently` → `applying` false → "Comparing with current code…" → report → one announcement |
| DS17 | U | 6 | One live dispatch | Live store `dispatch` spy | Exactly one call during the replay |
| DS18 | U | 6 | History after | — | Doc start + applied entries with original times; the commit not recorded; document errors not carried; errors raised during the replay carried |
| DS19 | U | 6 | Stopped | Needs machine injection through the controller (§12 G6) | `captureError` uncaught; `reason: 'stopped'`, `applied`, `total`, `stoppedAt`, §5.9 stopped message; position before the failing action |
| DS20 | U | 6 | Evaluated after checking | Deferred `checkPuzzles`; a digit entered while pending | Dialog asked with the progress row |
| DS21 ×2 | U | 6 | Focus | Panel: a listener moves focus in a frame; API: focus elsewhere | Restored to the remembered element on the next frame |
| DS22 | U | 6 | Single announcement | Replay ending on a won board in a recap | Live region: exactly one non-empty text, the outcome |
| DS23 ×6 | U | 6 | `busy` during the commit | A `changed` listener calls `clearHistory`, `setPencilMarks`, `fillPencilMarks`, `load`, `generate`, API `replay` | Each `busy` "A replay is running."; history intact; `logging()` / `setLogging` from the same listener succeed |
| DS24 ×2 | U | 6 | Panel supersession | Second panel replay while the first is (a) checking (deferred `checkPuzzles`), (b) confirming | First resolves declined and never replaces; second proceeds; one replace in total |
| DS25 | U | 6 | Panel waits | Second panel replay while the first is comparing (deferred `pause`) | Second starts after the first resolves |
| DS26 ×5 | U | 6 | API never superseded | API replay while another is checking, confirming, applying, comparing (panel or API) | `busy`; and a panel replay during an API replay waits |
| DS27 | U | 6 | API result | Success | `applied`, `total`, `message`, `report` |
| DS28 | U | 6 | Events | Success | `replay-status` "Checking session…", "Comparing with current code…", outcome; `replay-report` empty then final |
| DS29 ×7 | U | 6 | `clearHistory` | Busy; panel with entries confirmed / declined; empty (no dialog); API no flag with entries; API with flag; API empty without flag | `busy` first; dialog wording of fspec §10.1.1, "History cleared." / "History not cleared."; ok 0/0 announced; `needs-discard-history` with counts, nothing announced, no event; `discarded` counts; ok |
| DS30 | U | 6 | Error during an open confirmation | Capture an error while the clear dialog is open; confirm | Cleared count includes it; dialog body counts are those at open |
| DS31 ×3 | U | 6 | Tier | API `'NIGHTMARE'`; `'bogus'`; panel tier | Accepted; `invalid-tier` message; accepted |
| DS32 | U | 6 | Seed | Parameterised: valid `'0'`, `'4294967295'`, `' 42 '`, `42`, `0`; invalid `''`, `'4294967296'`, `'-1'`, `'+1'`, `'1.0'`, `'1e3'`, `'0x10'`, `'12345678901'`, `'abc'`, `1.5`, `-1`, `4294967296`, `NaN`, `null`, `undefined` | `invalid-seed` "Seed must be a whole number from 0 to 4294967295." for the invalid set |
| DS33 ×2 | U | 6 | Progress | Panel declined; API without `replace` | "No puzzle generated. Your game continues."; `needs-replace`; `generateSeeded` never called |
| DS34 ×3 | U | 6 | Fallback mode | Panel; API `acceptFallback`; API without | `'ask'`; `'accept'`; `'refuse'`; `budget` forwarded |
| DS35 ×9 | U | 6 | Outcome mapping | `loaded` without / with fallback; `loaded` Unrated; `needs-accept-fallback` rated / Unrated; `fallback-declined`; `cancelled`; `replaced`; `failed` | aspec §11.4 table and fspec §7.5 texts exactly; API fields `requestedTier`, `tier`, `seed`, `fallback`, `diagnostics` |
| DS36 | U | 6 | Announcements | Each outcome, panel and API | A game-changing result is announced; API failures are not (§12 G12) |
| DS37 ×4 | U | 6 | Logging | `setLogging('Generation', true)`; `('generation', 1)`; `('bogus', 1)`; change and no-change | `invalid-category` (exact case); `invalid-value`; `invalid-category` (category first); "Generation worker logging on." announced / same wording, not announced |

#### `unit/devApi.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DA1 | U | 6 | Surface | `install(fakeSession)` | `window.sudokuDev` frozen with exactly `state`, `load`, `inspect`, `coachStep`, `candidates`, `setPencilMarks`, `fillPencilMarks`, `exportSession`, `replay`, `generate`, `clearHistory`, `logging`, `setLogging` |
| DA2 ×13 | U | 6 | Forwarding | Each method | Controller called with `{ ask: false, … }` and `'api'`; `replay` input passed as given (object identity, text) |
| DA3 ×13 | U | 6 | Never throws | Controller throws synchronously or rejects | `{ ok: false, reason: 'failed', message }`; async methods resolve |
| DA4 | U | 6 | `budget` | Bad tier + bad budget; bad seed + bad budget; budget `0`, `-1`, `1.5`, `'3'`, `NaN`; `1`; omitted | `invalid-tier`; `invalid-seed`; `invalid-budget` "Budget must be a whole number of 1 or more."; forwarded; not forwarded |
| DA5 | U | 6 | Sync vs async | — | Read methods return objects; `load`, `replay`, `generate` return promises |

#### `main.js` and the mounted panel (Phase 6 portion)

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DP70 | U | 6 | `mount` awaits `ready` | `fakeDev` with a deferred `ready` | No `#dev-root` until it resolves |
| DP71 | U | 6 | API last | — | `window.sudokuDev` absent until the panel DOM exists, then present |
| DBG-G1 | I | 6 | Seeded run, Kiddie | `sudokuDev.generate('kiddie', 1, { replace: true })` | Ok; puzzle `id` `2fe4fb4f` (PD1 pin); pre-generation storage keys unchanged; `DIFF_KEY` unchanged; `gen.seedBy 'developer'` |
| DBG-G2 | I | 6 | Reproducible through the worker | Same call twice across a reload | Deep-equal puzzle and `gen` |
| DBG-G3 | I | 6 | Lower-tier fallback | `('easy', 26)` | `fallback: true`, `tier 'hard'`, §7.3 message; loaded without a dialog |
| DBG-G4 ×2 | I | 6 | Top-tier fallback, `refuse` / `accept` | `('nightmare', 1, { budget: 3 })` without and with `acceptFallback` | `needs-accept-fallback`, busy cleared, game unchanged; loads Easy, `DIFF_KEY` becomes `easy` |
| DBG-G5 ×3 | I | 6 | Unrated (§9.5) | `('expert', 223, { budget: 1, replace: true })`; `('nightmare', 223, { budget: 1 })`; the same with `acceptFallback` | `tier 'unrated'`, selector "Unrated", Hint "–", Coach disabled, `DIFF_KEY` unchanged; `needs-accept-fallback` with "…can't be rated…"; loads Unrated, `DIFF_KEY` unchanged |
| DBG-G6 ×3 | I | 6 | Cancelled / replaced | Nightmare seeded run with the real budget; then (a) busy-card Cancel, (b) New Puzzle, (c) load from string | `cancelled` "Generation cancelled.", prior state exact; `cancelled` "Generation replaced by another request." for (b) and (c) |
| DBG-G7 | I | 6 | Seeded run replaces boot generation | First-ever boot (no saved game, Diabolical preference) then a seeded Kiddie run | Seeded puzzle is the first puzzle; boot result never lands |
| DBG-G8 | I | 6 | API focus | Focus on a board cell; API `generate` | Focus unchanged (§12 G13) |

### 2.8 Phase 7 — panel

#### `unit/recorderPanel.test.js`

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| RPN1 | U | 7 | Markup | `mount` | aspec §12.1 structure, ids, labels, `aria-describedby`, roles; counts line not a live region; report `role="region"`, label, `tabindex 0` |
| RPN2 ×3 | U | 7 | Counts | 0/0; 1,234 actions; at capacity | "1,234 actions, 0 errors recorded."; capacity span "At capacity (5,000): …" |
| RPN3 | U | 7 | Coalescing | 10 `change` events in one task | One text update (MutationObserver) on the next frame |
| RPN4 ×5 | U | 7 | Storage line | `ok`, `unavailable`, `failing`, `discarded`, `lost` | Empty / the three fspec messages; announced once on change; repeated status not re-announced; return to `ok` clears without announcing |
| RPN5 | U | 7 | Copy success | — | Status text, plain style, announced; focus on Copy session; fallback hidden |
| RPN6 | U | 7 | Copy failure | — | Fallback unhidden; textarea value is the 2-space JSON; focused; `selectionStart 0`, `selectionEnd` = length; `scrollTop 0`; error-styled status, announced |
| RPN7 ×5 | U | 7 | Fallback lifetime | Next Copy success; `cleared`; `cleared-fallback`; rejected replay; declined replay | Hidden, hidden, hidden, kept, kept |
| RPN8 | U | 7 | Replay wiring | Click Replay | `session.replay(docText, { stopAfter: stopText }, { ask: true }, 'panel')`; both fields keep their content after every outcome |
| RPN9 ×3 | U | 7 | Status and report from events | Panel-originated; API-originated; rejected / stopped | Same elements filled; report emptied with `replaceChildren` (`:empty`); error style only for rejected / stopped |
| RPN10 | U | 7 | Report rendering | A report with every part | Elements of aspec §12.1; two `pre.dev-json` with JSON of only the differing parts and names "Recorded values" / "Current values"; empty parts omitted; time zero-padded local `HH:MM:SS.mmm` (expected value computed in the test from local getters) |
| RPN11 ×3 | U | 7 | Clear history | Panel confirmed; panel declined; API `cleared` | "History cleared." / "History not cleared." in the history status, focus back on the button; API clears report and fallback and leaves the history status untouched |
| RPN12 ×3 | U | 7 | Switches | Initial; click with a fake session that does not change the log; API change with the section collapsed | `aria-checked` from `log.get()`; unchanged (follows the log only); follows the log |
| RPN13 | U | 7 | Status elements persist | Several operations | Same element identity throughout |
| RPN14 | U | 7 | Board keys | Keydown digits / Backspace / arrows in the fallback textarea, replay textarea, stop input | No board dispatch (keyboard.js text-field guard) |
| RPN15 | U | 7 | `hidden` beats `display` | Fallback hidden with `dev.css` loaded | Computed `display: none` |

#### `unit/devPanel.test.js` (extended)

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DP72 | U | 7 | Six tools | — | Ids `dev-load`, `dev-inspector`, `dev-overlay`, `dev-coach`, `dev-gen`, `dev-rec`, all collapsed |
| DP73 ×3 | U | 7 | Seed row | Seed number; `null`; loaded puzzle | Value and enabled Copy seed; "Not recorded" and disabled; no table, message as today, status line still present |
| DP74 ×2 | U | 7 | Copy seed | `copy` true / false | "Seed copied." / error-styled failure; both announced; copies the decimal text |
| DP75 | U | 7 | Only `#dev-gen-info` re-renders | Type in the seed field, then a `puzzle` change | Field value and focus kept; status and group elements are the same nodes |
| DP76 | U | 7 | Tier select init | `getGenerationTier` returns `'hard'` | Selected `hard`; seven options |
| DP77 ×2 | U | 7 | Validation state | Bad seed; then an `input` event | `aria-invalid="true"`, `aria-describedby="dev-gen-status"`, error status; both removed |
| DP78 ×6 | U | 7 | Run end focus and status | Fake controller resolving each outcome | `#dev-gen-run` focused; status texts; "Generating from seed *S*…" while pending |
| DP79 | U | 7 | Tier and seed fields keep content | After each outcome | Unchanged |

### 2.9 Phase 8 — end to end, accessibility, performance

`integration/debug.test.js` (in addition to the Phase 4 and 6 groups):

| ID | Type | Ph | Covers | Setup / input | Expected |
|---|---|---|---|---|---|
| DBG-OFF1–7 | I | 8 | Dev-off guarantee | §4 | §4 |
| DBG-SYS1 | S | 8 | Record → export → replay | Tab A: seeded Hard game, digits, pencil, a coach start, a hint, Check; `exportSession`. Tab B (fresh, other progress): paste into the panel, Replay, confirm | Board, marks, selection, mode, hints, coach state equal A's final `state()`; "No divergences in *k* computed results."; history replaced; focus on Replay |
| DBG-SYS2 | S | 8 | Seed round trip | Copy seed from diagnostics in tab A; generate it in tab B through the panel | Same puzzle; diagnostics identical except "Seed chosen by" |
| DBG-R1 | I | 8 | Replayed game persists | After DBG-SYS1, reload | Replayed game restored; history persisted with the replayed entries |
| DBG-R2 | I | 8 | Ends won | Fixture `won-board.json` | Banner shown, no stats, saved game removed, focus stays on Replay |
| DBG-R3 | I | 8 | Ends in a recap | `coach-recap-end.json` | Recap shown a full 2.5 s from the end |
| DBG-R4 | I | 8 | Highlight pending | Doc ending right after a Check | Highlight clears ~3 s after the end |
| DBG-R5 | I | 8 | Replay over a running generation | Diabolical cold boot, replay during generation | Busy ends; the generated puzzle never lands (2.5 s lower-bound wait) |
| DBG-R6 | I | 8 | Ends generating | `generating-at-end.json` | Busy cleared; note in the report |
| DBG-R7 | I | 8 | Other tools after replay | Inspector run and set to a step, overlay on, before replay | Inspector "Board changed — run the solver again.", Restore disabled; overlay on with basic candidates; coach data and diagnostics follow the document |
| DBG-R8 | I | 8 | Open dialog closed | New Puzzle confirmation open (via its button) when an API replay with flags commits | Dialog closed; nothing else happens |
| DBG-M1 | I | 8 | Two tabs | Iframe A `?dev=1`, then iframe B `?dev=1`; record in A | A's storage line shows the takeover message (announced once); B's history has no A entries after takeover; A's `exportSession` still complete |
| DBG-L1 | I | 8 | Logging persists | Switch action trace on; reload; `?dev=0` then `?dev=1` | Still on |
| DBG-L2 | I | 8 | Console tags | Spy on the app frame's `console` | `[dev:gen]` on generation, `[dev:action]` per action when on, nothing when off |
| DBG-L3 ×2 | I | 8 | Swallowed in the app | (a) Corrupt a pre-generation entry before boot; (b) New Puzzle twice in one task | (a) `[dev:swallowed] pregen.load …`; (b) `[dev:swallowed] main.requestForeground …` |
| DBG-E1 ×3 | I | 8 | Error capture | A `window.gameState.on` listener throws; `setTimeout(() => { throw … })` in the app frame; `Promise.reject` | Listener entry with action type; uncaught entry with source; rejection entry; app keeps working |
| DBG-A1 | I | 8 | API smoke | Each method once against the live app | Every result is a plain object; `state()` matches the DOM board |

---

## 3. Changes to Existing Tests and the Normal-Mode Regression Net

### 3.1 Existing tests that must change

| File | Change | Phase |
|---|---|---|
| `setup.html` | Add the new unit files (`state-golden`, `state-devtools`, `sessionCodec`, `machine`, `recorderStore`, `recorder`, `devLog`, `devBoot`, `replay`, `replayFixture`, `session-fixtures`, `fidelity-sweep`, `devSession`, `devApi`, `recorderPanel`) and `integration/debug.test.js`, in phase order | each |
| `setup.js` | Global `afterEach`: `diagnostics.clear()`; delete `sudoku-dev-recorder` (await the request; integration iframes are removed first by each file's own `afterEach`) | 1 / 4 |
| `unit/arch.test.js` | AR-D1 widened to any static `/dev/` import other than `devMode.js`, file list per aspec §14.4 (already edited in the working tree — review it against §14.4); new AR-D4 (`devMode ? (await import('./dev/devBoot.js'))`); AR-D3 tokens `sudokuDev`, `dev-rec`, `devBoot`; new AR-D5 (`indexedDB` only in `js/dev/` and tests). Recommendation: derive the always-loaded list by crawling static imports from `/js/main.js` and `/js/worker/generator.worker.js` rather than a hand list, so a new always-loaded file is checked automatically (§12 G19) | 1, 4 |
| `unit/devPanel.test.js` | `mountPanel` becomes `async` and passes `dev: makeFakeDev()`; all ~70 call sites `await` it; DP5 / the tool-id list become six; DP43–DP47 select the table inside `#dev-gen-info` | 6, 7 |
| `unit/inspect.test.js` | IN33 expected rows gain the two seed rows first; IN35 additionally asserts the seed rows | 2 |
| `unit/pipeline-diagnostics.test.js` | PD2 asserts `gen.seed` and `gen.seedBy`; PD7 asserts the tier is not `unrated`. PD1 pins must not change | 2 |
| `unit/protocol.test.js` | WP2 envelope assertions extended with `seeded` | 2 |
| `unit/events.test.js` | EV11–EV15 added; EV5 unchanged (it now also proves nothing reaches a listener-less `diagnostics`) | 1 |
| `unit/devMode.test.js` | DM10–DM15 added; existing `afterEach(initDevMode(''))` also resets the fresh flag | 4 |
| `integration/devmode.test.js` | DVI2 lazy-members list gains `devBoot.js`, `recorder.js`, `recorderStore.js`, `devLog.js`, `sessionCodec.js`, `machine.js` (boot-time) and the panel-time modules; DVI22 now iterates the new controls (open `#dev-rec` first); DVI1 unchanged | 4, 7 |
| `integration/a11y.test.js`, `integration/perf.test.js` | Extended (§8, §9) | 8 |

No other existing assertion may change. A change to any assertion in the files of §3.3
needs the Reviewer's explicit sign-off with the reason recorded in the review report.

### 3.2 Proving normal-mode behaviour is unchanged (state.js)

The reducer change has four parts — dispatch split, injectable timers, `HINT.hint`, three
new actions — and the risk is that any of them alters a normal-mode emit, its order, or a
statistics call. Four independent checks:

1. **Golden trace against the pre-change reducer (SG0, SG1).** Captured from HEAD
   (`a4defe6`) in a separate worktree, because the working tree already holds Phase 1
   edits. The script drives every reducer case and every nested-dispatch site and records
   emit order, changed keys, full state snapshots, statistics calls, and hint-provider
   calls. SG1 replays it against the new reducer with `tap: null` and default timers and
   requires byte-equal records. This is the PD1 technique ("pins captured before the
   change") applied to the reducer.
2. **Tap and timers are transparent (SG2, SG3, PR5).** The same script with a no-op tap
   and with explicit real timers; PR5 runs a 2,000-action random stream on twin stores
   (tap null vs no-op tap) and compares every emit.
3. **The existing suites run unmodified**: `state.test.js` (101), `state-unrated` (23),
   `state-devboard` (11), `coach/session.test.js` (62), and the integration suites of
   §3.3. Real-timer behaviour of the check highlight remains covered by the existing
   `state.test.js` tests at lines ~546 and ~1398.
4. **New behaviour is unreachable from normal-mode callers**: SDT12 (a `HINT` without
   `hint`, or with `hint: undefined`, calls the provider exactly as before); AR-D1 and a
   source scan asserting no file outside `js/dev/` dispatches `DEV_SET_PENCIL`,
   `DEV_FILL_PENCIL`, `DEV_RESTORE_POSITION`, or a `HINT` with a `hint` field
   (extend `arch.test.js`, AR-D6).

### 3.3 Regression net for the other modified always-loaded modules

| Module | Change | Existing tests that must keep passing unmodified |
|---|---|---|
| `events.js` | `reportErrors`, `diagnostics` | EV1–EV10 |
| `storage.js`, `clipboard.js`, `statistics.js`, `cookieStatsStore.js` | Emit in `catch` | LS1–LS6, CB1–CB3, ST1–ST10, CS1–CS9 |
| `puzzleLoader.js` | Per-call `confirm`, `rejectionDetail` | PL-L1–PL-L24 (message texts unchanged) |
| `loadPuzzle.js` | `validateGivens` extracted | LP1–LP10 |
| `loadProvider.js` | `checkPuzzles`, `onmessage` routing | LV1–LV7 |
| `pipeline.js` | `seed`, `seedBy`, Unrated degenerate | PD1 pins, PD3–PD8, `pipeline.test.js` fixed-seed test |
| `clientGenProvider.js` | `seed` / `budget`, events, Unrated discard | PP1–PP11 |
| `protocol.js`, `generator.worker.js` | `seeded`, `elapsedMs`, `CHECK_*` | WP1–WP3, `integration/worker.test.js` |
| `srLive.js`, `dialog.js`, `coach.js` | `muted`, `aria-describedby`, recap restart | UL1–UL3, UD1–UD12, `integration/coach.test.js` (159) |
| `main.js` | Boot bracket, `_requestForeground` options, `_abortForeground`, `beforeReplace`, Unrated fallback | `game-flows` (27), `persistence` (10), `sharing` SHR1–SHR44 (boot race, replace, cancel, generation tier), `devmode` DVI1–DVI30, `system`, `perf` PERF-* |
| `devMode.js` | Purge, fresh flag | DM1–DM9 |

---

## 4. The Dev-Off Guarantee

| ID | Type | Proves | Method |
|---|---|---|---|
| AR-D1, AR-D4, AR-D5, AR-D6 | U | Nothing new can load statically; both dynamic imports are guarded; no `indexedDB` outside the tooling; no normal-mode dispatch of the dev actions | Source scans (§3.1) |
| DBG-OFF1 | I | Nothing new is downloaded | `index.html`, no flag; play a move, Hint, Check, New Puzzle, wait 400 ms: resource entries under `/js/dev/` are exactly `['/js/dev/devMode.js']`; no `dev.css` |
| DBG-OFF2 | I | No API | `'sudokuDev' in contentWindow === false`; `window.gameState` present |
| DBG-OFF3 | I | No recorder database | `indexedDB.databases()` (after the DB is deleted in `beforeEach`) lacks `sudoku-dev-recorder` after boot, play, and a reload |
| DBG-OFF4 | I | No logging, no capture | App-frame `console` spy across a session that triggers swallowed paths (corrupt pre-generation entry) and a throwing `gameState` listener: no message starting `[dev:`; the listener error is still logged by `events.js` as before |
| DBG-OFF5 | I | No dev DOM | Existing DVI1 assertions |
| DBG-OFF6 | I | `?dev=0` after use | DB deleted; no API; `sudoku.dev.logging.v1` survives; nothing logs |
| DBG-OFF7 | U | Residual cost is bounded | 10,000 `SELECT_CELL` dispatches on twin stores, tap `null` vs a no-op tap; `[PERF]` report of both; asserts the null-tap store is not slower than the no-op-tap one by more than noise (×1.5). "Identical performance" is otherwise carried by the unchanged PERF-* thresholds |

The aspec's residual-cost list (§3 item 3) is verified by review, not by test; DBG-OFF7
and the PERF-* suite are the measurable evidence.

---

## 5. Hard-to-Reach Branches

| Path | Technique | Tests |
|---|---|---|
| IndexedDB unavailable | `idb: undefined`; `erroringIdb()`; `hangingIdb()` with `openTimeoutMs: 10` | RS11–RS14 |
| A failing write; quota | `failingIdb` aborts the *n*-th `readwrite` transaction with an error named `QuotaExceededError`; next write succeeds | RS5, RS8–RS10 |
| Unreadable or unknown stored form | Pre-seed the real DB: `meta.form: 99`; an entry with neither `a` nor `e`; `failingIdb` failing `getAll`; a DB pre-created at version 2 (real `VersionError`), with and without a failing reopen | RS15–RS18 |
| Multi-tab ownership loss | Two store instances, one DB, one page (unit); two iframes (integration) | RS19, DBG-M1 |
| `onversionchange` | `indexedDB.deleteDatabase(name)` while a store is open | RS20 |
| Worker failure | `FakeWorker` driving `GEN_ERROR` and `onerror` (provider); controller with `generateSeeded` resolving `failed` | PP21, DS35. `main.js`'s `failed` call sits in the pre-existing uncovered `catch` (§12 G3) |
| Cancellation and supersession of generation | Real Nightmare run with the default budget, then Cancel / New Puzzle / load string, within one task where needed (the SHR40/41 technique) | DBG-G6, DBG-G7 |
| Cancellation and supersession of replay | Deferred `checkPuzzles`, deferred `confirm`, deferred `pause`, so each phase can be held open while a second replay arrives | DS24–DS26 |
| `busy` | A `changed` listener calling controller operations during the commit dispatch | DS23 |
| Clipboard failure | Injected `copy` resolving `false` (unit); `navigator.clipboard.writeText` rejecting in the app frame (integration) | DS11, RPN6, DP74 |
| Logging switches with storage unavailable | `Storage.prototype.setItem` / `getItem` throwing; the real `storage.js` swallows | DL4, DL2 |
| Error capture that must not recurse | Throwing recorder `change` listener; store `write` throwing inside `captureError`; throwing `diagnostics` listener | RC15, RC16, EV15 |
| Tap failure isolation | Injected `now`, `log.action`, store `write` throwing (the codec is a static import and cannot be stubbed) | RC17 |
| An action that throws mid-replay | `run(doc, n, { makeMachine })` with a machine whose `dispatch` throws at a chosen action | RP24; RF3 and DS19 need the same seam exposed (§12 G6) |
| Format-version upgrade | `readDocument(doc, { current: 2, upgraders: { 1: fake } })` | SC31–SC33; through `prepare` needs G5 |
| Honest fallback via the budget override | `sudokuDev.generate('nightmare', 1, { budget: 3 })` with and without `acceptFallback` | DBG-G4 |
| Unrated degenerate path | Pinned `('expert'|'nightmare', 223, budget 1)` — both attempts unsolvable (verified by a seed search against the current generator; 223 and 307 hit for Expert, Diabolical, and Nightmare at budget 1; no Hard hit in 400 seeds); budget 0 for the solvable variant | PD11, PD12, DBG-G5 |
| `devMode.js` `deleteDatabase` throwing | Redefine `window.indexedDB` as an own configurable property for one test, restore the original descriptor in `finally` | DM11, DM12 |
| Unrecordable action | `{ type: 'NOPE' }`, `PEN_ENTER { digit: 'x' }` | RC9 |
| Background Unrated result | `FakeWorker` posting a background `GEN_RESULT` with `difficulty: 'unrated'` | PP19 |
| Time-driven actions | `fakeClock` (sweep), injected `timers` (reducer), real waits in integration (DBG-B7, CO1, DBG-R3/R4) | SDT5, PR2 |

---

## 6. Property and Sweep Tests

All randomness comes from `mulberry32(seed)` with seeds pinned in the test. On failure a
test prints the seed, the action index, and the exported document, so the failure can be
saved as a fixture.

### 6.1 PR1 — position round trip (Phase 3, `sessionCodec.test.js`)

- **Inputs.** Every state reached by `sessionDriver` over 3 seeds × 600 actions on a live
  store, plus hand-built edge states: `puzzle: null`; Unrated; `Infinity` hints; won; each
  coach recap variant with and without `focused`; undo present; generating with and
  without progress; `highlightPending`; non-empty `incorrect`; a cell with all nine marks.
- **Law.** `fingerprint(createMachine(JSON.parse(JSON.stringify(encodePosition(S)))).getState())`
  equals `fingerprint(S)` in every part; and encoding is idempotent:
  `encodePosition(decode(encode(S)))` serialises identically to `encode(S)`.
- **Cost.** ~2,000 encodes and machine builds; well under 2 s.

### 6.2 PR2 — record-then-replay fidelity sweep (Phase 5, `fidelity-sweep.test.js`)

**Rig.** A real `createGameState` with `tap: recorder.tap`, `hintProvider:
wrapHintProvider({ nextHint })` (real hints), null statistics, and a real recorder over an
in-memory store with `now` a counter. The real `ui/coach.js` is mounted once for the file
on a DOM fixture with `#btn-coach`, `#coach-panel-wrap`, `#coach-recap` (it is a module
singleton; mounting per test would stack listeners). A stand-in for `main.js`'s
`CHANGE_DIFFICULTY` listener issues `SET_GENERATING` synchronously, as
`_requestForeground` does, so difficulty changes produce real follow-ups. `fakeClock` is
installed for the whole test, so both the reducer's check-highlight timer and `coach.js`'s
recap timer run only when the driver advances the clock.

**What is randomised.** Per step the driver picks, weighted towards legal play (~70%):
`SELECT_CELL` (biased to coached cells during a session, which triggers `coach.js` focus
follow-ups), `PEN_ENTER` with the solution digit or a wrong one, `PENCIL_TOGGLE`, `ERASE`,
`ERASE_ALL_PENCIL`, `UNDO`, `HINT`, `CHECK`, `TOGGLE_MODE` / `SET_MODE`, `ARROW_NAV`,
`DESELECT`, `SELECT_FIRST_CELL`, `RESET_PUZZLE`, `COACH_START` with the real
`analyze(...)` result (as `coach.js` dispatches it), `COACH_END`, `CHANGE_DIFFICULTY`,
`SET_GENERATING`, `GEN_PROGRESS`, `NEW_PUZZLE` / `PUZZLE_LOADED` from the fixture puzzles
(Kiddie, Medium, Hard, an Unrated one; `gen` with a numeric seed, with `seed: null`, and
absent), `RESTORE_SESSION`, `DEV_SET_BOARD` from `boardAtStep`, `DEV_SET_PENCIL`,
`DEV_FILL_PENCIL`, `DEV_RESTORE_POSITION` of an earlier encoded position, and
`advance(ms)` of the clock (100 ms to 3 s), which lets `CLEAR_INCORRECT` and the recap
timeout fire as top-level recorded actions. ~5% of steps run with a temporary `changed`
listener that throws, so documents carry listener errors that replay must ignore. The
remaining ~30% are arbitrary (ignored actions: digits on givens, Undo with nothing,
Hint with none left), exercising `nc`.

**Invariant, at every checkpoint (every 200 actions and at the end).**
`doc = recorder.exportDocument()`, then:
1. `prepare(doc)` succeeds (every exported document is valid against its own validator).
2. `fingerprint(run(doc, all).position)` equals `fingerprint(live.getState())` in all 11
   parts. This is stronger than comparing `describeState` (which omits undo, recap, and
   snapshot detail) and is the primary assertion.
3. `replayFixture(JSON.stringify(doc))` resolves with `state` deep-equal to
   `describeState(live.getState(), …)` excluding `recorder`, `report.divergences` empty,
   `report.stopped` null.

**Runs.** Seeds 1, 2, 3 × 1,500 actions at the default capacity; seed 4 × 3,000 actions at
capacity 50 (the start advances ~2,950 times); seed 5 × 300 actions at capacity 1.

**Determinism and speed.** No step awaits a macrotask: `replayFixture` uses a synchronous
`checkPuzzles` and a resolved `pause`, so the fake clock never races real time. Expected
cost: decode-and-apply ~7 µs per action plus comparison ~1 ms per coach/hint job;
~25 checkpoints each re-replaying up to 3,000 actions → under 10 s total. `this.timeout(60000)`;
a `[PERF]` line reports the total.

### 6.3 PR3 — capacity trimming equivalence (Phase 5, same file)

The same driver stream is fed to twin rigs: U with capacity 10⁶ and C with capacity
*c* ∈ {1, 2, 7, 50}, errors interleaved. At each checkpoint:
- C's actions are the tail of U's actions (by content and time).
- `run(U.doc, removedActions).position` has the fingerprint of `C.doc.start`, where
  `removedActions` is the number of U actions not in C.
- Both documents replay to the live fingerprint.

### 6.4 PR4 — seeded-generation determinism (Phase 2, `pipeline-diagnostics.test.js`)

| Case | Run | Expected |
|---|---|---|
| One seed per tier | `generateForTier(tier, { rng: mulberry32(s), seed: s, seeded: true, budget })` twice for Kiddie 1, Easy 42, Medium 7, Hard 2024, Expert 99 (budget 40), Diabolical 1 (budget 3), Nightmare 5 (budget 3) | Deep-equal givens, solution, difficulty, `id`, `gen` |
| Real-budget exhaustion | `('easy', 26)` | Falls back to Hard (≈ 240 ms); deterministic. Re-pin if a generator change invalidates it, as with PD1 |
| Override exhaustion | `('nightmare', 1, 3)`, `('diabolical', 1, 3)` | Easy, twice |
| Unrated | `('expert', 223, 1)` | `unrated`, twice |
| Random vs seeded | `seeded` false then true | Every field equal except `seedBy` |

Through the worker: DBG-G2.

### 6.5 PR5 — tap transparency (Phase 1, `state-golden.test.js`)

2,000 driver actions on twin stores, `tap: null` and a no-op tap; every emit (type, keys,
state snapshot) and every stats / provider call equal.

---

## 7. Regression Fixtures

Fixtures are produced by the running app (Copy session) and committed under
`js/tests/fixtures/sessions/`. Each test lives in `unit/session-fixtures.test.js`.

| ID | Fixture | How produced | Asserts |
|---|---|---|---|
| FX1 | `format-v1-baseline.json` | A deliberately broad session: every one of the 33 kinds at least once (including `PAGE_RELOADED` from a reload, a difficulty change with `then`, `noChange` entries, placement / elimination / no-technique coach starts, hints), errors of all three kinds including one with `count > 1`, `seed` and `tier` present | `applied === total`; pinned `state.text` and `state.pencilMarks`; no divergences; `errors.recorded` count; `notes []`. Frozen: the test also pins the SHA-256 of the file text (`crypto.subtle.digest`) so any edit fails loudly |
| FX2 | `coach-session-end.json` | Ends inside an active coach session | `coachActive`; the replayed step equals the recorded step |
| FX3 | `coach-recap-end.json` | Ends in a recap | Coach `recap` in the final position (also used by DBG-R3) |
| FX4 | `won-board.json` | Ends on a win | `won: true`; no `undoAvailable` change beyond the recorded |
| FX5 | `unrated-puzzle.json` | Coach and Hint attempted on an Unrated puzzle | `notCompared` items with the Unrated reason; `hintsRemaining: null` |
| FX6 | `divergence-deliberate.json` | FX1-style export with one recorded coach technique and one hint digit edited by hand (the edit described in a `_comment` property, which the reader ignores) | Exactly two divergences: `technique` on that coach action, `digit` on that hint |
| FX7 | `generating-at-end.json` | Exported mid-generation | Busy cleared; the note |
| FX8 | `capacity-advanced.json` | Exported at a small capacity mid-coach-session | Starting-position not-compared item; replays exactly |
| FX9 ×2 | `first-boot-null-start.json` | First-ever boot export | Full replay ok; `stopAfter` before the first puzzle rejects with the no-puzzle message |

Small rejection documents are inline in RP tests, not files.

**Upgrade path.** When format version 2 is introduced, FX1 must still pass unchanged and
the upgrade note must appear; SC31 is the template.

**Helper tests.** RF1–RF8 (§2.6) — the helper is tested as a unit in its own right, then
used by FX and PR2.

---

## 8. Accessibility

Unit tests (RPN, DP, DS) assert attributes and focus in isolation; `integration/a11y.test.js`
asserts them in the app with `?dev=1` and the Session recorder section open.

| ID | Element (fspec §11) | Assertion |
|---|---|---|
| A23 | Session recorder section | Native `<details>` / `<summary>`; collapsed initially; Enter / Space toggle |
| A24 | Counts line | Not a live region; text order |
| A25 | Storage line | `role="status"`; each message announced once when it appears (unavailable storage: app frame with `indexedDB.open` failing is not forceable from outside, so this row runs through DBG-M1's takeover message) |
| A26 | Copy session | Native button, accessible name "Copy session document"; outcome announced; focus stays |
| A27 | History status line | `role="status"`; shared by copy and clear outcomes |
| A28 | Copy fallback field | Read-only `textarea`, label "Session document", focused with full selection; board ignores keys typed in it |
| A29 | Replay document field | Visible label "Session document to replay" (`label[for]`); placeholder present but not the name source |
| A30 | Stop-after field | Label "Stop after action"; `aria-describedby` → the hint; non-digit input rejected at Replay with the §5.3 message (§12 G9) |
| A31 | Replay | Native button; outcome announced; focus stays on it after success, decline, rejection, and a won-board replay |
| A32 | Replay status line | `role="status"`; "Checking session…" and "Comparing with current code…" not announced |
| A33 | Replay confirmation | `role="dialog"`, `aria-modal`, `aria-labelledby` title, `aria-describedby="modal-body"`, Cancel focused, focus trapped, Escape cancels, focus returns to Replay |
| A34 | Report area | `role="region"`, name "Replay report", `tabindex 0`; lists for divergences and not-compared; each divergence a native disclosure; not a live region; text selectable |
| A35 | Clear history + confirmation | Native button; dialog titled "Clear recorded history?"; focus returns to Clear history; outcome announced |
| A36 | Logging switches | `role="switch"`, `aria-checked` follows clicks and API changes; visible label; tag `aria-hidden`; Enter / Space toggle; change announced |
| A37 | Seed row | Seed text selectable; Copy seed name "Copy seed"; `disabled` exposed when no seed |
| A38 | Tier select, Seed field, Generate | Labels "Tier", "Seed"; Generate name "Generate from seed"; validation error associated (`aria-invalid`, `aria-describedby`) and announced; focus returns to Generate after every outcome, including the confirmation and honest-fallback dialogs |
| A39 | Focus rings | Computed `outline` on `:focus` / `:focus-visible` for each new control per vspec §7 |
| A40 | Dev off | None of the new elements exist |
| A41 | API announcements | `clearHistory()`, `setLogging(...)`, a game-changing `generate` announce their messages; read calls announce nothing; focus never moves |

**Single-announcement rule (A42).** In the app frame a `MutationObserver` on `#sr-live`
records every non-empty text from the Replay click until 1 s after the outcome. Document:
`won-board.json` variant that also ends in a coach recap and contains numpad-announcing
actions (digit, erase, undo, hint). Expected: exactly one record, the §5.9 outcome. The
same check for an API replay (A42b).

---

## 9. Performance

All bounds are 1 s (CLAUDE.md); expected values from the aspec are logged for trend.

| ID | Type | Operation | Size / setup | Bound |
|---|---|---|---|---|
| PERF-D1 | I | Digit entry, all three logging switches on, history at capacity | Fill to 5,000 entries with `window.gameState.dispatch` (`SELECT_CELL`), switches on via API; then time keypress → rendered digit | < 1 s (expect a few ms) |
| PERF-D2 | I | Replay steps 5–6 | 5,000-action document from `sessionDriver` (5 puzzles, ~100 coach starts, ~50 hints); API replay with flags; time from `checkPuzzles` resolving (instrumented by a `replay-status` listener) to the `DEV_RESTORE_POSITION` `changed` emit plus one frame | < 1 s (expect < 150 ms) |
| PERF-D2u | U | `run` + `replaceHistory` | Same document, unit | `[PERF]` report; < 500 ms |
| PERF-D3 | U | Recorder overhead per action at capacity | 5,000 actions through the tap with capacity 5,000 already full (every action trims) | Report mean; soft assert < 1 ms |
| PERF-D4 | I | Board stays responsive while comparing | Coach-heavy document; dispatch a digit while "Comparing with current code…" is shown | < 1 s; longest comparison slice reported (expect < 100 ms) |
| PERF-D5 | I | Copy session at capacity | 5,000 entries, clipboard stubbed | < 1 s |
| PERF-D6 | I | Clear history and export at capacity | 5,000 entries | < 1 s each |
| PERF-D7 | I | Boot with a full stored history | Reload with 5,000 stored entries | Panel ready − baseline ready < 1 s |
| PERF-D8 | I | Seeded Kiddie / Easy generation | API | < 1 s (existing PERF-NEW budgets govern the top tiers) |
| DBG-OFF7 | U | Tap-null overhead | §4 | Report |

---

## 10. Coverage Map

### 10.1 Measurement

Coverage is measured as today: `npm test`, the URL-rewrite step, `npx c8 report`
(`CodeCoverageV2.md` §6). New files must reach 100% branch. For modified files the
project's established method applies (`coverage-devmode-sharing.md`): zero-hit branches and
uncovered lines from lcov are intersected with the lines added by `git diff -U0` against
the pre-feature commit; the intersection must be empty, and any exception is listed by
line with its reason. `main.js` is covered through integration iframes (same origin, same
collector). Worker-side code is not collected: `pipeline.js`, `loadPuzzle.js`, and
`protocol.js` are covered by direct import (PD, LP, WP); `generator.worker.js` changes
(passing `seeded`, `elapsedMs`, answering `CHECK_REQUEST`) are verified behaviourally by
LV11, DBG-G1–G5, and DBG-L2 (the `[dev:gen]` result message carries a numeric `elapsedMs`), and are
recorded in the coverage report as outside the collector, as for V4.

### 10.2 New files

| File | Decision points | Covered by |
|---|---|---|
| `sessionCodec.js` | per-kind encode / validate / decode (33); optional fields; origin map (5 arms); `gen` seed / seedBy null-coalescing; Infinity ↔ unlimited; coach recap null vs not; elimination vs placement; undo / generating / coach null vs present; every validator rule; fingerprint parts; informational detection; `describeState` arms (puzzle null, generated, Unrated, Infinity, each boolean); `readDocument` (not object, format, version cases, `<` current loop, upgrader present); seed/tier present vs absent | SC1–SC35, PR1 |
| `machine.js` | `f` present vs absent; throw path | MC1–MC10 |
| `recorder.js` | suppressed; depth 0 vs > 0; encode fail (unrecordable); `noteHint` (no entry, wrong type, HINT); `nc` vs changed vs informational; trim (action vs error oldest); dedup (equal vs different vs after action); re-entrancy flag; capture `try/catch`; begin / end `catch`; merge (loaded, empty, unavailable, discarded, open rejects); `silently` armed vs not; log trace on / unrecorded frame | RC1–RC33 |
| `recorderStore.js` | idb undefined; open error; timeout; late open; discard; form check; malformed record; read error; VersionError reopen ok / fail; owner match vs mismatch; `onversionchange`; in-flight vs idle (coalesce); dirty → full rewrite; success after failing; `onStatus` change only | RS1–RS23 |
| `devLog.js` | stored valid / missing / non-boolean / non-object; `set` changed vs same; each category on / off; parts empty vs not; dispose | DL1–DL9 |
| `devBoot.js` | fresh vs not; error event with / without `error`, with / without `filename`; rejection reason Error / string / undefined; listener payload with / without action | DB1–DB9 |
| `replay.js` | every `prepare` branch in fspec order; stop parse arms; no-puzzle rule arms; puzzle collection per kind and dedupe; check throw; `run` job kinds, coach-in-start, generating end, stopped; compare order (Unrated, noChange, throw), coach parts, step vs none, hint parts, yield vs not; `buildReport` ranges; `outcomeMessage` arms; `formatReportLines` arms | RP1–RP40 |
| `devSession.js` | every result row of fspec §6 and aspec §11.2–11.4; intent ask vs API; replay phases, supersede vs wait vs busy; applying flag; focus moved vs not | DS1–DS37 |
| `devApi.js` | per method; throw / reject wrapping; budget validation arms | DA1–DA5 |
| `recorderPanel.js` | counts at capacity vs not; frame coalescing pending vs not; storage message empty vs not and changed vs same; copy ok vs fail; fallback hide triggers; report parts present vs absent; error style; switch events | RPN1–RPN15 |
| `tests/helpers/replayFixture.js` | object vs text; rejected throw; stopped | RF1–RF8 (RF3 per G6) |

### 10.3 Changed files (added branches only)

| File | Added decision points | Covered by |
|---|---|---|
| `events.js` | `reportErrors` default / `{}` / false; emit in catch | EV11–EV15 |
| `state.js` | `tap === null`; `finally`; `action.hint !== undefined`; three new cases and their guards; `_checkElimComplete` session / not; restore `highlightPending`; timers routing | SG1–SG3, SDT1–SDT31 |
| `srLive.js` | mute depth > 0; nesting; `finally` | UL4–UL7 |
| `dialog.js` | attribute (no branch) | UD13 |
| `coach.js` | restore with / without pending timer; other action | CO1, CO2 |
| `storage.js`, `clipboard.js`, `statistics.js`, `cookieStatsStore.js` | emit in each catch | SW1 |
| `puzzleLoader.js` | `confirmOnce ?? confirm`; `rejectionDetail` arms; catch emit | PL-L25, PL-L26, SW1 |
| `loadPuzzle.js` | `validateGivens` arms; `checkGivens` ok / mismatch / invalid | LP11–LP13 |
| `loadProvider.js` | `CHECK_RESULT` vs `LOAD_RESULT`; error rejects checks | LV8–LV11 |
| `protocol.js` | `seeded` default; new builders | WP4–WP6 |
| `pipeline.js` | `seeded ? 'developer' : 'random'`; `result.solved ? tier : UNRATED` | PD9–PD12 |
| `clientGenProvider.js` | `seed !== undefined`; kind arms; `gen?.seed`; fallback event; background Unrated; abort / error / onerror events; three `pregen.*` catches | PP12–PP22, SW1 |
| `inspect.js` | seed null vs number; seedBy three arms | IN36–IN39 |
| `devMode.js` | `'0'` delete try / catch; fresh computation | DM10–DM15 |
| `devPanel.js` | await ready; six tools; seed rows; copy seed ok / fail; validation set / clear; run-end focus | DP70–DP79 |
| `main.js` | `devBoot` present vs absent (steps 1.5, 5, 6, 7); `restorable` before / after `bootComplete`; `_abortForeground` reasons; `opts.fallback` `'accept'` / `'refuse'`; Unrated fallback arms; `onOutcome` loaded / failed; `beforeReplace` | DBG-B1–B7, DBG-G1–G8, DBG-OFF1–7, existing SHR / DVI / game-flows. Exceptions: §12 G3 |

---

## 11. Requirements Traceability

| Req | Tests |
|---|---|
| R1 record every action, ignored ones too, timed; capacity; reloads; discarded on `?dev=0` | RC3–RC9, RC11–RC13, RC18–RC21, RC33, SDT1–SDT5, DBG-B1–B7, DM10, DBG-OFF6, PR2 |
| R2 replayable from the beginning; starting position | RC2, RC11, RC12, RC19, PR2, PR3, FX8 |
| R3 one self-contained, versioned JSON document | SC29–SC35, RC23–RC25, DS10, DS11, RPN5, RPN6, FX1 |
| R4 replay verbatim; stop after *N* | MC1–MC10, SC2, RP19–RP25, RP10–RP12, DS16–DS18, DBG-SYS1, DBG-R1–R8, PR2 |
| R5 divergence report with a separate errors part | RP27–RP40, RPN10, FX5, FX6 |
| R6 no statistics; confirm over progress and history; reject malformed or unsupported | SDT30, MC3, DS12–DS15, RP1–RP18, DBG-R2, A33 |
| R7 `window.sudokuDev` operations | DA1–DA5, DS1–DS11, DS29, DS37, DBG-A1 |
| R8 same rules as the panel; stated intent; failures leave the game untouched; absent when off | DS3, DS15, DS29, DS33–DS35, DA3, DBG-G4, DBG-OFF2 |
| R9 seed shown and copyable | IN36–IN39, DP73–DP74, A37 |
| R10 generate from tier and seed; reproducible including fallback; bypasses the cache | PP14, PD9–PD10, PR4, DS31–DS36, DBG-G1–G7, DBG-SYS2 |
| R11 three logging categories, switchable, persistent | DL1–DL9, DS37, RPN12, DBG-L1–L3, A36 |
| R12 error capture independent of the switches | DB3–DB9, RC14–RC17, EV11–EV15, DBG-E1 |
| R13 replay in the test suite; fixtures stay loadable | RF1–RF8, FX1–FX9, SC31–SC33 |
| R14 panel additions incl. the Clear-history confirmation | RPN1–RPN15, DP70–DP79, DS29–DS30 |
| R15 off means absent; accessible; < 1 s; branch coverage | DBG-OFF1–7, AR-D1/D4/D5/D6, A23–A42, PERF-D1–D8, §10 |
| R16 unsolvable fallback is Unrated, every mode | PD11, PD12, PP19, PR4, DBG-G5 (normal-mode foreground path: §12 G3) |

---

## 12. Gaps and Risks for the QE Test Writer

Disagreements and untestable items are listed, not resolved.

### 12.1 Untestable as specified, or aspec claims that do not hold

- **G1 — "a stubbed `rate` that never solves" (aspec §9.5).** `rate` is a static import
  in `pipeline.js`; with no build step it cannot be stubbed. Replaced by pinned seeds
  (PD11): `('expert'|'diabolical'|'nightmare', 223 or 307, budget 1)` hit the
  unsolvable-degenerate path in the current generator (both attempts unsolvable; today
  mislabelled `nightmare`). Re-pin if the generator changes.
- **G2 — "a seed found by the fidelity sweep" (aspec §9.5).** The fidelity sweep replays
  sessions; it never generates. The seeds come from a one-off seed search (G1).
- **G3 — Paths still unreachable deterministically.** (a) The honest-fallback **dialog**
  (`fallback: 'ask'`) for a seeded run, its decline (`fallback-declined`), and the fspec
  §7.5 Unrated dialog body and "Play Unrated" label: the panel has no budget control and
  the API never uses `'ask'`, so reaching the dialog needs a real-budget Diabolical /
  Nightmare exhaustion (FC-1: CPU-hours to find). aspec §14.3 says this closes the V3
  coverage exception; it closes only the `'accept'` / `'refuse'` arms. (b) The `main.js`
  `_startNewPuzzle` Unrated announcement (fspec §7.5, Kiddie–Expert foreground): ordinary
  generation cannot be seeded. (c) The `main.js` `failed` outcome: the real worker cannot
  be made to fail from outside the app frame. These remain coverage exceptions unless a
  seam is added (for example `budget` reachable on a panel run in tests, or an injectable
  provider in `main.js`). Needs an Orchestrator decision.
- **G4 — Missing injection seams in aspec signatures.** `createRecorderStore` has no
  database-name parameter (aspec §14.1 requires per-test names); `devBoot.boot()` takes no
  arguments and installs `window` listeners with no `dispose`, so unit tests would leak
  handlers across the suite; `createClientGenProvider` has no `createWorker` (this
  strategy swaps `window.Worker` instead, which works because the constructor is read at
  call time, but an injectable factory as in `loadProvider` would be cleaner).
- **G5 — Upgrade note through `prepare`.** `readDocument` takes `{ current, upgraders }`
  but `prepare(input, { stopAfter, checkPuzzles })` does not forward them, so the note's
  path from `prepare` to the report and status line is untestable until version 2 exists.
- **G6 — Stopped replay above `run`.** Only `run` takes `makeMachine`. `replayFixture`
  (fspec §9.1 promises "the state reached available for assertion") and `devSession`
  (DS19, API `reason: 'stopped'`) have no way to inject it, and validation is meant to
  make a stop unreachable from a document alone.
- **G7 — Recorder tap-failure test via "a codec stub that throws" (aspec §14.3).** The
  codec is a static import; RC17 uses injected `now`, `log`, and `store` instead.

### 12.2 aspec ↔ fspec disagreements

- **G8 — API `diagnostics`.** fspec §6.9: "the fields of fspec-005 §8 plus the seed"
  (requested tier, achieved tier, fallback, attempts, rejections, technique profile, seed).
  aspec §11.4: `diagnostics` is `puzzle.gen`, which has no achieved tier or technique
  profile and adds `seedBy` and `budget`.
- **G9 — Stop-after "accepts digits only" (fspec §11).** aspec markup uses
  `inputmode="numeric" pattern="[0-9]*"`, which does not filter typed characters; the only
  enforcement is the rejection at Replay. Whether whitespace is trimmed (the seed field
  trims) is unspecified.
- **G10 — Job for the failing action.** aspec §8.3 adds the compare job before
  `applyEntry`, so a coach or hint action that throws is still compared; fspec §5.9 says
  comparison runs "for the actions applied". RP24 asserts the fspec reading.
- **G11 — `setPencilMarks` announcements.** fspec §6.1 says a call that changes the game
  announces its outcome message, but §6.7 gives no success message; the no-change case
  ("succeeds and changes nothing") is not said to announce or not.
- **G12 — Generate announcements.** aspec: "A game-changing result is announced." fspec §11
  (Generate: "outcome announced") reads as every panel outcome, including cancelled and
  failed; for the API only game-changing results announce. DS36 needs one rule per caller.
- **G13 — Focus on API generate.** aspec §12.2 focuses `#dev-gen-run` "when a run ends, by
  any outcome"; fspec §6.1 says API calls never move focus. If the panel reacts to API runs
  through shared controller events, DBG-G8 will fail.

### 12.3 fspec gaps that leave expected values open

- **G14 — Summary when every computed result is not compared.** With *k* = 0 and *u* > 0,
  §5.8's "No computed results to compare: the replayed actions contain no coach steps or
  hints." is false; §5.9's status gains " *u* not compared." No wording for the report line.
- **G15 — Pluralisation.** "*d* divergences", "*u* not compared", "*A* actions, *E* errors"
  for 1 are unspecified ("1 divergences"?).
- **G16 — Structural rejection details.** §5.3 fixes the frame ("Action *n* is not valid:
  *detail*.") but not the detail for an unknown kind or missing data; nor the reason for a
  document with a bad top-level shape (`exportedAt` missing, `actions` not an array,
  `seed` without `tier`) or the *V* shown for a missing version. Tests will pin whatever
  the Implementor writes; the Functional Designer should confirm.
- **G17 — Edge timestamps and statuses.** `run` with `n = 0` on a generating start has no
  "last applied action" time for the extra entry; storage status precedence when
  `discarded` ("until the next page load") meets a later write failure or ownership loss;
  how `highlightPending` is derived from state (SC14 pins the implementation's rule);
  whether marks lists in a document must be ascending and duplicate-free; whether an
  unrecordable frame's follow-ups are recorded; how the merged history (stored entries +
  `PAGE_RELOADED` + post-boot entries) is first written after a `loaded` open; `meta`
  absent with entries present (RS23b).
- **G18 — Superseded panel replay status.** Whether the superseded run writes "Session not
  replayed…" to the status line (which would overwrite the second run's "Checking
  session…").

### 12.4 Practical risks

- **G19 — Arch test file lists.** The static server has no directory listing; AR-D1 / AR-D5
  rely on hand-maintained lists. Crawling static imports from `main.js` and the worker
  entry makes the always-loaded set self-maintaining.
- **G20 — IndexedDB state across tests.** Not cleared today. Without the `setup.js` hook,
  DVI3-style "load without the parameter" tests inherit histories from earlier tests.
  Integration iframes must be removed before the delete, or the request is blocked until
  their connections close (the store's `onversionchange` handler should prevent that).
- **G21 — Fake clock in the sweep.** Patching `window.setTimeout` / `Date.now` is safe
  for Mocha (it keeps its own references) but any `await` on a macrotask inside the sweep
  would hang; the sweep must stay microtask-only between actions.
- **G22 — `coach.js` singleton.** Mount once per file; its keydown listener and module
  state persist for the rest of the page. Pending recap timers are drained by the fake
  clock before it is uninstalled.
- **G23 — Golden-trace sequencing.** Phase 1 edits are already in the working tree; SG0
  must be captured from HEAD `a4defe6` before Phase 1 is accepted, or the baseline proves
  nothing.
- **G24 — Timing in integration.** CO1, DBG-B7, DBG-R3/R4 wait on real 2.5–3 s timers;
  bounds are generous (as SHR15). DBG-G6 uses a Nightmare real-budget run as the
  long-running generation; it must be cancelled within one task of starting where the race
  matters.
- **G25 — Seed pins.** `('easy', 26)`, `('nightmare', 1, 3)`, and `223` depend on the
  current generator; a generator change requires re-pinning, exactly as PD1.

---

## 13. Counts

Approximate number of `it` cases, counting each parameter of a "×n" row and each row of a
parameterised table.

| Phase | Unit | Integration | System | Notes |
|---|---|---|---|---|
| 0 | — | — | — | Capture script |
| 1 | ~105 | 3 | — | SG, SDT, EV, UL, UD, SW, PL-L, arch |
| 2 | ~55 | — | — | PD, WP, LP, LV, PP, IN, PR4 |
| 3 | ~240 | — | — | SC (≈ 60 + 13 + 33 + 20 parameterised rows), MC, PR1 |
| 4 | ~110 | 7 | — | RS, RC, DL, DB, DM, DBG-B |
| 5 | ~140 | — | — | RP (incl. RP10 / RP39 tables), RF, FX, PR2, PR3 |
| 6 | ~165 | 12 | — | DS (incl. DS7 / DS32 tables), DA, DP70–71, DBG-G |
| 7 | ~45 | — | — | RPN, DP72–79 |
| 8 | ~2 | ~45 | 2 | DBG, A23–A42, PERF-D |
| **Total** | **~860** | **~67** | **2** | Unit ≈ 93% |
