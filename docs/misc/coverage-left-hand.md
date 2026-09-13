# Code Coverage Report — Left-Hand Layout Mode (V4)

**Date:** 2026-09-13
**Test run:** 750 passing, 0 failing, 10 pending
**Coverage tool:** c8 via Playwright `page.coverage` (reproduce per CodeCoverageV2.md §6)
**Target (per CLAUDE.md):** 100% branch

## Headline

| Metric | Left-hand | V3 baseline | Delta |
|---|---|---|---|
| Statement | 95.92% | 95.89% | +0.03 |
| Branch | 91.94% | 91.88% | +0.06 |
| Function | 95.91% | 95.85% | +0.06 |
| Line | 95.92% | 95.89% | +0.03 |

## Files touched by this feature

| File | Branch | Notes |
|---|---|---|
| `js/ui/handedness.js` (new) | **100%** | All 10 branch pairs in tspec §3 exercised by UH1–UH19 |
| `js/main.js` | 73.33% (unchanged) | Two new unconditional calls, both executed; no new branches. Uncovered lines are the pre-existing V3 exception (fallback dialog, cancel wiring, restore guards) |

`index.html`'s inline head script is outside c8's `js/**` scope; its contract is covered
behaviorally by SYS6 (extracted and executed against a fake document) and SYS5/SYS8
(live page).

No new coverage gaps were introduced. Remaining project-wide gaps are the carried,
documented exceptions listed in CodeCoverageV3.md §2.
