# Functional Spec: Left-Hand Layout Mode
**ID:** fspec-004-left-hand
**Status:** Final
**Date:** 2026-09-13
**Author:** Uber Developer (Functional Designer stage)
**Based on:** rspec-004-left-hand

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [The Handedness Toggle](#2-the-handedness-toggle)
3. [Layout Behavior](#3-layout-behavior)
4. [Persistence](#4-persistence)
5. [Accessibility](#5-accessibility)
6. [Edge Cases](#6-edge-cases)
7. [Out of Scope](#7-out-of-scope)

---

## 1. Scope and Conventions

Extends `fspec-001-v1.md`. All existing behavior is unchanged unless overridden here.

**Terminology:**
- *Board column* — the difficulty selector, grid, generation progress card, coach panel, and
  coach recap, stacked vertically.
- *Control panel* — the number pad group (digits, Clear, Pen/Pencil, Hint, Check, Undo,
  Erase all pencil), the New Puzzle / Reset action row, and the statistics panel.
- *Wide viewport* — any width at which the board column and control panel sit side by side
  (fspec-001 desktop layout). *Narrow viewport* — any width at which they stack.
- *Right-hand mode* — the existing layout (control panel right of board). Default.
- *Left-hand mode* — control panel left of board.

---

## 2. The Handedness Toggle

### 2.1 Placement

A single toggle switch, visibly labeled **"Left-handed"**, sits in the header immediately to
the left of the theme selector. It is present on wide viewports and hidden on narrow
viewports (§3.3).

### 2.2 States

| Toggle state | Meaning          | Layout (wide viewport)     |
|--------------|------------------|----------------------------|
| Off          | Right-hand mode  | Board left, controls right |
| On           | Left-hand mode   | Controls left, board right |

### 2.3 Operation

1. The player activates the toggle by clicking/tapping it (label text included) or, with
   keyboard focus on it, pressing Space or Enter.
2. The toggle flips state immediately. No confirmation, no page reload.
3. The layout rearranges immediately (§3). There is no animated transition of the columns.
4. The new preference is saved (§4).
5. A screen reader announcement is made (§5.3).
6. Keyboard focus remains on the toggle.

### 2.4 Non-interference

Toggling has no effect on game state: the puzzle, pen digits, pencil marks, hint count,
undo availability, Pen/Pencil mode, an open coach session, an in-flight puzzle generation,
and statistics are all unchanged. It is not an undoable move.

The selected cell follows the existing rule (fspec-001 §4.2): clicking the toggle — like the
theme selector or any control outside the grid and number pad — deselects the cell.

The existing single-key shortcuts (`p`, digits, arrows, Backspace/Delete) keep their
fspec-001 §5.2 behavior; they do not activate the toggle, and Space/Enter on the focused
toggle do not act on the grid.

---

## 3. Layout Behavior

### 3.1 Wide viewport

In left-hand mode the control panel and board column exchange horizontal positions. Each
column's internal contents and order are unchanged — e.g., the difficulty selector remains
above the grid, the statistics panel remains below the action row. The gap between the
columns and the centering of the pair within the page are identical in both modes, so the
board shifts horizontally by the panel's width plus gap when the mode changes.

Overlays attached to the board — win banner, coach arrows — stay attached to the board.
Page-level overlays — confirmation dialog — are unaffected.

### 3.2 Header

The header is not mirrored. The title stays left; the toggle and theme selector stay right.

### 3.3 Narrow viewport

The stacked layout (board column above control panel) is identical in both modes, and the
toggle is not displayed. The saved preference is neither changed nor cleared. If the
viewport later widens (window resize, device rotation), the layout reflects the saved
preference without reload; if it narrows, the stacked layout returns.

---

## 4. Persistence

- The preference is stored in a cookie, independent of theme, puzzle state, and statistics.
- Default when no preference is stored: right-hand mode.
- An unrecognized stored value is treated as right-hand mode.
- On page load, the stored preference is applied before the page is first rendered: a
  left-hand player never sees the right-hand layout flash. The toggle reflects the stored
  state when it becomes interactive.

---

## 5. Accessibility

### 5.1 Toggle semantics

- Exposed as a switch (`role="switch"`) with its checked state (`aria-checked`) reflecting
  on/off at all times, including on page load.
- Accessible name: "Left-handed" (from its visible label).
- Focusable via Tab; operable via Space and Enter; visible focus indicator consistent with
  other header controls (vspec-001 §10.1).
- On narrow viewports it is hidden from all users, including assistive technology.

### 5.2 Focus and reading order

Tab order and screen reader reading order are identical in both modes and follow document
order: header (title, toggle, theme selector) → difficulty selector → grid → control panel
(number pad, action row, statistics) → footer.

**Override of fspec-001 §14.1:** that section states focus order follows visual reading
order (left-to-right). In left-hand mode, focus order deliberately does not follow the
visual left-to-right arrangement; the Product Director chose a stable, mode-independent
order (rspec R7). The grid remains the first game element reached, matching the puzzle's
primacy.

### 5.3 Announcements

Via the existing assertive live region (fspec-001 §14.3):

| Event                  | Announcement                                               |
|------------------------|------------------------------------------------------------|
| Toggle turned on       | "Left-handed layout on. Controls are left of the puzzle."  |
| Toggle turned off      | "Left-handed layout off. Controls are right of the puzzle."|

No announcement on page load.

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Toggle while a cell is selected | The cell is deselected, per fspec-001 §4.2 (the toggle is outside the grid and number pad). |
| Toggle while a coach session is open | Coach panel, highlights, and arrows remain correct on the moved board. |
| Toggle while the progress card is showing | Card moves with the board column; generation continues. |
| Toggle while the win banner is showing | Banner moves with the board. |
| Toggle while a confirmation dialog is open | Not reachable — the modal dialog blocks interaction with the header. |
| Cookies unavailable/blocked | Toggle still switches the layout for the session; preference is not retained across reloads. No error shown. |
| Stored left-hand preference on narrow viewport | Stacked layout; toggle hidden; preference retained (§3.3). |
| Rapid repeated toggling | Each activation flips state; the final state is the one saved and displayed. Each flip announces (the live region re-announces repeated messages). |

---

## 7. Out of Scope

- Mirroring the header or any other page chrome.
- A keyboard shortcut for the toggle.
- Any change to the narrow-viewport layout.
- Relocating the toggle into a hamburger menu (separate V4 candidate).
