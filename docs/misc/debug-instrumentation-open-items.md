# Debug Instrumentation — Open Items

**Date:** 2026-11-17
**Author:** Orchestrator
**Feature:** rspec-007 / fspec-007 / vspec-007 / aspec-debug-instrumentation
**State when written:** all phases implemented, tested and reviewed; working tree
uncommitted on top of `a4defe6`. Suite: 2737 passing, 0 failing, 11 pending, about 8m45s.

Everything here was found during the build and deliberately left. Each item says what it
is, where it lives, how to see it, and what the options are. None blocks shipping the
feature. Items are ordered by how much they matter.

Related records: `review-debug-instrumentation-v1.md` (the review and its disposition),
`coverage-debug-instrumentation.md` (per-phase test and coverage notes), fspec-007 §14
(decisions D-1 to D-36).

---

## 1. Defects

### 1.1 A corrupt pre-generation cache entry at boot is never logged — resolved 2026-11-26

**Resolution (Product Director chose option 1):** `clientGenProvider` reads its
localStorage mirror on first use (any public method or worker message) instead of at
construction. The first use comes after `devBoot` subscribes, so `pregen.load` reaches
the developer log. DBG-L3 is no longer skipped. aspec §8 pre-generation row updated.

The original finding:

**Status:** confirmed defect; pinned by a skipped test.
**Violates:** fspec-007 §8.1 — in developer mode every swallowed exception is logged,
and the pre-generation cache is named as one of the sites.

**What happens.** `js/providers/clientGenProvider.js` reads the pre-generation cache from
`localStorage` in `_loadFromStorage`, called at line 47 while the provider is being
constructed. A corrupt entry is caught and reported with
`diagnostics.emit('swallowed', { where: 'pregen.load', error })` (line 208). But the
provider is constructed when `js/providers/puzzleProvider.js` is evaluated, which is a
static import of `js/main.js` (line 28) and so runs before any of `main.js`'s own
statements. The developer log subscribes to `diagnostics` only at `main.js` line 43
(`devBoot ... .boot()`). The event is emitted with no listener and is lost.

**How to see it.** With developer mode on, put invalid JSON in
`localStorage['sudoku.pregen.v1.easy']` and reload. No `[dev:swallowed] pregen.load` line
appears. The two later sites, `pregen.save` and `pregen.clear`, do log.

**The test.** `js/tests/integration/debug.test.js` line 1083,
`it.skip('DBG-L3: a corrupt pre-generation entry at boot is logged as swallowed at pregen.load', …)`.
Change it to `it` once fixed. It is the one pending test this feature added.

**Options.**
1. Defer the cache read: have the provider load the cache lazily on first use, or expose
   an explicit `init()` that `main.js` calls after the developer boot. Cleanest, but it
   changes when an always-loaded module touches storage, so it needs the normal-mode
   regression net (the golden trace does not cover the provider; the provider and
   integration tests do).
2. Buffer in the diagnostics emitter: keep the last few events emitted with no listener
   and replay them to the first subscriber. No change to the provider, but it adds state
   to `js/util/events.js` on a path that runs in normal mode.
3. Have `devBoot` re-check the cache entries itself after subscribing and log what it
   finds. Developer-mode only, but duplicates the provider's validation.
4. Accept it and narrow fspec §8.1 to exceptions swallowed after the developer tooling
   has loaded.

**Recommendation:** option 1 if the boot order can be changed cheaply, otherwise 4. The
impact is small: only a log line is missing, and the corrupt entry is still discarded
correctly.

### 1.2 The busy state can still stick if the preference write or the dialog throws — resolved 2026-11-26

**Resolution (Product Director chose to degrade):** a throwing `chooseTier` in `accept()`
is emitted as `swallowed` (`foreground.chooseTier`, a new site) and the puzzle still
loads; `chooseTier` now sets the in-memory preference before writing, so it holds for the
session. A throwing `openDialog` logs, emits `generation` `failed`, and reports `failed`
(the busy state was already cleared). A new test drives an `onOutcome` that throws after
delivery through the `delivered` arm. `foreground.js` is at 100% branch. aspec §9.4 and
§10.2 updated.

The original finding:

**Status:** known gap, left deliberately; not reachable today.

