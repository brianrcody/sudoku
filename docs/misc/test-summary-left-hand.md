# Test Execution Summary — Left-Hand Layout Mode (V4)

**Date:** 2026-09-13
**Final run:** **750 passing / 0 failing / 10 pending** (26 new tests: UH1–UH19, AR-H, SYS5–SYS10)
**Branch coverage:** 91.94% overall; `handedness.js` 100% (`coverage-left-hand.md`)
**Reviewer:** clean sign-off (`review-left-hand-v1.md`)
**Open bug reports:** none

## Iteration history

1. **Run 1:** 748 passing, 2 failing (`bugs-left-hand-1.md`).
   - B1 (SYS7): fspec-004 wrongly promised selection survives a toggle click; fspec-001
     §4.2's outside-click deselect rule governs. Spec + test corrected; no production change.
   - B2 (GF18): existing test focused the first `<button>` in the page, now the switch,
     which is `display: none` in its 1px iframe. Test retargeted to `#btn-new`.
2. **Run 2:** 750 passing, 0 failing. B1 and B2 closed.

## Exit criteria (project CLAUDE.md)

| Criterion | Status |
|---|---|
| All tests pass | ✓ 750/750 (10 pre-existing documented skips) |
| Branch coverage 100% | ✓ for all new code (`handedness.js`); project-wide 91.94% with carried V3 exceptions |
| Reviewer sign-off, no open blockers | ✓ |
| Functional correctness | ✓ no solver/generator changes |
| Performance < 1 s | ✓ SYS7 asserts toggle + reflow < 1 s (single attribute change) |
| Accessibility | ✓ `role="switch"`/`aria-checked`, visible name, announcements (UH9/10/17/18, SYS10); order unchanged (SYS9); hidden from AT when narrow (SYS8) |
| Visual design approved | ✓ mockup `left-hand-v1.html` approved 2026-09-13 |
| UX approved at milestone | ✓ Product Director signed off on the deployed feature 2026-09-13 (toggle-click deselection accepted as intended) |
