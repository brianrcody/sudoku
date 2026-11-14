# Requirements Spec: Puzzle Sharing via URL
**ID:** rspec-006-puzzle-sharing
**Status:** Approved (Product Director decisions captured 2026-11-13)
**Date:** 2026-11-13
**Author:** Orchestrator (from Product Director direction)
**Source:** `docs/misc/v4featureCandidates.md` — Tier 1, "Puzzle Sharing via URL"
**Companion:** `rspec-005-dev-mode.md` (load-from-string uses this spec's loading rules)

---

## 1. Overview

Players can share the current puzzle as a link. Recipients start from the same givens
with no progress. No server infrastructure.

## 2. Requirements

### Sharing

**R1.** A Share action produces a link to the current puzzle's givens and copies it to
the clipboard, with a confirmation announced visually and to screen readers. If the
clipboard is unavailable (e.g. non-secure context, permission denied), the link is shown
in a selectable field instead.

**R2.** The link encodes the givens as a plain 81-digit string in a URL query parameter,
row-major, `0` for empty cells. Only givens are encoded — never the sharer's progress,
pencil marks, or difficulty.

**R3.** The Share action is available for any loaded puzzle, including Unrated ones, and
is reachable at all viewport widths. Its placement is provisional: the hamburger menu
(separate V4 item) will later absorb it.

### Receiving

**R4.** Opening a share link loads that puzzle. After it is handled (loaded, declined, or
rejected), the parameter is removed from the address bar without a reload, so refreshing
does not re-trigger it.

**R5.** The incoming string is validated. On input `.` is also accepted for empty cells.
A puzzle that is malformed, contradicts itself, or does not have exactly one solution is
rejected with a clear message, and the current game continues untouched.

**R6.** A valid puzzle is rated by the existing solver/rater. If the solver can rate it,
it loads under its rated tier. The tier is always derived on the recipient's side.

**R7.** If the solver cannot solve it, it loads as **Unrated**: coach and hints are
disabled (visibly, and announced as unavailable), while all other play features —
pencil marks, undo, erase, mistake checking, win detection — work normally.

**R8.** If the player has an unfinished game with progress (any player-entered digit or
pencil mark on an unwon board), they are asked to confirm before it is replaced. Declining
keeps the current game. With no progress, or a won board, the shared puzzle replaces it
without asking. The confirmation is keyboard operable and accessible as a modal dialog.

### Statistics and persistence

**R9.** A loaded puzzle records statistics (attempt and win) under its rated tier, exactly
like a generated puzzle — unless developer mode is on. Unrated puzzles never record
statistics.

**R10.** A loaded puzzle, including an Unrated one, persists and restores across page
loads like a generated one, keeping its Unrated status.

**R11.** Choosing New Puzzle or changing difficulty after playing a shared puzzle returns
to normal generation.

### Cross-cutting

**R12.** Loading a shared puzzle, including validation and rating, completes in under
1 second for any puzzle the solver can rate, without blocking the UI thread.

**R13.** All new controls and messages meet the project's a11y bar (keyboard navigable,
correct ARIA roles, screen reader announcements).

## 3. Out of Scope

- Hamburger menu integration (separate V4 item).
- Sharing progress, pencil marks, or solve state.
- Short links, QR codes, or any server component.
- Favorites/history of shared puzzles.