**What happens.** `js/game/foreground.js` now ends a request cleanly as `failed` when
loading a delivered puzzle throws (fixed 2026-11-16: the `load` helper and `busy` flag in
`request`). The same is not true if `chooseTier` (the tier-preference write) or
`openDialog` throws: the `.catch` logs and emits `generation` `failed` (the `delivered`
arm at line 162) but does not clear the busy state or call `onOutcome`, so a waiting
`generate` call would not resolve. On the fallback dialog's confirm path the exception
escapes from the button handler.

**Why it is unreachable today.** The preference write goes through
`js/persist/storage.js`, which swallows its own errors, and `openDialog` does not throw.

**Coverage consequence.** That `delivered` arm is the one uncovered branch in code this
feature added (`foreground.js` 98.43% branch). The Test Writer was told not to pin the
behaviour either way.

**Options.** Move `chooseTier` inside the `load` helper's `try`, which makes a failed
preference write a failed puzzle load (a behaviour decision); or leave it. If it is
fixed, add the tests and the file reaches 100%.

### 1.3 A pencil mark can be left on a filled cell when a coach session ends — resolved 2026-11-26

**Resolution (Product Director):** `_revertPencil` restores no snapshot marks to a cell
that holds a digit, and still strips the coach-added bits from it:
`snapshot = pen[i] === 0 ? pencilSnapshot[i] : 0`. (Skipping filled cells outright was
tried first and rejected: it left coach marks on a given cell, and on a cell the coach
revealed into after it was filled.) aspec-coach-ui §5.4 updated.

Consequences: the golden trace's script reaches this case with hand-built steps (records
329 and 337), so the trace changed; all 29 differing records follow from this change.
The Product Director relaxed the golden trace's rule at the same time: it had to come
from `a4defe6` only to prove the Phase 1 seams changed nothing, which was settled when
Phase 1 was accepted. The capture tool now captures from the working tree and lists the
records that differ, and a re-capture needs every difference explained (tspec §5 item 1
updated). devSession D-34's test, which pinned the old
restore, now expects no mark; its count rule is unchanged. New test: coach session
"Example E".

The original finding:

**Status:** oddity in pre-existing reducer code; believed unreachable in real play.

**What happens.** `_revertPencil` in `js/game/state.js` restores a cell's pre-coach marks
as `(snapshot & ~revealed) | (current & ~revealed)` for every cell the coach revealed
marks into. If that cell had player marks before the session and has since been filled
with a digit, the restored marks land on a filled cell. The Architect first raised this
for Erase all pencil (aspec §16.2); the Phase 6 Test Writer reproduced the filled-cell
form.

**Reproduction (hand-built coach step, not real play).** Load the Kiddie test fixture;
put pencil mark 1 in r1c3; dispatch `COACH_START` with `eliminationStep()` from
`js/tests/helpers/codecFixtures.js` (reveals 4 and 9 in r1c3, 2 and 6 in r1c4); dispatch
`PEN_ENTER` digit 4 with `fromHint: true` in r1c3; end the session. r1c3 holds a digit
and a pencil mark of 1.

**Why it is believed unreachable in play.** It needs the coach to reveal marks into a
cell the player has already marked. The analyzer intersects its candidates with the
player's marks in marked cells, so its auto-reveal never adds to them. Two live attempts
on a Hidden Pair position did not reproduce it (2026-11-15). This is an argument from
reading, not a proof.

**Options.** Make `_revertPencil` skip cells that hold a digit (a small, safe change); or
leave it. A session document edited by hand, or a console dispatch, can reach it.

---

## 2. Wording and consistency

### 2.1 Thousands separator on a position in the "stopped" message — resolved 2026-11-26

**Resolution (Product Director):** positions stay plain. `outcomeMessage` writes `at`
without a separator; the total keeps it. Pinned by a new `replay.test.js` case
("action 1234 of 5,000"); fspec D-35 f now says positions are not counts.

The original finding:


