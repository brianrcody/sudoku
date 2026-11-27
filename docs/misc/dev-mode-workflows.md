# Developer Mode — Workflows

**Date:** 2026-11-13; updated 2026-11-26 for debug instrumentation
**Audience:** the developer, and agents debugging the solver, coach, or generator
**Reference:** `fspec-005-dev-mode.md` and `fspec-007-debug-instrumentation.md` (exact
behavior), `aspec-dev-mode.md` and `aspec-debug-instrumentation.md` (internals)

This is a how-to. It describes what the six panel tools, the `window.sudokuDev` console
API and the live-debugging driver let you do in practice, and which one answers which
question.

---

## 1. Setup

| Do this | Result |
|---|---|
| Open the app with `?dev=1` | Developer mode on. Saved in `localStorage`; stays on across reloads |
| Open the app with `?dev=0` | Off, and the saved setting is cleared |

When it is on, a red **DEV** badge sits in the bottom-left corner (click it to jump to the
panel) and a *Developer tools* panel appears to the right of the game (below it when the
window is narrower than 1400px). Each tool is a collapsed
section; open the ones you need.

Four things to know before you start:

1. **No statistics are recorded while developer mode is on.** You can play, solve, and
   load freely without polluting your cookie stats. If you turn it off mid-game, the
   attempt is recorded on your next digit.
2. **Some tools change the game.** *Load puzzle from string*, *Replay* and *Generate*
   (from a seed) replace it, asking first if you have progress. The inspector's
   set-board-to-step replaces your digits and trims your pencil marks until you press
   *Restore board*. `sudokuDev.setPencilMarks` and `fillPencilMarks` edit pencil marks as
   an undoable move. The table in §4 says what each tool touches.
3. **Everything you do is recorded.** From page load, the session recorder keeps every
   action and every uncaught error, across reloads, until you clear it or turn developer
   mode off (§3.10).
4. **`window.sudokuDev` is available in the console** in developer mode, and
   `window.gameState` in every mode. Prefer `sudokuDev`: its calls return plain objects,
   never throw, and never open a dialog or move focus.

### Useful console one-liners

```js
sudokuDev.state().text              // the board as a ruled 9×9 grid
sudokuDev.state().puzzle.givens     // the givens, as a loadable string
sudokuDev.state().board             // givens plus your digits, as a loadable string
sudokuDev.state().puzzle.solution   // the answer key
sudokuDev.state().puzzle.seed       // the seed that generated it (null if not recorded)
sudokuDev.inspect()                 // the solver's steps from the current board
sudokuDev.coachStep()               // the active coach step, or { active: false }
sudokuDev.candidates()              // computed candidates for every cell

// The generator's solve trace (empty after a page reload; it isn't persisted)
gameState.getState().puzzle.solveTrace
```

Intent flags must be exactly `true`. A call that would replace the game or discard the
recorded history fails with `needs-replace` or `needs-discard-history` and changes
nothing, so `sudokuDev.load(s)` on a game with progress needs
`sudokuDev.load(s, { replace: true })`.

The **Share** button gives you the givens too: the copied link ends in `?p=<81 digits>`.

### Driving the app from a script

`scripts/devdrive.mjs` runs the app in a headed Chrome you can watch and play in, while a
script (or an agent) drives the same tab over CDP. This is the setup for working through
a bug together.

```sh
node scripts/devdrive.mjs up       # server on :8080 (no-store), Chrome on :9222, at ?dev=1
node scripts/devdrive.mjs -e 'await dev.load("<81 cells>"); await dev.runSolver();
  await dev.applyStep(17); return dev.coach()'
node scripts/devdrive.mjs run my-repro.mjs   # default export: async ({page, dev, shot, …}) => any
node scripts/devdrive.mjs down
```

- Chrome uses a throwaway profile, so your real statistics and settings are untouched.
- The server sends `Cache-Control: no-store`, so after an edit the page and the generator
  worker never run a mix of old and new modules.
- The `dev` helpers click the real controls, so a bug found by hand is reproduced through
  the same path. They are `load` (a share link, confirming the "Load shared puzzle?"
  prompt), `openTool`, `runSolver`, `applyStep`, `overlay`, `coach`, `summary` and `cellRef`.
