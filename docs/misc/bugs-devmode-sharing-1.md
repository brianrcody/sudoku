# Bug Report — Developer Mode + Puzzle Sharing, Test Run 1
**Date:** 2026-11-13
**Run result:** 1070 passing, 5 failing, 10 pending
**Status:** all closed in run 2 (1075 passing, 0 failing)

---

## B1 — Text fields unreadable in the Coffee theme

**Failures:**
- `SHR37: Share and the notice are legible in every theme…` —
  `link field, coffee: expected 1.19 to be above 4.5`
- `DVI24: developer UI is legible in every theme…` —
  `load field, coffee: expected 1.19 to be above 4.5`

**Triage:** **Production bug.** The share-link fallback field, the dev load field, and the
coach JSON block used `var(--text)` on `var(--bg)`. In four themes `--bg` is a light page
tint; in Coffee it is the dark page backdrop (`#3b2a1a`) while `--text` (`#2b1d0e`) is
tuned for `--surface`. Contrast 1.19:1 — effectively invisible.

**Reproduction:** Coffee theme → Share with the clipboard unavailable; or `?dev=1` → open
"Load puzzle from string".

**Fix:** inset fields use `var(--given-bg)`, which every theme defines as a tint of its
surface. **Changed:** production (`css/controls.css`, `css/dev.css`) and both vspecs.

## B2 — Link-variant notice rendered as a narrow monospace block

**Found by:** scripted visual pass before the first test run (screenshot at 390px).

**Triage:** **Production bug.** The link field's class was `notice-link`, which is also
the variant class `show()` puts on the card (`notice-<variant>`), so the field's
`display: block` and monospace rules applied to the whole card.

**Fix:** field class renamed `notice-field`. **Changed:** production (`notice.js`,
`controls.css`), aspec.

## B3 — Notice overflowed narrow viewports

**Found by:** same visual pass; pinned afterwards by SHR36.

**Triage:** **Production bug.** `width: 414px; max-width: 100%` on the card resolved its
percentage against `#notice-root`, which is shrink-to-fit in the stacked layout because
the board column centres its children. The card stayed 414px wide at 390px.

**Fix:** the width rules moved to `#notice-root`. **Changed:** production
(`controls.css`), vspec-006.

## B4 — DP13 / DP34 expected zero dispatches

**Failures:** `DP13: running the solver changes nothing in the game`,
`DP34: switching off restores the player's marks…` — `expected [ { type: 'DESELECT' }, … ]
to have a length of 0`.

**Triage:** **Test bug.** `ui/grid.js` deselects on any click outside the grid
(fspec-001 §4.2); clicking a dev control legitimately dispatches `DESELECT`. The tests
meant "no board-changing action".

**Fix:** assertions filter out `DESELECT`. **Changed:** test only.

## B5 — DVI8 read game state before the frame existed

**Failure:** `DVI8: a shared link opened with developer mode on records nothing` —
`Cannot read properties of undefined (reading 'getState')`.

**Triage:** **Test bug.** The test polled for `p` to leave the URL with its own predicate,
which is trivially true on the iframe's initial `about:blank`. The shared helper
`waitForLinkHandled` also requires the app to have booted.

**Fix:** use `waitForLinkHandled`. **Changed:** test only.