`outcomeMessage` in `js/dev/replay.js` line 551 writes
`Replay stopped at action ${count(at)} of ${count(report.total)}`. fspec D-35 f applies
separators to counts; positions elsewhere ("Action 1234 —", "after action 1234") stay
plain. Here `at` is a position and `total` is a count, so "action 1,234 of 5,000" is
inconsistent with the other position formats. No test pins it either way.
**Options:** write `at` plain; or declare that both numbers of an "N of M" pair take
separators (the Implementor's reading) and record that in the fspec.

### 2.2 The aspec text trails the code — resolved 2026-11-26

**Resolution:** every point below is now in `aspec-debug-instrumentation.md`. The §2.3
table was rewritten from the modules' actual imports, which also removed three stale
entries (`devBoot.js` → `sessionCodec.js`, `devApi.js` → `sessionCodec.js` / `inspect.js`,
`sessionCodec.js` → `util/grid.js`). The browser figures are a new table in §16.3.

The original finding:


The implementation is correct against the fspec; these are places where
`aspec-debug-instrumentation.md` was not updated as decisions were made. A single
tidy-up pass by the Architect would close them. From the review (M3, M6, M7, S3–S7) and
the Implementors' reports:

- **§2.3 import table** lacks: `devSession.js` → `dev/devLog.js`, `dev/machine.js`,
  `solver/logical.js`, `generator/rater.js`, `ui/dialog.js`, `util/events.js`;
  `recorderPanel.js` → `dev/replay.js`; `devPanel.js` → `config.js`. The Reviewer judged
  all acceptable.
- **§3 residual-cost list** calls itself exhaustive but omits the `timers` indirection,
  `confirmOnce ?? confirm`, the CHECK message-type comparisons, the fallback-policy
  checks, and the `delivered` flag in `foreground.js`. None is on the per-action path.
- **§5.7 report object:** divergences carry two extra fields, `technique` and `cell`.
- **§6.1 recorder API:** `createRecorder` takes an `opened` promise and returns
  `snapshot` and `storageChanged`; `boot`'s `storage` default is delegated to `devLog`.
- **§8.2:** the codec also requires `roles.fin` on a coach step.
- **§11.2 `fillPencilMarks`:** the count and announcement rules are stale against fspec
  §6.7 / D-34.
- **§11.3:** a superseded replay's dialog is closed explicitly, not merely "replaced".
- **§12.1:** the panel root carries `data-keep-selection` (fspec D-35 e); the per-button
  attributes are now redundant.
- **§16.3 measurements:** three browser figures exceed the Node estimates, all far inside
  the 1-second bound: replay of 5,000 actions 210–233 ms (estimated under 150);
  longest comparison slice about 215 ms (estimated under 100); recorder cost per action
  about 0.24 ms (estimated under 0.1).

### 2.3 `docs/misc/dev-mode-workflows.md` is stale — resolved 2026-11-26

**Resolution:** the "never change the board" claim is replaced by a list of what does;
the console one-liners use `sudokuDev`; new workflows §3.10–3.15 cover recording,
seeds, replay and the report, bisecting, fixtures and the console API; the tool reference
and limits cover the new tools. The README's `js/dev/` tree entry lists every module.

The original finding:


Line 29 says the tools never change the board except Load from string. That stopped
being true with the inspector's set-board-to-step, and is further from true now: the
pencil-mark API, replay and seeded generation all change the game. The document also
has no workflows for the new tools (record and export a session, replay and read the
divergence report, bisect with "Stop after action", reproduce a puzzle from its seed,
turn a session into a regression fixture, use `window.sudokuDev` from the console). Its
"Useful console one-liners" are now better expressed through `sudokuDev.state()`.
`README.md` has a current "Debug instrumentation" section; its architecture tree line
for `js/dev/` (around line 190) still names only the old modules.

### 2.4 Role files do not match how the roles are run — resolved 2026-11-26

**Resolution (Product Director):** every role in `docs/agents/`, the Uber Developer
included, runs on Opus (`claude-opus-5-5`). The Architect, QE Strategist and Reviewer are
`general-purpose`. The Tech Stack sections are filled in.

The original finding:


`docs/agents/*.md` name `sonnet` or `opus` and, for the Architect, QE Strategist and
Reviewer, the read-only `Plan` / `Explore` agent types. Those three must write a file, so
they were run as general-purpose agents. Models actually used for this feature: Fable for
the first-draft Functional Designer, the Architect and the Reviewer; Opus for incremental
spec edits, the Visual Designer, the QE Strategist, every Implementor and every Test
Writer. The role files' "Tech Stack: TBD" sections are also unfilled (Mocha + Chai in
headless Chromium via Playwright, c8, plain ES modules, no build step). The Product
Director has not asked for the files to be updated.

---

## 3. Testing

### 3.1 Project-wide branch coverage is 96.98%, not 100%

The project bar is 100%. Every file this feature created is at 100% (the §1.2 arm was closed
2026-11-26). All other shortfall predates the feature:

