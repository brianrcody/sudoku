# Developer Mode — Workflows

**Date:** 2026-11-13
**Audience:** the developer, and agents debugging the solver, coach, or generator
**Reference:** `fspec-005-dev-mode.md` (exact behavior), `aspec-dev-mode.md` (internals)

This is a how-to. It describes what the five tools let you do in practice, and which tool
answers which question.

---

## 1. Setup

| Do this | Result |
|---|---|
| Open the app with `?dev=1` | Developer mode on. Saved in `localStorage`; stays on across reloads |
| Open the app with `?dev=0` | Off, and the saved setting is cleared |

When it is on, a red **DEV** badge sits in the bottom-left corner (click it to jump to the
panel) and a *Developer tools* panel appears below the game. Each tool is a collapsed
section; open the ones you need.

Three things to know before you start:

1. **No statistics are recorded while developer mode is on.** You can play, solve, and
   load freely without polluting your cookie stats. If you turn it off mid-game, the
   attempt is recorded on your next digit.
2. **The tools never change the board**, with one exception: *Load puzzle from string*
   replaces the puzzle, and asks first if you have progress.
3. **`window.gameState` is available in the console** in every mode. Several workflows
   below use it to pull strings out of the app.

### Useful console one-liners

```js
// The current puzzle's givens, as a loadable string
Array.from(gameState.getState().puzzle.givens).join('')

// The current board — givens plus your digits — as a loadable string
Array.from(gameState.getState().pen).join('')

// The solution
Array.from(gameState.getState().puzzle.solution).join('')

// The generator's solve trace (empty after a page reload; it isn't persisted)
gameState.getState().puzzle.solveTrace
```

The **Share** button gives you the givens too: the copied link ends in `?p=<81 digits>`.

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

1. In the broken session, run `Array.from(gameState.getState().pen).join('')` in the
   console and copy the result.
2. Load that string. The player's digits are now givens.

This works because a correctly part-solved board still has exactly one solution. If the
load is rejected with "no solution", **that is your answer**: the position contained a
wrong digit, and the bug is likely downstream of that rather than in the solver.

Pencil marks are not part of the string. If the bug depends on them, re-enter the relevant
marks by hand after loading (see §3.4 for why that matters to the coach).

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
5. Click the step again to clear, or another step to move.

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
   place of your marks:

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

1. Select the tier, press New Puzzle a number of times, note *Attempts* each time.
2. If the wrong-tier breakdown is dominated by *easier* tiers, the target leaves too many
   givens; if by *harder* tiers or "unsolvable", too few.
3. Change the config, reload, repeat.

Caveat: New Puzzle is normally served from the **background pre-generation cache**, so the
puzzle you get was generated earlier. Its diagnostics are still its own — they travel with
the cached puzzle — but don't read *Attempts* as "how long I just waited".

**Confirming a rating.** *Achieved tier* is what the generator decided. Press Run solver
in the inspector: the summary's tier should match. A mismatch would mean the rater and the
live solver disagree — a serious bug.

**Checking the fallback path.** On Diabolical or Nightmare, a puzzle that arrived through
the "No Diabolical puzzle found… Play Expert?" dialog shows *Fallback used: Yes* with
*Attempts* equal to the budget.

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

---

## 4. Tool reference

| Tool | Input | Output | Changes the game? |
|---|---|---|---|
| Load puzzle from string | 81 cells, `0`/`.` empty, whitespace ignored | Outcome line; new puzzle on success | Yes — replaces the puzzle (asks if you have progress) |
| Solver step inspector | Current givens + pen digits | Ordered steps; summary; grid highlight on selection | No |
| Candidate overlay | Current board + your pencil marks | Computed candidates with divergence marked | No |
| Coach step data | The active coach session | `CoachStep` as JSON; clipboard copy | No |
| Generation diagnostics | The current puzzle | Generation-run table | No |

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
- **Developer mode is per-browser.** It lives in `localStorage` (`sudoku.dev.v1`).
