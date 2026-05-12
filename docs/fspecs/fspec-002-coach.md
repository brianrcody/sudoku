# Functional Spec: Coach Mode
**ID:** fspec-002-coach
**Status:** Draft
**Date:** 2026-05-03
**Author:** Functional Designer
**Based on:** rspec-002-coach

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Open Question Resolutions](#2-open-question-resolutions)
3. [Coach Button](#3-coach-button)
4. [Triggering the Coach](#4-triggering-the-coach)
5. [Coach Highlights and Cell Selection](#5-coach-highlights-and-cell-selection)
6. [Candidate Auto-Reveal](#6-candidate-auto-reveal)
7. [In-Context Explanation Panel](#7-in-context-explanation-panel)
8. [Explanation Content by Technique](#8-explanation-content-by-technique)
9. [Post-Fill Recap](#9-post-fill-recap)
10. [Coach State Lifecycle](#10-coach-state-lifecycle)
11. [Interaction with Existing Features](#11-interaction-with-existing-features)
12. [Accessibility](#12-accessibility)
13. [Out of Scope](#13-out-of-scope)

---

## 1. Scope and Conventions

This spec defines all user-facing behavior for the Coach Mode feature. It is authoritative
for the Visual Designer (who derives layout and visual language from it) and the Architect
(who derives the implementation plan from it).

Coach Mode extends the v1 game UI specified in `fspec-001-v1.md`. All v1 behaviors —
cell focus model, pencil marks, pen digit entry, hints, controls — remain unchanged unless
this spec explicitly overrides them.

**Terminology added by this spec:**

- *Coach session* — the lifecycle from pressing the Coach button to the recap dismissing.
- *Coached cells* — the set of cells highlighted by the coach after pressing the Coach
  button. The exact set depends on the identified technique (see §8).
- *Active coached cell* — the coached cell the user has focused during a coach session.
- *Coach accent color* — a single color used for all coach-drawn elements. Visual Designer
  selects this color subject to the constraints in §3.3.
- *Auto-revealed candidates* — pencil marks surfaced by the coach when the identified
  technique requires candidate visibility, and the user has none or insufficient candidates
  showing.

---

## 2. Open Question Resolutions

This section documents the six open questions from rspec-002-coach §5 and the resolution
chosen for each.

### 2.1 No Applicable Technique (rspec Q1)

**Resolution:** The Coach button shows an inline status message and takes no other action.

When the Coach button is pressed and no technique is applicable — because the puzzle is
already complete, because the board contains an error, or because the board is in an
inconsistent state (no logical solution reachable from the current position) — the button
does not enter an active coaching state. Instead, a brief status message appears near the
Coach button:

- Puzzle complete: "The puzzle is already solved."
- Board error (a non-conflicting wrong digit detected): "The board has an error. Use
  Check or Erase to fix it before coaching."
- Inconsistent state (solver cannot progress): "The board has a contradiction. Use Erase
  to fix it."

The error case is distinct from the inconsistent case: an error means the player has
entered a digit that contradicts the solution but does not yet create a visible conflict
with another placed digit. The coach detects this before running the solver, so it cannot
be misled by the corrupted board state.

The message appears for 3 seconds then dismisses automatically. No highlights are drawn.
No coach session begins. The Coach button remains enabled (the user can press it again
after correcting the board).

**Rationale:** A silent no-op on the Coach button would be confusing — the user expects
something to happen. A 3-second inline message matches the pattern already established by
the Check button's correctness feedback (fspec-001-v1 §7.2.2) and keeps the interaction
non-intrusive. Separate messages for all three states give the user actionable information.
The error message specifically directs the user to Check (which will locate the wrong
cell) rather than requiring them to find the mistake manually.

### 2.2 Non-Coached Cell Interaction (rspec Q2)

**Resolution:** Coach highlights dismiss. No recalculation.

When coach highlights are active and the user fills a non-coached cell (pen digit entry)
or erases any cell, the coach session ends silently: all highlights, auto-revealed
candidates (if still showing), and any open explanation panel dismiss immediately. The
user may press Coach again to start a new coaching session on the updated board.

When the user merely navigates focus to a non-coached cell (without filling or erasing),
the explanation panel for the previously focused coached cell dismisses (R17), but the
coached-cell highlights remain visible. Only a fill or erase ends the session.

**Rationale:** Fill and erase change the board state, making the coach's prior analysis
stale. Dismissing on fill/erase is the safest behavior — the coach never displays
information that may no longer be accurate. Navigation-only dismissal of the panel (but
not the highlights) is correct per R17: the panel is scoped to a focused coached cell.
Keeping highlights visible during navigation lets the user move away and return to a
coached cell to re-read the explanation.

### 2.3 Auto-Revealed Candidate Persistence (rspec Q3)

**Resolution:** Auto-revealed candidates revert when the coach session ends.

When the coach session ends — whether by the user filling the coached cell (ending with a
recap), filling a non-coached cell (silent dismiss), or any other session-ending event —
the board's pencil mark state reverts to exactly what it was before the coach pressed any
candidates into view.

Exception — manual edits: if the user manually adds or removes pencil marks during the
coach session (by switching to Pencil mode), those manual changes persist normally. Only
the marks that the coach auto-revealed are reverted.

Exception — elimination completion: when an elimination-technique session ends via the
completion-detection path (the user cleared all indicated candidates from their pencil
marks; see §9.1), any remaining auto-revealed pencil marks are **adopted** rather than
reverted. They become the user's marks permanently. The rationale: the user engaged with
the technique and completed the indicated action, so the coach-revealed context is useful
for their ongoing work. For all other session-end reasons the revert behavior is unchanged.

**Rationale:** Auto-revealed candidates are a coaching aid, not a permanent board edit.
Leaving them behind would silently modify the user's pencil mark state without their
consent, which is particularly disruptive if the user has been carefully maintaining their
own candidate sets. Reverting preserves the user's prior work. The two exceptions respect
user agency: anything the user explicitly types is theirs to keep, and a user who
successfully completes an elimination step has implicitly accepted the coach's candidate
context.

### 2.4 Explanation UI Surface (rspec Q4)

**Resolution:** A panel anchored below the grid, appearing only when a coached cell is
focused.

The explanation is displayed in a dedicated panel that appears in a fixed location below
the puzzle grid when the user focuses a coached cell. The panel replaces nothing in the
existing layout — it expands the page (or occupies a reserved space) below the grid.

The panel is dismissed automatically when focus leaves the coached cell (moves to a
non-coached cell, moves to a control element, or deselects entirely). It reappears
immediately when the user re-focuses any coached cell.

The panel is not user-dismissible (no close button). It appears and disappears
automatically in response to focus.

**Rationale:** Placing the panel below the grid ensures it never occludes any grid cells,
satisfying R22 ("must not obstruct the user's view of the grid cells relevant to the
technique"). A below-grid location is stable and predictable — the user learns quickly
where to look. Auto-dismiss on focus-out matches R17 exactly and requires no extra
dismissal gesture from the user, keeping the interaction lightweight.

### 2.5 Recap Form (rspec Q5)

**Resolution:** A brief toast notification appearing below the grid (at the explanation
panel's position) for 2.5 seconds, then auto-dismissing. There is no close button.

The recap's content depends on the technique type and the circumstances of session end;
see §9 for the full variant definitions (normal, error, and elim). In all cases the recap
auto-dismisses after 2.5 seconds, after which the coach session is fully concluded,
highlights are gone, and auto-revealed candidates have been reverted or adopted per §2.3.

For elimination-technique sessions, filling a coached cell with a digit ends the session
silently with no recap. Successful candidate elimination (PENCIL_TOGGLE) triggers the
`elim` recap variant — see §9.1 and §9.2.

**Rationale:** A toast in a familiar location (where the panel just was) is the least
disruptive option — it doesn't interrupt the grid, doesn't require a tap to dismiss, and
reinforces the learning moment briefly without overstaying its welcome. 2.5 seconds is
long enough to read a two-line message at a comfortable pace.

### 2.6 Coach Button States (rspec Q6)

**Resolution:** Three states — idle, coaching, and error-feedback.

| State | Trigger | Visual Treatment |
|---|---|---|
| Idle | No coach session active | Standard enabled appearance |
| Coaching | Coach session active (highlights drawn, user has not yet filled) | Visually distinguished — "active" treatment (Visual Designer's responsibility) |
| Error-feedback | No-applicable-technique message showing | Visually unchanged; message appears adjacent |

There is no permanently disabled state for the Coach button. Coach is always available
regardless of difficulty, hint budget, or selected cell (R2, R3). If a coach session is
already active and the user presses Coach again, the current session resets: highlights
and panels clear, and a fresh coaching analysis runs immediately on the current board state.

**Rationale:** Unlike the Hint button (which is disabled when the budget is zero or when
the selected cell is filled), Coach has no preconditions that would meaningfully be
communicated by disabling. The "press again to restart" behavior handles the case where
the user wants to re-request coaching mid-session without requiring them to manually exit
the session first.

---

## 3. Coach Button

### 3.1 Placement and Availability

The Coach button is added to the number pad control area alongside the Hint button (R1).
It is visible and enabled at all times during a puzzle, at all difficulty levels (R2).
It is not shown before a puzzle is loaded (same rule as the Hint button).

### 3.2 Coach Button States

See §2.6 for the three-state model. The Coaching state persists from the moment the
coach highlights are drawn until:

- The user fills the coached cell (placement technique) and the recap concludes, or
- Elimination completion is detected (all indicated candidates cleared) and the elim recap concludes, or
- The user fills or erases a non-coached cell (silent dismiss), or
- The user presses Coach again (session resets).

### 3.3 Coach Accent Color

The coach uses a single accent color for all elements it draws or auto-reveals. This
includes: coached-cell highlights, related-cell highlights, directional arrows or
connectors, auto-revealed candidate marks, and explanation panel borders and labels.

The accent color must be:
- Visually distinct from all existing theme colors (background, grid lines, given-cell
  color, player-cell color, selection highlight, conflict highlight, hint highlight).
- Distinct and legible across all five v1 themes: Minimalist, High Contrast, Soft Warm,
  Ocean Blue, Forest Green.

Color selection and cross-theme validation are the Visual Designer's responsibility (R27,
R28). The Functional Designer makes no color recommendation.

---

## 4. Triggering the Coach

### 4.1 Normal Flow

When the user presses the Coach button:

1. The app runs the logical solver on the current board state, identifying the lowest-ranked
   technique in the technique ladder that can make progress (R6, R7). The solver is
   pencil-aware: for each empty cell where the user has entered pencil marks, the solver
   intersects its logical candidate set with the user's marks. For empty cells with no
   pencil marks the full logical candidate set is used (the user simply hasn't noted
   anything yet). This means if the user has already applied an elimination technique (e.g.,
   cleared all targeted candidates in pencil), the solver will not return that technique —
   it will advance to the next applicable technique instead.
2. If a technique is found:
   a. All cells relevant to that technique are highlighted simultaneously in the coach
      accent color (R8). The exact set of highlighted cells varies by technique (see §8).
   b. If the technique requires candidate visibility, auto-reveal runs (§6).
   c. The Coach button enters the Coaching state (§2.6).
   d. No cell is auto-selected; the user chooses which coached cell to focus (R10).
3. If no technique is found (puzzle complete or inconsistent state): see §4.2.

### 4.2 No Applicable Technique

When the Coach button is pressed and no technique can be offered:

- If the puzzle is complete: the status message "The puzzle is already solved." appears
  adjacent to the Coach button for 3 seconds, then auto-dismisses.
- If a non-conflicting wrong digit is detected: the status message "The board has an
  error. Use Check or Erase to fix it before coaching." appears for 3 seconds, then
  auto-dismisses. (The coach detects this before running the solver — see §2.1.)
- If the board is inconsistent (no logical progress possible): the status message "The
  board has a contradiction. Use Erase to fix it." appears for 3 seconds, then
  auto-dismisses.

No coach highlights are drawn. No coach session begins. The Coach button does not enter
the Coaching state.

### 4.3 Pressing Coach During an Active Session

If the user presses the Coach button while a coach session is already active:

1. The current session ends immediately: highlights clear, any open explanation panel
   dismisses, auto-revealed candidates revert.
2. A fresh coaching analysis runs on the current board state, and the flow from §4.1
   repeats.

No confirmation is required. This allows the user to re-request coaching if they navigated
away and want a fresh highlight.

---

## 5. Coach Highlights and Cell Selection

### 5.1 Highlighted Cells

All cells that exemplify the identified technique are highlighted simultaneously (R8).
The highlighting does not change when the user navigates between cells; it persists for
the duration of the coach session.

The specific cells highlighted depend on the technique — see §8 for per-technique
definitions.

### 5.2 User Cell Selection

The user selects which coached cell to engage by tapping or clicking it, or by navigating
to it with arrow keys. The coach does not auto-select or auto-focus any cell (R10).

When the user focuses a coached cell, the in-context explanation panel appears (§7).
When focus moves away from a coached cell to any other cell or control, the explanation
panel dismisses. The cell highlights remain.

### 5.3 Freedom to Ignore the Coach

While coach highlights are active, the user may freely:
- Navigate to non-coached cells
- Enter pen digits in non-coached cells
- Erase cells
- Add or remove pencil marks in any cell
- Use the Hint button

None of these are blocked or warned against. The user is never locked into the coaching
flow (R11).

**Fill or erase in a non-coached cell:** ends the coach session silently (§2.2).

**Fill in a coached cell:** triggers the post-fill recap (§9).

---

## 6. Candidate Auto-Reveal

### 6.1 When Auto-Reveal Applies

Auto-reveal runs when the identified technique requires candidate (pencil mark) visibility
to explain (R13). The techniques requiring auto-reveal are those from rank 3 (Locked
Candidates) and above — any technique where the pattern is defined over candidates, not
simply over the placement of digits.

Naked Single and Hidden Single (ranks 1 and 2) do not require candidate auto-reveal:
the explanation is derivable from the placed digits in the row, column, and box.

All other techniques (ranks 3–15) require candidate visibility and trigger auto-reveal if
the relevant candidates are not already showing.

### 6.2 Auto-Reveal Behavior

When auto-reveal runs:

1. The app computes the candidate set for each coached cell based on elimination logic
   (digits not yet placed in the same row, column, or box). This computation uses the
   same pencil-aware logic described in §4.1: where the user has pencil marks, only
   candidates that appear in both the logical set and the user's marks are considered.
2. For each coached cell (and any related cells the explanation refers to), the computed
   candidates are surfaced as visible pencil marks if they are not already showing.
3. Auto-revealed marks are rendered in the coach accent color to distinguish them
   visually from user-entered pencil marks (R14).

User-entered pencil marks in coached cells are not altered. If a user mark and an
auto-revealed mark occupy the same candidate slot in the same cell, the mark is shown in
the coach accent color for the duration of the session (it will be visible as a user mark
again when the session ends).

### 6.3 Scope of Auto-Reveal

Auto-reveal is applied to all cells that the explanation references — not just the
primary coached cells. For example, an X-Wing explanation references the four corner
cells; all four receive auto-revealed candidates as needed.

### 6.4 Persistence

Auto-revealed candidates revert when the coach session ends (§2.3). The board's pencil
mark state returns to exactly what it was before auto-reveal ran, with the exception of
any manual pencil mark changes the user made during the session.

---

## 7. In-Context Explanation Panel

### 7.1 Panel Behavior

The explanation panel appears below the puzzle grid when the user focuses a coached cell
(R16). It dismisses automatically when focus leaves the coached cell (R17). There is no
close button.

Within the panel, the explanation is scoped to the specific coached cell the user has
focused. If the user focuses a different coached cell, the panel updates to reflect that
cell's explanation within the same technique.

### 7.2 Panel Contents

Each explanation panel includes, at minimum (R19):

1. **Technique name** — always displayed, in a visually prominent treatment.
2. **Visual elements on the grid** — highlights of related cells, directional arrows or
   connectors showing logical relationships, candidate annotations. All rendered in the
   coach accent color and scoped to the focused coached cell's explanation (R18).
3. **Supporting text** — minimal (R20). A single phrase or short sentence describing the
   specific logical observation. The text references the current board state (e.g., "4 is
   the only candidate in this cell"), not a general technique tutorial.

For complex techniques (XY-Chain, Forcing Chain (AIC)) where a complete board-spanning
visual is impractical, the panel provides (R21):
1. Technique name.
2. A brief plain-language concept summary (one to two sentences max).
3. Identification of the starting cells for analysis.
4. An explicit acknowledgment of complexity (e.g., "This chain is long — start here and
   follow the forced alternatives.").

### 7.3 Grid Overlays

Coach visual elements drawn on the grid (arrows, connectors, related-cell highlights) are
separate from the cell highlight layer. They appear when the explanation panel is open
(user has focused a coached cell) and disappear when it dismisses.

The grid overlays must not obscure digit labels or pencil mark candidates in cells the
user needs to read. Visual Designer is responsible for ensuring arrows and connectors are
routed to avoid obscuring cell content.

### 7.4 Panel Placement and Non-Obstruction

The panel occupies the space below the grid (§2.4). It does not overlap the grid. Grid
cells relevant to the technique are always fully visible while the panel is open (R22).

---

## 8. Explanation Content by Technique

This section defines, for each technique in the v1 ladder, which cells are highlighted,
what the visual explanation consists of, and the one-line supporting text pattern. Visual
specifics (arrow routing, color application) are the Visual Designer's domain; this
section defines the logical content.

**Terminology used here:**
- *Target cell* — the coached cell where the user will make the move (place a digit or
  eliminate a candidate). For placement techniques, this is where the digit goes.
  For elimination techniques, these are the cells from which candidates are removed.
- *Cause cells* — cells that logically force the placement or elimination.
- *Highlight* refers to the coach accent color applied to cell backgrounds or borders.

**Technique type classification:**

Each technique entry includes a **Technique type** field indicating whether it is a
*placement* technique (the coached move is entering a digit into a target cell) or an
*elimination* technique (the coached move is removing one or more candidates from target
cells). This classification drives the post-fill recap behavior defined in §9.

---

### 8.1 Naked Single (rank 1)

**Technique type:** Placement

**What the coach identifies:** A player cell with exactly one remaining candidate.

**Highlighted cells:** The target cell only.

**Auto-reveal:** Not required. The explanation references the filled digits in peers, not
candidate marks.

**Grid visual:** Arrows or lines from each peer cell containing a digit that eliminates
a candidate, pointing at the target cell. (Nine peers at most, but typically fewer arrows
are needed — only the digits that directly eliminate candidates are shown.)

**Supporting text:** "Only [digit] can go here — all other digits appear in this cell's
row, column, or box."

**User move:** Enter the digit in the target cell.

---

### 8.2 Hidden Single (rank 2)

**Technique type:** Placement

**What the coach identifies:** In a row, column, or box (the *unit*), a specific digit D
has exactly one candidate cell.

**Highlighted cells:** The target cell plus all other cells in the unit that are filled
or already contain D eliminated.

**Auto-reveal:** Not required.

**Grid visual:** The unit (row, column, or box) is outlined or shaded in the coach accent
color. The target cell is distinctly highlighted within the unit.

**Supporting text:** "[Digit] can only go in one place in this [row/column/box]."

**User move:** Enter the digit in the target cell.

---

### 8.3 Locked Candidates (rank 3)

**Technique type:** Elimination

**What the coach identifies:** Candidates for digit D in a box are all confined to one
row or column (pointing variant), or candidates for D in a row/column all fall within
one box (claiming variant). In either case, D can be eliminated from other cells in the
shared unit.

**Highlighted cells:**
- The cells where D is confined (the source cells — these are the ones the user will not
  fill, but they establish the pattern).
- The cells from which D is eliminated (the target cells — may or may not be the coached
  cell depending on technique variant).

Note: For elimination-only techniques like this one, the "coached cell" in the UI sense
is one of the target elimination cells. The user's move is to erase candidate D from
those cells if they are showing it, or simply to understand that D is eliminated there.

**Coached cells for highlight purposes:** The elimination target cells.

**Auto-reveal:** Yes — candidates must be visible for the pattern to be shown.

**Grid visual:** The source cells are highlighted in the coach accent color. An arrow or
bracket points from the source cluster to the elimination target cells. Candidate D is
annotated in the source cells.

**Supporting text (pointing):** "[Digit] in this box is confined to [row/column] —
eliminate it from the rest of that [row/column]."
**Supporting text (claiming):** "[Digit] in this [row/column] only appears within this
box — eliminate it from the rest of the box."

**User move:** Remove candidate D from the target cells (switch to Pencil mode and toggle
D off, or the coach can note the eliminations; the user decides how to record them).

---

### 8.4 Naked Pair (rank 4)

**Technique type:** Elimination

**What the coach identifies:** Two cells in a unit that together hold exactly two
candidates (the same two digits), eliminating those digits from all other cells in the
unit.

**Highlighted cells:** The two naked pair cells (cause cells) plus any target cells
from which digits are eliminated.

**Auto-reveal:** Yes.

**Grid visual:** The two pair cells are connected with a bracket or line in the coach
accent color. Target cells (with their candidates to be eliminated) are marked.

**Supporting text:** "These two cells must contain [digit A] and [digit B] — eliminate
both from the rest of this [row/column/box]."

**User move:** Remove the pair's digits from the target cells.

---

### 8.5 Hidden Pair (rank 5)

**Technique type:** Elimination

**What the coach identifies:** Two digits that appear as candidates only in the same two
cells within a unit, meaning all other candidates in those two cells can be eliminated.

**Highlighted cells:** The two hidden pair cells.

**Auto-reveal:** Yes.

**Grid visual:** The two cells are highlighted. The two "hidden" digits are annotated in
the coach accent color; all other candidates in those cells are crossed out or visually
de-emphasized.

**Supporting text:** "[Digit A] and [digit B] can only go in these two cells in this
[row/column/box] — all other candidates in these cells can be removed."

**User move:** Remove the non-pair candidates from both cells.

---

### 8.6 Naked Triple (rank 6)

**Technique type:** Elimination

**What the coach identifies:** Three cells in a unit sharing exactly three candidates in
total (each cell holds two or three of those three digits), eliminating those digits from
the rest of the unit.

**Highlighted cells:** The three triple cells (cause cells) plus elimination target cells.

**Auto-reveal:** Yes.

**Grid visual:** The three cells are connected by lines or a bracket in the coach accent
color. Candidate annotations show the three shared digits.

**Supporting text:** "These three cells hold only [digit A], [digit B], and [digit C] —
eliminate those candidates from the rest of this [row/column/box]."

**User move:** Remove the triple's digits from the target cells.

---

### 8.7 Hidden Triple (rank 7)

**Technique type:** Elimination

**What the coach identifies:** Three digits confined to the same three cells within a
unit, allowing all other candidates in those three cells to be removed.

**Highlighted cells:** The three hidden triple cells.

**Auto-reveal:** Yes.

**Grid visual:** The three cells are highlighted. The three hidden digits are annotated
in coach accent; other candidates in those cells are visually de-emphasized.

**Supporting text:** "[Digit A], [digit B], and [digit C] can only appear in these three
cells in this [row/column/box] — remove all other candidates from these cells."

**User move:** Remove the non-triple candidates from the three cells.

---

### 8.8 X-Wing (rank 8)

**Technique type:** Elimination

**What the coach identifies:** Digit D confined to the same two columns in exactly two
rows (or same two rows in exactly two columns), forming a rectangle. D can be eliminated
from all other cells in those two columns (or rows).

**Highlighted cells:** The four corner cells of the X-Wing rectangle (cause cells) plus
the elimination target cells.

**Auto-reveal:** Yes.

**Grid visual:** The four corners are highlighted. Lines connect them to show the
rectangle pattern. Elimination targets are marked.

**Supporting text:** "[Digit] only appears in these two columns within these two rows —
it can't appear elsewhere in those columns."

**User move:** Remove candidate D from the target cells.

---

### 8.9 Swordfish (rank 9)

**Technique type:** Elimination

**What the coach identifies:** The 3-row, 3-column generalization of X-Wing. Digit D is
confined to the same three columns across exactly three rows; eliminate D from all other
cells in those three columns.

**Highlighted cells:** The cells forming the Swordfish pattern (up to 9 cells) plus
elimination targets.

**Auto-reveal:** Yes.

**Grid visual:** The pattern cells are highlighted in coach accent. Lines or borders
connect them to show the 3×3 fish structure.

**Supporting text:** "[Digit] across these three rows is locked to these three columns —
eliminate it from the rest of those columns."

**User move:** Remove candidate D from the target cells.

---

### 8.10 Jellyfish (rank 10)

**Technique type:** Elimination

**What the coach identifies:** The 4-row, 4-column generalization. Digit D confined to
the same four columns across exactly four rows.

**Highlighted cells:** The Jellyfish pattern cells (up to 16 cells) plus elimination
targets.

**Auto-reveal:** Yes.

**Grid visual:** Pattern cells highlighted. Lines or borders show the 4×4 fish structure.

**Supporting text:** "[Digit] across these four rows is locked to these four columns —
eliminate it from the rest of those columns."

**User move:** Remove candidate D from the target cells.

---

### 8.11 XY-Wing (rank 11)

**Technique type:** Elimination

**What the coach identifies:** Three bivalue cells — a hinge cell with candidates {X,Y},
a wing with {X,Z}, and a wing with {Y,Z}. Digit Z can be eliminated from any cell that
sees both wings.

**Highlighted cells:** The hinge cell and the two wing cells (cause cells) plus the
elimination target cells.

**Auto-reveal:** Yes.

**Grid visual:** The hinge and wings are highlighted. Lines connect: hinge → wing 1 and
hinge → wing 2. The elimination target(s) are marked with the Z candidate crossed out.

**Supporting text:** "One of these two wings must contain [Z] — cells seeing both wings
can't contain [Z]."

**User move:** Remove candidate Z from the target cells.

---

### 8.12 Simple Coloring (rank 12)

**Technique type:** Elimination

**What the coach identifies:** A bilocation chain — a connected chain of cells that each
hold exactly two candidates for digit D, alternating between two colors (true/false). If
two same-colored cells see each other, that color is impossible.

**Highlighted cells:** All cells in the coloring chain, plus elimination target cells.

**Auto-reveal:** Yes.

**Grid visual:** Chain cells are highlighted in two distinct coach-accent variants (or
patterns) to show the two color groups. Edges connecting chain links are drawn. The
eliminated color group is marked.

**Supporting text:** "These linked cells must alternate between two values for [digit].
Two [color] cells see each other — that group can't be [digit]."

**User move:** Eliminate D from the false-color group cells and/or fill the true-color
cells with D where possible.

---

### 8.13 Multi-Coloring (rank 13)

**Technique type:** Elimination

**What the coach identifies:** Multiple Simple Coloring chains interacting. Two chains
of the same digit interact such that a cell sees one color from each chain, eliminating
cells that see one color from each chain.

**Highlighted cells:** All cells across both chains, plus elimination targets.

**Auto-reveal:** Yes.

**Grid visual:** Two chain sets, each with their two color groups represented by distinct
visual treatments. Connecting lines show inter-chain relationships.

**Supporting text (simplified — complexity acknowledged):** "Two separate chains for
[digit] interact. A cell that sees one color from each chain can't be [digit]."

**User move:** Remove candidate D from the target cells.

---

### 8.14 XY-Chain (rank 14)

**Technique type:** Elimination

**What the coach identifies:** A chain of bivalue cells where each adjacent pair shares
one candidate, and the first and last cells share a candidate that can be eliminated from
cells seeing both endpoints.

**Highlighted cells:** The chain cells (endpoints and interior) plus elimination targets.

**Auto-reveal:** Yes.

**Grid visual:** Chain cells are highlighted. Edges connect sequential cells in the
chain. The shared endpoint digit is annotated at each end.

**Complexity acknowledgment applies:** For long chains, a full visual traversal across
the board may be impractical. The panel shows:
1. Technique name: "XY-Chain"
2. Concept: "A chain of two-candidate cells passes [digit] from one end to the other.
   Cells seeing both ends can't contain [digit]."
3. Starting cells: endpoints are highlighted; the panel indicates "Follow the chain from
   [endpoint A] to [endpoint B]."
4. Acknowledgment: "This is a long chain — the highlights show the endpoints. Trace the
   links yourself to verify."

**User move:** Remove the shared endpoint digit from cells seeing both endpoints.

---

### 8.15 Forcing Chain (AIC) (rank 15)

**Technique type:** Elimination

**What the coach identifies:** An Alternating Inference Chain combining strong and weak
links. The chain forces a logical conclusion about a digit placement or elimination.

**Highlighted cells:** The AIC endpoints and, where the chain is short enough, interior
cells.

**Auto-reveal:** Yes.

**Complexity acknowledgment applies (always, by policy for this technique):**
1. Technique name: "Forcing Chain (AIC)"
2. Concept: "An alternating chain of strong and weak links forces [digit] into (or out
   of) [target cell]."
3. Starting cells: the chain endpoints and the target cell are highlighted.
4. Acknowledgment: "This technique involves a long chain of forced inferences. The
   highlighted cells show where to start and what the conclusion is. Working through the
   full chain is an advanced exercise."

**User move:** Place digit D in the target cell, or remove it from the target cell,
per the chain's conclusion.

---

## 9. Post-Fill Recap

### 9.1 Trigger

When the user fills a coached cell with a pen digit, the recap fires — but the variant
depends on the technique type (§8) and the correctness of the fill.

**Placement techniques (Naked Single, Hidden Single — ranks 1 and 2):**

- Correct fill (digit matches the cell's solution value): the normal recap fires (§9.2,
  normal variant).
- Incorrect fill (digit does not match the solution value): the error-variant recap fires
  (§9.2, error variant). The application already has the solution at fill time (conflict
  detection uses it per §11.4), so no new capability is required.

**Elimination techniques (ranks 3–15) — digit fill:**

If the user fills a coached cell with any digit while an elimination-technique coaching
session is active, the coach session ends silently — no recap of any kind appears. Filling
a digit was not the coached move; the user is playing past the coaching suggestion. The
conflict indicator handles correctness feedback as normal (§11.4). The session ends as if
a non-coached cell had been filled (§2.2). Auto-revealed candidates revert (standard path
per §2.3).

**Elimination techniques (ranks 3–15) — completion detection:**

During an active elimination-technique session, every `PENCIL_TOGGLE` action triggers a
completion check. The completion condition is: all digits in `step.digits` have been
cleared from all `step.roles.elimTarget` cells in the user's current pencil state.

When the completion condition is met:

1. The session transitions to the `elim` recap (§9.2, elim variant).
2. The recap auto-dismisses after 2.5 seconds.
3. On dismissal, auto-revealed pencil marks are adopted (not reverted) per the elimination
   completion exception in §2.3. All coach highlights clear and the button returns to Idle.

The completion check fires only on PENCIL_TOGGLE events, not on pen digit entry. If the
user clears the indicated candidates across multiple `PENCIL_TOGGLE` actions the check
passes on the action that removes the last indicated candidate.

### 9.2 Content

**Normal variant (placement technique, correct fill):**

The recap contains (§2.5):

1. **Confirmation line:** "You used [Technique Name]."
2. **Move description:** One sentence describing the logical move, referencing the
   specific cell and digit. Examples:
   - "Naked Single in row 3, column 7: only 4 could go here."
   - "Hidden Single in the top-left box: 7 was the only position for that digit."

**Error variant (placement technique, incorrect fill):**

The recap contains:

1. A single error-acknowledgment line: "That's not the right digit — the [Technique Name]
   suggestion still stands. Press Coach to try again."

The error variant uses the same placement (below the grid), the same auto-dismiss duration
(2.5 seconds), and the same no-close-button behavior as the normal variant.

**Elim variant (elimination technique, completion detection):**

The recap contains:

1. **Completion line:** "Candidates eliminated."
2. **Detail line:** One sentence describing the specific elimination, referencing the
   technique, unit, digit, and cell count. Examples:
   - "Locked Candidates in row 4: digit 7 removed from 2 cells."
   - "Naked Pair in the top-right box: digits 3 and 8 removed from 3 cells."
   - "X-Wing on digit 5: removed from 4 cells across columns 2 and 6."

The elim variant uses the same placement (below the grid), the same auto-dismiss duration
(2.5 seconds), and the same no-close-button behavior as the other variants.

### 9.3 Placement and Dismissal

The recap appears in the same location as the explanation panel (below the grid). It
auto-dismisses after 2.5 seconds. There is no manual close action. During the recap
duration, no coach highlights are shown (the session has ended). The user may interact
with the grid normally during the recap.

### 9.4 Post-Recap State

After the recap dismisses:
- The coach session is fully concluded.
- The Coach button returns to the Idle state.
- Auto-revealed candidates have been reverted or adopted per §2.3 (reverted for normal/error
  variants; adopted for the elim variant).
- All coach highlights are gone.
- The user may press Coach again for a fresh coaching session.

---

## 10. Coach State Lifecycle

The following table summarizes all coach session state transitions:

| Current State | Event | Next State | Side Effects |
|---|---|---|---|
| Idle | Coach button pressed; technique found | Coaching | Highlights drawn; auto-reveal if needed |
| Idle | Coach button pressed; no technique | Idle | 3-second error message shown |
| Coaching | User focuses coached cell | Coaching | Explanation panel opens |
| Coaching | User focuses non-coached cell or control | Coaching | Explanation panel closes; highlights remain |
| Coaching | User fills coached cell (placement technique, correct digit) | Recap | Panel closes; normal recap opens; highlights clear |
| Coaching | User fills coached cell (placement technique, incorrect digit) | Recap | Panel closes; error-variant recap opens; highlights clear |
| Coaching | User fills coached cell (elimination technique, any digit) | Idle | Panel closes; session ends silently; auto-revealed candidates revert; no recap |
| Coaching | PENCIL_TOGGLE; completion condition met (all `step.digits` cleared from all `step.roles.elimTarget` cells) | Recap (elim) | Panel closes; elim recap opens; highlights clear |
| Coaching | Hint fills coached cell | Idle | All highlights clear; panel closes; auto-revealed candidates revert; no recap |
| Coaching | User fills or erases non-coached cell | Idle | All highlights clear; panel closes; auto-revealed candidates revert |
| Coaching | Coach button pressed again | Coaching | Fresh analysis; previous session state fully reset before new highlights drawn |
| Recap (normal/error) | 2.5 seconds elapsed | Idle | Recap dismisses; auto-revealed candidates revert |
| Recap (elim) | 2.5 seconds elapsed | Idle | Recap dismisses; auto-revealed candidates adopted (§2.3) |
| Recap | User fills a cell during recap | Recap | Normal cell entry; recap continues its countdown |

---

## 11. Interaction with Existing Features

### 11.1 Hint Button

The Hint button and its existing behavior are unchanged (R4). Coach and Hint are
independent. Using a Hint while coach highlights are active:

- The hint fills a cell and decrements the hint count as normal.
- If the hinted cell was a coached cell: the coach session ends silently — no recap
  appears. This is identical to the behavior when Hint fills a non-coached cell (§2.2).
- If the hinted cell was a non-coached cell: the coach session ends silently (§2.2).

**Rationale:** The post-fill recap (§9) exists to reinforce learning after the *user*
applies the coached technique. R23 is explicit: "after the user fills the coached cell."
When Hint fills that cell, the user did not apply anything — the recap's confirmation
line ("You used [Technique Name]") would be false. No learning moment occurred, so no
recap is warranted. The behavior is uniform: any Hint fill ends the coach session silently,
regardless of whether the hinted cell was coached.

### 11.2 New Puzzle / Reset / Difficulty Change

If a coach session is active when the user confirms New Puzzle, Reset, or Difficulty
Change: the coach session ends immediately (no recap, no error message). All coach state
is discarded. Auto-revealed candidates are irrelevant (the board is cleared or replaced).

### 11.3 Win State

If filling the coached cell completes the puzzle (win condition met), the win state takes
precedence (fspec-001-v1 §10). The recap does not appear. The win animation and
statistics update proceed normally. The coach session is considered concluded.

### 11.4 Conflict Detection and Correctness Checking

Filling a coached cell (pen digit entry) triggers conflict detection and correctness
checking exactly as a normal pen entry does (fspec-001-v1 §6.2 steps 3–4). Coach does
not bypass or suppress these behaviors.

### 11.5 Auto-Clear of Pencil Marks

Filling a coached cell triggers auto-clear of related pencil marks (fspec-001-v1 §6.5)
as normal. The auto-clear applies to user-entered pencil marks and auto-revealed marks
alike (both are visible candidate marks from the grid's perspective at the moment of
fill).

### 11.6 Coach Does Not Auto-Fill

The coach never fills a cell on behalf of the user (out of scope per rspec §4).

### 11.7 Persistence

Coach session state (which cells are highlighted, whether auto-reveal is active) is
session-only and is not persisted. If the user reloads the page during a coach session,
the session is lost. The underlying board state (pen digits, user pencil marks, hint
count) is persisted normally per fspec-001-v1 §13.

---

## 12. Accessibility

### 12.1 Approach

Coach has best-effort accessibility support (R29). The coaching experience is inherently
visual; full non-visual parity is not required but is pursued where practical (R30).

### 12.2 Coach Button

- The Coach button has an accessible label of "Coach".
- In the Coaching state, the button's label updates to "Coach (active)" to communicate
  to screen reader users that a coaching session is in progress.
- When the no-applicable-technique message is showing, the message is announced via the
  live region (§12.5) simultaneously with its visual appearance.

### 12.3 Coached Cell Highlights

- Coached cells carry `aria-describedby` pointing to a hidden element containing the
  text "Coached cell — focus for explanation."
- When the user focuses a coached cell, the live region announces: "Coached cell.
  [Technique Name]. [Supporting text from the explanation panel]."
- This gives screen reader users the same one-line logical insight as the visual
  explanation panel.

### 12.4 Explanation Panel

- The panel element has `role="region"` with `aria-label="Coach explanation"`.
- The panel content (technique name + supporting text) is readable by screen readers
  when the panel is open.
- The panel is not a modal — it does not trap focus. Screen reader users may navigate
  the grid normally while the panel is logically "open."

### 12.5 Live Region Announcements

Coach events are announced via the existing screen reader live region (fspec-001-v1
§14.3):

| Event | Announcement |
|---|---|
| Coach highlights drawn | "Coach: [Technique Name] identified. [N] cell(s) highlighted." |
| No applicable technique — complete | "Coach: The puzzle is already solved." |
| No applicable technique — error | "Coach: The board has an error. Use Check or Erase to fix it before coaching." |
| No applicable technique — inconsistent | "Coach: The board has a contradiction. Use Erase to fix it." |
| User focuses coached cell | "Coached cell. [Technique Name]. [Supporting text]." |
| Post-fill recap (normal variant) | "You used [Technique Name]. [Move description]." |
| Post-fill recap (elim variant) | "Candidates eliminated. [Detail line from §9.2 elim variant]." |
| Coach session dismissed (silent) | No announcement — this is a consequence of a cell fill, which is already announced. |

### 12.6 Keyboard Navigation of Coached Cells

Coached cells are reachable via arrow key navigation within the grid as normal
(fspec-001-v1 §4.2). No additional keyboard navigation is added for the coaching flow.

The explanation panel is not keyboard-navigable as a separate widget — its content is
exposed via the live region announcement (§12.5) when the coached cell gains focus.

### 12.7 Auto-Revealed Candidates

Auto-revealed candidates are rendered in the coach accent color, which may not be
distinguishable by users with certain color vision deficiencies. As a best-effort
accommodation: the `aria-label` on cells with auto-revealed marks includes a note
distinguishing coach-revealed marks from user marks (e.g., "Coach candidates: [digits].
Your marks: [digits].").

### 12.8 Per-Technique Accessibility Notes

All 15 techniques follow the same accessibility pattern (§12.3): the live region
announces the technique name and supporting text when the coached cell gains focus. This
is the same one-line text defined in §8 for each technique.

For complex techniques (XY-Chain, Forcing Chain (AIC)) where the visual explanation is
simplified, the live region announces the same simplified concept text used in the visual
panel. Full chain traversal is not narrated.

---

## 13. Out of Scope

The following are excluded from this spec, consistent with rspec §4:

- **Technique library / reference panel** — a browsable index of technique explanations
  outside a live coaching moment.
- **Persistent coach mode** — a session-level toggle that continuously surfaces teachable
  moments. Coach is one-shot only.
- **Auto-fill** — the coach never fills a cell. The user always makes the move.
- **Changes to the Hint feature** — Hint is unchanged.
- **Coach use tracking** — Coach use is not counted or displayed anywhere (R3).
