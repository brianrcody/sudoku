# Final Report — Developer Mode + Puzzle Sharing (V4)

**Date:** 2026-11-13
**From:** Uber Developer session (autonomous)
**To:** Product Director
**Brief:** `docs/misc/v4-devmode-sharing-brief.md`
**State:** both features built, reviewed, and tested. **Nothing is committed, pushed, or
deployed**; all work is unstaged in the working tree. No escalation was needed.

---

## 1. Outcome

| Brief §7 criterion | Result |
|---|---|
| Full suite passes, ≥ 3 consecutive runs | ✓ 1081 passing / 0 failing / 10 pending, three identical runs (750 before) |
| Branch coverage 100% | ✓ all ten new modules at 100%; every added line in modified files covered **except one** (§3.1). Project-wide 93.50%, up from 91.94%, with the carried exceptions |
| Review sign-off clean | ✓ `review-devmode-sharing-v1.md` |
| Performance target met or documented | ✓ met, including for Unrated puzzles (§4) |
| A11y requirements met | ✓ asserted in tests (§1 of the review) |
| Final report | This document |

Where to look first: run the app with `?dev=1`, then open a link such as
`index.html?p=000000039000001005003050800008090006070002000100400000009080050020000600400700000`
(loads as Unrated).

## 2. Decisions Log

Interpretations made without escalating, with reasoning. "D" numbers in the aspecs refer
to the same decisions.

### Loading and sharing

| # | Decision | Reasoning |
|---|---|---|
| 1 | Share parameter is `p` | Shortest unambiguous name; the brief left it to me |
| 2 | Rate first, confirm second | An invalid link should never ask the player to give up progress. Progress is evaluated when checking finishes, so a move made meanwhile still triggers the prompt |
| 3 | Unrated puzzles use on-demand checking with the Check button shown | rspec-006 R7 lists mistake checking among features that work normally; with hints and coach gone it is the only aid left. The alternative (silent, like the top tiers) would make "mistake checking works" vacuous |
| 4 | Changing difficulty on an **Unrated** puzzle generates a new puzzle at the chosen tier | The existing behavior relabels the current puzzle. Relabelling an Unrated puzzle would re-enable coach on a board the solver can't solve and count it in statistics. This also matches R11's "changing difficulty … returns to normal generation" |
| 5 | Rated loaded puzzles keep the existing difficulty-change behavior (relabel) | Consistency with generated puzzles. I think that behavior is itself wrong (§5.1) but changing it is a product decision outside this brief |
| 6 | "The shared puzzle wins" in every ordering | Per the brief. In-flight generation is aborted when the shared puzzle is ready; a generation that finished first is replaced silently (no progress); a restored game with progress gets the confirmation. A rejected or declined link leaves the boot puzzle alone |
| 7 | While statistics are ineligible, `attemptRecorded` stays false | Otherwise a game started under dev mode and finished after `?dev=0` would record a win with no attempt. The attempt is recorded on the first eligible digit |
| 8 | A grid with no empty cells is rejected | Nothing to play, and the rater would call it Kiddie |
| 9 | Seven distinct rejection messages; illegal characters reported before wrong length | "Clear message" (R5). A string that is both wrong-length and non-numeric is more usefully described as non-numeric |
| 10 | Share button is a full-width second row under New Puzzle / Reset | Must be reachable at every width, so it cannot join the header controls that hide at ≤ 720px. Provisional until the hamburger menu |
| 11 | One notice card under the board for share and link outcomes; errors and the fallback link stay until dismissed, confirmations auto-dismiss after 4 s | The app had no general message area. Not a second live region — outcomes go through the existing announcer so nothing is read twice |
| 12 | No `execCommand('copy')` fallback | R1 specifies the selectable field as the fallback; the deprecated API would add an untestable third path |
| 13 | Board keyboard shortcuts are ignored inside text fields | Previously digits typed anywhere went to the selected cell. With a link field and a dev textarea now on the page that would corrupt the board. `<select>` behavior deliberately left as it was |
| 14 | `dialog.open` gained an optional `onCancel` | The loader must learn of a decline to report it and to spend the link. Existing callers are unaffected |
| 15 | Loading does not change the saved difficulty preference | It is the player's choice of what to *generate*; a friend's link shouldn't move it |
| 16 | Overlapping loads are independent; no supersession | A token scheme would let a later, rejected load silently void an earlier one the player had already confirmed |
| 17 | A loaded puzzle's id is derived from givens + solution only | The same shared puzzle gets the same id for everyone |

