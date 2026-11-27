# Requirements Spec: Hamburger Menu and Control Consolidation
**ID:** rspec-008-hamburger-menu
**Status:** Approved (Product Director decisions captured 2026-11-27)
**Date:** 2026-11-27
**Author:** Orchestrator (from Product Director direction)
**Source:** `docs/misc/v4featureCandidates.md` — Tier 1, "Hamburger Menu UI Consolidation"
(scope widened by the Product Director, 2026-11-27)
**Visual reference:** `docs/mockups/hamburger-menu-v1.html` (exploratory, Option B). The
Product Director approved its Difficulty + New Puzzle cluster and its menu contents. It
predates R2a and R9–R11.

---

## 1. Overview

The page has accumulated controls. The controls that stay on screen should be the ones
used to play the active game. Settings and between-game actions move into a hamburger
menu. The menu is also the planned home for upcoming features that are not part of play.

## 2. Requirements

### Placement of controls

**R1.** A hamburger menu button sits at the right end of the page header. It stays on the
right in every layout: right-hand and left-hand mode, wide and narrow viewports. This
matches vspec-004's rule that the header is not mirrored.

**R2.** New Puzzle moves out of the action row and sits beside the Difficulty selector,
above the grid. Both start the next game, and they are grouped as one cluster. Their
behavior is unchanged, including the "progress will be lost" confirmation.

**R2a.** The cluster's design in the v1 mockup (one bordered control joining the select
and the button) is approved.

**R3.** New Puzzle remains the control that receives focus when the win banner appears.

**R4.** These controls move into the menu: Theme, Left-handed, Share, Reset, and
Statistics. Each keeps its current behavior unless stated here. In particular, Reset
keeps its confirmation dialog and Share keeps its current enabled/disabled rules.

**R4a.** Once a Reset is confirmed, focus goes to the grid.

**R4b.** Reset and Share stay enabled after a win. Replaying a just-won puzzle and sharing
one the player enjoyed are both expected uses.

**R4c.** Reset is disabled while no puzzle is loaded, as Share already is.

**R4d.** Once a new puzzle started from the New Puzzle button has loaded, focus goes to
the grid. Today it stays on New Puzzle. Changing difficulty does not move focus (the
fspec confirms today's behavior there).

**R5.** The action row is removed.

**R6.** Where the Left-handed switch is hidden today (narrow viewports, where the layout
already stacks), its menu entry is hidden too. The saved preference is kept.

### Statistics

**R7.** The statistics panel is removed from the page. A "Statistics" item in the menu
opens a dialog with the same content (the per-tier table with the current tier
highlighted). The statistics themselves are unchanged.

### Menu structure

**R8.** The menu is grouped into labelled sections (for example *Game* and *Settings*), so
that later features can be added without making it a flat list. Planned later items, none
built in this feature: Daily Puzzle, Favorites/History, Timer/Personal Bests, pencil-mark
assist, mistake highlighting, colorblind and high-contrast modes.

### Number pad tools

**R9.** The six tool buttons below the digits are rearranged into two columns of three
rows:

| Column 1: forward-looking | Column 2: backward-looking |
|---|---|
| Pen/Pencil | Undo |
| Coach | Clear |
| Hint | Erase all pencil |

Check stays on its own row below this block. All buttons keep their current behavior,
labels, badges, enabled/disabled rules and keyboard shortcuts.

**R10.** Tab order and screen-reader order go by column: Pen/Pencil → Coach → Hint →
Undo → Clear → Erase all pencil → Check. The number pad keeps today's keyboard model:
every button is its own Tab stop, and the arrow keys keep moving the grid selection.
The number pad is no longer exposed as a toolbar, because it has no toolbar arrow-key
behavior (decision 2026-11-27).

**R11.** Each column is a labelled group for assistive technology, so the
forward/backward grouping can be heard. The fspec fixes the wording.

### Accessibility

**R12.** The menu button and the menu are fully keyboard operable and correctly exposed to
assistive technology: expanded/collapsed state, the role of each item, and the state of
toggle-type items. Escape closes the menu. Focus returns somewhere sensible on close, and
after an item's dialog closes. R4a sets one case; the fspec covers the rest.

**R13.** Tab order and screen reader reading order stay logical. The header (including the
menu button) comes first, then the difficulty/New Puzzle cluster, then the grid, then the
controls.

### Focus visibility

**R14.** The grid gets a focus indicator, shown only for keyboard focus (decision
2026-11-27).

**R15.** In the Coffee theme, every focus indicator meets 3:1 contrast against its
background. This covers the existing ones (number pad, Difficulty selector, New Puzzle),
which are about 1.5:1 today. Scope added 2026-11-27.

## 3. Out of Scope

- The planned later items listed in R8.
- Dev mode. It stays URL-gated and gets no menu entry.
- Any number pad change beyond R9–R11.
- New statistics content or a reset-statistics action.

## 4. Resolved Questions

**Q1. The statistics panel.** Resolved 2026-11-27: move it to a dialog opened from the
menu (R7). This was Option B in the exploratory mockup.
