# Functional Spec — Sudoku v1
**Status:** Final
**Date:** 2026-04-18
**Author:** Functional Designer

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Application Structure](#2-application-structure)
3. [Difficulty Selection](#3-difficulty-selection)
4. [Grid and Cell Interaction](#4-grid-and-cell-interaction)
5. [Input Model](#5-input-model)
6. [Pen and Pencil Marks](#6-pen-and-pencil-marks)
7. [Validation](#7-validation)
8. [Hints](#8-hints)
9. [Controls](#9-controls)
10. [Win State](#10-win-state)
11. [Statistics](#11-statistics)
12. [Visual Themes](#12-visual-themes)
13. [Persistence](#13-persistence)
14. [Accessibility](#14-accessibility)
15. [Open Items for the Orchestrator](#15-open-items-for-the-orchestrator)

---

## 1. Scope and Conventions

This spec defines all user-facing behavior for Sudoku v1. It is authoritative for the
Visual Designer (who derives layout and visual language from it) and the Architect (who
derives the implementation plan from it).

**What this spec does not cover:**
- Visual design: colors, typography, spacing, animation specifics
- Technical implementation: data structures, algorithms, storage formats

**Terminology used throughout:**
- *Given* — a pre-filled cell provided by the puzzle; not editable by the player.
- *Pen digit* — a committed answer entered by the player.
- *Pencil mark* — a candidate digit entered by the player, not a committed answer.
- *Player cell* — any non-given cell.
- *Selected cell* — the single cell currently focused for input.
- *Active mode* — either Pen or Pencil, as toggled by the player.
- *In progress* — a puzzle where at least one pen digit has been entered by the player.

---

## 2. Application Structure

The application is a single page. All of the following are visible simultaneously at all
times during play; none are hidden behind navigation or modals except where this spec
explicitly calls for a confirmation dialog:

- The 9×9 puzzle grid
- The custom number pad (digits 1–9, Erase, Pen/Pencil toggle, Hint button with remaining
  count)
- The difficulty selector
- The New Puzzle and Reset controls
- The Check button (Easy and Medium only)
- The statistics display (per-difficulty, always visible)
- The theme selector

The layout must not shift or reflow during play. The number pad is always rendered; the
system keyboard is never invoked.

---

## 3. Difficulty Selection

### 3.1 Available Levels

Five difficulty levels are available, in ascending order of difficulty:

| Level       | Hints | Correctness Checking                                    |
|-------------|-------|---------------------------------------------------------|
| Kiddie      | ∞     | Real-time — incorrect cells flagged as entered          |
| Easy        | 3     | On-demand via Check button                              |
| Medium      | 1     | On-demand via Check button                              |
| Hard        | 0     | On completion only — wrong cells highlighted + message  |
| Death March | 0     | On completion only — message only, no cell highlight    |

### 3.2 Selecting a Difficulty

The difficulty selector reflects the currently active level at all times.

**While no puzzle is in progress:** Changing the difficulty level takes effect immediately
with no confirmation. A new puzzle is not automatically generated; the player must tap
New Puzzle to start one.

**While a puzzle is in progress:** Selecting a different difficulty level triggers an
abandonment warning (§9.1). If the player confirms, the difficulty changes and the
in-progress puzzle is abandoned. If the player cancels, the difficulty selector reverts
to the previous level and the puzzle is unchanged.

---

## 4. Grid and Cell Interaction

### 4.1 Grid Structure

The grid is a standard 9×9 Sudoku grid subdivided into nine 3×3 boxes. Given cells are
visually distinct from player cells (Visual Designer's responsibility). Given cells are
not selectable for input.

### 4.2 Cell Selection

Exactly one player cell may be selected at a time. Selection is indicated visually
(Visual Designer's responsibility).

**Triggers for selection:**
- Tapping or clicking any player cell selects it.
- Arrow key navigation (desktop) moves selection from the currently selected cell to the
  adjacent player cell in the pressed direction. Navigation wraps: pressing right from
  column 9 moves to column 1 of the same row; pressing down from row 9 moves to row 1 of
  the same column. Given cells are skipped — arrow navigation lands on the nearest
  player cell in the direction of travel.

**No cell selected state:** On page load (new puzzle or resumed puzzle), no cell is
selected. A cell becomes selected on first tap/click or first arrow key press.

**Deselection:** Tapping or clicking outside the grid deselects the current cell. There
is no keyboard deselection shortcut.

### 4.3 Cell State Summary

Each player cell is in exactly one of these states at any point:

| State              | Contents                                             |
|--------------------|------------------------------------------------------|
| Empty              | No digit, no pencil marks                            |
| Pen — correct      | One committed pen digit; solution matches            |
| Pen — incorrect    | One committed pen digit; solution does not match     |
| Pen — conflict     | One committed pen digit; conflicts with another cell |
| Pencil             | One or more candidate digits                         |

A cell with a pen digit cannot simultaneously have pencil marks. Pencil marks are not
subject to conflict detection or correctness evaluation.

Note: "Pen — correct" and "Pen — incorrect" are only visually distinguishable when
correctness checking is active for the current difficulty (see §7).

---

## 5. Input Model

### 5.1 Number Pad

A custom on-screen number pad is always visible. It is the primary input device for all
players. The system keyboard is never triggered. The pad contains:

- Digit buttons: 1–9
- Erase button
- Pen/Pencil mode toggle (see §6.1)
- Hint button (see §8)

All pad interactions require a cell to be selected. If no cell is selected when a pad
button is tapped, the tap has no effect.

### 5.2 Desktop Keyboard

On desktop, the following keyboard shortcuts are supported:

| Key                          | Action                                             |
|------------------------------|----------------------------------------------------|
| 1–9                          | Enter digit in selected cell (respects active mode)|
| Arrow keys                   | Navigate between cells (see §4.2)                  |
| Backspace or Delete          | Erase selected cell                                |
| Tab / Shift+Tab              | Move to next/previous focusable element (standard browser tab order) |
| **P**                        | Toggle Pen/Pencil mode                             |
| Enter or Space (on a button) | Activate the focused button                        |

**Rationale for P as the pen/pencil shortcut:** Single-letter, mnemonic (P for Pencil),
unambiguous — no browser or OS conflict for an in-game context, and easy to reach
one-handed.

If no cell is currently selected, digit keys (1–9), Backspace, and Delete have no effect.
Arrow keys when no cell is selected select the first available player cell in reading
order (top-left to bottom-right).

### 5.3 Input Routing

When a digit is entered (via pad or keyboard), the behavior depends on active mode:

- **Pen mode:** The digit is committed to the selected cell as a pen digit (see §6.2).
- **Pencil mode:** The digit is toggled as a pencil mark candidate in the selected cell
  (see §6.3).

---

## 6. Pen and Pencil Marks

### 6.1 Mode Toggle

The Pen/Pencil toggle button shows the currently active mode at all times. Default mode
on page load (new puzzle or resumed puzzle) is **Pen**. The toggle switches between Pen
and Pencil. The active mode persists within a session but is not persisted to the cookie;
on page load the mode always resets to Pen.

### 6.2 Pen Mode Behavior

When the active mode is Pen and a digit is entered in a selected player cell:

1. If the cell contains pencil marks, they are cleared.
2. The entered digit becomes the committed pen digit for that cell.
3. Conflict detection is evaluated immediately for the affected row, column, and box
   (see §7.1).
4. Correctness checking, if real-time (Kiddie), is evaluated immediately (see §7.2).
5. Auto-clear of related pencil marks is applied (see §6.5).
6. Persistence is written (see §13.1).

Entering the same digit that is already in the cell has no effect (the digit is already
committed; the cell state does not change).

Entering a different digit in a cell that already contains a pen digit replaces it.
This follows the same flow as above.

**Given cells are not affected by pen input.** Attempting to enter a digit in a given
cell (if somehow selected) has no effect.

### 6.3 Pencil Mode Behavior

When the active mode is Pencil and a digit is entered in a selected player cell:

1. If the cell contains a pen digit, the entry is ignored. The pen digit is not cleared,
   and no pencil mark is added. (A cell with a committed digit cannot hold pencil marks.)
2. If the cell does not contain a pen digit, the digit is toggled as a pencil candidate:
   - If the digit is not currently a candidate in the cell, it is added.
   - If the digit is already a candidate, it is removed.
3. Persistence is written (see §13.1).

Pencil marks in a cell are not mutually exclusive — a cell may hold any subset of {1–9}
as candidates simultaneously.

### 6.4 Erase Behavior

The Erase button and the Backspace/Delete keys clear the selected cell:

- If the cell contains a pen digit, the pen digit is removed. The cell becomes empty.
  Conflict detection is re-evaluated for the affected row, column, and box.
  Auto-clear state is not reversed (previously auto-cleared pencil marks are not
  restored on erase).
- If the cell contains pencil marks, all pencil marks in that cell are removed.
- If the cell is empty, erase has no effect.
- Given cells are not affected by erase.

### 6.5 Auto-clear of Related Pencil Marks

**Decision:** Auto-clear is enabled by default.

When a pen digit D is committed to a cell (by the player or by a hint), the digit D is
automatically removed as a pencil candidate from all other cells in the same row, column,
and box that currently have D as a pencil mark.

**Reasoning:** Auto-clear is the standard behavior in well-regarded Sudoku apps and
reduces mechanical bookkeeping that adds no cognitive value. Players using pencil marks
are doing so to track logical possibilities; a committed digit eliminates D as a
possibility in related cells by definition. Auto-clearing it is factually correct and
saves effort. A player who wants to manage pencil marks fully manually can simply not
use them.

**Decision confirmed by user.**

---

## 7. Validation

### 7.1 Conflict Detection

Conflict detection is always active for all difficulty levels. It applies to pen digits
only — pencil marks are never flagged for conflicts.

**Definition:** A conflict exists when two cells in the same row, the same column, or the
same 3×3 box both contain the same committed pen digit.

**Trigger:** Conflict detection is re-evaluated every time a pen digit is entered or
erased in any cell.

**Visual feedback:** All cells that are part of an active conflict are flagged
simultaneously. If cell A and cell B conflict with each other, both are flagged. If a
third cell C is then added with the same digit in the same row, all three (A, B, C) are
flagged.

**Resolution:** When the player erases or changes a digit such that no conflict remains
involving a given cell, that cell's conflict flag is cleared immediately.

Conflict detection is structural — it does not consult the puzzle solution. A digit that
happens to be the correct answer can still conflict if duplicated.

### 7.2 Correctness Checking

Correctness checking applies to pen digits only. Behavior differs by difficulty level.

#### 7.2.1 Kiddie — Real-time

Every time a pen digit is entered, it is immediately evaluated against the solution.

- If the digit is correct: no flag. Any prior incorrect flag on that cell is cleared.
- If the digit is incorrect: the cell is flagged immediately.
- When an incorrect cell is erased, the flag is cleared immediately.

#### 7.2.2 Easy and Medium — On-demand

A "Check" button is available on these difficulty levels. It is not available on Hard or
Death March.

**Check button availability:** The Check button is always enabled when the difficulty
is Easy or Medium, regardless of how many cells are filled.

**On Check activation:**
1. All filled player cells are evaluated against the solution.
2. Cells with incorrect pen digits are flagged.
3. Cells with correct pen digits are not flagged (and any prior flag from a previous
   Check is cleared).
4. Empty cells are not evaluated.

**Highlight persistence:** Incorrect-cell highlighting from a Check clears automatically
after a brief interval (3 seconds). The flags do not persist after the interval expires.
The player may tap Check again at any time to re-evaluate.

#### 7.2.3 Hard — On-completion

No correctness checking is available while the puzzle is incomplete. The Check button
is not shown.

When all 81 cells contain committed pen digits (the puzzle is fully filled):

1. The solution is automatically evaluated.
2. **If correct:** Win state (§10) is triggered.
3. **If incorrect:**
   - All cells with incorrect pen digits are flagged.
   - A message is displayed: "Not quite — some cells are incorrect. Keep going!"
   - The player may continue editing. No stat changes occur.
   - Highlighting clears automatically after 3 seconds. The player may continue editing;
     re-evaluation occurs again when the grid is next fully filled.
   - When the player fills all cells again, automatic re-evaluation occurs.

#### 7.2.4 Death March — On-completion

Identical to Hard §7.2.3 with one exception: when the puzzle is fully filled and
incorrect, **no cell highlighting is applied**. Only the message is shown:
"Not quite. Keep going!"

The player receives no indication of which cells are wrong. They must find and fix errors
on their own.

### 7.3 Completion Check

The puzzle completion condition is: all 81 cells contain committed pen digits AND the
solution is correct. This is evaluated automatically:

- On every pen digit entry (Kiddie, to catch the last cell).
- On full-grid fill (Hard, Death March).

When the completion condition is met, the win state (§10) is triggered regardless of
difficulty.

---

## 8. Hints

### 8.1 Hint Button State

The Hint button obeys the following state rules:

| Condition                                           | Button State    |
|-----------------------------------------------------|-----------------|
| No hints remaining (Easy: 0, Medium: 0, Hard: always, Death March: always) | Disabled permanently for this puzzle |
| No cell selected                                    | Enabled (but tap has no effect)      |
| Selected cell is a given                            | Enabled (but tap has no effect)      |
| Selected cell contains a pen digit                  | Disabled        |
| Selected cell contains only pencil marks or is empty | Enabled        |

**Decision on non-empty cell:** The Hint button is **disabled** when the selected cell
already contains a pen digit.

**Reasoning:** A disabled button communicates clearly that the action is unavailable in
the current context. Silent no-ops on tappable buttons are confusing on touch devices
where feedback is expected. Disabling is the more informative choice. When the player
erases the pen digit (making the cell empty), the Hint button re-enables.

### 8.2 Hint Activation Flow

When the player taps the Hint button and the button is enabled and a valid empty (or
pencil-only) player cell is selected:

1. The correct digit for that cell is filled in as a pen digit.
2. All pencil marks in that cell are cleared (the cell now holds a pen digit).
3. Auto-clear of related pencil marks is applied (§6.5) — the hint-filled digit is
   treated identically to a player-entered pen digit for auto-clear purposes.
4. The remaining hint count decrements by 1.
5. If hints remaining is now 0, the Hint button is permanently disabled for this puzzle.
6. Conflict detection is re-evaluated (§7.1).
7. Correctness checking is evaluated if real-time (Kiddie) or if the grid is now fully
   filled (Hard/Death March).
8. Persistence is written (§13.1).

### 8.3 Hint Count Display

The remaining hint count is displayed on or immediately adjacent to the Hint button at
all times:

- Kiddie: displays "∞"
- Easy: displays "3", "2", "1", or "0" (0 shown only briefly before the button
  disables — in practice the button disables immediately after the last hint is consumed)
- Medium: displays "1" or "0" (same note)
- Hard / Death March: displays "0" always (button is always disabled)

When the button is disabled due to exhaustion, the count display may be omitted or
shown as "0" — Visual Designer's call.

---

## 9. Controls

### 9.1 New Puzzle

**While no puzzle is in progress or the current puzzle is complete:** Immediately
generates and displays a new puzzle at the active difficulty level. No confirmation
required. Clears all saved puzzle state. Hint count resets to the level default.

**While a puzzle is in progress:** Displays an abandonment confirmation dialog:

> "Start a new puzzle? Your current progress will be lost."
> [Cancel] [New Puzzle]

- **Cancel:** Dismisses dialog. Puzzle unchanged.
- **New Puzzle:** Abandons current puzzle, generates and displays a new one. Saved state
  is cleared. Hint count resets to the level default.

The dialog must be keyboard accessible (Escape = Cancel, Enter on focused button =
confirm). Focus moves to the dialog on open and returns to the grid on dismiss.

### 9.2 Reset

Resets the current puzzle to its initial state:

1. All player-entered pen digits are removed.
2. All pencil marks are removed.
3. The hint count is restored to the level default.
4. Correctness flags and conflict flags are cleared.
5. The active mode resets to Pen.
6. The games-attempted counter state for this puzzle is preserved (resetting does not
   re-increment the counter on the next entry, nor does it un-increment a counter that
   was already recorded).
7. Persistence is updated.

Reset is available at all times (including after puzzle completion — though the puzzle is
no longer resumable after win, the player may still use Reset to try again for practice).

Reset requires a confirmation dialog:

> "Reset puzzle? Your entries will be cleared."
> [Cancel] [Reset]

- **Cancel:** Dismisses dialog. Puzzle unchanged.
- **Reset:** Proceeds with the reset as described above.

The dialog must be keyboard accessible (Escape = Cancel, Enter on focused button =
confirm). Focus moves to the dialog on open and returns to the grid on dismiss.

### 9.3 Difficulty Selector

See §3.2 for behavior. The selector always reflects the current active difficulty.

When changing difficulty triggers abandonment (§3.2), the confirmation dialog is:

> "Change difficulty? Your current progress will be lost."
> [Cancel] [Change Difficulty]

- **Cancel:** Dismisses dialog. Difficulty reverts to prior level. Puzzle unchanged.
- **Change Difficulty:** Changes active difficulty level. Puzzle state is cleared. No
  new puzzle is generated automatically; the player sees an empty grid / start state for
  the new difficulty until they tap New Puzzle.

### 9.4 Check Button

Available on Easy and Medium only. Not shown on Kiddie, Hard, or Death March.

See §7.2.2 for the full behavior specification.

### 9.5 Pen/Pencil Toggle

Switches the active input mode between Pen and Pencil. The button visually indicates the
current mode at all times (Visual Designer's responsibility). Toggling does not affect
any cell contents.

Keyboard shortcut: **P** (see §5.2).

### 9.6 Erase

Clears the selected cell. See §6.4 for the full behavior specification.

If no cell is selected, Erase has no effect.

---

## 10. Win State

### 10.1 Trigger

Win state is triggered when the completion condition (§7.3) is met.

### 10.2 Win State Behavior

1. A completion animation plays. (Visual Designer proposes options; user selects.)
2. The games-won statistic for the current difficulty level increments.
3. The saved puzzle state is cleared (the puzzle is no longer resumable).
4. Input is disabled — the player cannot modify the completed grid.
5. The New Puzzle and Reset controls remain active. Reset on a completed puzzle reverts
   the grid to givens-only and re-enables input, allowing the player to attempt again
   (stats are not affected by this post-win reset).

### 10.3 Post-Win State

After win, the grid displays the completed solution. The player may:
- Tap New Puzzle to start a fresh puzzle (no confirmation needed — the puzzle is complete,
  not abandoned).
- Tap Reset to return to the givens and re-solve (no stats impact).
- Simply leave the page (no in-progress state to save).

---

## 11. Statistics

### 11.1 Tracked Values

Statistics are tracked and displayed independently for each of the five difficulty levels.

| Statistic       | Definition                                                                 |
|-----------------|----------------------------------------------------------------------------|
| Games attempted | Increments the first time the player enters a pen digit in a new puzzle.   |
| Games won       | Increments when the player correctly completes a puzzle.                   |

**Games attempted — increment rule:** The counter increments exactly once per puzzle
instance. Resuming a saved puzzle does not re-increment. Resetting a puzzle does not
re-increment (the attempt was already recorded). Starting a new puzzle (or changing
difficulty) creates a new puzzle instance; the counter will increment again on first
pen entry into that new puzzle.

**Games won** increments only on correct completion. Abandoning, resetting, or
completing incorrectly (Hard/Death March partial submission) does not affect games won.

### 11.2 Display

The statistics panel is always visible on the page. It shows all five difficulty levels
with their respective attempted and won counts. The active difficulty level is
visually distinguished in the stats panel. (Layout is Visual Designer's responsibility.)

### 11.3 Storage

Statistics are stored in a cookie and persist across sessions and browser restarts. They
are independent of puzzle state and theme storage.

---

## 12. Visual Themes

### 12.1 Available Themes

Four themes are provided as seeds. The Visual Designer may propose additional themes or
refine these. The final theme list is a user decision.

- Minimalist
- Coffee Shop
- School
- Digital Terminal

### 12.2 Theme Selection

A theme selector is always accessible on the page. The selector must be keyboard
navigable. (Exact UI treatment — dropdown, icon picker, etc. — is Visual Designer's
responsibility.)

Selecting a theme applies it immediately with no confirmation. No page reload required.

### 12.3 Theme Persistence

The selected theme is stored in a cookie independently of puzzle state and statistics.
On page load, the stored theme is applied before the page is rendered to the user (no
flash of default theme).

---

## 13. Persistence

### 13.1 What Is Saved

On every state-changing action (pen digit entry, pencil mark toggle, erase, hint use),
the following are written to the puzzle state cookie:

- The puzzle identity / givens
- All committed pen digits (player-entered and hint-filled)
- All pencil marks
- Remaining hint count
- Whether games-attempted has been incremented for this puzzle

Active mode (Pen/Pencil) is not persisted; it always resets to Pen on page load.

### 13.2 Resume Behavior

On page load, if a saved in-progress puzzle exists:

1. The saved puzzle is restored exactly — givens, pen digits, pencil marks, hint count.
2. The active difficulty level is set to match the saved puzzle's difficulty.
3. The difficulty selector reflects this.
4. No cell is selected.
5. Active mode is Pen.
6. Conflict detection is evaluated for the restored state and flags are applied where
   applicable.
7. Correctness flags from a prior Check (Easy/Medium) or completion attempt (Hard) are
   **not** restored — the player starts the session without flags visible. They may tap
   Check again if desired.

**Rationale for not restoring correctness flags:** Correctness flag state is transient
UI feedback, not part of the puzzle's logical state. Restoring it would require storing
additional data and could confuse the player (flags appearing without any action taken).

### 13.3 State Invalidation

Saved puzzle state is cleared in the following cases:

- Player taps New Puzzle and confirms (or no confirmation needed)
- Player changes difficulty and confirms
- Puzzle completion (win state)

After invalidation, page load shows no saved puzzle (the player sees a blank start
state or the last-used difficulty level with no puzzle loaded, ready for New Puzzle).

---

## 14. Accessibility

### 14.1 Keyboard Navigation

All interactive elements are reachable via Tab/Shift+Tab. The standard browser focus
order follows reading order (left-to-right, top-to-bottom). The grid cells participate
in tab order.

Within the grid, arrow keys navigate between cells (§4.2). Tab/Shift+Tab moves focus
out of the grid to the next/previous focusable element in page order.

The number pad buttons (1–9, Erase, Pen/Pencil, Hint), difficulty selector, New Puzzle,
Reset, Check, and theme selector are all focusable and operable via keyboard.

### 14.2 ARIA Roles and Labels

- The grid is a `grid` role with `gridcell` roles for individual cells.
- Given cells are marked `aria-readonly="true"`.
- The selected cell has `aria-selected="true"`.
- Cells with conflict flags carry an appropriate `aria-label` or `aria-describedby`
  indicating the conflict (e.g., "Cell contains 5 — conflict with row").
- Cells with incorrect flags (when correctness checking is active) carry an appropriate
  indicator (e.g., "Cell contains 3 — incorrect").
- The Hint button's accessible label includes the remaining count (e.g., "Hint, 3
  remaining" or "Hint, unlimited").
- The Pen/Pencil toggle's accessible label reflects the current state (e.g., "Switch to
  Pencil mode" when Pen is active, "Switch to Pen mode" when Pencil is active).
- The difficulty selector has an appropriate label.
- Confirmation dialogs use `role="dialog"` with `aria-modal="true"` and a descriptive
  `aria-labelledby`.

### 14.3 Screen Reader Announcements

The following events must produce screen reader announcements via a live region:

| Event                                           | Announcement                                              |
|-------------------------------------------------|-----------------------------------------------------------|
| Pen digit entered                               | "Cell [row, col]: [digit]"                                |
| Pen digit erased                                | "Cell [row, col] cleared"                                 |
| Conflict detected on entry                      | "Conflict: [digit] appears more than once in [row/column/box]" |
| Conflict resolved                               | "Conflict resolved"                                       |
| Incorrect flag applied (Kiddie real-time)       | "Incorrect"                                               |
| Check results (Easy/Medium)                     | "N cells incorrect" or "All filled cells are correct"     |
| Hard/Death March on-fill result (incorrect)     | Announcement matches the visible message                  |
| Hint used                                       | "Hint used: [digit] placed in cell [row, col]. [N] hints remaining" |
| Hints exhausted                                 | "No hints remaining"                                      |
| Puzzle complete (win)                           | "Puzzle complete! Well done."                             |

### 14.4 Focus Management

- On confirmation dialog open: focus moves to the dialog (Cancel button as default).
- On confirmation dialog close: focus returns to the element that triggered it.
- On puzzle completion (win): focus moves to the New Puzzle button.
- On page load with a resumed puzzle: no cell is auto-focused; the player's first Tab
  or arrow key interaction moves focus into the appropriate area.

---

## 15. Resolved Items

All open items have been resolved by the user. No outstanding decisions remain.

| Item                                         | Resolution                                    |
|----------------------------------------------|-----------------------------------------------|
| Auto-clear of related pencil marks           | Enabled (standard behavior)                   |
| Check button highlighting — Easy/Medium      | Brief-interval auto-clear (3 seconds)         |
| Check button highlighting — Hard             | Brief-interval auto-clear (3 seconds)         |
| Reset confirmation dialog                    | Confirmation dialog required                  |
| Games-attempted increment on Reset           | Does not re-increment                         |
| Generation approach dependency               | No fspec sections require revision            |
