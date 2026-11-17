# Requirements Spec: Debug Instrumentation
**ID:** rspec-007-debug-instrumentation
**Status:** Approved (Product Director decisions captured 2026-11-15)
**Date:** 2026-11-15
**Author:** Orchestrator (from Product Director direction)
**Source:** Live-debugging baseline of 2026-11-15 (developer and agent driving the running
app together through a debug browser)
**Extends:** `rspec-005-dev-mode.md`. Its requirements are cited here as `rspec-005 Rn`.

---

## 1. Overview

Developer mode gains the instrumentation needed to diagnose bugs against the live
application: a recorder that turns a session into a replayable document, a scripting API
over the existing tools, reproducible puzzle generation, and diagnostic logging. The
audience is the developer and agents working with the developer; a session captured by
hand must be usable by an agent, and the reverse.

Everything here exists only while developer mode is on, with one exception: R16 corrects
the generator itself and applies in every mode.

## 2. Requirements

### Session recorder

**R1.** While developer mode is on, every action issued to the game is recorded, in
order, with the time it occurred — including an action the game ignored, which is marked
as having changed nothing. The history has a fixed capacity and survives page reloads.
Turning developer mode off discards it.

**R2.** The history is always replayable from its beginning. When older actions are
discarded to stay within capacity, the recorder keeps the starting position — puzzle,
placed digits, and pencil marks — that the remaining actions apply to.

**R3.** A session can be exported as a single self-contained JSON document: the starting
position, the generation seed and tier where known, the recorded actions, and the errors
captured under R12. The document carries a format version.

**R4.** A session document can be replayed. Replay applies the recorded actions exactly
as recorded, so it reproduces the recorded state regardless of later changes to the
solver, coach, or hint logic. Replay can be stopped after the first *N* actions.

**R5.** Replay reports divergences. Where the recorded session contains a computed
result — a coach step or a hint — replay also computes that result with the current code
and reports each case where the two differ: which action, and what differed. A replay
with no divergences says so. Separately, and never counted as a divergence, the report
lists the errors recorded in the replayed range against the errors raised during the
replay.

**R6.** Replay never records statistics. Replaying over a game that has progress asks
first, under the same rule as loading a puzzle from a string (`rspec-005 R5`). Replay and
clearing the history both discard the recorded history, and each asks first when that
history is not empty. A document
that is malformed or of an unsupported version is rejected with a clear message and
leaves the current game untouched.

### Developer API

**R7.** While developer mode is on, a scripting interface (`window.sudokuDev`) provides,
without use of the panel:

- the current game state as plain JSON, with pencil marks and candidate sets expressed as
  digit lists, and a text rendering of the grid;
- load a puzzle from a string;
- run the solver step inspector and return its steps and summary;
- the current coach step, if a session is active;
- the computed candidates for the current board;
- set the pencil marks of a cell, and fill every empty cell's pencil marks with its
  computed candidates;
- the recorder's export and replay (R3–R5), and seeded generation (R10);
- clear the recorded history, and read and set the logging switches (R11).

**R8.** An API call follows the same rules as the panel tool it mirrors: the same
validation, the same outcome messages, no statistics. Where the panel would ask for
confirmation, the caller states its intent explicitly instead of being prompted. Invalid
calls report why they failed and leave the game untouched. The interface does not exist
when developer mode is off.

### Seeded generation

**R9.** Generation diagnostics shows the seed that produced the current puzzle, in a form
that can be copied.

**R10.** A puzzle can be generated from a chosen tier and seed. The same tier and seed
always produce the same puzzle and the same generation diagnostics, including a run that
ends in the budget-exhaustion fallback. Seeded generation bypasses the background
pre-generation cache. Reproducibility is promised only for an unchanged version of the
generator and solver. Through the API only, a seeded run may be given its own attempt
budget in place of the tier's, so that the budget-exhaustion fallback can be reached
quickly and on purpose; reproducibility then holds for the same tier, seed, and budget.

### Logging and error capture

**R11.** Developer mode writes diagnostic messages to the browser console in three
categories:

