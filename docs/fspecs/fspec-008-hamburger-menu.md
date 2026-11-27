# Functional Spec: Hamburger Menu and Control Consolidation
**ID:** fspec-008-hamburger-menu
**Status:** Final
**Date:** 2026-11-27
**Author:** Functional Designer
**Based on:** rspec-008-hamburger-menu; visual reference `docs/mockups/hamburger-menu-v1.html`
(Option B)

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Page Structure](#2-page-structure)
3. [The Next-Game Cluster](#3-the-next-game-cluster)
4. [The Menu Button and Menu](#4-the-menu-button-and-menu)
5. [Menu Items](#5-menu-items)
6. [The Statistics Dialog](#6-the-statistics-dialog)
7. [Number Pad Tools](#7-number-pad-tools)
8. [Focus Management](#8-focus-management)
9. [Keyboard](#9-keyboard)
10. [Screen Reader Announcements](#10-screen-reader-announcements)
11. [Edge Cases](#11-edge-cases)
12. [Overrides of Existing Specs](#12-overrides-of-existing-specs)
13. [Spec and Code Drift Found](#13-spec-and-code-drift-found)
14. [Open Questions](#14-open-questions)
15. [Out of Scope](#15-out-of-scope)

---

## 1. Scope and Conventions

Extends `fspec-001-v1.md`, `fspec-002-coach.md`, `fspec-004-left-hand.md` and
`fspec-006-puzzle-sharing.md`. Behavior not mentioned here is unchanged. §12 lists every
section of those specs that this one overrides.

**Terminology:**
- *Menu button* — the header control that opens and closes the menu.
- *Menu* — the popup list of items the menu button controls.
- *Open* / *closed* — whether the menu is displayed. A closed menu is hidden from all
  users, including assistive technology.
- *Next-game cluster* — the Difficulty selector and New Puzzle button, joined (§3).
- *Tool block* — the six number pad tool buttons arranged in two columns (§7).
- *Wide* / *narrow viewport* — as fspec-004 §1: the board column and control panel side
  by side, or stacked. The narrow breakpoint is the one at which the layout stacks.
- *Progress* — at least one player-entered pen digit on a board that is not won. This is
  the existing New Puzzle confirmation test (fspec-001 §9.1); it is not the fspec-006
  definition, which also counts pencil marks.

---

## 2. Page Structure

Document, focus and reading order, top to bottom (R13):

1. **Header:** the title, then the menu button at the header's right end.
2. **Next-game cluster:** Difficulty selector, New Puzzle.
3. **Grid**, with its overlays (win banner, coach arrows).
4. **Board column extras**, in their existing order: generation progress card, notice,
   coach explanation panel, coach recap.
5. **Control panel:** the number pad only. Digits 1–9, then the tool block, then Check.
6. **Footer.**

Removed from the page: the header theme selector, the header Left-handed switch, the action
row (New Puzzle, Reset, Share) (R5), and the statistics panel (R7).

The menu button is at the right end of the header in every layout: right-hand and
left-hand mode, wide and narrow viewports (R1). The header is never mirrored
(fspec-004 §3.2). This overrides the mockup, which moves the button left in left-hand
mode.

In left-hand mode the control panel and board column still exchange places on wide
viewports (fspec-004 §3.1). The next-game cluster is part of the board column and moves
with it. Focus and reading order stay as listed above in both modes (fspec-004 §5.2).

---

## 3. The Next-Game Cluster

### 3.1 Placement

New Puzzle sits beside the Difficulty selector, above the grid, joined with it into one
control (R2, R2a; the mockup's design). The visible "Difficulty" label stays. Both are
visible at every viewport width.

### 3.2 Behavior

Unchanged except for focus (§3.4):
- The Difficulty selector behaves as fspec-001 §3.2 and §9.3, including its confirmation.
- New Puzzle behaves as fspec-001 §9.1, including the "progress will be lost"
  confirmation.
- The win banner moves focus to New Puzzle when it appears (R3, fspec-001 §14.4).

### 3.4 Focus around a new game

**Requests from New Puzzle (R4d).** These rules apply however New Puzzle was pressed:
directly with no progress, after its progress-loss confirmation, or from the win banner,
where New Puzzle already has focus.

| Moment | Focus |
|---|---|
| New Puzzle pressed, no confirmation needed | Stays on New Puzzle while generating |
| Progress-loss confirmation confirmed | Returns to New Puzzle (the dialog's trigger) while generating |
| Progress-loss confirmation cancelled | Returns to New Puzzle. No request is made |
| While generating, before the busy card's Cancel appears | Unchanged. The player may move it anywhere |
| The busy card's Cancel appears (Diabolical and Nightmare, after the progress delay) | Moves to Cancel, but only if focus is still on New Puzzle (today's rule, fspec-003 §9.3) |
| **Puzzle loaded** | **The grid itself, with no cell selected**, provided focus is on New Puzzle, on the busy card's Cancel, or nowhere. If the player has moved focus elsewhere during generation, focus stays where it is |
| Cancel on the busy card | New Puzzle. The search is cancelled and "Puzzle search cancelled." is announced (unchanged) |
| Honest fallback offered (fspec-003 §5.4) | The offer dialog opens; Cancel in it has focus |
| Fallback accepted | The grid once the puzzle loads, as "Puzzle loaded" |
| Fallback declined | New Puzzle. The board is unchanged |
| Request fails | New Puzzle if focus was on the busy card's Cancel, which disappears, or nowhere; otherwise unchanged. The board is unchanged |

The guard on "Puzzle loaded" keeps a slow generation from pulling focus away from what the
player moved to meanwhile, for example the open menu. If the menu is open when the puzzle
loads, it stays open (§11). After the grid takes focus, the first arrow key or Home
selects row 1, column 1 (fspec-001 §5.2).

**Requests from the Difficulty selector.** Focus does not move to the grid. Today's
behavior is kept: once the puzzle at the chosen tier loads, focus is put on the Difficulty
selector (fspec-001 §9.3). Usually focus is already there, so nothing visibly moves. When
the change needed a confirmation, closing the dialog returns focus to the selector before
generation starts. Cancel on the busy card, a declined fallback and a failed request all
leave focus on the selector, or put it there if focus was on the busy card's Cancel or
nowhere. The busy card's Cancel does not take focus automatically for these requests,
because today's rule checks only for New Puzzle.

Today's code puts focus on the selector at load even if the player has moved focus
elsewhere during generation. This spec records that as current behavior and flags it
(§13 D10, §14 N1).

### 3.3 Accessibility

- The cluster is a group with accessible name **"Next game"**.
- The selector keeps its accessible name "Select difficulty level". New Puzzle keeps
  "Start new puzzle".
- Tab order: Difficulty selector, then New Puzzle, then the grid.

---

## 4. The Menu Button and Menu

### 4.1 The menu button

- A button with accessible name **"Menu"**. It declares that it opens a menu
  (`aria-haspopup="menu"`), names the menu it controls, and exposes its state through
  `aria-expanded` (true when open).
- Always enabled, including while a puzzle is generating and before the first puzzle has
  loaded.
- It is a normal Tab stop, and the first one on the page.
- The button shows an open state while the menu is open (Visual Designer).

### 4.2 Opening

| Trigger (menu closed) | Result |
|---|---|
| Click or tap the menu button | Menu opens; focus moves to the first visible item |
| Enter or Space on the focused button | Menu opens; focus moves to the first visible item |
| ArrowDown on the focused button | Menu opens; focus moves to the first visible item |
| ArrowUp on the focused button | Menu opens; focus moves to the last visible item |

The first visible item is always Statistics…. The last visible item is Left-handed on
wide viewports and Mountain (the last theme) on narrow ones.

Clicking the menu button is a click outside the grid and number pad, so it deselects the
selected cell (fspec-001 §4.2). Opening the menu from the keyboard does not change the
selection.

### 4.3 Closing

| Trigger (menu open) | Result | Focus afterwards |
|---|---|---|
| Escape | Menu closes | Menu button |
| Click or tap the menu button | Menu closes | Menu button |
| Tab | Menu closes | The next Tab stop after the menu button (the Difficulty selector) |
| Shift+Tab | Menu closes | Menu button |
| Click or tap outside the menu and menu button | Menu closes. The click then acts on its target as it normally would | The clicked element if it takes focus on click; otherwise the menu button (§8.2) |
| Activating Statistics…, Share puzzle or Reset puzzle… | Menu closes, then the item acts | See §8.1 |
| A dialog opens while the menu is open (§11) | Menu closes | Moves into the dialog |
| The win state begins while the menu is open (§11) | Menu closes | New Puzzle (R3) |

Activating a Theme item or Left-handed does **not** close the menu (§5.4, §5.5).

The menu stays open across window resizes, rotation and the narrow breakpoint (§11).

### 4.4 Navigation inside the open menu

The menu uses roving focus. Exactly one item is focusable at a time and Tab does not move
between items.

| Key | Action |
|---|---|
| ArrowDown | Next visible item; wraps from last to first |
| ArrowUp | Previous visible item; wraps from first to last |
| Home | First visible item |
| End | Last visible item |
| Enter or Space | Activate the focused item (§5) |
| A printable character | Type-ahead: focus moves to the next visible item, after the focused one and wrapping, whose visible label starts with that character (case-insensitive). No match: nothing happens |
| ArrowLeft, ArrowRight | Nothing |
| Escape, Tab, Shift+Tab | See §4.3 |

Navigation passes through section boundaries without stopping on headings, which are not
items. Hidden items (Left-handed on narrow viewports) are skipped by every key above.
Disabled items (Share puzzle and Reset puzzle… with no puzzle loaded) are not skipped;
they can be focused and their state heard.

Pointer: moving the pointer over an item highlights it as the focused item. Clicking or
tapping an item activates it.

### 4.5 Menu semantics

- The menu has `role="menu"` and accessible name "Menu".
- Each section is a `group` labelled by its visible heading (§5.1). Headings are not read
  twice: they are exposed only as the group's name.
- Item roles: Statistics…, Share puzzle and Reset puzzle… are `menuitem`. Each Theme
  choice is a `menuitemradio`, and exactly one has `aria-checked="true"`. Left-handed is a
  `menuitemcheckbox` whose `aria-checked` reflects the preference.
- Items that open a dialog (Statistics…, Reset puzzle…) declare it
  (`aria-haspopup="dialog"`).
- A disabled item uses `aria-disabled="true"` and stays focusable.

These are the mockup's choices, adopted unchanged. The menu roles expose the checked
state of Theme and Left-handed directly, which a disclosure with a plain list would not.

---

## 5. Menu Items

### 5.1 Structure and labels

| Section heading | Item (visible label) | Accessible name | Role | Closes menu |
|---|---|---|---|---|
| **Game** | Statistics… | Statistics | menuitem, opens dialog | Yes |
| | Share puzzle | Share puzzle link | menuitem | Yes, when enabled |
| | Reset puzzle… | Reset puzzle | menuitem, opens dialog | Yes, when enabled |
| **Settings**, subheading **Theme** | Minimalist | Minimalist | menuitemradio | No |
| | Coffee Shop | Coffee Shop | menuitemradio | No |
| | School | School | menuitemradio | No |
| | Digital Terminal | Digital Terminal | menuitemradio | No |
| | Mountain | Mountain | menuitemradio | No |
| **Settings** | Left-handed | Left-handed | menuitemcheckbox | No |

Group names for assistive technology: the Game items form the group "Game". The theme
choices form the group "Settings, Theme". Left-handed is alone in the group "Settings".

**Ellipsis convention:** a label ends in "…" exactly when activating the item always opens
a dialog. Share puzzle has none: it opens no dialog, and its copy-failed fallback is a
notice, not a dialog. The ellipsis is not part of any accessible name; `aria-haspopup`
carries that meaning instead.

Share puzzle may show secondary text ("Copy link", per the mockup). That text is
decorative and not part of the accessible name. Its accessible name "Share puzzle link" is
kept from fspec-006 §9 and contains the visible label.

New sections or items added later (R8) go in labelled groups of their own or join one of
these. This spec defines none.

### 5.2 Statistics…

1. The menu closes.
2. The Statistics dialog opens (§6).

Always enabled.

### 5.3 Share puzzle

**Enabled rule:** unchanged from fspec-006 §2.2. Enabled whenever a puzzle is loaded:
any tier including Unrated, in progress, or won (R4b). Disabled only while no puzzle is
loaded. The item's enabled state updates live, including while the menu is open.

**When enabled:**
1. The menu closes and focus moves to the menu button.
2. The share action runs as fspec-006 §2.3 steps 2–5.
3. **Copy succeeded:** the "Link copied to clipboard." notice appears and the text is
   announced. Focus stays on the menu button.
4. **Copy failed:** the Link notice appears. Its read-only field takes focus with its
   whole content selected, as fspec-006 §2.3 step 5 requires. When the notice's Dismiss
   button is used, focus returns to the menu button.

**When disabled:** activation does nothing. The menu stays open and focus stays on the
item.

### 5.4 Reset puzzle…

**Enabled rule (R4b, R4c):** the same as Share puzzle. Enabled whenever a puzzle is
loaded, including in progress, won, Unrated, and while the next puzzle is generating with
a puzzle still on the board. Disabled only while no puzzle is loaded. The item's enabled
state updates live, including while the menu is open.

**When disabled:** the same treatment as Share puzzle (§5.3). It is `aria-disabled`,
stays focusable, and activation does nothing: no dialog, no announcement. The menu stays
open and focus stays on the item.

**When enabled:**
1. The menu closes.
2. The Reset confirmation opens, unchanged from fspec-001 §9.2: "Reset puzzle? Your
   entries will be cleared." [Cancel] [Reset]. Cancel has focus.
3. **Confirmed:** the puzzle resets (fspec-001 §9.2 steps 1–7). The reset leaves no cell
   selected. "Puzzle reset." is announced. Focus moves to the grid itself, not to a cell
   (R4a). The next arrow key or Home selects row 1, column 1 (fspec-001 §5.2).
4. **Cancelled** (Cancel or Escape): nothing changes. Focus moves to the menu button.

The confirmation always appears, even when the board has no player entries. That is
today's behavior and fspec-001 §9.2 calls for it; R4 keeps it.

### 5.5 Theme items

1. Activating a theme that is not current applies it immediately, with no confirmation and
   no reload (fspec-001 §12.2). It is saved as today (fspec-001 §12.3).
2. The checked state moves to that item.
3. "Theme changed to *Theme name*." is announced.
4. The menu stays open and focus stays on the item, so the player can see the result
   and try another without reopening the menu.

Activating the theme that is already current does nothing and announces nothing, matching
the current selector, which fires no change for the same value.

The theme list and names are unchanged.

### 5.6 Left-handed

1. Activating the item flips the preference, exactly as fspec-004 §2.3 steps 2–5: the
   layout changes immediately, the preference is saved, and the existing announcement is
   made (fspec-004 §5.3).
2. `aria-checked` updates.
3. The menu stays open and focus stays on the item.

The menu stays attached to the menu button while the columns swap beneath it. The header
is not mirrored.

**Narrow viewports (R6):** the item, and its "Settings" group, are hidden from all users,
including assistive technology. The saved preference is kept, unchanged and uncleared
(fspec-004 §3.3).

Non-interference (fspec-004 §2.4) still holds for both Theme and Left-handed: game state
is unchanged and nothing is undoable.

---

## 6. The Statistics Dialog

### 6.1 Contents

- Title: **"Statistics"**.
- The statistics table now shown in the panel, unchanged: one row per tier in tier order,
  with columns Level, Tried, Won.
- The row for the current puzzle's tier is marked. With an Unrated puzzle no row is marked
  (fspec-006 §6). Before the first puzzle has loaded, no row is marked.
- One button: **Close**.

There is no reset-statistics action and no new content (R7, out of scope). Values are read
when the dialog opens and are correct for as long as it stays open.

### 6.2 Behavior

- Modal, like the confirmation dialog: the page behind it is inert, and focus is trapped
  in the dialog.
- On open, focus moves to Close.
- **Closes on:** Close (click, tap, Enter, Space) or Escape. A click on the backdrop does
  nothing, matching the confirmation dialog.
- On close, focus moves to the menu button. The menu stays closed.
- Opening and closing the dialog changes no game or statistics state.

### 6.3 Accessibility

- `role="dialog"`, `aria-modal="true"`, labelled by its title.
- The table keeps its accessible name "Game statistics by difficulty", with column
  headers exposed as headers.
- Each row's accessible name gives the tier and both counts, as today ("*Tier*: *N*
  attempted, *M* won"). **Change from today:** the marked row's name also identifies it as
  the current level, for example "Medium, current level: 4 attempted, 2 won". Today the
  current row is marked only visually (§13 D6), which falls short of the screen-reader
  requirement. Exact wording is the Architect's choice within this pattern.

---

## 7. Number Pad Tools

### 7.1 Arrangement (R9)

The digit buttons are unchanged and come first. Below them are the six tool buttons in two
columns of three rows:

| Row | Column 1: group "Input and help" | Column 2: group "Corrections" |
|---|---|---|
| 1 | Pen/Pencil | Undo |
| 2 | Coach | Clear |
| 3 | Hint | Erase all pencil |

Check is on its own row below the block, outside both groups, on the tiers where it is
shown. The Hard-and-above completion message keeps its current place in the number pad
and is outside both groups.

Every button keeps its current label, badge, accessible name, enabled and disabled rules,
mode states and keyboard shortcut. That includes fspec-002 §2.6 for the Coach states and
fspec-006 §6 for Unrated.

### 7.2 Order (R10)

Tab and screen-reader order: digits 1–9 → Pen/Pencil → Coach → Hint → Undo → Clear →
Erase all pencil → Check.

Today's order is digits → Clear → Pen/Pencil → Erase all pencil → Undo → Hint → Coach →
Check.

Disabled buttons are skipped by Tab, as today. A hidden Check is absent.

**Keyboard model (R10): unchanged.** Every enabled button in the number pad is its own
Tab stop. There is no arrow-key movement between number pad buttons. Arrow keys keep
moving the grid selection whenever a cell is selected and focus is not in a text field,
including while a number pad button has focus (fspec-001 §4.2, §5.2).

### 7.3 Group names (R11)

The groups are labelled for assistive technology and need no visible heading:
- Column 1: **"Input and help"**
- Column 2: **"Corrections"**

"Next steps", the working name for column 1, is not used. Pen/Pencil switches the input
mode and is not a step, so the name would mislabel the column's first button. "Input and
help" covers the mode toggle and both assists. "Corrections" is kept.

**Number pad semantics (R10).** The number pad is no longer exposed as a toolbar, because
it has no toolbar arrow-key behavior. It is a `group` with accessible name **"Number
pad"**. Inside it:
- The digit buttons are exposed as today: their accessible names are "Enter 1" to "Enter
  9", with no grouping of their own.
- The two column groups, "Input and help" and "Corrections".
- Check, outside both column groups.

Screen readers announce the group name when focus enters a column.

---

## 8. Focus Management

### 8.1 After each menu action and close

| Event | Focus goes to |
|---|---|
| Menu opened | First visible item (last on ArrowUp) |
| Escape in the menu | Menu button |
| Tab out of the menu | Next Tab stop after the menu button (the Difficulty selector) |
| Shift+Tab out of the menu | Menu button |
| Outside click or tap | The clicked element if it takes focus on click; otherwise the menu button |
| Menu button clicked while open | Menu button |
| Theme item or Left-handed activated | Stays on the item; menu open |
| Disabled Share puzzle or Reset puzzle… activated | Stays on the item; menu open |
| Statistics dialog opened | Close button |
| Statistics dialog closed | Menu button |
| Share: copy succeeded | Menu button |
| Share: copy failed | The notice's link field, with its content selected |
| Share: Link notice dismissed | Menu button |
| Reset confirmation opened | Cancel |
| Reset cancelled (Cancel or Escape) | Menu button |
| Reset confirmed | The grid (no cell selected) (R4a) |
| Win while the menu is open | New Puzzle (R3) |
| Puzzle started from New Puzzle has loaded | The grid, with the guard in §3.4 (R4d) |
| Puzzle started from the Difficulty selector has loaded | The Difficulty selector (§3.4) |
| Busy card Cancel, declined fallback, failed request | The control that started the request (§3.4) |

### 8.2 Rules behind the table

- **Return to the menu button, not the item.** Every action item closes the menu, so its
  own element is gone. Focus returns to the visible control that launched it. This
  replaces fspec-001 §14.4 "returns to the element that triggered it" for dialogs opened
  from the menu, and fspec-006 §9 "focus returns to Share".
- **Outside click.** Grid cells take focus on click, so focus lands there and the cell is
  selected as usual. Number pad buttons deliberately do not take focus on click
  (fspec-001 §4.2), and neither does empty page area. In those cases focus goes to the
  menu button. It never stays on a hidden menu item.
- **Copy-failed field takes focus.** fspec-006 requires it and the player's next action is
  to copy, so this spec keeps it.

---

## 9. Keyboard

### 9.1 Game shortcuts while focus is in the menu

While focus is on a menu item, keys act on the menu (§4.4) and never on the game:

| Key | While a menu item has focus |
|---|---|
| 1–9 | Type-ahead only. No item label starts with a digit, so nothing happens; no digit is entered |
| P, C and other letters | Type-ahead only. Pen/Pencil does not toggle and Coach does not run. "C" moves to Coffee Shop |
| Backspace, Delete | Nothing |
| Arrow keys | Menu navigation (Up/Down) or nothing (Left/Right); the grid selection does not move |
| Home, End | First or last item; the grid is not focused |
| Ctrl+Z / Cmd+Z | Nothing; no undo |
| Escape | Closes the menu (§4.3) |

This overrides fspec-002 §3.1, which lets `C` fire whenever a non-text element has focus,
and fspec-001 §5.2 for these keys. With focus on the closed menu button, every shortcut
behaves as on any other button today.

### 9.2 No shortcut for the menu

No key opens the menu from elsewhere on the page. The menu, Theme and Left-handed gain no
shortcuts (fspec-004 §7 already excludes one for Left-handed).

### 9.3 Escape precedence

Only one of these can be open at a time (§11): the menu, a confirmation dialog, or the
Statistics dialog. Escape closes whichever is open. With none open, Escape does nothing
new.

---

## 10. Screen Reader Announcements

All announcements go through the existing assertive live region (fspec-001 §14.3).

| Event | Announcement |
|---|---|
| Menu opened or closed | None. The menu button's expanded state and the focus move convey it |
| Statistics dialog opened | None. The dialog's role and title are read as focus enters |
| Share: copy succeeded | "Link copied to clipboard." (unchanged) |
| Share: copy failed | "Couldn't copy automatically. The link is shown for you to copy." (unchanged) |
| Share or Reset activated while disabled | None. The item already reads as unavailable |
| Reset confirmed | "Puzzle reset." (existing) |
| Reset cancelled | None |
| Theme changed | "Theme changed to *Theme name*." (existing) |
| Same theme re-chosen | None |
| Left-handed on / off | fspec-004 §5.3 strings, unchanged |
| Left-handed item hidden or shown at the breakpoint | None |

No announcement on page load.

---

## 11. Edge Cases

| Case | Behavior |
|---|---|
| Menu open when a confirmation dialog opens without player action (fspec-006 §4.3 replace confirmation, fspec-003 §5.4 substitute offer) | The menu closes first. The dialog takes focus. When the dialog closes, focus returns to the menu button, not to the hidden item that had focus |
| Opening the menu while any dialog is open | Not possible: the modal dialog makes the header inert |
| Menu open when a puzzle finishes generating or loading | The menu stays open and focus stays in it: the §3.4 guard does not move focus to the grid. Share puzzle and Reset puzzle… become enabled if they were disabled. The Statistics dialog, opened later, marks the new tier |
| Menu open when generation starts | Only reachable through developer tools or a share-link load, since starting a game from the cluster closes the menu first. The menu stays open; Share stays enabled (a puzzle is still on the board) |
| Menu open when the win state begins | Not reachable through normal input: every move closes the menu first. If it happens (developer tools), the menu closes and focus goes to New Puzzle (R3) |
| Viewport crosses the narrow breakpoint, menu open | The menu stays open. Left-handed is hidden or shown. If Left-handed had focus when it was hidden, focus moves to the last theme item (Mountain) |
| Stored left-hand preference on a narrow viewport | Stacked layout; Left-handed item hidden; preference kept (R6) |
| Share puzzle with no puzzle loaded (first boot, before generation finishes) | Disabled: focusable, read as unavailable, activation does nothing (§5.3) |
| Share during generation of the next puzzle | Enabled; shares the puzzle on the board (unchanged) |
| Reset with no puzzle loaded (first boot, before generation finishes) | Disabled, like Share (§5.4, R4c) |
| Reset with no player entries | The confirmation still appears; confirming changes nothing visible and announces "Puzzle reset." (today's behavior) |
| Reset after a win | Enabled; confirming reverts to the givens and re-enables input (fspec-001 §10.2, R4b) |
| Reset while a coach session is active | The coach session ends on confirm (fspec-002 §11.2) |
| Reset during generation of a new puzzle | Unchanged from today: the reset applies to the board on screen, which the new puzzle then replaces |
| Statistics opened while generating | The dialog marks the tier of the puzzle on the board. If the new puzzle lands while the dialog is open, the mark moves to its tier |
| Statistics with an Unrated puzzle | No row marked |
| Theme or Left-handed activated while a cell is selected | Clicking the menu button to open the menu has already deselected the cell (§4.2). Keyboard activation does not change the selection |
| Coach session open while using the menu | Unaffected by opening, navigating or closing the menu, or by Theme, Left-handed and Statistics. Coach highlights and arrows stay correct when the layout swaps (fspec-004 §6) |
| Copy-failed notice showing, then Share used again | The new notice replaces the old one (fspec-006 §8) |
| Rapid Left-handed activation | As fspec-004 §6: each activation flips and announces |
| Cookies blocked | Theme and Left-handed still apply for the session; nothing is retained. No error |

---

## 12. Overrides of Existing Specs

| Spec § | Was | Now |
|---|---|---|
| fspec-001 §2 | Theme selector, New Puzzle/Reset and the statistics display visible at all times | Theme, Reset and statistics are in the menu (statistics in a dialog). New Puzzle is in the next-game cluster. Everything needed during play stays on screen |
| fspec-001 §5.1 | Pad contents list | Pad order and grouping per §7 |
| fspec-001 §9.1 | Focus "returns to the grid on dismiss" | Cancel returns focus to New Puzzle; the grid takes focus once the new puzzle has loaded (§3.4, R4d) |
| fspec-001 §9.2 | Reset is an on-page button, always available. Focus "returns to the grid on dismiss" | Reset is a menu item, disabled with no puzzle loaded (R4c). Confirm → grid; cancel → menu button (§8) |
| fspec-001 §9.3 | Focus returns to the selector once the puzzle has loaded | Unchanged, and extended to cancel, fallback and failure (§3.4) |
| fspec-001 §10.2–10.3 | "Tap … Reset" | Reset is reached through the menu; behavior unchanged |
| fspec-001 §11.2 | Panel always visible on the page | Statistics dialog (§6) |
| fspec-001 §12.2 | Theme selector always on the page | Theme items in the menu (§5.5) |
| fspec-001 §14.1 | Lists Reset and the theme selector among page controls; order left-to-right | Order per §2 and §7.2; menu keyboard per §4.4 |
| fspec-001 §14.2 | — | Adds the menu, cluster, number pad group and statistics-row semantics of §3.3, §4, §6.3, §7.3 |
| fspec-001 §14.4 | Dialog close returns focus to the trigger | Unchanged for dialogs opened from on-page controls; menu-launched dialogs per §8. This is the rule wherever fspec-001 §9.1–9.2 said otherwise |
| fspec-001 §14.1 (number pad) | Number pad exposed as a toolbar (code) | A labelled group, "Number pad", with no arrow-key movement inside it (§7.3, R10) |
| fspec-001 §5.2, fspec-002 §3.1 | Shortcuts (including `C`) fire while a button has focus | Not while a menu item has focus (§9.1) |
| fspec-002 §3.1 | Coach "alongside the Hint button" | Coach above Hint in column 1 (§7.1); Tab order per §7.2 |
| fspec-004 §1 | Control panel includes the action row and statistics panel | Control panel is the number pad only |
| fspec-004 §2.1 | Header switch left of the theme selector | Menu item under Settings (§5.6) |
| fspec-004 §2.3 step 1, step 6 | Click the switch; focus stays on the toggle | Activate the menu item; focus stays on the item, menu open |
| fspec-004 §3.2 | Toggle and theme selector stay right in the header | The menu button stays right in the header (R1) |
| fspec-004 §3.3, §5.1 | `role="switch"`; hidden on narrow viewports | `menuitemcheckbox`; hidden on narrow viewports (R6) |
| fspec-004 §5.2 | Order: title, toggle, theme selector → difficulty → grid → number pad, action row, statistics → footer | Order per §2 |
| fspec-004 §7 | "Relocating the toggle into a hamburger menu" out of scope | Done by this spec |
| fspec-006 §2.1 | Share button in the action row | Share puzzle in the menu's Game section |
| fspec-006 §2.3 step 6 | Focus stays on Share | Focus on the menu button (§5.3) |
| fspec-006 §6 | "Statistics panel: no row marked" | Applies to the Statistics dialog |
| fspec-006 §9 | Share is a native button, disabled when unavailable; Dismiss returns focus to Share | `menuitem` with `aria-disabled`; Dismiss returns focus to the menu button |

---

## 13. Spec and Code Drift Found

Found while writing this spec. Items marked *resolved* are settled by this spec's
overrides (§12). The rest are records for the Orchestrator to correct in the older specs
or the code. This spec does not change them.

- **D1. Number pad toolbar has no toolbar keyboard model.** *Resolved by R10 (§7.2,
  §7.3).* `js/ui/numpad.js` declares `role="toolbar"`, but every button is its own Tab
  stop and there is no arrow-key handling inside the pad. Decision 2026-11-27: keep that
  keyboard model and expose the pad as a labelled group instead of a toolbar.
- **D2. fspec-001 contradicts itself on dialog focus return.** *Resolved where it
  applies.* §9.1 and §9.2 say focus "returns to the grid on dismiss". §14.4 says it
  "returns to the element that triggered it", and the code (`js/ui/dialog.js`) does that.
  This spec sets each case: New Puzzle cancel returns to New Puzzle (§3.4), Reset cancel
  returns to the menu button (§5.4), and other on-page dialogs return to their trigger
  (§12, fspec-001 §14.4). The fspec-001 §9.1–9.2 wording should still be corrected.
- **D3. Reset confirm focus.** *Resolved by R4a (§5.4).* The code focuses the Reset
  button after a confirmed reset. fspec-001 says the grid or the trigger.
- **D4. New Puzzle focus after load.** *Resolved by R4d (§3.4).* The code returns focus
  to New Puzzle once the new puzzle has loaded; fspec-001 §9.1 says the grid. The grid now
  takes focus, with the §3.4 guard.
- **D5. Announcements missing from fspec-001 §14.3.** The code announces "Puzzle reset.",
  "Theme changed to *X*." and, from the Pen/Pencil button only (not the `P` key),
  "Mode: Pen/Pencil". This spec writes down the first two as existing behavior (§10).
  The mockup uses "Theme: *X*" and makes no Left-handed announcement. The code's strings
  are kept.
- **D6. Current statistics row is marked only visually.** *Resolved (§6.3).* The row's
  accessible name does not say it is current. The current row's name now identifies it.
- **D7. Reset with no puzzle loaded.** *Resolved by R4c (§5.4).* The Reset button had no
  disabled state. Before the first puzzle loaded, confirming did nothing to the board but
  still announced "Puzzle reset.". Reset is now disabled with no puzzle loaded.
- **D8. Coach visibility before a puzzle.** fspec-002 §3.1 says Coach "is not shown
  before a puzzle is loaded". The code always renders it, and pressing it with no puzzle
  does nothing. Not changed here.
- **D9. Busy-card Cancel drops focus.** *Resolved for focus (§3.4).* When Cancel is
  pressed, or a request fails while Cancel has focus, the card disappears and focus is left
  on nothing (`js/game/foreground.js`, `js/ui/busy.js`). This spec sends focus back to the
  control that started the request. A failed request also shows and announces nothing
  today, so the player gets no indication; this spec does not change that.
- **D10. Difficulty change takes focus back at load.** The code puts focus on the
  Difficulty selector when the puzzle at the chosen tier loads, even if the player moved
  focus elsewhere during generation (`_afterNewPuzzle('difficulty-select')` in
  `js/main.js`). It is harmless when focus never left the selector, which is the usual
  case, but it can pull focus out of the grid or the menu after a slow generation.
  Specified as current behavior (§3.4); see §14 N1.
- **D11. Busy-card Cancel auto-focus applies only to New Puzzle.** The rule that moves focus
  to Cancel when it appears checks for focus on New Puzzle only, so requests from the
  Difficulty selector never get it. Recorded; not changed here.

---

## 14. Open Questions

None block this spec. Q1–Q3 were decided by the Product Director on 2026-11-27 and are
now rspec-008 R10, R4c and R4d. The item below is non-blocking.

**N1. Guard on the Difficulty selector's focus at load (D10).** The New Puzzle path
moves focus at load only if the player has not moved it elsewhere (§3.4). The Difficulty
path takes focus back unconditionally, as today. Applying the same guard there would make
the two paths consistent and stop a slow generation from pulling focus out of the grid or
the menu. *Resolved 2026-11-27: keep today's behavior.* The Product Director directed
that Difficulty-change focus stay as it is.

---

## 15. Out of Scope

Per rspec-008 §3:
- The planned later menu items in R8 (Daily Puzzle, Favorites/History, Timer/Personal
  Bests, pencil-mark assist, mistake highlighting, colorblind and high-contrast modes).
- A dev-mode entry in the menu. Dev mode stays URL-gated.
- Number pad changes beyond R9–R11.
- New statistics content and a reset-statistics action.

Also not covered here: visual treatment of the menu, the cluster, the tool block and the
dialog (Visual Designer), and implementation (Architect).