- **Step numbers are the panel's 1-based numbers.** The step buttons' `data-step`
  attribute is 0-based; the helpers convert, so code that uses the selector directly
  must too.
- A snippet's return value prints as JSON, followed by any console errors, page errors
  and failed requests. Screenshots (`shot(name)`) and logs go to `sudoku-devdrive/` under
  the OS temp directory.
- For reads, `window.sudokuDev` (documented in the README) is usually all you need:
  `return page.evaluate(() => sudokuDev.inspect())`.

---

## 2. Which tool answers which question

| Question | Tool |
|---|---|
| "What does this specific puzzle do in our app?" | Load puzzle from string |
| "What would the solver do from here, step by step?" | Solver step inspector |
| "Is this technique firing where I think it should?" | Solver step inspector |
| "Why does the solver rate this puzzle the way it does?" | Inspector summary + Generation diagnostics |
| "Are my pencil marks wrong, or is the coach wrong?" | Candidate overlay |
| "Is the coach's data wrong, or is its rendering wrong?" | Coach step data |
| "Why did the coach pick a different technique than the solver's first step?" | Inspector + Coach step data + Candidate overlay together (§3.4) |
| "How hard is the generator working for this tier?" | Generation diagnostics |
| "Did the fallback fire?" | Generation diagnostics |
| "Which puzzle was this, exactly?" | Generation diagnostics: the seed (§3.11) |
| "What did I do to get here?" | Session recorder: Copy session (§3.10) |
| "Does the current code still behave as it did in this session?" | Session recorder: Replay and the divergence report (§3.12) |
| "Which action broke it?" | Replay with *Stop after action* (§3.13) |
| "How do I keep this bug fixed?" | A session fixture (§3.14) |
| "How do I drive the app from a script or an agent?" | `window.sudokuDev` (§3.15) and `scripts/devdrive.mjs` (§1) |

---

## 3. Workflows

### 3.1 Reproduce a bug report from a puzzle string

Someone reports "the coach said X on this puzzle" or a test prints a failing board.

1. Open *Load puzzle from string*, paste the string, press **Load**.
2. Read the status line: it tells you the tier the solver rated it, or that it loaded as
   Unrated, or exactly why it was rejected.

Accepted input is forgiving: digits `1`–`9`, `0` or `.` for empty, and whitespace anywhere,
so a 9-line grid pasted from a forum or a test fixture works as-is.

Rejections are diagnostic in themselves:

| Message | What it tells you |
|---|---|
| "…exactly 81 cells; this one has *N*" | Truncated or padded paste |
| "A digit repeats in a row, column, or box" | Transcription error in the givens |
| "The puzzle has no solution" | The givens look legal but contradict each other |
| "The puzzle has more than one solution" | Not a proper puzzle; our generator would never emit it |

**To hand someone else a repro**, press Share: the link carries the givens and they get
the identical puzzle, re-rated on their side.

### 3.2 Reproduce a mid-solve position

A bug often depends on the position, not the starting puzzle. You can freeze a position
into a puzzle:

1. In the broken session, run `sudokuDev.state().board` in the console and copy the
   result.
2. Load that string. The player's digits are now givens.

This works because a correctly part-solved board still has exactly one solution. If the
load is rejected with "no solution", **that is your answer**: the position contained a
wrong digit, and the bug is likely downstream of that rather than in the solver.

Pencil marks are not part of the string. If the bug depends on them, re-enter them after
loading, by hand or with `sudokuDev.setPencilMarks('r4c7', [1, 5])` per cell (see §3.4
for why that matters to the coach). `sudokuDev.fillPencilMarks()` fills every empty cell
with its computed candidates, a quick start when you want to remove a few by hand.

If you still have the session, a replay (§3.12) reproduces the position *with* its marks,
coach state and undo history, which a string cannot.

### 3.3 Verify technique detection

You want to know whether a technique fires, when, and on which cells.

1. Load or reach the position.
2. Open *Solver step inspector*, press **Run solver**.
3. Scan the list. Each line is one step: `Technique — place d at rXcY` or
   `Technique — eliminate d from rXcY, …; d2 from …`.
