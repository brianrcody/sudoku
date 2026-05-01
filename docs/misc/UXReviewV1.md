# UX Review Worksheet — v1

**Date:** 2026-04-30
**Reviewer:** Product Director (user)
**Purpose:** Final UX checkpoint before v1 sign-off, per CLAUDE.md "UX Quality" criterion.

**How to use:** Walk through each section in the running app. Tick items
that pass, leave a note next to anything that doesn't. The Orchestrator's
job from here is to capture issues; the Product Director decides whether
each is a blocker, a v1.x backlog item, or "ship as is."

**Where to review:**
- **Local:** http://localhost:3001/index.html (dev server is running)
- **Deployed:** the hosting.com URL (verified working after the
  WORKER_URL fix; cross-check at least the new-puzzle generation path)

Reset state between sections by closing/reopening the tab or clearing
`localStorage` for the site so each section starts fresh.

---

## 1. First-load impression

- [ ] App loads to a playable puzzle without manual interaction
- [ ] Default theme (Minimalist) reads as clean and intentional
- [ ] Default difficulty (Medium) is sensible for a first-time visitor
- [ ] No layout flash, no visible loading spinner that lingers
- [ ] Header / title is unambiguous about what the app is

**Notes:**

---

## 2. Grid and cells (fspec §4, vspec §4.1, §5.1)

- [ ] 9×9 grid renders with clear 3×3 box separators
- [ ] Givens are visually distinct from player entries
- [ ] Selected cell has obvious focus
- [ ] Peer cells (row/col/box) of the selection are visually de-emphasized or highlighted (whichever the spec calls for)
- [ ] Cells with the same digit as the selection are visually linked (if specified)
- [ ] Cell sizing feels right — not cramped, not sparse

**Notes:**

---

## 3. Input — number pad and keyboard (fspec §5)

- [ ] Number pad buttons 1–9 enter the digit in the selected cell
- [ ] Number pad has obvious tap targets (mobile)
- [ ] Keyboard 1–9 enters digits
- [ ] `Delete` / `Backspace` erases
- [ ] `P` toggles pen/pencil mode
- [ ] Arrow keys move selection, including wrap behavior
- [ ] Typing while focus is in difficulty/theme select does **not** enter digits

**Notes:**

---

## 4. Pen and pencil (fspec §6)

- [ ] Mode toggle is visible and unambiguous (which mode is active?)
- [ ] Pen entry replaces any existing entry in the cell
- [ ] Pencil marks render as small digits, multiple per cell
- [ ] Same pencil digit toggles on/off
- [ ] Entering a pen digit clears matching pencil marks in peer cells (auto-clear)
- [ ] Erase on a cell clears both pen and pencil

**Notes:**

---

## 5. Validation behavior per tier (fspec §7)

Cycle through tiers using New Puzzle and verify each:

- [ ] **Kiddie:** wrong digit flagged immediately (real-time)
- [ ] **Easy / Medium:** wrong digits not flagged until Check pressed; Check flags incorrect cells
- [ ] **Hard:** no on-demand check; incorrect cells flagged on completion
- [ ] **Death March:** no cell-level highlighting on completion; only a message
- [ ] **All tiers:** duplicate digits in a row/col/box highlight as conflicts in real time
- [ ] Conflict highlight clears when the offending entry is erased / changed

**Notes:**

---

## 6. Hints (fspec §8)

- [ ] Hint button enabled when hints remain, disabled when 0
- [ ] Hint counter visible and accurate
- [ ] Tier-appropriate hint limits feel right (e.g. fewer for harder tiers)
- [ ] Pressing Hint with a cell selected fills the correct digit
- [ ] Pressing Hint without a selection picks a sensible cell or does nothing harmful

**Notes:**

---

## 7. Controls and confirmation flows (fspec §9)

- [ ] **New Puzzle, no progress:** generates immediately, no dialog
- [ ] **New Puzzle, mid-game:** dialog asks before discarding progress
- [ ] **Reset:** always confirms before clearing
- [ ] **Difficulty change, no progress:** changes immediately
- [ ] **Difficulty change, mid-game:** dialog asks before changing; cancel reverts the selector
- [ ] **Check button** behavior matches the tier rules above
- [ ] Pen/pencil toggle button shows current mode clearly
- [ ] Erase button works as a number-pad alternative

