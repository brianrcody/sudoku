# Functional Spec: Puzzle Sharing via URL
**ID:** fspec-006-puzzle-sharing
**Status:** Final
**Date:** 2026-11-13
**Author:** Uber Developer (Functional Designer stage)
**Based on:** rspec-006-puzzle-sharing; companion to fspec-005-dev-mode

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [The Share Action](#2-the-share-action)
3. [Puzzle Strings](#3-puzzle-strings)
4. [Loading a Puzzle](#4-loading-a-puzzle)
5. [Opening a Share Link](#5-opening-a-share-link)
6. [Unrated Puzzles](#6-unrated-puzzles)
7. [Statistics and Persistence](#7-statistics-and-persistence)
8. [The Notice](#8-the-notice)
9. [Accessibility](#9-accessibility)
10. [Edge Cases](#10-edge-cases)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Scope and Conventions

Extends `fspec-001-v1.md` and `fspec-003-harder-tiers.md`. Existing behavior is unchanged
unless overridden here.

**Terminology:**
- *Givens* — the puzzle's pre-filled cells. Never the player's entries.
- *Puzzle string* — 81 characters describing givens, row-major (§3).
- *Share link* — the app's own URL with the puzzle string in the `p` query parameter.
- *Loaded puzzle* — a puzzle that entered the app through the loading procedure (§4)
  rather than the generator: from a share link, or from developer mode's load-from-string
  tool (fspec-005 §4).
- *Rated* — the solver can solve the puzzle and so assigns it one of the seven tiers.
  *Unrated* — a valid puzzle the solver cannot finish (§6).
- *Progress* — at least one player-entered digit or pencil mark on a board that is not won.
- *Generation tier* — the tier New Puzzle generates: the current puzzle's tier when it is
  rated, otherwise the tier the player last chose in the difficulty selector.

---

## 2. The Share Action

### 2.1 Placement

A **Share** button sits in the action row beneath New Puzzle and Reset, spanning the row's
full width. It is visible at every viewport width. The placement is provisional; the
hamburger menu will absorb it later.

### 2.2 Availability

Enabled whenever a puzzle is loaded — in any tier including Unrated, in progress, or won.
Disabled only while no puzzle is loaded (first-ever boot, before generation finishes).

### 2.3 Behavior

1. The player activates Share (click, tap, Enter, or Space).
2. The app builds the share link for the current puzzle's givens (§3.2).
3. The app tries to copy the link to the clipboard.
4. **Copy succeeded:** the notice (§8) shows "Link copied to clipboard." and the same text
   is announced. The notice dismisses itself after 4 seconds.
5. **Copy failed or clipboard unavailable:** the notice shows "Copy this link to share the
   puzzle:" above a read-only text field holding the link. The field receives focus with
   its whole content selected. The text "Couldn't copy automatically. The link is shown
   for you to copy." is announced. This notice stays until dismissed or replaced.
6. Focus stays on the Share button in case 4.

Share never changes game state: no selection change beyond the standard outside-grid
click rule (fspec-001 §4.2), nothing undoable, no statistics.

---

## 3. Puzzle Strings

### 3.1 Accepted input

| Rule | Detail |
|---|---|
| Digits `1`–`9` | A given |
| `0` or `.` | An empty cell |
| Whitespace | Ignored anywhere (leading, trailing, embedded, including line breaks) |
| Anything else | Malformed |
| Length | Exactly 81 cells after whitespace removal |

### 3.2 Produced output

Share links always encode exactly 81 digits, `0` for empty, in the `p` parameter:
`<app URL without query or fragment>?p=<81 digits>`. Nothing else is encoded: no player
digits, pencil marks, tier, hint count, or developer-mode flag.

---

## 4. Loading a Puzzle

One procedure serves share links and developer mode's load-from-string tool.

### 4.1 Procedure

1. **Parse** the string (§3.1). On failure → rejected (§4.2).
2. **Validate** off the UI thread. The notice shows "Checking puzzle…" until step 3 or 4
   resolves. The current game stays fully playable meanwhile.
   - any digit repeated in a row, column, or box → rejected
   - no empty cell → rejected
   - no solution → rejected
   - more than one solution → rejected
3. **Rate** with the solver. Solvable → the tier of the hardest technique used.
   Not solvable → Unrated.
4. **Confirm if needed.** If the current game has progress at this moment, a modal
   confirmation opens (§4.3). Otherwise continue directly.
5. **Replace.** Any in-flight puzzle generation is cancelled and any other open
   confirmation dialog is closed. The loaded puzzle becomes the current puzzle with an
   empty board: no player digits, no pencil marks, no selection, pen mode, undo cleared,
   coach session ended, hints at the tier's limit.
6. **Report** the outcome (§4.4).

Overlapping loads are independent: each completes on its own, and the one that finishes
last is the current puzzle. A second replace confirmation replaces the first, which then
counts as declined.

### 4.2 Rejections

A rejected puzzle changes nothing: the current game, its progress, and its persistence
are untouched.

| Condition | Message |
|---|---|
| Wrong length | "A puzzle needs exactly 81 cells; this one has *N*." |
| Illegal character | "Puzzles can contain only the digits 1–9, with 0 or . for empty cells." |
| Repeated digit in a unit | "A digit repeats in a row, column, or box." |
| No empty cell | "The puzzle has no empty cells." |
| No solution | "The puzzle has no solution." |
| Multiple solutions | "The puzzle has more than one solution." |
| Internal failure while checking | "The puzzle couldn't be checked." |

Length is checked before characters only when every character is legal; an illegal
character always produces the illegal-character message.

### 4.3 Replace confirmation

> **Load shared puzzle?** Your current progress will be lost.
> [Cancel] [Load Puzzle]

- Standard confirmation dialog (fspec-001 §9): modal, focus trapped, Cancel focused on
  open, Escape cancels.
- **Load Puzzle** → step 5. **Cancel/Escape** → declined; the current game continues.
- Asked only when there is progress at the moment validation finishes. A won board, or a
  board with no player digits and no pencil marks, is replaced without asking.
- From developer mode the title is "Load this puzzle?".

### 4.4 Outcome messages

| Outcome | Message |
|---|---|
| Loaded, rated | "Puzzle loaded. Difficulty: *Tier*." |
| Loaded, Unrated | "Puzzle loaded as Unrated. The solver can't rate it, so hints and coach are unavailable." |
| Declined | "Puzzle not loaded. Your game continues." |
| Rejected | "This puzzle can't be loaded. *Reason from §4.2*" |

---

## 5. Opening a Share Link

1. The app boots normally: it restores the saved game, or starts generating a puzzle at
   the generation tier.
2. If the URL has a `p` parameter, the loading procedure (§4) runs concurrently with its
   value.
3. The outcome message is shown in the notice and announced. Loaded and declined
   notices dismiss after 4 seconds; a rejection notice stays until dismissed.
4. Once the outcome is known — loaded, declined, or rejected — the `p` parameter is
   removed from the address bar without a reload. Other parameters and the fragment are
   kept. Refreshing therefore does not re-trigger the link.

**The shared puzzle wins.** If boot-time generation is still running when a valid shared
puzzle is ready, generation is cancelled and the shared puzzle loads. If generation
finished first, its untouched puzzle is replaced without a prompt (no progress). If a
saved game with progress was restored, §4.3 applies. If the link is rejected or declined,
the boot-time puzzle or restored game stands.

An empty `p` value is a wrong-length rejection.

---

## 6. Unrated Puzzles

An Unrated puzzle is fully playable but receives no solver assistance.

| Feature | Behavior on an Unrated puzzle |
|---|---|
| Pen, pencil, erase, erase-all, undo, reset | Normal |
| Conflict highlighting | Normal |
| Mistake checking | On-demand: the Check button is shown, as on Easy/Medium |
| Win detection and win banner | Normal |
| Hint | Button disabled; badge shows "–"; never usable |
| Coach | Button disabled; the `C` shortcut announces "Coach is unavailable for unrated puzzles." and does nothing else |
| Difficulty selector | Shows an extra "Unrated" entry, selected. The entry exists only while the current puzzle is Unrated |
| Statistics panel | No row is marked active |
| Share | Available |
| New Puzzle | Generates at the generation tier (§1) |
| Changing difficulty | After the standard abandonment confirmation when there is progress, generates a new puzzle at the chosen tier. If generation is cancelled, the Unrated puzzle remains and the selector returns to "Unrated" |

Rated loaded puzzles behave exactly like generated puzzles of that tier in every respect,
including difficulty changes.

---

## 7. Statistics and Persistence

### 7.1 Statistics

- A rated loaded puzzle records an attempt and a win under its tier by the same rules as
  a generated one (fspec-001 §10).
- An Unrated puzzle never records an attempt or a win.
- While developer mode is on, nothing records (fspec-005 §3).
- A game whose first entry was made while recording was suppressed records its attempt on
  the first player digit entered after recording resumes.

### 7.2 Persistence

A loaded puzzle is saved and restored exactly like a generated one (fspec-001 §11),
including its Unrated status and its restrictions. The saved difficulty-selector
preference is not changed by loading a puzzle.

---

## 8. The Notice

A single message area below the board, in the board column.

| Variant | Use | Dismissal |
|---|---|---|
| Info | "Link copied…", loaded, declined | Auto after 4 s, or the Dismiss button |
| Progress | "Checking puzzle…" | Replaced by the outcome |
| Error | Rejections | Dismiss button, or replaced |
| Link | Copy fallback with the read-only field | Dismiss button, or replaced |

- One notice at a time; a new one replaces the old.
- Every notice except Progress has a **Dismiss** button.
- A notice is cleared when a new puzzle is generated.

---

## 9. Accessibility

| Element | Requirement |
|---|---|
| Share button | Native button, accessible name "Share puzzle link", visible focus ring, operable by Enter/Space |
| Copy confirmation | Announced through the live region |
| Fallback field | Read-only text input labelled "Shareable puzzle link"; focused and selected on appearance; typing digits or arrows in it never reaches the board |
| Notice | Outcome text is announced through the live region; the notice itself is not a second live region |
| Dismiss button | Accessible name "Dismiss message"; after dismissal of a Link notice, focus returns to Share |
| Replace confirmation | `role="dialog"`, `aria-modal`, labelled by its title; focus trap; Escape = Cancel |
| Hint (Unrated) | Disabled; accessible name "Hint — unavailable for unrated puzzles" |
| Coach (Unrated) | Disabled; accessible name "Coach — unavailable for unrated puzzles" |
| Unrated load | The loaded announcement states that hints and coach are unavailable |

Keyboard shortcuts for the board (digits, erase, arrows) are ignored while focus is in
any text field.

---

## 10. Edge Cases

| Case | Behavior |
|---|---|
| Share link opened with developer mode on | Loads normally; nothing records statistics |
| Link puzzle identical to the current puzzle | Treated like any other: confirm if there is progress, then a fresh board |
| Player makes a move while "Checking puzzle…" | Progress is evaluated when checking finishes, so the confirmation appears |
| Player presses New Puzzle while checking | The shared puzzle still wins when ready (§5) |
| Honest-fallback dialog (fspec-003 §5.4) open when the shared puzzle is ready | The dialog is closed; the shared puzzle loads |
| Clipboard permission prompt dismissed | Treated as copy failure (§2.3 step 5) |
| `p` present twice | The first value is used |
| Storage unavailable | Loading still works; persistence silently unavailable (existing rule) |

---

## 11. Out of Scope

Per rspec-006 §3: hamburger-menu integration; sharing progress, pencil marks, or solve
state; short links, QR codes, any server component; favorites/history.