### Developer mode

| # | Decision | Reasoning |
|---|---|---|
| 18 | The indicator is a fixed "DEV" badge in the viewport's bottom-left corner, and it links to the panel | Persistent and unobtrusive (R3); visible at widths where header controls hide; keeps dev markup out of `index.html` entirely |
| 19 | The panel sits below the game area, each tool a native `<details>` | Subordinate to the game; keyboard and screen-reader behavior for free |
| 20 | Tools draw on the grid through one new hook, `grid.setCellDecorator` | The overlay must replace cell content and accessible names; a hook inside the renderer cannot be raced by a re-render. Cost when dev mode is off: one null check per cell update |
| 21 | An empty cell with no pencil marks shows all computed candidates as "agree" | An unmarked cell is not a divergence; flagging every candidate in every untouched cell would bury the real ones |
| 22 | The inspector summary reports hardest **rank and tier**, not a technique name | The solver returns the rank; naming the technique would need a second name↔rank table that could drift |
| 23 | Inspector results go stale on any pen change, not on pencil changes | The inspector ignores pencil marks by requirement (R6) |
| 24 | Selected step highlights three roles: placement, elimination, and pattern cells | "Highlights the cells involved" (R6). Pattern cells are collected generically from the fields techniques already report |
| 25 | Technique profile is ordered by use count | Answers "what does this puzzle exercise"; no rank table needed |
| 26 | Diagnostics include a per-tier breakdown of wrong-tier rejections | Beyond R9's two reasons, free to collect, and it is what budget tuning needs |
| 27 | Diagnostics are persisted with the saved game and the pre-generation cache | Otherwise they would vanish on reload or for any pre-generated puzzle — i.e. most puzzles |
| 28 | The `dev` parameter is left in the address bar | Lets you bookmark `?dev=1`; share links never include it |
| 29 | Inspector and overlay run on the main thread | Measured at 38–62 ms on unrateable boards; a worker round trip would add complexity for nothing visible |

## 3. Deviations from the Brief

### 3.1 One uncovered line (coverage standard)

`js/main.js` line 283, `preferredTier = puzzle.difficulty;`, is not executed by any test.
It is one unconditional assignment inside the honest-fallback dialog's confirm handler — a
block that has been a documented coverage exception since V3 because reaching it needs a
top-tier budget exhaustion through the UI, and seeds can't be controlled from outside the
app. Covering it means making the seed injectable through `main.js`, a production change
the process says not to make just for coverage. **Your call** whether that is worth doing;
it would also let the long-standing fallback-dialog gap be closed.

### 3.2 A second worker, not "the worker"

The brief says to run validation and rating "in the worker". They run in a **dedicated
second instance** of the same worker script. Reason: `generateForTier` is synchronous, so
the generation worker cannot answer anything while a generation runs — and a Diabolical
pre-generation runs for seconds. A load queued there would have missed the 1-second
target in exactly the common case (opening a link at boot). The protocol change is still
additive, and the cost is one extra worker startup on the first load only.

### 3.3 Stage order

Review findings B2 and B3 came from the scripted visual pass, B1 from the first test run,
i.e. the review and test stages overlapped rather than running strictly in sequence. All
three are recorded in the review and the bug report.

Otherwise the brief was followed as written: one loader, additive protocol, deterministic
generation, lazy dev module, no body-class state, no commits.

## 4. Performance Measurements

Headless Chromium, three runs; details in `test-summary-devmode-sharing.md`.