4. Click a step. The grid highlights:
   - **green ring** — the placement cell
   - **red ring** — cells losing a candidate
   - **dashed accent ring** — other cells in the pattern (pivot, wings, fins, chain
     nodes, colour groups, rectangle corners, ALS members), where the technique reports
     them
5. Click another step to move, or use Up/Down (Home/End) to walk the list; the highlight
   and the board cursor follow. Escape clears the selection.
6. Double-click a step, or press Enter or Space on it, to **set the board to that step**:
   the board you ran the solver on plus every digit placed up to there. Go to an earlier
   step and the later digits come off again. *Restore board* returns to where you
   started. This is not a move: no undo, no win, no statistics.
   Your pencil marks follow along: each step shows the marks you had when you first set
   the board to a step, minus whatever the solver has ruled out by then (eliminations, and
   placed digits from their row, column, and box). Going back brings marks back, and
   *Restore board* returns them exactly. A cell you never marked shows the solver's
   candidates at that step, so the coach sees the solver's eliminations even if you have
   not pencilled anything; a marked cell whose marks are all ruled out stays empty. Marks you change by
   hand while stepping are dropped at the next step. Those filled-in candidates are real
   pencil marks: if you make a move and the inspector goes stale, they stay (and are saved
   with the game), and the overlay, now back to plain row/column/box elimination, shows the
   digits the solver had eliminated as *computed, not marked*. That is expected, not an
   overlay bug; *Restore board* (before the move) or Erase all pencil clears them.
   The **candidate overlay** follows too: while the board is set to a step it shows the
   solver's candidates after that step, so with the overlay on you can watch eliminations
   without pencilling anything in.

The summary line gives you the rating directly: `Solved in N steps. Hardest rank R (Tier).`
Rank-to-tier, for reference:

| Rank | Technique | Tier |
|---|---|---|
| 1 | Naked Single | Kiddie |
| 2 | Hidden Single | Easy |
| 3–7 | Locked Candidates, Naked/Hidden Pair, Naked/Hidden Triple | Medium |
| 8–11 | X-Wing, Swordfish, Jellyfish, XY-Wing | Hard |
| 12–19 | XYZ-Wing, WXYZ-Wing, Finned X-Wing/Swordfish, Simple/Multi-Coloring, XY-Chain, Forcing Chain | Expert |
| 20 | Unique Rectangle | Diabolical |
| 21 | ALS-XZ | Nightmare |

Things to keep in mind:

- The inspector runs on **givens plus your pen digits**, with freshly computed candidates.
  It ignores pencil marks entirely.
- It takes your digits at face value, **including wrong ones**. A wrong digit usually
  makes it stall — which is a quick way to confirm a position is broken.
