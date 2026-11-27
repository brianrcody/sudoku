# Functional Spec: Debug Instrumentation
**ID:** fspec-007-debug-instrumentation
**Status:** Draft
**Date:** 2026-11-15
**Author:** Functional Designer
**Based on:** rspec-007-debug-instrumentation; extends fspec-005-dev-mode; follows the
loading rules of fspec-006-puzzle-sharing

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Availability](#2-availability)
3. [Session Recorder](#3-session-recorder)
4. [Session Document and Export](#4-session-document-and-export)
5. [Replay](#5-replay)
6. [Developer API](#6-developer-api)
7. [Seeded Generation](#7-seeded-generation)
8. [Logging and Error Capture](#8-logging-and-error-capture)
9. [Regression Fixtures](#9-regression-fixtures)
10. [Panel Summary](#10-panel-summary)
11. [Accessibility](#11-accessibility)
12. [Edge Cases](#12-edge-cases)
13. [Out of Scope](#13-out-of-scope)
14. [Resolved Decisions](#14-resolved-decisions)
15. [Traceability](#15-traceability)

---

## 1. Scope and Conventions

Extends `fspec-005-dev-mode.md`; its terminology (dev mode, developer panel, current
board, cell reference `r<row>c<col>`) and its rules apply unless overridden here. Puzzle
strings, validation, Unrated handling, *progress*, and *generation tier* are as defined in
`fspec-006-puzzle-sharing.md`.

The audience is the developer and an agent driving the same live browser session. Anything
one of them produces — a session document, a seed — must be usable by the other.

**Terminology:**
- *Action* — one change request applied to the game: a player input (select a cell, enter
  a digit, toggle a pencil mark, erase, undo, hint, check, reset, change mode), or a
  change the application issues itself (generation started, generation progress, puzzle
  arrived, coach session started, coach session ended by its timer, a check highlight
  expiring), or a developer tool's change (puzzle loaded from a string, board set to a
  solver step, board restored, pencil marks set through the API).
- *Follow-up action* — an action the application issues in immediate response to another
  action, such as the generation started that follows a difficulty change, or the coach's
  focus tracking that follows a selection. It belongs to the triggering action's entry
  (§3.1).
- *Position* — everything that determines what the game shows and how it reacts to the
  next action (§3.2).
- *History* — the recorder's ordered list of entries, plus the starting position they
  apply to.
- *Entry* — one recorded action or one captured error.
- *Session document* — the exported form of a history (§4).
- *Computed result* — a result the solver-based code worked out and an action carries: a
  coach step (or the coach's "no technique" answer) and a hint.
- *Divergence* — a computed result that the current code works out differently from what
  was recorded (§5.8).
- *Seed* — a whole number from 0 to 4294967295 that fully determines a generation run for
  a given tier.
- *Recorder capacity* — the maximum number of entries kept. A named, adjustable value;
  initially **5,000**.

**Counts in wording.** Every count in a message, status line, dialog, or report takes the
singular noun when the count is 1 — "1 action", "1 error", "1 divergence", "1 computed
result", "1 cell", "1 coach step", "1 hint" — and the plural otherwise, including 0. The
templates in this spec show the plural form.

---

## 2. Availability

Everything in this spec exists only while dev mode is on (fspec-005 §2), with one
exception: §7.5 corrects the generator and applies in every mode.

- **Dev mode off:** nothing is recorded, logged, or captured; `window.sudokuDev` does not
  exist; no new control is visible, focusable, or exposed to assistive technology; none of
  this tooling is downloaded. Behavior and performance are identical to an app without
  this feature.
- **Dev mode on:** the developer panel gains a sixth tool, **Session recorder**, and the
  Generation diagnostics tool gains a seed and a generate control (§10). Recording, error
  capture, and the API are active from page load, whether or not any panel section is
  open.
- Recording and logging never change what a game action does. With every logging category
  on and the history at capacity, each user-facing action still completes in under
  1 second.
- Nothing here records statistics (fspec-005 §3).

---

## 3. Session Recorder

### 3.1 What is recorded

While dev mode is on, every action is recorded as one entry, in the order applied, with
the date and time it occurred (millisecond precision).

| Rule | Detail |
|---|---|
| One entry per issued action | An entry is recorded for each action issued by the player, by the application, or by a developer tool or API call, except follow-up actions (next row) |
| Consequences are not separate entries | Changes the game makes as a direct consequence of an action belong to that action's entry: auto-clearing related pencil marks, a coach session ending or moving to its recap because of a fill or erase, the completion check and win after the last digit. So do follow-up actions (§1): the generation started that follows a difficulty change, the coach's focus tracking that follows a selection. A difficulty change is therefore one entry; generation started is a separate entry only when issued on its own (boot, New Puzzle) |
| Entries carry their data | An entry holds whatever the action carried: the cell and digit, the generated or loaded puzzle (givens, solution, tier or Unrated, origin, generation data including the seed where known), the coach step exactly as the analyzer produced it, the board and pencil marks of a set-board-to-step |
| Hints carry their result | A hint entry holds the cell, the digit placed, and the technique the hint was attributed to |
| Ignored actions | An action the game ignored (a digit typed on a given, Undo with nothing to undo, Hint with none remaining) is recorded too, marked as having changed nothing |
| Time-driven actions | A coach recap timing out and a check highlight expiring are recorded when they happen, like any other action |

**Not recorded** — these are not game actions: theme and hand changes, opening or closing
panel sections, the candidate overlay switch, running the inspector and selecting a step
(the cursor move that selection causes *is* an action and is recorded), logging switches,
notices, Share, and the opening, confirming, or cancelling of a dialog. A dialog's effect
is recorded only through the action that follows a confirmation.

Actions issued through the console (`window.gameState`, `window.sudokuDev`) are recorded
exactly like those issued through the UI. The exception is a malformed action issued
through `window.gameState` — one of an unknown kind, or with data that does not fit its
kind: it is not recorded as an action, and one error entry notes it. That entry is of
kind "uncaught error" (§8.3) with the message "Unrecordable action: *kind*". If such an
action changed the game, later entries may not reproduce the position.

### 3.2 Starting position and capacity

The history always consists of a **starting position** followed by the entries that apply
to it, so it is replayable from its beginning at all times.

A position contains:

| Part | Content |
|---|---|
| Puzzle | Givens, solution, tier or Unrated, origin (generated / link / string / unknown), and for a generated puzzle its generation data: requested tier, seed where known, and the diagnostics of fspec-005 §8. May be "no puzzle" (first-ever boot, before generation finishes) |
| Placed digits | The player's pen digits |
| Pencil marks | Per cell, the set of marked digits |
| Play state | Hints remaining, pen/pencil mode, selected cell, whether the puzzle is won, the one step Undo would restore (if any), and any generation in progress |
| Coach session | When one is in progress: its step, its recap state, and which pencil marks the coach revealed |

- A new history starts with the position at that moment and no entries.
- When an entry would take the history over the recorder capacity, the oldest entry is
  discarded and the starting position advances to the position immediately after it. The
  remaining entries therefore still reproduce every later position exactly.
- Captured errors (§8.3) are entries and count toward capacity.
- Action numbers shown anywhere (panel, report, API) are positions in the current history
  or document, counting actions only, from 1. They are not permanent identifiers:
  discarding the oldest entry renumbers the rest.

### 3.3 Lifetime

| Event | Effect on the history |
|---|---|
| Page reload, dev mode still on | Kept. One entry, "page reloaded", is appended, carrying the complete position the application starts with after the reload (the restored saved game, or no puzzle when none was saved). The individual steps the application takes to rebuild a saved game are not entries |
| New puzzle, difficulty change, loaded puzzle | Kept. The puzzle's arrival is an ordinary entry carrying the puzzle; one history can span many puzzles |
| Reset, win | Kept; ordinary entries |
| **Clear history** (§10.1, §6.10) | Entries and captured errors are discarded; the starting position becomes the current position. Asked first when the history has at least one entry (§10.1) |
| Replay (§5) | Replaced by the replayed session (§5.6). Asked first when the history has at least one entry (§5.4) |
| Dev mode turned off (`?dev=0`) | Discarded. Nothing is recorded while the mode is off. Turning the mode on again starts a new history at the position of that page load |
| Share link opened (`?p=`) | Kept; the load is an ordinary entry |

A reload does not preserve an active coach session, the undo step, the selection, or
pencil mode (existing behavior); the "page reloaded" entry is what makes the history
reflect that.

### 3.4 Storage

The history is saved in browser storage after every entry so that it survives a reload.
Saving starts after every entry and completes shortly afterwards: a tab that is closed or
crashes within moments of an action may lose its last few entries. Every entry recorded
before that survives.

| Condition | Behavior |
|---|---|
| Storage unavailable at page load | The history is kept in memory for this page load only. The recorder's storage line reads "History is not being saved — it will be lost on reload." |
| A save fails (storage full) | Recording continues in memory, complete and exportable. The storage line shows the same message, announced once. Saving is attempted again at each new entry and after Clear history; when a save succeeds the line clears |
| Saved history unreadable or of an unknown stored form at page load | It is discarded and a new history starts. The storage line reads "The saved history couldn't be read and was discarded." until the next page load |

When more than one condition holds, the storage line shows the most urgent: ownership
lost (§3.5), then storage unavailable, then a failing save, then the "couldn't be read"
notice, which otherwise stays for the rest of the page load.

Storage trouble never interrupts play, never raises a dialog, and is never itself captured
as an error entry. It is reported under the swallowed-exceptions logging category (§8.1).

### 3.5 More than one tab

A saved history belongs to one tab at a time: the tab that loaded most recently with dev
mode on.

- A tab that loads with dev mode on reads the saved history, appends its "page reloaded"
  entry, and becomes the owner.
- A tab that loses ownership keeps recording in memory, complete and exportable, and stops
  saving. Its storage line reads "Another tab has taken over the saved history. This tab's
  history is kept until it is closed or reloaded.", announced once. The tab learns of the
  loss, and shows the message, when it next records an entry, not at the moment the other
  tab takes over.
- Tabs never interleave their entries.

### 3.6 Counts

The Session recorder tool shows "*A* actions, *E* errors recorded." and keeps it current.
When the history is at capacity it adds "At capacity (*C*): the oldest entries are being
discarded." The counts are not announced as they change.

---

## 4. Session Document and Export

### 4.1 Content

A session document is one self-contained JSON text. From the user's perspective it holds:

| Part | Content |
|---|---|
| Format version | A whole number identifying the document layout. This spec introduces version 1 |
| Exported at | Date and time of export |
| Starting position | As §3.2 |
| Seed and tier | For the starting puzzle, when it was generated and the seed is known: the seed and the requested tier, stated on their own so they can be read without digging. Absent otherwise |
| Actions | Every recorded action, in order, each with its time and data (§3.1) |
| Errors | Every captured error (§8.3), each with its time and the number of the action it followed (0 when it preceded the first) |

- Cells are identified by index 0–80, row-major, as in the coach step data (fspec-005 §7).
  Boards are 81-character strings; pencil marks are lists of digits, written in ascending order
  without repeats; a document is accepted with them in any order.
- A solver solve trace is not part of a puzzle in the document.
- Nothing outside the game is included: no statistics, theme, hand setting, logging
  switches, or dev-mode flag.
- The document is the whole history at the moment of export. Exporting changes nothing.

### 4.2 Copy flow

1. The developer activates **Copy session** in the Session recorder tool.
2. The app builds the document from the current history and tries to copy it to the
   clipboard.
3. **Copy succeeded:** the history status line reads "Session copied: *A* actions, *E*
   errors." and is announced. Focus stays on Copy session.
4. **Copy failed or clipboard unavailable:** a read-only multi-line text field labelled
   "Session document" appears beneath the button, holding the document, focused with its
   whole content selected. The history status line reads "Couldn't copy automatically. The
   session document is shown for you to copy.", styled as an error, and is announced. The
   field stays until the next Copy session, Clear history, or a replay that replaces the
   game (§5.2 step 5); a successful later copy removes it. A rejected or declined replay
   leaves it in place.

The history status line is one status line in the Session recorder's history group,
shared by the Copy session outcomes and the Clear history outcomes ("History cleared.",
"History not cleared.", §10.1.1). It shows the most recent of them.

Copy session is always enabled; a history with no entries exports a valid document.

---

## 5. Replay

### 5.1 Supplying a document

The Session recorder tool has a labelled multi-line text field ("Session document to
replay"), an optional number field labelled "Stop after action" with the hint "Optional. Leave
empty to replay every action." as its description, a **Replay** button, a replay status
line, and a report area. The document is supplied by pasting or typing its JSON
text into the field. Both fields keep their content after every outcome.

The stop-after value has surrounding whitespace trimmed; an empty value means all
actions. Anything other than decimal digits is rejected with the stop-value message of
§5.3. The field asks for a numeric keyboard on touch devices; it does not filter
keystrokes.

### 5.2 Procedure

1. The developer activates Replay.
2. The status line shows "Checking session…". The current game stays fully playable.
3. **Parse and validate** the document and the stop value (§5.3). Every puzzle the
   document carries — the starting puzzle and any puzzle arriving in a later action — is
   checked off the UI thread under fspec-006 §4.1 step 2, and its recorded solution must
   be that puzzle's one solution. Puzzles are **not** re-rated: tier and Unrated status
   are taken as recorded. Validation covers the whole document, including actions beyond
   the stop value. On any failure → rejected; nothing changes.
4. **Confirm if needed** (§5.4): once, covering both the game's progress and the recorded
   history.
5. **Replace.** As fspec-006 §4.1 step 5: any in-flight generation is cancelled and any
   other open confirmation dialog is closed. The previous report is cleared from the
   report area and the copy-fallback field (§4.2) is removed. The document's starting position becomes the current position.
6. **Apply** the first *N* actions in order (§5.5), where *N* is the stop value, or all
   of them when it is empty or exceeds the count.
7. **Compare** each computed result with the current code (§5.8).
8. **Report** the outcome in the status line (§5.9) and the report area (§5.8); the
   outcome is announced. The global notice is not used.

Steps 5–6 complete without accepting other input, and within the 1-second bound for a
document at recorder capacity. Step 7 may take longer; while it runs the status line reads
"Comparing with current code…", the board already shows the replayed position, and the
game is playable.

### 5.3 Rejections

A rejected replay changes nothing: the current game, its progress, its persistence, and
the current history are untouched. The only panel change besides the status line is that
the report area is cleared (§5.8); the copy-fallback field (§4.2) stays. A rejection is reported without any confirmation
being asked. The message is "This session can't be replayed."
followed by the reason.

| Condition | Reason |
|---|---|
| Field empty | "No session document was supplied." |
| Not JSON | "The text is not valid JSON." |
| JSON, but not a session document: the top-level value lacks the required parts of a session document (§4.1); the format version is checked by the next row | "The JSON is not a session document." |
| Format version newer than this build reads, or not a version at all | "It is format version *V*; this build reads versions 1 to *S*." When the version is missing or not a number, *V* is shown as "unknown" |
| Starting position structurally wrong, or its puzzle fails validation | "Its starting position is not valid: *detail*." For a puzzle failure the detail is as below the table |
| An action is of an unknown kind, lacks its data, or carries a puzzle that fails validation | "Action *n* is not valid: *detail*." The first such action is reported. For an unknown kind the detail is "it is not a recognised action"; for incomplete or invalid data, "its data is incomplete or invalid"; for a puzzle failure, as below the table |
| Stop value, after trimming surrounding whitespace, neither empty nor decimal digits only (API: not a whole number ≥ 0) | "Stop after must be a whole number, 0 or greater." |
| The replay would end with no puzzle on the board | "It would end before any puzzle is loaded. Choose a later stopping point." |
| Internal failure while checking | "The session couldn't be checked." |

A puzzle failure's detail is the fspec-006 §4.2 message for that failure, with one
addition that is this spec's own wording: a puzzle whose recorded solution is not its one
solution (§5.2 step 3) has the detail "The recorded solution is not the puzzle's
solution."

Checks are made in the order listed; the first failure is the one reported. Older format
versions are not rejected (§9.2).

### 5.4 Confirmation

A replay replaces two things: the current game, and the recorded history (§5.6). It asks
before discarding either one that holds something, in a single dialog. Two conditions are
evaluated at the moment validation finishes:

- **Progress** — the current game has progress (fspec-006 §1). As in fspec-006 §4.3, a
  won board, or one with no player digits and no pencil marks, has none.
- **History** — the recorded history has at least one entry, action or error. Whether it
  has been exported is not considered.

| Progress | History | Dialog body |
|---|---|---|
| Yes | No | "Your current progress will be lost." |
| No | Yes | "The recorded history (*A* actions, *E* errors) will be discarded." |
| Yes | Yes | "Your current progress will be lost, and the recorded history (*A* actions, *E* errors) will be discarded." |
| No | No | No dialog; the replay proceeds directly |

In every case that asks, the dialog is:

> **Replay this session?** *Body from the table.*
> [Cancel] [Replay]

- Standard confirmation dialog (fspec-001 §9): modal, focus trapped, Cancel focused on
  open, Escape cancels.
- *A* and *E* are the counts shown in the tool (§3.6) at the moment the dialog opens.
- **Replay** → step 5. **Cancel/Escape** → declined: "Session not replayed. Your game and
  recorded history are unchanged." The report area keeps any existing report, and the
  copy-fallback field (§4.2) stays.
- Never more than one dialog per replay.
- A second replace confirmation (another replay, a load from string, a share link)
  replaces the first, which then counts as declined (fspec-006 §4.1).
- A replay that has been replaced by a second one writes nothing further to the status
  line or the report area: it does not show the declined message. Only the latest replay
  reports.

### 5.5 How actions are applied

- Each action is applied exactly as recorded, with the data it carries. A coach session
  starts with the recorded coach step; a hint places the recorded digit in the recorded
  cell; a puzzle arrival puts the recorded puzzle on the board with its recorded tier; a
  set-board-to-step sets the recorded board and pencil marks. The current solver, coach,
  hint, and generator code is **not** consulted to apply an action, so the replayed
  position is the recorded one whatever has changed in that code since.
- An action recorded as having changed nothing is applied like any other. Whatever the
  current game logic does with it is the result.
- Replay never starts a real generation, never changes the saved difficulty preference,
  never records statistics, and never opens a dialog (other than §5.4 beforehand).
  Recorded generation-started and generation-progress actions change only what the
  recorded actions changed.
- Replay does not wait for recorded times; actions are applied as fast as possible. No
  intermediate position is shown and no per-action announcement is made.
- The stop value counts actions. Errors recorded in the document are never re-raised.
- **An action raises an error while being applied:** replay stops. The board shows the
  position reached before that action. The error is captured (§8.3). The outcome is the
  "stopped" message of §5.9.

### 5.6 After a replay

- The board shows the position after the last applied action, including the selected
  cell, pen/pencil mode, hints remaining, pencil marks, an active coach session if the
  session was in one (the coach panel and highlights show the recorded step), and the win
  state (the win banner shows; nothing is recorded in statistics).
- If the last applied action left a generation in progress, the busy state is cleared, as
  if cancelled, and the report says so. A replay never leaves the app waiting for a
  generation that is not running.
- Time-driven follow-ups pending in the final position (a recap or check highlight about
  to expire) run their normal course from the moment the replay ends.
- The replayed game is the current game in every respect: playable, saved and restored
  like any other, with the difficulty selector showing its puzzle's tier (or Unrated). The
  saved difficulty preference is unchanged (fspec-006 §7.2).
- **The history is replaced** by the replayed session, the previous one having been
  confirmed for discarding where it had entries (§5.4): the document's starting position
  plus the actions applied, with their original times. Applying them does not record them
  a second time. Errors recorded in the document are not carried into the history; errors
  captured during this replay are. Play continues the history from there, so a session
  replayed to action *N* and then continued by hand exports as one coherent document.
- Keyboard focus stays on Replay.

### 5.7 Interaction with other tools and states

| State when the replay replaces the game | Behavior |
|---|---|
| Active coach session | Ended, as for any puzzle replacement. Coach-revealed marks vanish with the old board |
| Generation running (including the first-ever boot) | Cancelled. The busy state ends |
| Honest-fallback dialog or any other confirmation open | Closed, counted as declined |
| A puzzle load still "Checking puzzle…" | Independent (fspec-006 §4.1): whichever finishes last is the current game |
| Inspector has results | Cleared; the summary reads "Board changed — run the solver again." (fspec-005 §5.3) |
| Inspector has the board set to a step | That state is dropped: no step is marked, the board status is cleared, Restore board is disabled. Recorded set-board-to-step actions change the board but never repopulate the inspector's list |
| Candidate overlay on | Stays on and shows the replayed board. It shows basic computed candidates, since the board is no longer set to an inspector step |
| Coach step data tool | Shows the recorded step if the replay ends inside a coach session; otherwise "No active coach session." |
| Generation diagnostics | Show the generation data the document carries for the puzzle now on the board (§7.1) |

### 5.8 Divergence report

For every applied action that carries a computed result, the current code computes that
result from the replayed position immediately before the action, and the two are compared
in full. An action that raises an error while being applied (§5.5) is not itself
compared; comparison covers the actions applied before it.

| Computed result | Compared |
|---|---|
| Coach step | The whole coach step: technique, type, digits, placement or eliminations, cell roles, arrows, text, auto-reveal. A "no technique" answer and its reason count as a result |
| Hint | Cell, digit, and attributed technique |

The report area shows, in this order:

1. **Scope line.** "Replayed *N* of *M* actions." Plus "Document format version *v* was
   read as version *S*." when an older document was upgraded, and "Replay ended during a
   puzzle generation; the busy state was cleared." when §5.6 applied.
2. **Divergence summary** — exactly one of:
   - "No divergences: all *k* computed results match the current code (*c* coach steps,
     *h* hints)."
   - "*d* of *k* computed results differ from the current code:" followed by the list.
   The verb agrees with the count it follows: for *k* = 1 the first form reads "No
   divergences: the 1 computed result matches the current code (…)", and for *d* = 1 the
   second reads "1 of *k* computed results differs from the current code:". The summary
   line never carries the not-compared count; that appears in the Not compared part and
   in the outcome message (§5.9).
   - "No computed results to compare: the replayed actions contain no coach steps or
     hints." when they contain none at all.
   - "No computed results could be compared." when they contain computed results but
     every one is not compared.
3. **Divergence list**, in action order, one item each:
   - "Action *n* — coach step at *time*: technique — recorded *X*, current *Y*." when the
     technique differs; other differing parts are then named after "Also differs:".
   - "Action *n* — coach step (*X*) at *time*: differs in *part, part, …*." when the
     technique is the same.
   - "Action *n* — hint on *cell* at *time*: *part* — recorded *X*, current *Y*." for each
     differing part.
   *time* is the recorded action's local time of day as `HH:MM:SS.mmm` (24-hour).
   Each item can be expanded to show the recorded and current values of every differing
   part as JSON, in two blocks with the accessible names "Recorded values" and "Current
   values".
4. **Not compared**, when any, under the sub-heading "Not compared", one item each:
   "Action *n* — *kind*: not compared — *reason*."

   | Case | Reason |
   |---|---|
   | The current code raised an error computing the result | "the current code raised an error: *message*" |
   | The action is a coach step or hint on an Unrated puzzle | "hints and coach are unavailable on an Unrated puzzle" |
   | The game ignored the action when it was recorded | "the recorded action changed nothing" |

   A coach session already in progress in the starting position is listed as "Starting
   position — coach step: not compared — the position before it is not in the document."
5. **Errors.** "Errors: *r* recorded in the replayed range, *e* raised during this
   replay." *r* and *e* count error entries, not repeats, as the tool's error count does
   (§3.6). Each is then listed, one item each:
   - "Recorded — *kind* after action *n*: *message*" for an error recorded in the
     document;
   - "Raised during this replay — *kind* after action *n*: *message*" for an error raised
     while this replay was applied or compared.

   *kind* is "uncaught error", "unhandled rejection", or "listener exception" (§8.3); *n*
   is 0 for an error that preceded the first action. When an error's repeat count (§8.3)
   is greater than 1, " (×*count*)" follows the item; the repeat count appears only there.
   Omitted when both counts are 0.

Not-compared items are neither matches nor divergences and are excluded from *k*.

The report stays until a later replay proceeds past confirmation (§5.2 step 5), a
rejection, or Clear history, each of which clears it; a replay that proceeds shows its own
report when it finishes. A declined replay leaves the report in place. Its text is
selectable.

### 5.9 Outcome messages

| Outcome | Status line and announcement |
|---|---|
| Replayed, nothing differs | "Session replayed: *N* of *M* actions. No divergences in *k* computed results." |
| Replayed, divergences | "Session replayed: *N* of *M* actions. *d* divergences in *k* computed results." |
| Replayed, nothing to compare (the actions contain no computed results) | "Session replayed: *N* of *M* actions. No computed results to compare." |
| Replayed, nothing could be compared (every computed result is not compared) | "Session replayed: *N* of *M* actions. No computed results could be compared." |
| Any of the above with not-compared items | The sentence gains " *u* not compared." |
| Stopped by an error | "Replay stopped at action *n* of *M*: *error message*. The board shows the position before that action.", styled as an error. Comparison still runs for the actions applied before it; the failing action is not compared (§5.8) |
| Declined | "Session not replayed. Your game and recorded history are unchanged." |
| Rejected | "This session can't be replayed. *Reason from §5.3*", styled as an error |

The stopped and rejected outcomes are styled as errors; the other replay outcomes are
not. The same error styling applies to the Copy session failure (§4.2) and the Copy seed
failure (§7.1), as it already does to the seed validation and generator failure messages
(§7.2).

---

## 6. Developer API

### 6.1 General contract

While dev mode is on, `window.sudokuDev` offers the operations below. It is available as
soon as the developer panel is.

- **Results.** Every operation returns one plain JSON object — directly for read
  operations, as a promise for the operations marked *async*. Success:
  `ok: true` plus the fields listed. Failure: `ok: false`, a `reason` code from the
  tables below, and a `message`. No operation throws or rejects for bad input or an
  unmet precondition.
- **Same rules as the panel.** An operation that mirrors a panel tool applies the same
  validation and produces the same outcome message as that tool, in `message`.
- **Stated intent instead of a prompt.** An operation that would replace a game with
  progress never opens a dialog. The caller passes `replace: true` to state that the
  current progress may be discarded. Without it, when there is progress (fspec-006 §1) at
  the moment the panel would have asked (fspec-006 §4.3), the operation fails with reason `needs-replace`, a message
  that is the panel's declined message followed by "Pass replace: true to replace a game
  with progress.", and the game untouched. `replace: true` is harmless when there is no
  progress. The honest-fallback prompt is handled the same way with `acceptFallback`
  (§6.9), and discarding a recorded history that has entries with `discardHistory`
  (§6.8, §6.10): without it the operation fails with reason `needs-discard-history`.
- **Failure leaves the game untouched**, and the history and logging switches too. The
  single exception is a replay stopped by an error part-way (§6.8).
- **Cells** are given as cell references (`"r4c7"`). Per-cell lists in results are
  81-entry row-major arrays. The coach step is returned as it is (cell indices 0–80).
- **Recording.** Changes made through the API are actions and are recorded (§3.1).
- **Announcements.** A call that changes the game, clears the history, or changes a
  logging switch announces its outcome message through the live region; a call that
  succeeds without changing anything does not (§6.7, §6.11). Read operations announce
  nothing. The outcome of a generation is announced exactly once (§6.9). API calls never move keyboard focus and never write to the global
  notice. `replay` (§6.8) is the only API call that writes a panel status line (the replay
  status line) and the only one that fills the report area. `clearHistory` (§6.10) writes
  no status line; its only panel effect is clearing the report area and the copy-fallback
  field. No other API call changes the panel's status lines, report area, or fallback
  field.
- **No statistics**, as everywhere in dev mode.
- While a replay is applying actions, every other operation that changes the game or the
  history fails with reason `busy` ("A replay is running."). Reading and setting the
  logging switches (§6.11) is not affected.

The existing `window.gameState` is unchanged and remains available in every mode.

### 6.2 `state()`

Returns the current position as plain JSON.

| Field | Content |
|---|---|
| `puzzle` | `null` when none; otherwise `givens` and `solution` (81-character strings, `0` for empty), `tier` (tier name or `"unrated"`), `origin` (`generated`, `link`, `string`, `unknown`), and for a generated puzzle `requestedTier`, `seed` (number, or `null` when not recorded), `fallback` |
| `board` | The current board as an 81-character string |
| `pencilMarks` | 81 lists of digits, ascending; empty list for no marks |
| `selected` | Cell reference or `null` |
| `mode` | `"pen"` or `"pencil"` |
| `hintsRemaining` | A number, or `"unlimited"`, or `null` on an Unrated puzzle |
| `won`, `generating`, `undoAvailable`, `coachActive` | Booleans |
| `conflicts`, `flaggedIncorrect` | Lists of cell references currently in conflict / flagged incorrect by the last check. A cell in both lists is drawn as conflicting on the board |
| `recorder` | `actions`, `errors`, `capacity` |
| `text` | The grid as nine lines of digits with `.` for empty cells, spaced and ruled into 3×3 boxes, givens and player digits alike |

Never fails.

### 6.3 `load(puzzleString, { replace })` — *async*

Mirrors Load puzzle from string (fspec-005 §4): the loading procedure of fspec-006 §4.

| Outcome | Result |
|---|---|
| Loaded | `ok: true`, `tier`, `message` per fspec-006 §4.4 |
| Rejected | `ok: false`, `reason: "rejected"`, `message` per fspec-006 §4.4 |
| Progress, no `replace` | `ok: false`, `reason: "needs-replace"` |
| Not a string | `ok: false`, `reason: "invalid-argument"` |

### 6.4 `inspect()`

Runs the solver exactly as Run solver does (fspec-005 §5.1) and returns `summary` (the
summary line), `solved`, `unsolvedCells`, `hardestRank` and `tier` (both `null` unless
solved), and `steps`: for each, its number, `technique`, `text` (the list line),
`placement` (cell and digit, or `null`), `eliminations` (cell and digit each), and
`pattern` (the other cells the technique reported).

It is a pure read: it changes nothing in the game and does not alter the panel
inspector's list, selection, highlights, or board-set-to-step state.

Fails with `no-puzzle` ("No puzzle loaded.") when there is none.

### 6.5 `coachStep()`

Returns `active` and `step`: the exact object shown by Coach step data (fspec-005 §7),
or `active: false`, `step: null`, `message: "No active coach session."`. Never fails.

### 6.6 `candidates()`

Returns `candidates`: 81 lists of digits — for each empty cell of the current board, the
candidates from basic row/column/box elimination; an empty list for a filled cell. These
are always the basic candidates, including while the inspector has the board set to a
step. Fails with `no-puzzle`.

### 6.7 `setPencilMarks(cell, digits)` and `fillPencilMarks()`

**`setPencilMarks`** makes the cell's pencil marks exactly the given digits (an empty
list clears them).

- It behaves as if the player had toggled each differing digit by hand, as one step: Undo
  restores the cell's previous marks; an active coach session continues and reacts as it
  does to hand edits (clearing the last indicated candidate completes an elimination
  step); the inspector's results are not made stale.
- The selection and the pen/pencil mode do not change.
- Returns `cell`, the resulting `digits`, and `message` "Pencil marks set in *cell*.",
  which is announced (§6.1). Setting marks that are already as requested succeeds and
  changes nothing: it returns the same message but is not announced.

**`fillPencilMarks`** replaces the pencil marks of every empty cell with that cell's
basic computed candidates (§6.6), removing any other marks.

- One step for Undo. An active coach session ends first, as it does for Erase-all-pencil.
- Returns `cellsChanged` and `message` "Pencil marks filled in *n* cells.", where *n* is
  `cellsChanged`. It is announced unless no cell changed (§6.1).

| Failure | Reason | Message |
|---|---|---|
| No puzzle | `no-puzzle` | "No puzzle loaded." |
| Puzzle won | `game-won` | "The puzzle is complete; pencil marks can't be changed." |
| Generation running | `busy` | "A puzzle is being generated." |
| Not a cell reference | `invalid-cell` | "*value* is not a cell reference such as r4c7." |
| Cell holds a given or a pen digit | `cell-filled` | "*cell* holds a digit; it can't take pencil marks." |
| Digits not a list of whole numbers 1–9 | `invalid-digits` | "Pencil marks must be a list of digits 1–9." |

Repeated digits in the list are accepted and count once.

### 6.8 `exportSession()` and `replay(document, { stopAfter, replace, discardHistory })`

**`exportSession()`** returns `document`: the session document (§4.1) as a JSON object.
It does not use the clipboard. Never fails.

**`replay`** — *async* — mirrors §5. `document` may be the JSON object or its text.

| Outcome | Result |
|---|---|
| Replayed | `ok: true`, `applied`, `total`, `message` (§5.9), `report` |
| Stopped by an error | `ok: false`, `reason: "stopped"`, `applied`, `total`, `stoppedAt`, `message`, `report`. This is the one failure that changes the game: it shows the position before the failing action |
| Rejected | `ok: false`, `reason: "rejected"`, `message` (§5.9) |
| A needed intent flag is missing | `ok: false`, `reason` and `missing` as below |
| Any other replay in flight, from the panel or the API, in any phase (checking, awaiting confirmation, applying, comparing) | `ok: false`, `reason: "busy"` |

Intent (§5.4, §6.1). The two conditions of §5.4 are evaluated at the same moment as in the
panel, and each needs its own flag: `replace: true` when the game has progress,
`discardHistory: true` when the recorded history has at least one entry. A flag that is
not needed is harmless. Both are checked together, so one failed call tells the caller
everything it must pass:

| Missing | `reason` | `missing` | `message` |
|---|---|---|---|
| `replace` only | `needs-replace` | `["replace"]` | "Session not replayed. Your game and recorded history are unchanged. Pass replace: true to replace a game with progress." |
| `discardHistory` only | `needs-discard-history` | `["discardHistory"]` | "Session not replayed. Your game and recorded history are unchanged. Pass discardHistory: true to discard the recorded history (*A* actions, *E* errors)." |
| Both | `needs-replace` | `["replace", "discardHistory"]` | The declined sentence followed by both "Pass …" sentences, in that order |

A rejected document is reported as rejected whatever flags were passed.

An API replay is never superseded. A panel replay activated while an API replay is in
flight waits for it to finish, then proceeds as §5.2.

The promise resolves when the comparison has finished. `report` carries everything the
panel report shows (§5.8): `applied`, `total`, `compared`, `divergences` (each with
`action`, `kind`, `time`, and `differences`: part name with `recorded` and `current`
values), `notCompared` (each with `action`, `kind`, `reason`), `errors` (`recorded` and
`raised` lists), and `notes` (format upgrade, busy state cleared).

A replay run through the API also fills the panel's report area and status line, so both
people in the session see the same result. This is the one case in which an API call
writes a panel status line (§6.1).

### 6.9 `generate(tier, seed, { replace, acceptFallback, budget })` — *async*

Mirrors Generate from seed (§7.2).

| Outcome | Result |
|---|---|
| Generated at the requested tier | `ok: true`, `requestedTier`, `tier`, `seed`, `fallback: false`, `diagnostics`, `message` ("Generated from seed *S*: *Tier* puzzle.", §7.2) |
| Budget exhausted, Kiddie–Expert | `ok: true`, with `fallback: true`, `tier` the delivered tier, and `message` as the §7.3 status; the puzzle is loaded (§7.3) |
| Budget exhausted, Diabolical/Nightmare, `acceptFallback: true` | As the row above |
| Budget exhausted, Diabolical/Nightmare, no `acceptFallback` | `ok: false`, `reason: "needs-accept-fallback"`, `requestedTier`, `tier` (the best found), `seed`, `diagnostics`, and the message "No *Tier* puzzle found. The best the generator found is rated *ActualTier*. Pass acceptFallback: true to play it." |
| Unknown tier | `ok: false`, `reason: "invalid-tier"`, "Tier must be one of: kiddie, easy, medium, hard, expert, diabolical, nightmare." |
| Bad seed | `ok: false`, `reason: "invalid-seed"`, message per §7.2 |
| `budget` given but not a whole number of 1 or more | `ok: false`, `reason: "invalid-budget"`, "Budget must be a whole number of 1 or more." |
| Progress, no `replace` | `ok: false`, `reason: "needs-replace"` — decided before generation starts |
| Cancelled or replaced by another request | `ok: false`, `reason: "cancelled"`, message per §7.2 |
| Generator failure | `ok: false`, `reason: "failed"`, "The puzzle couldn't be generated." |

`diagnostics` carry the same information the Generation diagnostics table shows (§7.1,
fspec-005 §8): requested tier, achieved tier, fallback used, attempts and budget, rejected
counts with the per-tier breakdown, technique profile, seed, and seed chosen by. `tier`
accepts tier names in any letter case.

**Announcement and focus.** The outcome of a generation is announced exactly once,
whether the run was started from the panel or through the API. A panel-started run also
shows it in the Generate status line and returns focus to Generate (§7.2). An API call
writes no panel status line and never moves focus (§6.1).

**`budget`** is optional and exists only in the API; the panel has no such control. It
replaces the tier's attempt budget for this one run, so that budget exhaustion — and with
it the fallback behavior of §7.3 — can be reached quickly and on purpose: a seed that
exhausts a tier's real budget is impractical to find. Everything else about the run is as
without it. The diagnostics show the budget the run used ("Attempts: *N* of *budget*").
Checks are made in the order tier, seed, budget.

### 6.10 `clearHistory({ discardHistory })`

Mirrors **Clear history** (§10.1).

- Effects are exactly the button's: every entry and captured error is discarded and the
  starting position becomes the current position (§3.3); saving the history is attempted
  again (§3.4); the current game is untouched.
- No dialog is opened. Where the button would ask — the history has at least one entry —
  the caller must pass `discardHistory: true` (§6.1). The flag is harmless when the
  history is empty.
- It also clears the panel's report area and copy-fallback field, as the button does: a
  report or an exported document left on screen would describe a history that no longer
  exists. It does not write "History cleared." to the panel's history status line
  (§4.2, §6.1).
- "History cleared." is announced, as for the button.
- Clearing is not a game action and is not itself recorded.

| Outcome | Result |
|---|---|
| Cleared | `ok: true`, `message: "History cleared."`, `discarded` (`actions` and `errors`: the counts removed) |
| History has entries, no `discardHistory` | `ok: false`, `reason: "needs-discard-history"`, "History not cleared. Pass discardHistory: true to discard the recorded history (*A* actions, *E* errors)." Nothing is cleared, nothing on the panel changes, nothing is announced |
| A replay is applying actions | `ok: false`, `reason: "busy"`, "A replay is running." Nothing is cleared |

`busy` is checked first. Clearing a history that is already empty succeeds with both
counts 0, with or without the flag, and is announced all the same. There is no other
failure.

### 6.11 `logging()` and `setLogging(category, on)`

Mirror the three logging switches (§8.2). The API and the panel operate the same three
settings: a change made through either shows in the other immediately.

| Category name | Switch |
|---|---|
| `"generation"` | Log generation worker |
| `"swallowed"` | Log swallowed exceptions |
| `"actions"` | Log action trace |

**`logging()`** returns `logging`: an object with the three category names, each `true`
(on) or `false` (off). Never fails; announces nothing.

**`setLogging(category, on)`** sets one switch.

- Effects are exactly the switch's: it takes effect immediately for messages from that
  moment on, is saved per browser under the same persistence rule (when storage is
  unavailable the choice lasts for this page load), and never affects the recorder or
  error capture.
- The panel switch shows the new state and its `aria-checked` follows.
- The state change is announced with the switch's own wording: "*Category* logging on." /
  "*Category* logging off.", where *Category* is "Generation worker", "Swallowed
  exceptions", or "Action trace".
- Setting a switch to the state it already has succeeds, changes nothing, and announces
  nothing.
- Category names are matched exactly, in lower case.

| Outcome | Result |
|---|---|
| Set | `ok: true`, `category`, `on`, `logging` (all three, as `logging()` returns), `message` (the announcement text) |
| Already in that state | As the row above; `message` states the unchanged state in the same wording |
| Unknown or missing category | `ok: false`, `reason: "invalid-category"`, "Logging category must be one of: generation, swallowed, actions." |
| `on` is not `true` or `false` | `ok: false`, `reason: "invalid-value"`, "Logging can only be set to true or false." No value is coerced: `1`, `0`, `"on"`, and a missing argument all fail |

The category is checked before the value. A failed call changes no switch.

Switch state is deliberately not part of `state()` (§6.2), which describes the game and
its recorder; `logging()` is the one place to read it.

---

## 7. Seeded Generation

### 7.1 The seed in Generation diagnostics

The diagnostics table (fspec-005 §8) gains two rows, shown first:

| Field | Content |
|---|---|
| Seed | The seed of the run that produced the puzzle, as a decimal whole number, with a **Copy seed** button |
| Seed chosen by | "Generator (random)" or "Developer (seeded run)". Every seeded run reads "Developer (seeded run)", including one that reproduces a randomly seeded puzzle (§7.4) |

| Puzzle | Seed row |
|---|---|
| Generated, seed recorded | The seed; Copy seed enabled |
| Generated before this feature existed (a saved game or a pre-generated puzzle from an older version) | "Not recorded"; Copy seed disabled; "Seed chosen by" reads "—" |
| Loaded from a link or string | No table, as today: "This puzzle was loaded, not generated." |
| No origin recorded | As today: "No generation data was recorded for this puzzle." |
| Put on the board by a replay | Whatever generation data the session document carries for that puzzle, under the rules above |

- The seed belongs to the puzzle. It survives reloads with the saved game, and travels
  with a pre-generated puzzle, so a puzzle served from the background cache shows the
  seed of the earlier run that produced it.
- A seed reproduces its puzzle only together with the **requested** tier shown in the
  same table, not the achieved tier.
- **Copy seed** copies the decimal seed. Success: status "Seed copied." Failure: status
  "Couldn't copy — select the seed and copy it manually.", styled as an error. Both are
  announced. The seed text is selectable.

### 7.2 Generate from seed

Beneath the table, always present whatever the current puzzle: a **Tier** selector (the
seven tiers; initially the generation tier), a **Seed** text field, a **Generate** button,
and a status line.

1. The developer chooses a tier, enters a seed, and activates Generate.
2. **Validate the seed.** After trimming surrounding whitespace it must be a whole number
   from 0 to 4294967295 written in decimal digits only. Otherwise the status line shows,
   as an error, "Seed must be a whole number from 0 to 4294967295." and nothing else
   happens. An empty field fails the same way.
3. **Confirm if needed.** If the current game has progress (fspec-006 §1), asked under
   the rule of fspec-006 §4.3:

   > **Generate from this seed?** Your current progress will be lost.
   > [Cancel] [Generate]

   Cancel/Escape → "No puzzle generated. Your game continues." The confirmation is asked
   before generation starts, as for New Puzzle.
4. **Generate.** The run uses exactly the chosen tier and seed and bypasses the background
   pre-generation cache: it neither takes a cached puzzle nor stores its result there. The
   status line reads "Generating from seed *S*…". The normal busy state applies, with the
   progress line and **Cancel** of fspec-003 §5.2–5.3 for Diabolical and Nightmare.
5. **Deliver** (§7.3). The puzzle arrives as a new puzzle does: empty board, hints at the
   tier's limit, coach session ended, undo cleared, saved game replaced.
6. **Report** in the status line, announced in place of "New puzzle started.":
   "Generated from seed *S*: *Tier* puzzle." Focus returns to Generate.

The outcome of a run, whatever it is, is announced exactly once. Only a run started from
the panel shows its outcome in the status line and returns focus to Generate; a run
started through the API (§6.9) does neither.

Further rules:

- The saved difficulty preference is not changed by a seeded run, except as the
  honest-fallback dialog changes it (§7.3).
- **A generation is already running** (boot, New Puzzle, a difficulty change, or another
  seeded run): the seeded request replaces it, with no confirmation beyond step 3. The
  replaced seeded run, if any, reports "Generation replaced by another request."
- **A later request replaces a running seeded run** (New Puzzle, a difficulty change, a
  loaded puzzle, a replay): same message; the later request proceeds normally.
- **Cancel** during a seeded run restores the prior state exactly (fspec-003 §5.3); the
  status line reads "Generation cancelled."
- **Generator failure:** the busy state ends, the current game stays, and the status line
  shows "The puzzle couldn't be generated." as an error.
- The tier and seed fields keep their content after every outcome.

### 7.3 Budget exhaustion

A seeded run that exhausts its budget behaves exactly as an unseeded foreground run for
that tier does today, and does so identically every time for that tier and seed.

| Requested tier | Behavior |
|---|---|
| Kiddie–Expert | The best puzzle found loads without a prompt, as today. Status: "Generated from seed *S*: *ActualTier* puzzle. No *Tier* puzzle was found within the budget." |
| Diabolical, Nightmare | The honest-fallback dialog of fspec-003 §5.4 opens, with its existing wording, buttons, and outcomes. **Play** loads the puzzle under its true tier and makes that tier the saved preference, as today; the status line then reads as the row above. **Cancel** restores the prior state; the status line reads "No puzzle generated. Your game continues." |

In both cases the delivered puzzle's diagnostics show Fallback used: Yes, attempts at
least the budget (the generator can make one further attempt when no candidate was
solvable), and the chosen seed.

### 7.4 Reproducibility

- Seeded runs with the same tier, seed, and attempt budget (the tier's own unless the API
  overrides it, §6.9) always produce the same puzzle and the same
  diagnostics — every field of §7.1 and fspec-005 §8 — including a run that ends in budget
  exhaustion.
- A puzzle produced by ordinary generation is reproduced by a seeded run with its
  requested tier and its seed: the same puzzle and the same diagnostics in every field
  except "Seed chosen by", which reads "Developer (seeded run)" for every seeded run.
- The promise holds only for an unchanged version of the generator and solver. After
  either changes, a seed may produce a different puzzle; no warning is given.
- The timing and number of progress updates during a run are not part of the promise.

### 7.5 Unsolvable fallback puzzle (all generation, every mode)

This section corrects existing generator behavior and applies whether dev mode is on or
off, to ordinary, background, and seeded runs alike. It amends fspec-003 §5.4.

A run that exhausts its budget normally delivers the best puzzle it found, under that
puzzle's true tier (§7.3). When **no** candidate in the whole run was solvable by the
solver, the puzzle the run delivers cannot be rated. It is then delivered as **Unrated**,
never under the requested tier or the tier of a partial solve.

| Aspect | Behavior |
|---|---|
| The puzzle | Unrated in every respect of fspec-006 §6: the difficulty selector shows "Unrated", Hint shows "–", Coach is disabled, Check is available, and no statistics are recorded |
| Saved difficulty preference | Never becomes Unrated. It stays as it was, so the next New Puzzle generates at the tier the player last chose |
| Kiddie–Expert, foreground | Loads without a prompt, as any fallback does for these tiers. The announcement is "New puzzle started. It could not be rated, so hints and coach are unavailable." |
| Diabolical, Nightmare, foreground | The honest-fallback dialog opens with the title unchanged ("No *Tier* puzzle found") and the body "The generator couldn't find a *Tier* puzzle this time. The best it found can't be rated, so hints and coach are unavailable. Play it?" Buttons: **Play Unrated** (default) / **Cancel**. **Play** loads it as Unrated and leaves the saved preference unchanged. **Cancel** is as today |
| Background pre-generation | The puzzle is discarded: nothing is stored in the cache, and the next request for that tier runs normally |
| Generation diagnostics | Achieved tier "Unrated"; Fallback used "Yes"; attempts and rejection counts as recorded |
| Seeded run, panel | As the rows above for its tier. The §7.3 status reads "Generated from seed *S*: Unrated puzzle. No *Tier* puzzle was found within the budget." |
| Seeded run, API (§6.9) | `tier` is `"unrated"` and `fallback` is `true`. For Diabolical and Nightmare without `acceptFallback`, the `needs-accept-fallback` message reads "No *Tier* puzzle found. The best the generator found can't be rated. Pass acceptFallback: true to play it." |

The case is reproducible like any other seeded outcome (§7.4), and the API's `budget`
option (§6.9) is the practical way to reach it.

---

## 8. Logging and Error Capture

### 8.1 Categories

While dev mode is on, diagnostic messages are written to the browser console. Each
message starts with its category tag.

| Category | Tag | Default | Messages |
|---|---|---|---|
| Generation worker | `[dev:gen]` | On | See below |
| Swallowed exceptions | `[dev:swallowed]` | On | One message for every error the application catches and deliberately ignores, with a name for where it was caught and the error itself. This covers, at least: storage and cookie reads and writes, clipboard writes, the pre-generation cache, the recorder's own storage (§3.4), puzzle checking, and generation requests |
| Action trace | `[dev:action]` | Off | One message per action when it is applied: its kind and data, which parts of the game state it changed (or "no change"), and how long applying it took in milliseconds, including the time spent updating the screen. Consequential changes (§3.1) are shown as part of their action |

Generation worker messages:

| Event | Reported |
|---|---|
| Request | Tier, seed, and kind: foreground, background (pre-generation), or seeded |
| Cache hit | A puzzle request was served from the pre-generation cache: tier, and the seed of the cached puzzle where recorded |
| Cache miss | A puzzle request found no cached puzzle and started a run |
| Progress | Attempts so far, of the budget — as often as the busy state is updated |
| Result | Requested tier, achieved tier, seed, attempts, elapsed time |
| Fallback | The budget ran out: requested tier, delivered tier, seed |
| Cancelled / failed | A run was cancelled or replaced, or the generator failed, with the reason |

A switched-off category writes nothing. Console output the application already produces in
every mode is unchanged.

### 8.2 Switches

The Session recorder tool has three switches: "Log generation worker", "Log swallowed
exceptions", "Log action trace".

- A switch takes effect immediately, for messages from that moment on.
- Each choice is saved per browser and survives reloads and turning dev mode off and on.
  If storage is unavailable, the defaults apply at each page load.
- A state change is announced: "*Category* logging on." / "*Category* logging off."
- Switches affect only the console. They never affect the recorder or error capture.
- The same three settings can be read and set through the API (§6.11), with identical
  effect.

### 8.3 Error capture

While dev mode is on, and whatever the switches are set to, the following are captured as
entries in the history at the point they occur:

| Kind | Captured |
|---|---|
| Uncaught error | Message, stack where available, source location where available |
| Unhandled promise rejection | The rejection reason, with stack where available |
| Exception thrown by a state listener | Message, stack, and the action being applied when it was thrown |

- Each error entry has its time and its place in the order of entries: it follows the
  last action applied before it.
- Capturing an error changes nothing about how the application handles it. An uncaught
  error still reaches the console as the browser reports it; a listener exception is
  still contained so the remaining listeners run.
- Identical errors captured consecutively, with no action between them, are kept as one
  entry with a repeat count, so an error storm cannot push the actions that led to it
  out of the history.
- Swallowed exceptions (§8.1) are logged only; they are not captured into the history.
- The error count in the tool (§3.6) counts entries, not repeats.

---

## 9. Regression Fixtures

A session document saved as a file can be replayed inside the automated test suite by a
test helper. This section states only what a test author can rely on.

### 9.1 What can be asserted

- The helper accepts a session document (object or JSON text) and an optional stop value,
  and applies the rules of §5: the same validation, the same verbatim application of
  actions, the same comparison against the current code.
- It yields:
  - the **final state**, in the same shape as `state()` (§6.2), including `text`;
  - the **report**, in the same shape as the API's `report` (§6.8): counts, divergences,
    not-compared items, errors, notes;
  - `applied` and `total`.
- A document that §5.3 would reject makes the helper fail with that rejection message. An
  action that raises an error stops the replay and is reported as in §5.9, with the state
  reached available for assertion.
- The outcome is deterministic: the same document against the same code gives the same
  final state and report on every run, independent of the clock, of recorded times, and of
  anything in browser storage.
- The helper needs no confirmation, opens no dialog, records no statistics, starts no
  generation, and leaves no saved game or history behind.
- Typical assertions: the final board and pencil marks equal expected values; the report
  has no divergences; or the report has exactly the divergence that a deliberate change
  is expected to cause.

### 9.2 Format-version compatibility

- Every format version ever written by a released build remains readable, by in-app
  replay, by the API, and by the test helper. A fixture never has to be re-exported or
  edited because the format changed.
- An older document is upgraded as it is read. Its recorded actions, data, and computed
  results keep their meaning; the report notes the upgrade (§5.8).
- A document of a version newer than the build reads is rejected (§5.3).
- The promise covers reading and applying the document. It does not promise that a
  fixture's divergence report stays the same across code changes; reporting such changes
  is the purpose of a fixture.

---

## 10. Panel Summary

### 10.1 Tool: Session Recorder

A sixth collapsible section, after Generation diagnostics, collapsed initially.

| Control | Behavior |
|---|---|
| Counts line | §3.6 |
| Storage line | §3.4, §3.5. Empty when the history is being saved normally |
| **Copy session**, history status line, fallback field | §4.2. The history status line is shared by the Copy session and Clear history outcomes |
| "Session document to replay" field, "Stop after action" field, **Replay**, replay status | §5.1–5.4, §5.9 |
| Report area | §5.8. Empty until the first replay |
| **Clear history** | Discards all entries and captured errors (§3.3) and clears the report area and the fallback field. "History cleared." shown in the history status line and announced. Asks first when the history has at least one entry (§10.1.1). The current game is untouched. Also available as `clearHistory()` (§6.10) |
| Three logging switches | §8.2. Each always shows the current setting, including one changed through `setLogging` (§6.11) |

#### 10.1.1 Clear history confirmation

Asked when the history has at least one entry, action or error, at the moment Clear
history is activated. An empty history is cleared without asking.

> **Clear recorded history?** The recorded history (*A* actions, *E* errors) will be
> discarded. Your game is not affected.
> [Cancel] [Clear History]

- Standard confirmation dialog (fspec-001 §9): modal, focus trapped, Cancel focused on
  open, Escape cancels.
- **Clear History** → the history is cleared; the history status line (§4.2) reads
  "History cleared."
- **Cancel/Escape** → declined: the history status line reads "History not cleared.",
  announced. The history, the report area, and the fallback field stay as they are.
- Focus returns to the Clear history button either way.

### 10.2 Generation Diagnostics additions

The Seed and "Seed chosen by" rows with **Copy seed** (§7.1), and the Tier selector, Seed
field, **Generate** button, and status line (§7.2).

### 10.3 Panel wording

The developer panel's existing note and heading are unchanged. References in fspec-005 to
"the five tools" now mean six.

---

## 11. Accessibility

Consistent with fspec-005 §9. All new controls are native elements in the panel's tab
order, show the standard focus ring, and are operable with Enter/Space.

| Element | Requirement |
|---|---|
| Session recorder section | Native disclosure widget, as the other tools |
| Counts line | Plain text, read in order; not a live region (it changes with every action) |
| Storage line | Polite status region; each message announced once when it appears |
| Copy session | Native button, accessible name "Copy session document"; outcome announced; focus stays on the button on success |
| History status line | Polite status region shared by the Copy session and Clear history outcomes (§4.2, §10.1.1); each outcome announced as it is shown |
| Copy fallback field | Read-only multi-line text field labelled "Session document"; focused with content selected when it appears; keys typed in it never reach the board |
| Replay document field | Visible label "Session document to replay"; placeholder text "Paste a session document (JSON)", which is not relied on as the label |
| Stop-after field | Visible label "Stop after action"; the hint "Optional. Leave empty to replay every action." is associated with the field as its description; asks for a numeric keyboard on touch devices but does not filter keystrokes; surrounding whitespace is trimmed, and anything other than decimal digits is rejected at Replay (§5.1, §5.3) |
| Replay | Native button. Outcome (§5.9) announced through the live region; focus stays on the button |
| Replay status line | Polite status region; "Checking session…" and "Comparing with current code…" are not separately announced |
| Replay confirmation | Standard confirmation dialog (fspec-001 §9, §14.4): `role="dialog"`, `aria-modal`, labelled by its title, focus trapped, Cancel focused on open, Escape cancels, focus returns to Replay on close. One dialog whichever of progress and history is at stake; its body text (§5.4) is part of what is read on open |
| Report area | A region labelled "Replay report", focusable so it can be read and its text selected. Divergences and not-compared items are lists. Each expandable divergence is a native disclosure widget. The report is not a live region; the announced outcome carries the counts |
| Clear history | Native button; "History cleared." or "History not cleared." shown in the history status line and announced; focus stays on, or returns to, the button |
| Clear history confirmation | Standard confirmation dialog, as the replay confirmation; labelled by its title "Clear recorded history?"; focus returns to Clear history on close |
| Logging switches | `role="switch"` with `aria-checked` and a visible label each; state change announced (§8.2). `aria-checked` also follows a change made through the API (§6.11) |
| Seed row | Seed is selectable text; Copy seed is a native button with accessible name "Copy seed"; disabled state exposed when no seed is recorded; outcome announced |
| Tier selector | Native select with visible label "Tier" |
| Seed field | Text field with visible label "Seed"; a validation error is associated with the field and announced |
| Generate | Native button with accessible name "Generate from seed"; the outcome of a run is announced exactly once, whether the run was started from the panel or the API; focus returns to it when a panel-started run ends in any way, and never moves for a run started through the API (§6.9) |
| Generate confirmation, honest-fallback dialog | Standard confirmation dialog, as above; focus returns to Generate on close |
| Generate status line | Polite status region |

- Board keyboard shortcuts are ignored while focus is in any of the new text fields
  (fspec-006 §9).
- During a replay no per-action announcement is made (§5.5); exactly one announcement, the
  outcome, follows it.
- An API call that changes the game, clears the history, or changes a logging switch
  announces its outcome (§6.1), so a screen-reader user sharing the session learns that
  something changed under them. `clearHistory()` and `setLogging` use the same wording as
  the button and the switches, and never move focus.
- With dev mode off none of these elements exist (§2).

---

## 12. Edge Cases

| Case | Behavior |
|---|---|
| Replay with stop value 0 | The starting position is shown; "Replayed 0 of *M* actions." |
| Stop value greater than the action count | All actions are applied; no error |
| Document with no actions | Valid; sets the starting position |
| Document exported on a first-ever boot, starting with no puzzle | Valid if the applied actions bring a puzzle; otherwise rejected (§5.3) |
| Replaying the document just exported from this session | Like any other: confirm as §5.4 requires, then the same position again; the history is replaced by an equal one |
| Replay ends inside a coach session | The session is active and shows the recorded step, even if the current code would compute a different one; the report names the divergence |
| Replay ends on a won board | Win state and banner as recorded; no statistics |
| Replayed puzzle is Unrated | Unrated restrictions apply (fspec-006 §6); nothing is compared for that puzzle |
| Recorded tier differs from what the current solver would rate | The recorded tier is used; rating is not a compared result |
| Developer plays on while "Checking session…" | Progress and history are both evaluated when checking finishes, so the confirmation appears and names what is then at stake |
| Replay on a fresh board right after a reload | The history holds the "page reloaded" entry, so it is not empty: the history-only confirmation appears |
| Replay immediately after Clear history, on a board without progress | Nothing to lose: no dialog |
| Replay over a won board with a non-empty history | History-only confirmation |
| An error is captured while a replay or Clear history confirmation is open | Confirming discards the history as it then stands, including the new entry; the counts in the dialog are those at the moment it opened |
| `replay()` with `replace: true` only, over a game with progress and a non-empty history | Fails with `needs-discard-history`; nothing changes |
| `clearHistory()` with no flag on an empty history | Succeeds |
| Replay activated twice in the panel | The second replaces the first: the first's confirmation counts as declined, and the first writes nothing further to the status line or the report (§5.4); only the second reports. If the first has reached step 5, it is not replaced: the second waits for it |
| Panel replay activated while an API replay is in flight | The API replay is never superseded: the panel replay waits for it to finish (§6.8) |
| `replay()` called while any replay is in flight | Fails with `busy`, whether the other replay came from the panel or the API and whatever phase it is in (§6.8) |
| Game replaced by a replay, then dev mode turned off | The game restores normally; statistics resume per fspec-006 §7.1 |
| History at capacity during a long generation | Progress entries displace the oldest entries like any others; the starting position advances |
| Error raised repeatedly by a listener on every action | One error entry per action, each following its action; consecutive identical ones with no action between them collapse (§8.3) |
| Error thrown while dev tooling itself handles an entry | Captured once; capturing never raises a further capture |
| Seeded run with the tier and seed of the puzzle already on the board | Generates it again; a fresh board of the same puzzle |
| Seed entered with a sign, decimal point, exponent, or `0x` prefix | Rejected with the §7.2 message |
| Seeded run requested during the first-ever boot | Replaces the boot generation; the seeded puzzle is the first puzzle |
| Share link opened while a seeded run is in progress | The shared puzzle wins when ready (fspec-006 §5); the seeded run reports "Generation replaced by another request." |
| Seeded puzzle followed by New Puzzle | Normal generation at the generation tier, from the cache when available; unaffected by the earlier seed |
| `setPencilMarks` on a cell with coach-revealed marks | Treated as a hand edit of that cell during the session |
| API called before a puzzle exists | `state()` returns `puzzle: null`; operations needing a puzzle fail with `no-puzzle` |
| Clipboard permission prompt dismissed | Treated as copy failure (§4.2 step 4, §7.1) |
| Storage unavailable | Recording, export, replay, API, seeded generation, and logging all work; the history and switch choices do not survive a reload |
| `clearHistory()` while a report or the copy-fallback field is showing | Both are cleared, as by the button (§6.10) |
| `clearHistory()` called while a replay is applying actions | Fails with `busy`; the replayed history is intact when the replay finishes |
| `setLogging` while the Session recorder section is collapsed | The setting changes and is announced; the switch shows it whenever the section is opened |
| `setLogging("actions", true)` with storage unavailable | Succeeds for this page load; the default (off) applies again after a reload |
| `setLogging` with a category in another letter case, or a truthy non-boolean value | Fails with `invalid-category` / `invalid-value`; no switch changes |
| Action dispatched from the console through `window.gameState` | A well-formed action is recorded like any other and is replayable. A malformed one (unknown kind, or data that does not fit its kind) is not recorded as an action; one error entry notes it, and if it changed the game, later entries may not reproduce the position (§3.1) |

---

## 13. Out of Scope

Per rspec-007 §4:

- Force technique — still deferred (rspec-005 §3).
- A `?seed=` URL parameter, or carrying a seed in share links. Share links stay `?p=` only
  (fspec-006 §3.2).
- Recording anything while dev mode is off.
- Server-side logging or remote diagnostics.
- The external browser-driver script used by agents.

Also not specified here:

- **Possible future enhancement:** supplying a session document from a file (a file
  picker), and saving one to a file, in the panel. For now the panel is paste-only and
  uses the clipboard; files are handled outside the app.
- Stepping through a replay interactively, or animating it. A replay stops only at the
  chosen action count.
- Editing a history or a session document in the app.
- Comparing a puzzle's recorded tier, or a recorded generation run, with the current
  code. Only coach steps and hints are compared (rspec-007 R5).
- The implementation of the test helper (§9) and where fixtures are kept — the Architect's
  domain.

---

## 14. Resolved Decisions

Four questions raised in the first draft of this spec, and two choices the draft had made
on its own, were decided by the Product Director on 2026-11-15. rspec-007 (R1, R5, R7,
and its §3) was updated to match OQ-1 to OQ-4. On 2026-11-15, after the review of mockup
`debug-instrumentation-v1.html`, the Product Director decided D-7, and the Orchestrator
resolved D-8 to D-12, gaps the mockup exposed. The same day the Orchestrator resolved D-13,
consistency fixes found while applying them, and D-14 to D-20, feasibility concerns and
code findings returned by the Architect (aspec-debug-instrumentation §16.1, §16.2), and
D-23 to D-31, gaps found in QE review (tspec-debug-instrumentation §12).

| # | Question | Decision | Specified in |
|---|---|---|---|
| OQ-1 | Are actions the game ignored recorded? | (b) Every issued action is recorded; those that changed nothing are marked as such | §3.1, §5.5, §5.8 |
| OQ-2 | What happens to the history when dev mode is turned off? | (a) It is discarded on `?dev=0` | §3.3 |
| OQ-3 | Does the replay report cover errors as well as divergences? | (b) Yes, as a separate part of the report that never counts as a divergence | §5.6, §5.8 item 5 |
| OQ-4 | Should the API also offer Clear history and the logging switches? | (b) Yes: `clearHistory()`, `logging()`, and `setLogging()` | §6.10, §6.11 |
| D-5 | Do Replay and Clear history ask before discarding the recorded history? (The draft did not ask.) | Yes, whenever the history has at least one entry; an empty history is discarded without asking. Replay asks once, in one dialog covering progress and history. The API uses `discardHistory: true` | §3.3, §5.4, §6.8, §6.10, §10.1.1 |
| D-6 | Is paste the only way to supply a session document in the panel? | Accepted for now; a file picker and save-to-file are a possible future enhancement | §5.1, §13 |
| D-7 | "Generated a *Tier* puzzle from seed *S*." reads "a Easy" / "a Expert". How should it read? (Product Director) | "Generated from seed *S*: *Tier* puzzle." The budget-exhaustion status follows the same form: "Generated from seed *S*: *ActualTier* puzzle. No *Tier* puzzle was found within the budget." | §6.9, §7.2, §7.3 |
| D-8 | Where are "History cleared." and "History not cleared." shown? (Orchestrator) | In the same status line as the Copy session outcome: one shared history status line in the Session recorder's history group | §4.2, §6.10, §10.1, §10.1.1, §11 |
| D-9 | What formats does the replay report use for divergence times, error items, and the not-compared part? (Orchestrator) | Time is the action's local time of day, `HH:MM:SS.mmm` (24-hour). Error items read "Recorded — *kind* after action *n*: *message*" or "Raised during this replay — *kind* after action *n*: *message*", with " (×*count*)" when repeated. The not-compared part has the sub-heading "Not compared" | §5.8 |
| D-10 | Which messages besides rejections are styled as errors? (Orchestrator) | Also "Replay stopped at action…", the Copy session failure, and the Copy seed failure | §4.2, §5.9, §7.1 |
| D-11 | When is the previous replay report cleared? (Orchestrator) | When a replay proceeds past confirmation (§5.2 step 5), so no stale report sits beside "Comparing with current code…"; also on a rejection and on Clear history. A declined replay leaves it in place | §5.2, §5.3, §5.4, §5.8 |
| D-12 | How is the stop-after field explained? (Orchestrator) | Its label stays "Stop after action"; the hint "Optional. Leave empty to replay every action." is associated with it as its description | §5.1, §11 |
| D-13 | Consistency fixes (Orchestrator) | Every divergence line carries "at *time*". The copy-fallback field is removed when a replay replaces the game, not on a rejected or declined replay. Progress is cited as fspec-006 §1 and the replace-confirmation rule as fspec-006 §4.3. The report's error counts count entries, not repeats. `replay` is the only API call that writes a panel status line and fills the report; `clearHistory` only clears the report area and fallback field | §4.2, §5.2, §5.3, §5.4, §5.8, §6.1, §7.2 |
| D-14 | FC-2: after budget exhaustion the generator can make one further attempt when no candidate was solvable. (Architect feasibility (Orchestrator)) | The diagnostics show attempts at least the budget, not equal to it | §7.3 |
| D-15 | FC-3: a recorded solution that is not the puzzle's solution has no fspec-006 message. (Architect feasibility (Orchestrator)) | Detail "The recorded solution is not the puzzle's solution.", this spec's own wording; other puzzle failures keep the fspec-006 §4.2 messages | §5.3 |
| D-16 | FC-4: "Seed chosen by" differs between a random run and its seeded reproduction. (Architect feasibility (Orchestrator)) | The reproducibility promise compares seeded runs. An ordinary puzzle's seeded reproduction matches in every field except "Seed chosen by", which reads "Developer (seeded run)" for every seeded run | §7.1, §7.4 |
| D-17 | FC-5: what does an API replay do when a panel replay starts? (Architect feasibility (Orchestrator)) | An API replay is never superseded; a panel replay waits for it. An API replay returns `busy` whenever any replay is in flight, in any phase | §6.8, §12 |
| D-18 | FC-6 and FC-7: saving completes asynchronously, and loss of ownership is detected late. (Architect feasibility (Orchestrator)) | A tab closed or crashed within moments of an action may lose its last few entries. A tab that lost ownership learns of it, and shows its message, at its next entry | §3.4, §3.5 |
| D-19 | Malformed console actions cannot be recorded replayably. (Architect feasibility (Orchestrator)) | Not recorded as an action; one error entry notes it; later entries may not reproduce the position if it changed the game. "Replayable" holds for well-formed actions | §3.1, §12 |
| D-20 | Actions the application issues in immediate response to another action. (Architect feasibility (Orchestrator)) | They are follow-up actions and belong to the triggering action's entry; a difficulty change is one entry | §1, §3.1 |
| D-21 | A seed cannot practically exercise budget exhaustion with a tier's real budget. (Product Director, on the Architect's feasibility concern FC-1) | `generate()` accepts an optional `budget` that replaces the tier's attempt budget for that run; API only. Reproducibility is per tier, seed, and budget | §6.9, §7.4 |
| D-22 | When a run exhausts its budget and no candidate was solvable, the delivered puzzle was labelled with a tier the solver could not support. (Product Director, on an Architect finding) | It is Unrated, in every mode; the saved preference never becomes Unrated; such a puzzle is never cached. Amends fspec-003 §5.4 | §7.5 |
| D-13a | Gaps found while writing the vspec (Orchestrator) | The replay document field has the placeholder "Paste a session document (JSON)". The two JSON blocks of an expanded divergence are named "Recorded values" and "Current values" | §5.8, §11 |
| D-23 | G15: how are counts of 1 worded? (QE review (Orchestrator)) | Singular noun for a count of 1, plural otherwise including 0; one general rule | §1 |
| D-24 | G14: summary when the actions contain computed results but none could be compared. (QE review (Orchestrator)) | Report: "No computed results could be compared."; outcome: "Session replayed: *N* of *M* actions. No computed results could be compared." "No computed results to compare" stays for actions that contain none | §5.8, §5.9 |
| D-25 | G16: rejection details for structural failures. (QE review (Orchestrator)) | Unknown kind: "it is not a recognised action"; bad data: "its data is incomplete or invalid"; JSON lacking a session document's required parts: "The JSON is not a session document."; a missing or non-numeric version is shown as "unknown" | §5.3 |
| D-26 | G18: does a superseded replay write to the status line? (QE review (Orchestrator)) | No: a replaced replay writes nothing further to the status line or report; only the latest replay reports | §5.4, §12 |
| D-27 | G11: `setPencilMarks` and `fillPencilMarks` messages. (QE review (Orchestrator)) | "Pencil marks set in *cell*." / "Pencil marks filled in *n* cells.", returned as `message` and announced; a call that changes nothing returns the message and is not announced | §6.1, §6.7 |
| D-28 | G12, G13: generate announcements and focus per caller. (QE review (Orchestrator)) | The outcome is announced exactly once, from the panel or the API. Only a panel-started run shows it in the status line and returns focus to Generate; an API call never moves focus | §6.1, §6.9, §7.2, §11 |
| D-29 | G9: stop-after input handling. (QE review (Orchestrator)) | Whitespace trimmed; empty means all actions; anything other than decimal digits is rejected with the stop-value message. Numeric keyboard on touch devices; keystrokes are not filtered | §5.1, §5.3, §11 |
| D-30 | G8: what does the API's `diagnostics` contain? (QE review (Orchestrator)) | The Generation diagnostics information, listed field by field | §6.9 |
| D-31 | G10: is the action that stops a replay compared? (QE review (Orchestrator)) | No; comparison covers the actions applied before it | §5.8, §5.9 |
| D-32 | Edge rules left open at QE review (Architect, confirmed by the Orchestrator) | Storage-line precedence: ownership lost, unavailable, failing save, discarded notice. Pencil-mark lists are written ascending and unique and read in any order. A document whose top-level parts are missing or of the wrong type is "not a session document". Follow-ups of an unrecordable console action are not recorded. A replay stopped at 0 on a start with a generation in progress records its cancelling entry at the document's export time | §3.4, §4.1, §5.3, aspec §16.5 |
| D-33 | Report wording found during implementation (Orchestrator, 2026-11-16) | Verbs agree with a count of 1 ("the 1 computed result matches", "1 of *k* computed results differs"). The report summary never carries the not-compared count. A rejection detail that already ends in a full stop is not given a second one | §5.3, §5.8, §5.9 |
| D-34 | API details settled during implementation (Orchestrator, 2026-11-16) | Read operations also return `ok: true`. `load` with a non-string argument fails with `invalid-argument`, "The puzzle must be given as a string." A replay rejected through the API is announced and shown in the panel's replay status line, as a panel replay is; other API failures are not announced. While a replay is running, every operation that changes the game or the history fails with `busy` before any other check. The flags `replace`, `discardHistory` and `acceptFallback` count only when exactly `true`. `fillPencilMarks` reports the number of cells whose marks differ after the call from before it, including marks reverted by ending a coach session | §6.1, §6.3, §6.7, §6.8 |
| D-35 | Spec inconsistencies found at review (Orchestrator, 2026-11-16) | (a) Every outcome of a generation run that actually started is announced once, for the panel and the API alike, including `needs-accept-fallback`, cancelled and failed; this is the exception to "API failures are not announced" (D-28 governs D-34). (b) "A failed call leaves the history untouched" does not cover a generation that started: its generation-started and progress entries are recorded as §3.1 requires. (c) An API replay that fails for a missing intent flag shows the declined sentence in the replay status line, unannounced. (d) A storage-line message already in force when the panel is first shown is announced once at that point. (e) Every control in the developer panel leaves the board selection alone, so operating the panel never records a deselect; "Replay immediately after Clear history: no dialog" therefore holds whatever panel controls are used in between. (f) Counts of 1,000 or more are written with a thousands separator wherever a count is shown: the counts line, dialog bodies, status lines, announcements and API messages. Action positions ("Action 1234 —", "after action 1234", and the *n* of "Replay stopped at action *n* of *M*") are not counts and stay plain (Orchestrator, 2026-11-26) | §3.4, §5.4, §6.1, §6.8, §6.9, §11, §12 |
| D-36 | Does "API calls never move keyboard focus" forbid the win banner's focus move after an API replay that ends on a won board? (Product Director, 2026-11-16, on review blocker B1) | No. The rule protects whoever is using the keyboard: an API call never takes focus away from the element that has it. When no element has focus, a focus move the application normally makes for the resulting state stands; a replay that ends on a won board leaves focus on New Puzzle, as a win does | §6.1, §11 |

---

## 15. Traceability

| Requirement | Addressed in |
|---|---|
| R1 — record every issued action, including ignored ones, in order, timed; fixed capacity; survives reloads; discarded when dev mode is turned off | §3.1, §3.2, §3.3, §3.4 |
| R2 — always replayable from the beginning; starting position kept | §3.2, §3.3 |
| R3 — export as one self-contained, versioned JSON document | §4.1, §4.2, §6.8 |
| R4 — replay verbatim; stop after *N* | §5.2, §5.5, §5.6 |
| R5 — divergence report, with the separate errors part | §5.8, §5.9 |
| R6 — no statistics; confirm over progress (and, in the same dialog, over a non-empty history); reject malformed or unsupported | §2, §5.3, §5.4, §5.5 |
| R7 — `window.sudokuDev` operations, including clear history and the logging switches | §6.2–§6.11 |
| R8 — same rules as the panel; stated intent (`replace`, `acceptFallback`, `discardHistory`); failures leave the game untouched; absent when off | §2, §6.1, §6.8, §6.10 |
| R9 — seed shown and copyable | §7.1 |
| R10 — generate from tier and seed; reproducible including fallback; bypasses the cache | §7.2, §7.3, §7.4 |
| R11 — three logging categories, switchable, persistent | §8.1, §8.2, §6.11 |
| R12 — error capture independent of the switches | §8.3, §3.2 |
| R13 — replay in the test suite; fixtures stay loadable | §9.1, §9.2 |
| R14 — panel additions, including the Clear history confirmation | §10, with §3.6, §4.2, §5.1, §7.1, §7.2, §8.2 |
| R15 — off means absent; accessible; under 1 second; branch coverage | §2, §5.2, §11. Branch coverage is a build standard with no user-facing behavior; it is carried to the Architect and QE Strategist unchanged |
| R16 — an unsolvable fallback puzzle is Unrated, in every mode | §7.5 |
