# Review Report — Left-Hand Layout Mode (v1)
**Date:** 2026-09-13
**Reviewer:** Uber Developer (Review stage)
**Specs:** fspec-004-left-hand, vspec-004-left-hand, aspec-left-hand
**Verdict:** **Sign-off** — no blockers.

Verification method: code read against each spec section, plus a scripted Playwright pass
against the running app (1100px, 721px, 720px, 400px viewports; cookie pre-seeded; Space
and Enter activation; computed styles and bounding rects; console error capture).

---

## 1. Functional Spec Fidelity

| fspec § | Requirement | Result |
|---|---|---|
| 2.1 | Switch labeled "Left-handed", in header, left of theme selector | ✓ `index.html` `.header-controls` |
| 2.2 | Off = board left; On = controls left | ✓ numpad rect left 211 < grid left 475 with cookie `left` |
| 2.3.1–2 | Click/tap (incl. label), Space, Enter; immediate flip | ✓ label is button content; Space → right, Enter → left observed |
| 2.3.3 | No animated column transition | ✓ no transition on `.game-area` |
| 2.3.4 | Preference saved | ✓ cookie `sudoku.hand=right` after Space |
| 2.3.5 | Announcement | ✓ live region text matches §5.3 |
| 2.3.6 | Focus stays on toggle | ✓ `activeElement` = `hand-toggle` after activation |
| 2.4 | No game-state interaction; not undoable; outside-click deselect rule applies | ✓ `handedness.js` imports only `cookies` + `srLive`; no dispatch. (Deselect rule clarified in fspec during Stage 8 — see `bugs-left-hand-1.md`) |
| 3.1 | Columns swap; internals, gap, centering unchanged | ✓ `row-reverse` only |
| 3.1 | Board overlays follow board | ✓ win banner and `#coach-overlay` are absolute inside `.grid-wrapper` |
| 3.2 | Header not mirrored | ✓ |
| 3.3 | Narrow: stacked, toggle hidden, preference retained, live reflow on resize | ✓ 720px → `column`, toggle `display:none`; 721px → `row-reverse`; attribute untouched |
| 4 | Cookie, default right, unknown → right, applied before first render | ✓ `data-hand` already `left` at `DOMContentLoaded`; `initHandedness` normalizes |
| 5.1 | `role="switch"`, `aria-checked` accurate, name "Left-handed", focusable, focus ring, hidden from AT when narrow | ✓ (`display:none` removes from AT) |
| 5.2 | Tab/reading order unchanged | ✓ by construction (CSS-only swap) |
| 5.3 | Exact announcement strings; none on load | ✓ `initHandedness` passes `shouldAnnounce=false` |
| 6 | Dialog open blocks toggle | ✓ `.modal-backdrop` is `position: fixed; inset: 0; z-index: 100` and traps Tab |
| 6 | Cookies blocked → session-only | ✓ attribute is source of truth; cookie write failure is silent |

## 2. Visual Design Spec Fidelity

| vspec § | Result |
|---|---|
| 1 `.header-controls` gap 20px | ✓ `base.css` |
| 2.2 dimensions, colors, label, hover | ✓ `controls.css` byte-identical to approved mockup block |
| 2.3 on/off/focus states | ✓ |
| 2.4 Coffee/Mountain/Terminal overrides | ✓ screenshot check (Coffee, left mode) |
| 2.5 motion + reduced-motion | ✓ |
| 3 swap query is the exact complement of 720px breakpoint | ✓ verified at 720/721px |
| 4 responsive hide | ✓ |
| 5 theme-select focus fix | ✓ specificity `(1,3,1)` beats `#theme-select:focus` `(1,1,0)` |

## 3. Architectural Plan Fidelity

| aspec § | Result |
|---|---|
| 2 files touched | ✓ matches (tests/docs verified in Stages 7–8) |
| 3 `<html data-hand>`, absent when right | ✓ |
| 4 API: `getHandedness`, `applyHandedness`, `initHandedness`, `bindHandToggle` | ✓ signatures and behavior match; JSDoc present |
| 5 inline script extension | ✓ |
| 7 CSS placement (swap rule before mobile block; switch section after theme selector) | ✓ |
| 8 bootstrap steps 2 and 8, no null guard | ✓ |
| No new dependencies, no server code | ✓ |

## 4. Non-Blocking Observations

1. **Static `aria-checked="false"`** in `index.html` is corrected by `bindHandToggle` at
   bootstrap step 8. A screen reader user who reaches the switch in the milliseconds before
   `main.js` finishes its top-level `await stats.init()` could hear "off" for a left-hand
   user. Accepted per aspec §6; not practically reachable.
2. **fspec-001 §14.1 override** (focus order ≠ visual order in left-hand mode) is a
   deliberate Product Director decision, recorded in fspec-004 §5.2.
3. **Mockup renders one captured puzzle** with two visually selected cells (a capture
   artifact). Irrelevant to the implementation.
