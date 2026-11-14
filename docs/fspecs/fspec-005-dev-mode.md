# Functional Spec: Developer Mode
**ID:** fspec-005-dev-mode
**Status:** Final
**Date:** 2026-11-13
**Author:** Uber Developer (Functional Designer stage)
**Based on:** rspec-005-dev-mode; companion to fspec-006-puzzle-sharing

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Activation](#2-activation)
3. [Effects on Normal Play](#3-effects-on-normal-play)
4. [Tool: Load Puzzle from String](#4-tool-load-puzzle-from-string)
5. [Tool: Solver Step Inspector](#5-tool-solver-step-inspector)
6. [Tool: Candidate Overlay](#6-tool-candidate-overlay)
7. [Tool: Coach Step Data](#7-tool-coach-step-data)
8. [Tool: Generation Diagnostics](#8-tool-generation-diagnostics)
9. [Accessibility](#9-accessibility)
10. [Edge Cases](#10-edge-cases)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Scope and Conventions

Extends `fspec-001-v1.md`. The audience is the developer and future agents; clarity and
correctness outrank polish.

**Terminology:**
- *Dev mode* — the on/off setting of §2.
- *Developer panel* — the region holding the five tools: to the right of the game area
  when the window is wide enough for both, below it otherwise.
- *Current board* — givens plus the player's pen digits. Pencil marks are not part of it.
- *Cell reference* — `r<row>c<col>`, both 1-based (`r1c1` is top-left).

---

## 2. Activation

| URL on load | Result |
|---|---|
| `?dev=1` | Dev mode on; setting saved |
| `?dev=0` | Dev mode off; saved setting cleared |
| No `dev` parameter, or any other value | Saved setting applies; off when none is saved |

- The setting is read once at page load. Changing it requires loading the app with the
  parameter.
- The `dev` parameter is left in the address bar.
- If storage is unavailable, `?dev=1` still applies for that page load.

**When off:** no developer UI exists in the page — nothing visible, nothing focusable,
nothing exposed to assistive technology — and the developer tooling is not downloaded.

**When on:**
- A small **DEV** badge is fixed to the bottom-left corner of the viewport at all times.
  It is a link that moves focus to the developer panel.
- The developer panel appears to the right of the game area when the window is wide
  enough for both side by side, and below it otherwise (in either hand mode), with the heading "Developer tools" and
  the note "Statistics are not recorded while developer mode is on. Load the app with
  ?dev=0 to turn it off."
- Each tool is a collapsible section, collapsed initially, operable with the keyboard.

---

## 3. Effects on Normal Play

- While dev mode is on, no puzzle — generated, shared, or loaded from a string — records
  an attempt or a win (see also fspec-006 §7.1 for the resume rule).
- Nothing else about play changes. All game actions keep their existing behavior and
  timing.
- With dev mode off, behavior and performance are identical to an app without this
  feature.

---

## 4. Tool: Load Puzzle from String

A labelled multi-line text field, a **Load** button, and a status line.

1. The developer types or pastes a puzzle string (format: fspec-006 §3.1) and activates
   Load.
2. The status line shows "Checking puzzle…".
3. The loading procedure of fspec-006 §4 runs with the same validation, rating, Unrated
   handling, and replace confirmation (titled "Load this puzzle?").
4. The status line shows the outcome message (fspec-006 §4.4), styled as an error for a
   rejection, and the message is announced. The global notice is not used.
5. The text field keeps its content after every outcome.

A rejection leaves the current game untouched. An empty field is a wrong-length rejection
("…this one has 0.").

---

## 5. Tool: Solver Step Inspector

Controls: **Run solver**, **Clear**, **Restore board**, a summary line, a board-status
line, and an ordered list of steps.

### 5.1 Running

1. The developer activates Run solver.
2. The logical solver runs against a copy of the current board with freshly computed
   candidates, from the lowest-ranked technique upward, until the board is full or no
   technique applies.
3. Each step is listed in order:
   - placement: "*Technique* — place *d* at *cell*"
   - elimination: "*Technique* — eliminate *d* from *cells*", with one clause per digit,
     separated by "; "
4. The summary line reads one of:
   - "Solved in *N* steps. Hardest rank *R* (*Tier*)." — the highest technique rank used and
     the tier it maps to
   - "Stalled after *N* steps with *M* cells unsolved." (also when *N* is 0)
   - "The board is already full."
5. The summary is announced.

Running the solver changes nothing in the game. The inspector never changes pencil marks,
hints, or statistics; it moves the board cursor when a step is selected (§5.2) and changes
the board only when the developer sets it to a step (§5.4).

### 5.2 Selecting a step

- Clicking a step selects it (and deselects any other). Clicking the selected step leaves
  it selected.
- With focus on a step, Up/Down move focus and selection to the previous/next step, and
  Home/End to the first/last; the list stops at its ends. Selection by key behaves
  exactly like a click. These keys do not also move the board cursor.
- Escape, with focus on a step, clears the selection. Clear (§5.3) also clears it.
- Selecting a step moves the board cursor to the cell the step acts on: the placement
  cell, or for an elimination step the first cell it eliminates from. Keyboard focus stays
  in the list.
- While a step is selected, the cells it involves are highlighted on the grid in three
  roles: the **placement** cell, **elimination** cells, and other **pattern** cells the
  technique reported (pivot, wings, fins, chain nodes, colour groups, rectangle corners,
  ALS members).
- Selection is announced: "Step *n*: *text*. *k* cells highlighted."
- Highlights are additive to normal cell styling and never alter cell content.

### 5.3 Staleness

When the current board changes (any pen digit placed, erased, undone, reset, or a new
puzzle), the list and highlights are cleared and the summary reads "Board changed — run
the solver again." Pencil-mark changes do not clear it, and neither do the inspector's own
board changes (§5.4). **Clear** empties the list, highlights, summary, and board status; it
leaves the board as it is.

### 5.4 Setting the board to a step

- Double-clicking a step, or pressing Enter or Space with focus on it, sets the board to
  the solver's position after that step: the board the solver was run on, plus every
  digit placed by steps 1 to *n*. Elimination steps place nothing. The step is also
  selected.
- This works in both directions: choosing an earlier step removes the digits of the later
  ones.
- The board status reads "Board set to step *n* of *N*." and is announced. Steps 1 to *n*
  are marked in the list, and step *n* is marked as the board's current position.
- **Restore board** puts back the board the solver was run on and reads "Board restored
  to where the solver started." It is disabled until the board has been set to a step.
- Setting the board is not a move: it cannot be undone with Undo, clears any existing
  undo step, never counts as a win (even at the last step of a full solve), ends an active
  coach session, and leaves pencil marks alone.
- The list stays usable afterwards. A change made by the player makes it stale as in §5.3;
  the board then stays as the player left it.

---

## 6. Tool: Candidate Overlay

A switch labelled "Show computed candidates", off initially, plus a legend.

**On:** every empty cell of the current board shows the candidates computed by basic
row/column/box elimination from the current board, in the 3×3 pencil layout, instead of
the player's pencil marks. Each digit position is one of:

| State | Meaning | Presentation |
|---|---|---|
| Agree | Computed, and the player has marked it | Normal pencil style |
| Missing | Computed, but the player has not marked it | Accent colour, bold, underlined |
| Extra | The player marked it, but it is not computed | Conflict colour, struck through |
| Absent | Neither | Blank |

- A cell where the player has no pencil marks at all shows all computed candidates as
  Agree — an unmarked cell is not a divergence.
- The overlay follows the board live: every pen or pencil change updates it.
- Filled cells are unaffected.
- Coach-revealed marks count as player marks while they are present.

**Off:** the normal pencil-mark display returns. The player's marks are never modified by
the overlay in either direction, and the overlay is never persisted.

---

## 7. Tool: Coach Step Data

- **No coach session:** the body reads "No active coach session."; Copy is disabled.
- **Session active (including during a recap):** the body shows the session's `CoachStep`
  — the exact object handed to the coach renderer — as JSON indented by two spaces. It
  updates whenever the session starts, changes, or ends.
- **Copy JSON** copies the displayed text to the clipboard. Success: status "Copied."
  Failure: status "Couldn't copy — select the text and copy it manually." Both are
  announced. The JSON block is focusable and selectable.

---

## 8. Tool: Generation Diagnostics

Shows data for the current puzzle and updates when the puzzle changes.

| Puzzle | Shown |
|---|---|
| Produced by the generator, with diagnostics | The table below |
| Loaded from a link or string | "This puzzle was loaded, not generated." |
| No origin recorded (saved by an older version) | "No generation data was recorded for this puzzle." |
| None | "No puzzle loaded." |

| Field | Content |
|---|---|
| Requested tier | The tier asked of the generator |
| Achieved tier | The tier of the delivered puzzle |
| Fallback used | Yes / No — whether the attempt budget ran out |
| Attempts | Attempts made, of the budget |
| Rejected — unsolvable by solver | Count |
| Rejected — wrong tier | Count, with a per-tier breakdown |
| Technique profile | Each technique in the puzzle's solve trace with its use count, most-used first (ties alphabetical) |

Diagnostics describe the generation run that produced the puzzle; they survive page
reloads with the saved game.

---

## 9. Accessibility

| Element | Requirement |
|---|---|
| DEV badge | A link with accessible name "Developer mode on — skip to developer tools"; visible focus ring |
| Developer panel | A landmark region labelled by its heading; focus target of the badge |
| Tool sections | Native disclosure widgets: focusable summary, Enter/Space toggles, expanded state exposed |
| Load field | Visible label; status line is a polite status region; outcome also announced |
| Step list | Ordered list of buttons with `aria-pressed` |
| Overlay switch | `role="switch"` with `aria-checked`; state change announced ("Candidate overlay on/off.") |
| Overlay cells | Each empty cell's accessible name becomes "Row *r*, column *c*: candidates *list*" plus ". Missing from your marks: *list*" and ". Extra marks: *list*" when applicable, plus " (selected)" as usual |
| Highlighted cells | Accessible name gains " — solver step: placement / elimination / pattern" |
| Coach JSON | Focusable region labelled "Coach step JSON" |
| Diagnostics | Definition-style table readable in order |

Board keyboard shortcuts are ignored while focus is in the Load field (fspec-006 §9).
All dev controls show the standard focus ring.

---

## 10. Edge Cases

| Case | Behavior |
|---|---|
| Run solver on a board with wrong or conflicting digits | The solver runs on the board as it stands; it will usually stall. No error state |
| Overlay on, then a new puzzle loads | Overlay stays on and shows the new board |
| Step selected, then overlay toggled | Both remain; highlight and overlay combine |
| Coach session starts while the Coach Step section is collapsed | Content is current whenever the section is opened |
| Unrated puzzle | Inspector works (and stalls); overlay works; coach viewer shows no session; diagnostics say loaded |
| Dev mode turned off with `?dev=0` mid-game | Game restores normally; statistics resume per fspec-006 §7.1 |

---

## 11. Out of Scope

Per rspec-005 §3: force technique; server-side logging or remote diagnostics; editing the
board from the inspector. (Stepping the board from the inspector was out of scope in
rspec-005 and was added at the Product Director's request on 2026-11-14; see §5.4.)
