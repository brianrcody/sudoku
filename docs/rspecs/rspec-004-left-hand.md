# Requirements Spec: Left-Hand Layout Mode
**ID:** rspec-004-left-hand
**Status:** Approved (Product Director decisions captured 2026-09-13)
**Date:** 2026-09-13
**Author:** Uber Developer (from Product Director direction)
**Source:** `docs/misc/v4featureCandidates.md` — Tier 1, "Left-Hand Layout Mode"

---

## 1. Overview

Left-handed players tapping the number pad reach across the board with the default layout,
covering the puzzle with their hand. Left-hand layout mode moves the control panel to the
left of the board.

## 2. Requirements

**R1.** A toggle switch in the page header, immediately to the left of the theme selector,
turns left-hand layout mode on and off.

**R2.** When on, the control panel — number pad (including mode/hint/undo/erase controls),
the New Puzzle / Reset action row, and the statistics panel — appears to the left of the
puzzle. When off (the default), the existing layout is unchanged.

**R3.** Everything currently stacked with the board (difficulty selector, grid, coach panel,
coach recap, generation progress card) stays with the board.

**R4.** The two columns swap; the board-plus-panel group remains centered as it is today.
The board is not pinned to page center.

**R5.** The preference persists across page loads and is applied before first render (no
flash of the default layout).

**R6.** On narrow viewports where the board and controls already stack vertically, the
mode has no effect and the toggle is hidden. The saved preference is retained and applies
whenever the viewport is wide.

**R7.** Keyboard Tab order and screen reader reading order are unchanged by the mode
(difficulty → grid → controls in both modes). Only the visual arrangement changes.

**R8.** The toggle is keyboard operable, correctly exposed to assistive technology as a
switch with its on/off state, and changes are announced to screen readers.

## 3. Out of Scope

- Mirroring the header itself (theme selector position, title position).
- The hamburger menu consolidation (separate V4 candidate); it will later absorb this
  toggle.
- Any change to the stacked mobile layout.