| Measurement | Result | Target |
|---|---|---|
| Load, warm, rateable (Medium / Hard) | 26–32 ms | < 1000 ms |
| Load, warm, **unrateable** | 52–65 ms | < 1000 ms |
| Load, cold (first load; includes worker startup) | 164–189 ms | < 1000 ms |
| Share link → loaded, including page boot, while the generation worker is busy | 398–444 ms | < 1000 ms |
| Inspector on an unrateable board (main thread) | 38–50 ms | < 1000 ms |

**The hazard in brief §5 did not materialize.** Rating was sampled in Node over 1,500
seeded minimal puzzles, 101 of which the solver cannot finish: median 0.2 ms, 99th
percentile 95 ms, worst case 317 ms. The classic "hardest" puzzles (Inkala, Golden
Nugget, Easter Monster) take 20–60 ms because the ladder finds nothing and stops at once.
The expensive inputs are puzzles the solver *almost* finishes with many chain steps, and
those are bounded as above. So no mitigation was needed for R12; the work is off the UI
thread regardless, and a "Checking puzzle…" state is shown.

With dev mode off, nothing changed on the hot path except one null comparison per cell
render; the existing perf suite's numbers are unchanged (all ≤ 6 ms for non-generation
actions).

## 5. Known Limitations and Things You Should Know

### 5.1 Found in existing code, not fixed (your decision)

1. **Difficulty change relabels instead of clearing.** Changing difficulty on a rated
   puzzle keeps the board and just changes its tier. A Nightmare puzzle can be relabelled
   Kiddie — gaining unlimited hints and counting as a Kiddie win. fspec-001 §9.3 says the
   puzzle state is cleared. This predates V4. It now also applies to rated *shared*
   puzzles. I'd recommend fixing it, but it changes established behavior.
2. **Cancel does not stop the generation worker.** The abort flag is only read between
   requests, so a cancelled Diabolical search runs to completion in the background (its
   result is cached). Harmless, but it is why loads needed their own worker.
3. **README claims "best/average time" statistics** that don't exist. Left untouched.

### 5.2 Limitations of this work

4. **Share placement is provisional**, per the rspec.
5. **A notice can be replaced before it is read** — e.g. pressing Share right after a link
   was rejected replaces the rejection message. One notice at a time, by design.
6. **Pattern highlighting keys off field names.** A future technique that reports cells
   under a new key gets placement/elimination highlights but no pattern highlight until
   the key is added to `CELL_KEYS` in `inspect.js`.
7. **Diagnostics exist only for puzzles generated from now on.** A game or cached puzzle
   saved by the previous version shows "No generation data was recorded".
8. **Dev rings replace coach rings** on a cell that has both during a coach session.
9. **Unrated + cancelled generation:** if you pick a top tier on an Unrated puzzle and
   cancel the search, the Unrated puzzle stays and the selector returns to "Unrated", but
   your saved preference is now the tier you picked. Next New Puzzle uses it.
10. **No visual mockup was reviewed.** The vspecs record what I chose; expect UX-review
    changes, most likely to the Share button's position and the notice.

## 6. Suggested Commit Breakdown

In dependency order; each leaves the suite green. Paths are relative to the repo root.

