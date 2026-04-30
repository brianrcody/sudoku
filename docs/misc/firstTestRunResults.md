# First Test Run Results — 2026-04-21

## Summary

| Result  | Count | Pct |
|---------|-------|-----|
| Passing | 371   | 89% |
| Failing | 25    | 6%  |
| Pending | 22    | 5%  |
| **Total** | **418** | |

## Failures by Category

### Solver technique bugs (returning null unexpectedly)
- `hiddenSingle HS1`: detects hidden single in a row — `expected null not to be null`
- `hiddenSingle HS2`: detects hidden single in a column — `expected 9 to equal 14`
- `nakedSubsets NT2`: naked triple with 2-2-3 candidate pattern variant — `expected null not to be null`
- `coloring SC1`: simple coloring Rule 2 fires when two same-color cells are peers — `expected null not to be null`
- `coloring SC2`: simple coloring returns elimination-only result — `expected null not to be null`
- `coloring SC3`: simple coloring result shape is correct — `expected null not to be null`
- `forcingChains XYC1`: XY-Chain fires on board with 4-cell bivalue chain — `expected null not to be null`
- `forcingChains XYC2`: XY-Chain result contains valid elimination shape — `expected null not to be null`

### Rater miscalibration
- `rater.js R2`: rates easy fixture as tier='easy' — `expected 'kiddie' to equal 'easy'`
- `rater.js R6`: returns tier='beyond-death-march' on unsolvable-by-ladder board — `expected 'kiddie' to equal 'beyond-death-march'`

### Worker / pipeline issues
- `pipeline.js PL4`: throws AbortError when aborted during generation — `expected false to be true`
- `puzzleProvider PP2`: requests a kiddie puzzle from the Worker when cache is empty — `the event {"isTrusted":true} was thrown`
- `puzzleProvider PP6`: writes puzzle to localStorage when a background result arrives — `localStorage not written within timeout`
- `puzzleProvider PP9`: two concurrent requestPuzzle calls both resolve — `the event {"isTrusted":true} was thrown`
- `puzzleProvider PP10`: puzzle returned by requestPuzzle has no .fallback property — `the event {"isTrusted":true} was thrown`
- `generator.worker.js W4`: GEN_ABORT cancels in-flight request; no GEN_RESULT arrives — `expected true to be false`
- `generator.worker.js W5`: foreground GEN_REQUEST completes before background — `expected 'bg' to equal 'fg'`
- `system tests SYS3`: Death March puzzle generates within 5s budget — `expected null not to be null`

### Persistence bugs
- `integration/persistence PE7`: currentDifficulty is persisted to localStorage on difficulty change — `expected 'easy' to equal 'hard'`
- `integration/persistence PE8`: a state blob with version:2 is ignored on load — `expected null not to be null`

### A11y copy mismatches
- `integration/a11y A1`: entering a pen digit announces the cell and digit — `expected 'conflict: 1 appears more than once' to include 'row'`
- `integration/a11y A13`: hint button aria-label contains the remaining hint count — `expected 'hint — no hints remaining' to satisfy [Function]`
- `integration/a11y A20`: announcing the same text twice clears then re-sets the live region — `expected 'Conflict: 1 appears more than once' to equal ''`

### Data / bitset bug
- `bitset.js B8`: iterate yields digits in ascending order — `expected [ 1, 6, 8 ] to deeply equal [ 1, 3, 5 ]`

## Additional Notes

- A `[page error] d is not defined` browser error was logged — an undefined variable in some module, potentially responsible for some of the null-return failures above.
- The `"type": "module"` field was missing from `package.json` (fixed to enable ESM in the runner).
- The mocha runner script in `setup.html` was converted from a classic `<script>` to `type="module"` to ensure it executes after all test modules have registered (fixed 0-test issue on first run).