| Category | Content | Default |
|---|---|---|
| Generation worker | request, progress, result, fallback, pre-generation cache hit or miss | on |
| Swallowed exceptions | every error the application catches and deliberately ignores, with where it occurred | on |
| Action trace | each action, what it changed, and how long it took | off |

Each category can be switched on or off, and the choice persists across reloads.

**R12.** Uncaught errors, unhandled promise rejections, and exceptions thrown by state
listeners are captured into the session history at the point they occurred, whatever the
logging switches are set to.

### Regression fixtures

**R13.** An exported session document can be replayed inside the automated test suite by
a test helper, and asserted against: final state, and divergences. Session documents kept
as fixtures remain loadable when the format version later changes.

### Panel

**R14.** The developer panel gains:

- a **Session recorder** tool: the number of recorded actions and captured errors, copy
  the session document to the clipboard, load and replay a session document (optionally
  stopping after *N* actions), the replay's divergence report, clear the history, and the
  three logging switches of R11;
- in **Generation diagnostics**: the seed (R9) and a control to generate a puzzle from a
  tier and seed (R10).

### Generator correctness

**R16.** A generated puzzle is never labelled with a tier the solver cannot support. When
a generation run exhausts its budget without producing any puzzle the solver can finish,
the puzzle it delivers is Unrated and behaves as any Unrated puzzle does (`rspec-006`).
The saved difficulty preference is never set to Unrated, and an Unrated puzzle is never
kept in the background pre-generation cache. This applies with developer mode on or off.

### Cross-cutting

**R15.** `rspec-005` R2, R10, R11, and R12 apply to everything in this spec: with
developer mode off nothing here is loaded, visible, or reachable; all new UI is keyboard
operable and correctly exposed to assistive technology; user-facing actions still complete
in under 1 second with recording and logging on; and the code is held to 100% branch
coverage.

## 3. Decisions Captured

| Decision | Outcome |
|---|---|
| Recorder lifetime | Survives reloads, capped |
| Replay semantics | Verbatim, plus a divergence report against current code |
| Surface | Panel controls and console API, both |
| Regression fixtures | In this iteration |
| Action trace default | Off — it is noisy and duplicates the recorder |
| Seed entry | Panel and API only; no URL parameter. Share links stay `?p=` only |
| Recording with developer mode off | None. A bug seen in normal mode is reproduced again with the mode on |
| Ignored actions | Recorded, marked as having changed nothing |
| History on `?dev=0` | Discarded |
| Errors in the replay report | Included, as a separate part that is never a divergence |
| API: clear history and logging switches | Included |
| Unsolvable fallback puzzle from the generator | Labelled Unrated, in every mode (R16). Found by the Architect; the budget override makes the case easy to reach, so it is fixed here |
| Attempt-budget override for seeded runs | Included, API only (Architect feasibility: no practical seed exhausts a real budget) |
| Discarding a non-empty history (replay, clear) | Asks first |
| Supplying a session document in the panel | Paste only for now; a file picker is a possible future enhancement |

## 4. Out of Scope

- **Force technique** — still deferred (`rspec-005` §3).
- A `?seed=` URL parameter, or carrying a seed in share links.
- Recording anything while developer mode is off.
- Server-side logging or remote diagnostics.
- Loading a session document from a file, or saving one to a file, in the panel. Possible
  future enhancement.
- The external browser-driver script used by agents. It is tooling outside the
  application and is handled separately.

## 5. Notes for Downstream Roles

- R10 closes the open item from the developer-mode handoff: with a chosen seed, the
  honest-fallback path for the top tiers can be exercised deterministically.
- Recorded actions are not all user input. Some are issued by the application itself
  (generation progress, coach session start carrying the analyzer's result, a new puzzle
  carrying the generated puzzle). R4 requires these to be replayed as recorded; R5 is what
  compares them with current behavior.
- The tools of `rspec-005` that change the board — load from string, and the inspector's
  set-board-to-step — must be recorded and replayable like any other action.