| # | Commit | Files |
|---|---|---|
| 1 | **Add V4 dev-mode and sharing specs** | `docs/rspecs/rspec-005*`, `rspec-006*`, `docs/fspecs/fspec-005*`, `fspec-006*`, `docs/vspecs/vspec-005*`, `vspec-006*`, `docs/aspecs/aspec-dev-mode.md`, `aspec-puzzle-sharing.md`, `aspec-overview.md`, `docs/tspecs/tspec-dev-mode.md`, `tspec-puzzle-sharing.md`, `docs/misc/v4-devmode-sharing-brief.md` |
| 2 | **Add Unrated tier and statistics gating to the reducer** | `js/config.js`, `js/game/state.js`; tests `unit/config.test.js`, `unit/state-unrated.test.js` |
| 3 | **Record generation diagnostics on generated puzzles** | `js/generator/pipeline.js`, `js/providers/clientGenProvider.js`; tests `unit/pipeline-diagnostics.test.js`, `unit/puzzleProvider.test.js` |
| 4 | **Add the puzzle loader: codec, validation/rating worker path, load flow** | `js/util/puzzleString.js`, `js/generator/loadPuzzle.js`, `js/worker/protocol.js`, `js/worker/generator.worker.js`, `js/providers/loadProvider.js`, `js/game/puzzleLoader.js`, `js/ui/dialog.js`; tests `fixtures/puzzles/loadable.js`, `unit/puzzleString`, `loadPuzzle`, `loadProvider`, `puzzleLoader`, `protocol`, `ui-dialog` |
| 5 | **Add puzzle sharing via URL** | `index.html`, `css/controls.css`, `js/util/clipboard.js`, `js/ui/notice.js`, `js/ui/share.js`, `js/ui/controls.js`, `js/ui/numpad.js`, `js/ui/coach.js`, `js/ui/keyboard.js`, `js/main.js` (all but the dev block); tests `unit/clipboard`, `ui-notice`, `ui-share`, `ui-controls`, `ui-numpad`, `ui-keyboard`, `arch`, `integration/_app.js`, `integration/sharing.test.js`, `setup.html` |
| 6 | **Add developer mode** | `js/dev/`, `css/dev.css`, `js/ui/grid.js`, `js/main.js` (dev flag, `statsSuppressed`, lazy import); tests `unit/devMode`, `inspect`, `devPanel`, `ui-grid`, `integration/devmode.test.js` |
| 7 | **Document dev mode and share links; record review and test results** | `README.md`, `docs/misc/v4featureCandidates.md`, `review-devmode-sharing-v1.md`, `bugs-devmode-sharing-1.md`, `coverage-devmode-sharing.md`, `test-summary-devmode-sharing.md`, `v4-devmode-sharing-report.md`, `dev-mode-workflows.md`, `v3-to-v4-technical-overview.md`, `scripts/visual-smoke.js` (screenshot pass for UX review: `node scripts/visual-smoke.js [outputDir]`) |

Notes on splitting: `js/main.js` and `js/tests/setup.html` are each touched by commits 5
and 6 and need `git add -p`. Commit 5 depends on `devMode.js` only through `main.js`'s
`statsSuppressed: isDevMode`; if you would rather not hunk-split, fold commits 5 and 6
together. `docs/agents/uberdeveloper.md` was already modified before this session and is
not part of this work.

### Picking this up in a later session

1. `git status` should show the same set as this table: nothing here was committed or
   staged. If files have changed since 2026-11-13, re-run `npm test` (expect 1081 passing,
   0 failing, 10 pending; about 4 minutes) before committing.
2. Commit only on explicit approval, one approval per commit (project `CLAUDE.md`).
3. Simplest safe route if hunk-splitting isn't wanted: commits 1–4 as listed, then 5 and 6
   folded into one "Add puzzle sharing and developer mode", then 7.
4. Coverage can be regenerated with the procedure in `CodeCoverageV2.md` §6.
5. Still open for the Product Director: UX review (mockups were waived), and the two
   decisions in §3.1 and §5.1 item 1.

## 7. Deliverables Index

| Kind | Path |
|---|---|
| Functional specs | `docs/fspecs/fspec-005-dev-mode.md`, `fspec-006-puzzle-sharing.md` |
| Visual specs | `docs/vspecs/vspec-005-dev-mode.md`, `vspec-006-puzzle-sharing.md` |
| Architecture | `docs/aspecs/aspec-dev-mode.md`, `aspec-puzzle-sharing.md`; index and tree in `aspec-overview.md` |
| Test strategy | `docs/tspecs/tspec-dev-mode.md`, `tspec-puzzle-sharing.md` |
| Review | `docs/misc/review-devmode-sharing-v1.md` |
| Bugs | `docs/misc/bugs-devmode-sharing-1.md` |
| Coverage / tests | `docs/misc/coverage-devmode-sharing.md`, `test-summary-devmode-sharing.md` |
| User docs | `README.md` (Share links; Developer Mode) |
| Candidates | `docs/misc/v4featureCandidates.md` — both marked implemented, pending review |