**Notes:**

---

## 8. Win state (fspec §10)

- [ ] Solving a puzzle correctly triggers the win banner
- [ ] Win banner is celebratory but dismissible
- [ ] Stats update (attempts, wins) on a successful solve
- [ ] After winning, Reset / New Puzzle behavior is sane
- [ ] No false positives — partial solves don't trigger the banner

**Notes:**

---

## 9. Statistics (fspec §11)

- [ ] Stats panel is visible and readable
- [ ] Per-tier rows show correct attempted / won counts
- [ ] Active tier row is visually distinguished (vspec §5.7)
- [ ] Stats persist across reload (open, play, reload, verify)

**Notes:**

---

## 10. Themes (fspec §12, vspec §2)

For each theme, do a quick visual pass — pick + interact + read text:

- [ ] **Minimalist** (default)
- [ ] **Coffee Shop**
- [ ] **School**
- [ ] **Mountain**
- [ ] **Digital Terminal**

For each: contrast feels OK, focus indicators visible, no jarring color
clashes, win banner / dialog / stats panel all read well. Switching
themes mid-game does not lose state.

- [ ] Selected theme persists across reload

**Notes per theme:**

---

## 11. Persistence and resume (fspec §13)

- [ ] Make progress, reload — state restores (puzzle, pen, pencil, hints used)
- [ ] Win, reload — does not re-trigger the win banner
- [ ] Switching difficulty mid-puzzle and reloading lands on the right state
- [ ] Clearing localStorage results in a clean fresh-load (no error states)

**Notes:**

---

## 12. Accessibility (fspec §14, vspec §10)

- [ ] Tab order moves through controls in a logical sequence
- [ ] Every interactive element is reachable and operable via keyboard alone
- [ ] Focus indicators visible in every theme
- [ ] Screen reader (VoiceOver / NVDA / TalkBack — whichever you have) announces:
  - puzzle load
  - cell selection
  - digit entry
  - conflict / incorrect feedback
  - hint placement
  - win
- [ ] No keyboard traps (especially in the dialog)

**Notes:**

---

## 13. Responsive layout (vspec §8)

Resize the browser or use devtools device emulation:

- [ ] **Desktop** (>720 px) — feels well-proportioned
- [ ] **Mobile** (≤720 px) — grid is tappable, controls reachable with thumb
- [ ] **Very small** (≤375 px) — nothing overflows or becomes unreadable
- [ ] Number pad placement on mobile feels natural for one-handed play

**Notes:**

---

## 14. Aesthetic and overall feel (subjective)

- [ ] Typography reads well across themes (vspec §3)
- [ ] Spacing and density feel right (not cramped, not bloated)
- [ ] Animations / transitions are tasteful (vspec §9) — not flashy, not absent
- [ ] Win banner, dialogs, conflict highlighting all use consistent visual language
- [ ] Nothing about the app feels rough, half-finished, or "test-stage"

**Overall vibe — would a fresh visitor want to come back?**

---

## 15. Anything noticed that isn't on this list

Use this section for surprises — bugs, awkward flows, polish items
that occur to you while reviewing.

**Issues:**

**Backlog candidates (v1.x):**

---

## Sign-off

**Decision:**

- [x] **Approve v1** — UX meets the milestone bar; ship.
- [ ] **Approve with backlog** — UX meets the bar; items above go to v1.x backlog.
- [ ] **Block** — issues above must be resolved before v1 sign-off.

**Date approved:** 2026-04-30
**Signed:** Brian Cody (Product Director)

### Notes captured during review

**Narrow-width grid clipping — dev-server only, not a v1 issue.**
While shrinking the desktop browser window very narrow (below ~220 px),
the bottom rows of the grid clipped on `localhost:3001`. The same case
on the production hosting.com deployment did not reproduce — the bug
is local-dev-only, root cause unconfirmed. Decision: do not fix.
Identical CSS is served in both environments, so the divergence is
likely something in how the production server delivers the page
(viewport meta, font fallback, or similar). Worth investigating only
if the symptom resurfaces in production.