- The list goes stale the moment a pen digit changes ("Board changed — run the solver
  again"). Pencil changes don't affect it.
- `Stalled after N steps with M cells unsolved` is the explicit "the ladder ran out"
  signal. On a freshly loaded puzzle, that is exactly the condition that makes it Unrated.

**To find a puzzle that exercises a given technique:** generate at the tier that needs it
(table above), run the inspector, and look for the technique in the list. *Generation
diagnostics* shows the technique profile without running anything (§3.6). There is no
"force technique" tool — that was deferred.

### 3.4 Debug the coach

The coach has three layers, and each tool isolates one.

| Layer | What can be wrong | Tool |
|---|---|---|
| Solver | The technique itself is wrong or missing | Inspector |
| Analyzer | Right technique, wrong roles/arrows/text | Coach step data |
| Renderer | Right data, drawn or announced wrong | Compare Coach step data to the screen |

**Separating data bugs from rendering bugs**

1. Press **Coach** (or `C`).
2. Open *Coach step data*. This is the exact `CoachStep` object the renderer received.
3. Check it against what you see:
   - `roles.target`, `roles.cause`, `roles.elimTarget`, `roles.unitMember`, `roles.scA`,
     `roles.scB`, `roles.fin` — cell indices (0–80, row-major) for each highlight class
   - `arrows` — every overlay arrow as `{from, to, style}`
   - `eliminations` — what is actually removed, as `{cellIndex, digit}`
   - `digits` — the *headline* digits, which can differ from the eliminated ones
     (Unique Rectangle Types 2 and 4)
   - `supportingText`, `complexity.note` — the panel text
   - `autoReveal.cells` — which pencil marks the coach will add
4. If the JSON is right and the screen is wrong, the bug is in `ui/coach.js` or
   `ui/coachOverlay.js`. If the JSON is wrong, it is in `coach/analyzer.js`.

**Copy JSON** puts the object on the clipboard — paste it straight into a bug note or a
test fixture.

The view follows the session: it updates when a session starts and shows "No active coach
session." when it ends.

**"The coach chose a different technique than the inspector's first step"**

This is the most useful three-tool workflow, and it is usually not a bug. The two see
different candidates:

| | Inspector | Coach |
|---|---|---|
| Board | Givens + all pen digits | Givens + pen digits (refuses if any is wrong or in conflict) |
| Candidates | Freshly computed | Computed, then **intersected with your pencil marks** in every cell where you have marks |

So if you have pencilled a cell and omitted a real candidate, the coach believes it is
gone and may find a simpler — or different — technique.

1. Run the inspector; note step 1.
2. Press Coach; read `technique` in *Coach step data*.
3. If they differ, switch on *Candidate overlay* and look for **underlined** digits: those
   are true candidates missing from your marks. They are what the coach was told don't
   exist.
4. Press *Erase all pencil* and ask the coach again. If it now agrees with the inspector,
   the divergence came from the marks, as designed. If it still disagrees, you have a real
   analyzer bug.

**A cell's index to its position:** `row = floor(i / 9) + 1`, `col = i % 9 + 1`. The
inspector uses `rXcY`; the coach JSON uses raw indices.

### 3.5 Check pencil marks against the truth

1. Open *Candidate overlay*, switch on **Show computed candidates**.
2. Every empty cell now shows the candidates from plain row/column/box elimination, in
   place of your marks (while the inspector has the board set to a step, the solver's
   candidates after that step instead — see §3.3):

| Appearance | Meaning |
|---|---|
| Normal pencil digit | You marked it and it is a candidate |
| **Underlined**, accent colour | It is a candidate; you haven't marked it |
| ~~Struck through~~, red | You marked it; it is not a candidate |

3. Switch it off and your own marks are back, untouched.

A cell where you have no marks at all shows everything as normal — an unmarked cell isn't
treated as a disagreement.

Uses:

- **Auditing a coach auto-reveal.** Coach-revealed marks count as marks while they are on
  the board, so you can see whether the coach revealed exactly the computed set.
- **Explaining a stuck coach.** Struck-through or missing digits are the usual reason
  (§3.4).
- **Spotting a wrong digit.** An empty cell showing no candidates at all means a pen digit
  somewhere is wrong.

The overlay shows *basic* candidates only. It does not apply eliminations the solver would
make (pairs, wings, and so on). To see those, run the inspector and select the elimination
step.

The overlay and a selected inspector step can be on together: you see the candidates and
the rings on the same cells.

### 3.6 Tune and sanity-check the generator

*Generation diagnostics* describes the run that produced the current puzzle.

| Field | Read it as |
|---|---|
| Requested tier / Achieved tier | Different values mean the budget ran out |
| Fallback used | "Yes" = the honest-fallback (top tiers) or silent-fallback (lower tiers) path |
| Attempts | `N of budget`. Consistently close to the budget means the tier is starved |
| Rejected — unsolvable by solver | Candidates beyond the ladder. High counts mean removal is stripping too far for this tier |
| Rejected — wrong tier | With a per-tier breakdown, e.g. `18 (Kiddie 12, Medium 6)`. Tells you which way the given-count target is missing |
| Technique profile | Each technique and its use count in the solve, most-used first |

**Tuning a budget or a given-count target** (`ATTEMPT_BUDGET`, `GIVEN_COUNT_TARGET` in
`js/config.js`):

1. Select the tier, press New Puzzle a number of times, note *Attempts* each time. For
   numbers worth trusting, sweep seeds in Node instead:
   `generateForTier(tier, { rng: mulberry32(seed), seed, budget })` (from
   `js/generator/pipeline.js`; `puzzle.gen` holds the diagnostics) over a few hundred seeds gives the attempt distribution and the
   fallback rate for a candidate budget or target.
2. If the wrong-tier breakdown is dominated by *easier* tiers, the target leaves too many
   givens; if by *harder* tiers or "unsolvable", too few.
3. Change the config, reload, repeat.

Caveat: New Puzzle is normally served from the **background pre-generation cache**, so the
puzzle you get was generated earlier. Its diagnostics are still its own — they travel with
the cached puzzle — but don't read *Attempts* as "how long I just waited". A seeded run
(§3.11) bypasses the cache.

**Confirming a rating.** *Achieved tier* is what the generator decided. Press Run solver
in the inspector: the summary's tier should match. A mismatch would mean the rater and the
live solver disagree — a serious bug.

**Checking the fallback path.** On Diabolical or Nightmare, a puzzle that arrived through
the "No Diabolical puzzle found… Play Expert?" dialog shows *Fallback used: Yes* with
*Attempts* at least the budget (one more when no candidate was solvable). To reach the
fallback on demand, shrink the budget for one seeded run; with a budget of 1, almost any
seed exhausts it:
`await sudokuDev.generate('diabolical', 1, { budget: 1, replace: true, acceptFallback: true })`.
Without `acceptFallback: true` the call stops at `needs-accept-fallback` instead of
loading the fallback puzzle.

Diagnostics survive a reload. For a puzzle loaded from a link or string the section says
so; for a game or cached puzzle saved before this feature existed it says no data was
recorded.

### 3.7 Test against external puzzles

Use this for puzzles from books, forums, other apps, or the soundness sweep.

1. Load the string.
2. If it loads under a tier: run the inspector and compare the technique sequence with
   the source's claimed difficulty or solution path.
3. If it loads as **Unrated**: the ladder can't finish it. Run the inspector to see how
   far it gets — `Stalled after N steps with M cells unsolved`. The last few steps before
   the stall, and the position it leaves, show which technique we lack.

This is the fastest way to evaluate a candidate new technique: collect puzzles known to
need it, confirm each loads Unrated today, implement it, and watch them move to a tier.

**From a soundness-sweep failure:** the sweep reports a board. Load it, run the inspector,
and step through to the first elimination that removes a digit present in the solution
(`gameState.getState().puzzle.solution` in the console gives you the answer key).

### 3.8 Exercise the Unrated path

Any puzzle the solver can't finish loads as Unrated. A known one ("Golden Nugget"):

```
000000039000001005003050800008090006070002000100400000009080050020000600400700000
```

Load it, or open `index.html?p=` followed by that string. You should see "Unrated" in the
difficulty selector, Hint showing "–", Coach disabled, and Check available. `C` announces
that coach is unavailable.

### 3.9 Play without touching statistics

Leave developer mode on. Nothing you solve, abandon, or load is counted. This is the mode
to use for manual UX testing and for demos.

### 3.10 Record and export a session

Nothing to switch on: from page load the recorder keeps every action issued to the game
(player input, coach and hint requests with their results, timer actions, generation
start and progress, developer-tool actions, a *page reloaded* entry on each load), and
every uncaught error, unhandled rejection and listener exception. It saves to IndexedDB
after every entry, so the history survives reloads and crashes.

1. Reproduce the bug however you like, reloading if you need to.
2. Open *Session recorder* and press **Copy session**. The clipboard now holds one JSON
   session document. If the copy fails, the document appears in a text field, selected,
   for you to copy by hand.
3. Paste it into the bug note. It is the whole repro: starting position, every action
   with its time, and the errors.

The counts line shows what you have ("*A* actions, *E* errors recorded."). The history
keeps a starting position plus the last 5,000 entries, folding older ones into the
starting position, so a long session loses its beginning, not its end.

**Start clean before a repro** with **Clear history**: it empties the history (asking
first if it has entries) and leaves the game alone. The next document then holds only the
repro. From the console: `sudokuDev.clearHistory({ discardHistory: true })`.

With two tabs open, the later one owns the saved history; the earlier tab says so in the
storage line. `?dev=0` deletes the history along with the developer setting.

### 3.11 Reproduce a puzzle from its seed

Every generated puzzle records its seed.

1. Open *Generation diagnostics*. Note **Seed** and **Requested tier** (not *Achieved
   tier*: a seed reproduces its puzzle only with the tier that was asked for). **Copy
   seed** copies the number.
2. Under the table, choose that tier, enter the seed, press **Generate**.

You get the same puzzle and the same diagnostics, except *Seed chosen by*, which reads
"Developer (seeded run)". From the console:
`await sudokuDev.generate('medium', 123456789, { replace: true })`.

A seed is a much smaller repro than a session when the bug is in the generator or the
puzzle itself. It holds only for an unchanged generator and solver; after either changes,
the same seed may give a different puzzle, without warning. Seeded runs neither take from
nor store into the pre-generation cache.

### 3.12 Replay a session and read the divergence report

Replay answers "does the current code still do what it did then?". Use it to confirm a
fix, or to check that a refactor changed nothing.

1. Open *Session recorder*, paste the document into *Session document to replay*, press
   **Replay**.
2. The document is checked first. A bad one is rejected with a reason and nothing
   changes. Otherwise you are asked, once, before your progress or a recorded history is
   discarded.
3. The actions are applied **as recorded**: a coach step or hint replays the recorded
   result, not a fresh one. The board ends exactly where the session ended, with its
   pencil marks, coach session, undo history and win state, and is playable.
4. The report then recomputes every recorded coach step and hint from the position before
   it, with the current code, and compares the two.

Reading the report:

| Part | Read it as |
|---|---|
| "No divergences: all *k* computed results match…" | The current solver, coach and hint code reproduce the session exactly |
| "Action *n* — coach step at *time*: technique — recorded *X*, current *Y*." | The coach now picks a different technique there. Expand the item for both values as JSON |
| "Action *n* — coach step (*X*) at *time*: differs in *parts*." | Same technique, different roles, arrows, text or eliminations: an analyzer change |
| "Action *n* — hint on *cell*…" | The hint provider now gives a different cell, digit or technique |
| Not compared | Neither a match nor a divergence: an Unrated puzzle, an action that changed nothing, or a coach session already running at the starting position |
| Errors | Errors recorded in the replayed range, and any raised during this replay |

A replay that hits an error stops with "Replay stopped at action *n* of *M*: …" and leaves
the board at the position before that action.

After a replay **the history is the replayed session**. Keep playing and *Copy session*
exports one document covering both, so "replay to the bug, then try the fix by hand"
gives a single repro.

### 3.13 Bisect with "Stop after action"

When a session ends in a broken position and you need the action that broke it:

1. Replay the document with *Stop after action* set to about half its action count.
2. Look at the board, or run the inspector or overlay on it. Still good? Replay again
   with a later stop. Already broken? An earlier one.
3. Narrow until you have *N* (good) and *N+1* (broken). Action *N+1* is the culprit;
   find it in the document's `actions` array.

Each replay takes well under a second, so this is quick by hand. From the console it is a
loop:

```js
const doc = /* the session document, as an object */;
const at = n => sudokuDev.replay(doc, { stopAfter: n, replace: true, discardHistory: true });
await at(240); sudokuDev.state().text
```

A stop of 0 replays nothing past the starting position. A stop that would leave no puzzle
on the board is rejected.

### 3.14 Turn a session into a regression fixture

1. Export the session (§3.10), trimmed to the repro if you can (Clear history first).
2. Save it as `js/tests/fixtures/sessions/<name>.json`.
3. Replay it in a test:

```js
import { replayFixture, loadSessionFixture } from '/js/tests/helpers/replayFixture.js';

const { state, report } = await replayFixture(await loadSessionFixture('<name>.json'));
expect(report.divergences).to.be.empty;
```

`replayFixture` runs the same checks and replay as the app, deterministically, with no
confirmation and no storage. `state` has the shape of `sudokuDev.state()`, so you can
assert the final board, marks or coach state; pass `{ stopAfter }` to assert a midpoint.
The divergence assertion is what keeps a solver, coach or hint fix from regressing. Add
the test to `js/tests/unit/session-fixtures.test.js`.

For a fixture built from a scripted session rather than a hand-played one, add a scenario
to `js/tests/tools/captureSessionFixtures.js` and run
`node js/tests/tools/captureSessionFixtures.js <name>`. It never overwrites an existing
file. **Never edit or re-record `format-v1-baseline.json`**: it is the anchor that proves
every future build still reads format version 1, and its hash is pinned.

### 3.15 Use `window.sudokuDev` from the console

The API mirrors the panel and adds what the panel lacks. Every call returns
`{ ok, reason?, message, … }`. The full table is in the README; fspec-007 §6 has the exact
contract.

| Task | Call |
|---|---|
| Read the whole position | `sudokuDev.state()` |
| Load a puzzle | `await sudokuDev.load(s, { replace: true })` |
| Set or fill pencil marks | `sudokuDev.setPencilMarks('r4c7', [1, 5])`, `sudokuDev.fillPencilMarks()` (both one Undo step) |
| Export or replay a session | `sudokuDev.exportSession()`, `await sudokuDev.replay(doc, { stopAfter, replace: true, discardHistory: true })` |
| Seeded generation, optionally with a smaller budget | `await sudokuDev.generate(tier, seed, { replace: true, budget })` |
| Console logging | `sudokuDev.logging()`, `sudokuDev.setLogging('actions', true)` |

**Console logging.** Three switches, also in the *Session recorder* panel, saved across
reloads: `generation` (`[dev:gen]` lines for each request, cache hit or miss, progress
and outcome; on), `swallowed` (`[dev:swallowed]` for every exception the app catches and
ignores, with where; on), and `actions` (`[dev:action]` for each recorded action, what it
changed and how long it took; off). Turn on `actions` while chasing a slow action or an
action that silently does nothing.

---

## 4. Tool reference

| Tool | Input | Output | Changes the game? |
|---|---|---|---|
| Load puzzle from string | 81 cells, `0`/`.` empty, whitespace ignored | Outcome line; new puzzle on success | Yes — replaces the puzzle (asks if you have progress) |
| Solver step inspector | Current givens + pen digits | Ordered steps; summary; grid highlight on selection | Selecting moves the board cursor; set-to-step replaces your digits, trims your pencil marks, and gives cells you never marked the solver's candidates (Restore board undoes all of it) |
| Candidate overlay | Current board + your pencil marks | Computed candidates with divergence marked | No |
| Coach step data | The active coach session | `CoachStep` as JSON; clipboard copy | No |
| Generation diagnostics | The current puzzle; a tier and seed | Generation-run table with seed; seeded generation | Generate replaces the puzzle (asks if you have progress) |
| Session recorder | The recorded history; a session document | Counts; session document; replay report | Replay replaces the game and the history (asks first); Clear history empties the history only |
| `window.sudokuDev` | Console calls | Plain result objects | `load`, `replay` and `generate` replace the game; the pencil-mark calls edit marks as one Undo step; the rest only read |

## 5. Limits

- **No force-technique.** You can't make the solver skip lower-ranked techniques.
- **The inspector names a rank and tier, not the hardest technique.** Read the technique
  off the list.
- **Pattern highlighting depends on what a technique reports.** The basic ones (singles,
  locked candidates, pairs, triples, plain fish, XY-Wing) report only their
  placements/eliminations, so they have no dashed pattern ring.
- **The solve trace isn't persisted.** After a reload `puzzle.solveTrace` is empty; the
  diagnostics panel recomputes the technique profile from the givens, so it still shows.
- **The inspector and overlay run on the main thread.** Measured at 40–60 ms on the
  hardest boards; not a practical concern.
- **Developer mode is per-browser.** It lives in `localStorage` (`sudoku.dev.v1`); the
  logging switches in `sudoku.dev.logging.v1`; the history in IndexedDB
  (`sudoku-dev-recorder`).
- **Replay applies, it does not re-run.** A replayed session ends where it ended even if
  the code has changed; only the divergence report shows the difference. A session that
  depends on a generator change needs a seed (§3.11), not a replay.
- **A corrupt pre-generation cache entry read at boot is not logged** (open item §1.1 in
  `debug-instrumentation-open-items.md`). Later cache errors are.