| File | Branch |
|---|---|
| `ui/numpad.js` | 75.67% |
| `ui/coachOverlay.js` | 78.78% |
| `generator/rater.js` | 80% |
| `ui/themes.js` | 83.33% |
| `ui/stats.js` | 85.71% |
| `coach/analyzer.js` | 87.2% |
| `generator/fillGrid.js` | 88.23% |
| `ui/coach.js` | 88.42% (lines 81, 92, 144, 197, 270, 352, 353, 369, 414) |
| `ui/srLive.js` | 88.88% (line 18) |
| `ui/grid.js` | 90.72% |
| `ui/winBanner.js` | 90.9% |
| `ui/keyboard.js` | 91.8% |
| `ui/dialog.js` | 92.85% (line 110) |
| `providers/hintProvider.js` | 94.73% |
| `ui/controls.js` | 94.87% |
| `main.js` | 95% (lines 242, 243, 291, 292: `_isInProgress` and `_saveState` with no puzzle or a won board) |
| `util/events.js` | 96.66% (line 53) |
| `providers/clientGenProvider.js` | 96.72% (lines 102, 204) |
| `generator/pipeline.js` | 96.87% (line 172, an unreachable `?? tier`) |
| `solver/uniqueness.js`, `solver/techniques/coloring.js` | 97.05% |
| `solver/techniques/xyWing.js` | 97.72% |
| `game/state.js` | 99.13% (lines 95, 96, 455) |

Worker-side code (`worker/generator.worker.js`) is not collected by the runner; it is
covered through direct-import tests and one end-to-end assertion.
A dedicated coverage pass would be its own piece of work. `pipeline.js:172` and a few
others are dead code and would be removed, not tested.

### 3.2 The suite takes about 8m45s

Up from about 4m40s before the feature (1132 tests then, 2737 now). About 10 seconds
could be recovered by having the ten A39 focus-ring tests in
`js/tests/integration/a11y.test.js` (line 503) share one app boot. The fidelity sweep
takes about 10 seconds by design.

### 3.3 Limits of what the tests prove

- **Keyboard activation.** Tests running inside the page cannot create trusted key
  events, so they assert native `button` / `summary` elements, document-order tab order
  and that Enter / Space is not blocked, not the browser's own activation. A Playwright
  driven keyboard pass from outside the page would close this.
- **The honest-fallback and Unrated dialogs** are tested with a fake provider
  (`foreground.test.js` FG14–17, FG32–34), not through the real UI: reaching them there
  needs a real budget exhaustion and the panel has no budget control.
- **The "stopped" replay outcome** is tested through the `makeMachine` seam; no valid
  document makes a real action throw.
- **Screen readers.** ARIA attributes and live-region text are asserted; no real screen
  reader has been run.
- **The Reviewer did not re-run** after the fix list was implemented. Blocker B1 was
  withdrawn by decision D-36 and the fixes are covered by tests.

### 3.4 Occasional timing overrun in `PERF-NEW-*` — resolved 2026-11-21

The six `PERF-NEW-*` tests no longer hang (fixed in Phase 2). The remaining overrun was
not the fallback itself but the fixed wall-clock bound: a generation's attempt count is
geometric, so any fixed bound fails on its tail. Raising the budgets (§4.1) moved the
tail rather than removing it; in a 300-seed Chromium sweep with the new budgets, Medium
p99 is 1.1 s and max 1.45 s, Hard p99 1.5 s and max 1.8 s.

**Fix:** `PERF-NEW-*` now asserts `elapsed < 500 ms + attempts × PER_ATTEMPT_MS[tier]`,
reading `attempts` from `puzzle.gen`. The ceilings are about 3× the per-attempt cost
measured in headless Chromium (Kiddie 6.1 ms, Easy 7.5, Medium 10.7, Hard 15.4, Expert
22.1, Nightmare 20.0); full-suite runs measure about 1.2× that. The test is deterministic
given the attempts a run took and still catches regressions in per-attempt cost and in
UI / worker overhead.

**Decision (Product Director, 2026-11-21):** the CLAUDE.md 1 s target does not apply to
cold puzzle generation. A slow run is the expected tail of a random process, not a
failure; generation is judged per attempt, and every other action keeps the 1 s target.
User-facing latency is addressed by the cache (§4.4), not by the test.

### 3.5 Frozen fixture

