# Review: Hamburger Menu and Control Consolidation — v2

**Reviewer:** Reviewer subagent
**Date:** 2026-11-27
**Scope:** the fixes for v1 blocker B1 and v1 observation 1 in `js/ui/menu.js` only. Everything
else stands as reviewed in `review-hamburger-menu-v1.md`.
**Verdict:** **Signed off.** B1 is resolved, observation 1 is resolved, and I found no regressions.

## 1. Changes reviewed

- `_setCurrent(item)` moves the roving `tabindex="0"` and never moves focus. `_focusItem` now
  calls it and then `focus()`.
- A `focusin` listener on `#app-menu` calls `_setCurrent` when the focused `.mi` is not
  `_current`. This fixes B1. The guard makes `_focusItem`'s own focus a no-op.
- A `mousedown` on `#app-menu` outside any `.mi` is `preventDefault`ed. This fixes observation 1.

Both match the amended aspec §4.5 and §4.8. The tspec adds MN115 and MN116 for them.

## 2. Verification (headless Chromium, real `index.html`)

| Check | Result |
|---|---|
| B1 repro (400px, touch): tap School | Focus is on School, which alone has `tabindex="0"` |
| … then ArrowDown | Digital Terminal (was Share puzzle in v1). Pass |
| … type-ahead `d` | Stays on Digital Terminal, the only "d" item. Pass |
| Tap or click a heading or the menu padding | Focus stays on the current item; menu open. Pass |
| … then ArrowUp / ArrowDown | Moves from that item. Pass |
| Keyboard open, ArrowUp wrap, Home/End, type-ahead `c` (and repeat) | Statistics → Left-handed → Coffee Shop (repeat stays). Pass |
| Mouse hover | Focus and `tabindex` follow the pointer. Pass |
| Click theme item | Applied; menu open; focus on item. Pass |
| Tab / Shift+Tab out | Difficulty selector / menu button; menu closed; no item keeps `tabindex="0"`. Pass |
| Escape; Statistics open → Escape | Menu button. Pass |
| Outside click on a digit / a cell / the menu button again | Menu button / the cell / menu button, menu closed. Pass |
| Short viewport (300px): menu scrolls with the wheel despite the `mousedown` rule | `scrollTop` 200. Pass |

## 3. Notes

- The `focusin` listener can fire only for visible items, because a closed menu is `hidden`.
  So it cannot set `_current` while the menu is closed, and `close()` still resets it.
- I did not re-run `npm test` for this change. The MN115 and MN116 unit tests will be added by
  the QE Test Writer.
