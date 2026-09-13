# Bug Report — Left-Hand Layout, Test Run 1
**Date:** 2026-09-13
**Run result:** 748 passing, 2 failing, 10 pending

---

## B1 — SYS7 expected selection to persist across a toggle click

**Failure:** `system tests: left-hand layout SYS7: toggling the switch swaps the layout
without disturbing game state` — `expected null to equal 4`.

**Triage:** **Spec error (fspec-004), not a production bug.** fspec-004 §2.4 and §6 claimed
the selected cell persists when the toggle is clicked. fspec-001 §4.2 already mandates that
clicking outside the grid deselects, with only the number pad exempt; `grid.js`'s document
click handler implements exactly that, and the theme selector already behaves this way.
The switch is outside both regions, so deselection is the specified behavior. This is an
interpretation consistent with an existing rule, not a new product decision.

**Reproduction:** select a cell, click the Left-handed switch → selection cleared.

**Fix:** amend fspec-004 §2.4/§6 to reference the fspec-001 §4.2 rule; amend tspec SYS7 and
the test to assert `selected === null`. **Changed:** spec + test. Production unchanged.

## B2 — GF18 "focus in BUTTON prevents undo" regressed

**Failure:** `integration/game-flows GF18: keyboard guard: focus in BUTTON prevents undo` —
`expected null not to be null` (undo ran).

**Triage:** **Test bug exposed by new markup.** The test focuses
`document.querySelector('button')`. The handedness switch is now the first `<button>` in
the document, and in the test's 1px iframe it is `display: none` (mobile hide), so
`focus()` is a no-op, focus stays on `<body>`, the BUTTON guard in `keyboard.js` is never
engaged, and Ctrl+Z undoes. `keyboard.js` behaves correctly.

**Reproduction:** in a ≤720px viewport, `querySelector('button').focus()` → `activeElement`
is `<body>`.

**Fix:** target `#btn-new` (always displayed). **Changed:** test only.
