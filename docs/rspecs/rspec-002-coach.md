# Requirements Spec: Coach Mode
**ID:** rspec-002-coach
**Status:** Approved — ready for Functional Designer
**Date:** 2026-05-03
**Author:** Orchestrator

---

## 1. Overview

Coach Mode is the flagship V2 feature. It teaches users solving techniques in the context
of the live puzzle they are playing. When a user is stuck, they can press the Coach button
to receive a guided, in-context explanation of how to make progress using the simplest
applicable technique. The goal is to help users build genuine Sudoku skills, not just
complete puzzles.

---

## 2. Feature Summary

A "Coach" button is added to the game controls alongside the existing Hint button. Pressing
Coach is a one-shot action: it identifies the easiest applicable solving technique for the
current board state, highlights the relevant cell(s), and provides an in-context visual
explanation when the user focuses one of those cells. The user makes the move themselves.
After filling the cell, a brief recap appears. Coach is available at all difficulty levels
and does not affect the hint budget.

---

## 3. Requirements

### 3.1 Coach Button

**R1.** A "Coach" button appears in the game controls alongside the Hint button.

**R2.** Coach is available at all difficulty levels (Kiddie through Death March).

**R3.** Coach does not draw from the hint budget. Coach use is not tracked or counted
in any way.

**R4.** The Hint button and its existing behavior are unchanged. Hint and Coach are
independent features that coexist.

### 3.2 Triggering the Coach

**R5.** Pressing Coach is a one-shot action. It does not activate a persistent mode; the
coaching interaction begins immediately and concludes after the post-fill recap.

**R6.** When Coach is pressed, the app identifies the easiest applicable solving technique
for the current board state, using the existing logical solver technique ladder.

**R7.** "Easiest applicable" means the lowest-ranked technique in the technique ladder that
can make progress on the current board (same ranking order used by the solver and rater).

**R8.** All cells that exemplify the identified technique are highlighted simultaneously.
The user is not shown just one candidate cell; they choose which to engage with.

**R9.** Behavior when no technique is applicable (e.g., puzzle already complete, or board
state is inconsistent): left open for the Functional Designer to specify.

### 3.3 Cell Selection

**R10.** After Coach highlights cells, the user selects which highlighted cell to focus.
The coach does not auto-select.

**R11.** While coach highlights are active, the user is not locked into the coaching flow.
They may freely navigate, enter numbers, erase, or otherwise play normally, ignoring the
coach's suggestions entirely.

**R12.** Behavior of coach highlights when the user acts on a non-coached cell (navigates
away, fills an unrelated cell, etc.): left open for the Functional Designer to specify.

### 3.4 Candidate Auto-Reveal

**R13.** If the identified technique requires candidate (pencil mark) visibility to explain,
the coach auto-reveals candidates. The user is not required to manually enable pencil marks
before using Coach.

**R14.** Auto-revealed candidates are rendered in the coach accent color (see §3.7) to
distinguish them visually from user-entered pencil marks.

**R15.** Whether auto-revealed candidates persist after the coaching interaction ends or
revert to the user's prior pencil mark state: left open for the Functional Designer to
specify.

### 3.5 In-Context Explanation

**R16.** When the user focuses a highlighted coached cell, an in-context explanation
appears.

**R17.** Coach visuals (arrows, related-cell highlights, explanation panel, candidate
annotations) are scoped to the currently focused coached cell. They appear when the user
focuses a highlighted cell and disappear when focus moves to any other cell.

**R18.** The explanation prioritizes visual communication over text: highlights of related
cells, directional arrows or connectors between cells showing logical relationships, and
candidate annotations — all rendered in the coach accent color.

**R19.** The technique name is always displayed as part of the explanation (e.g.,
"Naked Pair," "X-Wing," "Forcing Chain").

**R20.** Supporting text is minimal. The explanation focuses on applying logic to the
current board state, not on providing a general technique reference. Large blocks of
repeated explanatory text are explicitly undesirable.

**R21.** For complex techniques (e.g., XY-Chain, Forcing Chains) where a complete visual
representation spanning the board is impractical, the coach provides at minimum:
(a) the technique name, (b) a brief plain-language concept summary, and (c) identification
of the specific cells the user should begin analyzing. The explanation acknowledges the
complexity rather than attempting an incomplete visual that misleads.

**R22.** The exact UI surface for the explanation (inline panel, floating overlay, side
panel, etc.) is left open for the Functional Designer and Visual Designer to specify. The
surface must not obstruct the user's view of the grid cells relevant to the technique.

### 3.6 Post-Fill Recap

**R23.** After the user fills the coached cell, a brief recap appears confirming what the
user just did.

**R24.** The form, content, and dismissal behavior of the recap are left open for the
Functional Designer to specify. The recap should be brief and non-intrusive.

**R25.** After the recap concludes (whether by user action or auto-dismiss), the coach
state resets. The user may press Coach again for a new coaching hint on the updated board.

### 3.7 Visual Language — Coach Accent Color

**R26.** The coach uses a single accent color (the "coach color") for all elements it
draws or auto-reveals: cell highlights, arrows and connectors, auto-revealed candidate
marks, and any coach UI borders or labels.

**R27.** The coach color must be visually distinct from all existing theme colors and from
the existing hint highlight color.

**R28.** The coach color must remain distinct and legible across all V1 themes (Minimalist,
High Contrast, Soft Warm, Ocean Blue, Forest Green). Color selection and cross-theme
validation are delegated to the Visual Designer.

### 3.8 Accessibility

**R29.** Coach has best-effort accessibility support. The coaching experience is inherently
visual; full non-visual parity is not required but should be pursued where practical.

**R30.** For each technique's explanation, the Functional Designer will propose an
accessible representation (ARIA labels, screen reader narration, keyboard navigation of
coach highlights). Accessibility approach for each technique will be reviewed and confirmed
during functional design sign-off.

### 3.9 Technique Coverage

**R31.** Coach supports the full v1 technique ladder: Naked Single, Hidden Single, Locked
Candidates, Naked Pair, Hidden Pair, Naked Triple, Hidden Triple, X-Wing, Swordfish,
Jellyfish, XY-Wing, Simple Coloring, Multi-Coloring, XY-Chain, and Forcing Chains.

**R32.** No technique is excluded from coaching. Techniques too complex for a full visual
treatment receive the simplified explanation defined in R21.

---

## 4. Out of Scope

- **Technique library / reference panel** — a browsable index of technique explanations
  outside of a live coaching moment. May be a future separate feature.
- **Persistent coach mode** — a session-level toggle that continuously surfaces teachable
  moments. Coach is one-shot only.
- **Auto-fill on behalf of the user** — the coach never fills a cell; the user always acts.
- **Changes to the Hint feature** — Hint is unchanged.

---

## 5. Open Questions for Functional Designer

The following are intentionally deferred to the Functional Designer:

1. **No applicable technique:** What does the Coach button show or do when the board has
   no applicable technique (puzzle complete, or inconsistent state)?

2. **Non-coached cell interaction:** When coach highlights are active and the user fills
   or focuses a non-coached cell, do the highlights dismiss, persist, or recalculate?

3. **Auto-revealed candidate persistence:** After a coaching interaction ends, do
   auto-revealed candidates stay visible or revert to the user's prior pencil mark state?

4. **Explanation UI surface:** Exact component, placement, and dismissal behavior for the
   in-context explanation.

5. **Recap form:** Content, placement, duration, and dismissal behavior of the post-fill
   recap.

6. **Coach button states:** Visual states for the Coach button (idle, active/coaching in
   progress, disabled if applicable).