`js/tests/fixtures/sessions/format-v1-baseline.json` (SHA-256
`d845b7bca1cac9a19ba7f70a7a6d342811d17f0326c5a0c3365679f357b66a52`, 480 actions, 4 error
entries) is the format-compatibility anchor and must never be edited once the feature
ships; `session-fixtures.test.js` FX1 pins the hash. To cover something new, add a
fixture with `js/tests/tools/captureSessionFixtures.js`, which refuses to overwrite.
Known gap in it: puzzle origins are generated and string only; there is no link-origin
or unknown-origin puzzle.

---

## 4. Outside this feature

### 4.1 Medium requests fall back to another tier about 7% of the time — resolved 2026-11-21

**Resolution:** `ATTEMPT_BUDGET` raised to Easy 60 (from 30), Medium 200 (from 60) and
Hard 200 (from 150), so every tier now falls back less than 0.01% of the time. Measured
per-attempt accept rates (3,000 Node attempts each): Kiddie 99.6%, Easy 15.5%, Medium
4.9%, Hard 4.6%, Expert 21%, Nightmare 4.6%. At the old budgets, Medium missed about
4.8% of the time, Easy 0.64% and Hard 0.09%. No practical seed now exhausts Easy's real
budget, so PR4 and DBG-G3 pin `budget: 30` to keep exercising the fallback from seed 26.

The original finding, kept for the record:

Found while diagnosing the flaky performance test. In a 300-seed sweep, 22 Medium runs
exhausted the attempt budget (`ATTEMPT_BUDGET.medium` is 60 in `js/config.js`) and
delivered a different tier; two captured cases were Expert and Nightmare. Below
Diabolical the fallback is silent, so a player asking for Medium gets a much harder
puzzle, correctly labelled, about one time in fourteen. Easy fell back in 2 of 206 seeds;
Kiddie in 0 of 4,000; Hard in 0 of 139.

**Now easy to study.** `sudokuDev.generate('medium', seed)` reproduces any run, and
Generation diagnostics shows attempts and the wrong-tier breakdown. A sweep over seeds in
Node (`generateForTier` with `mulberry32(seed)`) gives the rate for any candidate budget
or `GIVEN_COUNT_TARGET.medium` (currently 30–34).
**Options:** raise the Medium budget; adjust the given-count target; or make the silent
fallback below Diabolical prefer the nearest tier over the hardest candidate found
(`pipeline.js` keeps the highest-ranked wrong-tier puzzle as `best`).

### 4.2 Stale modules after a deploy

Twice during the build, Chrome ran a cached copy of one module beside fresh copies of
others: once in the page ("does not provide an export named …") and once in the
generator worker (old pipeline, new page). The local server sends no cache headers, so
this is expected locally. The same can happen to players after a deploy if hosting.com
serves `.js` files with headers that allow reuse without revalidation; page and worker
could briefly run different versions, and the worker protocol gained fields in this
feature. **To check before shipping:** the `Cache-Control` / `ETag` behaviour for `.js`
on the host, and whether a cache-busting query on the module entry points is wanted.

### 4.3 The live-debugging driver script is not in the repository — resolved 2026-11-22

**Resolution:** the driver is now `scripts/devdrive.mjs`, with helpers under
`scripts/devdrive/`. `up` and `down` start and stop a no-store static server and the
debug Chrome. `run` and `-e` run a script against the app tab. Panel helpers (`load`,
`runSolver`, `applyStep`, `overlay`, `coach`, `summary`) click the real controls and take
the panel's 1-based step numbers. It was checked by replaying the 2026-11-22 inspector and
coach session end to end. Usage is in `dev-mode-workflows.md` §1. The appendix that kept
the old script is removed. The persistent console logger stays superseded by the session
recorder's error capture.

### 4.4 The pre-generation cache refills only at boot

Backlog; added 2026-11-21 for a future session. `primeNext` is called once, in
`js/main.js` step 10, for the boot tier only (aspec-game-state §boot, unchanged since v1).
After the first New Puzzle or difficulty change, every request is a cold generation, so
the generator's latency tail (§3.4) reaches the player: Medium p90 about 0.6 s, p99 about
1.1 s; Nightmare p90 about 0.9 s, p99 about 1.9 s.

**Direction:** refill the current tier's cache entry after each one is consumed. That is
the main win. Priming every tier costs more: Diabolical averages about 200 attempts per
puzzle (≈ 4 s), and a foreground request aborts background work, discarding its
progress. The cache already persists to localStorage, so tiers filled in one session
carry into the next. **Accepted limit:** the cache holds one puzzle per tier, so
pressing New Puzzle again quickly still waits on a cold generation; the Product Director
accepts that cost.
