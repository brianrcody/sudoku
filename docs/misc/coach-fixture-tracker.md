# Coach Analyzer Fixture Tracker

Fixtures for ranks 1–3 are complete. Higher ranks are collected organically (manual-play
capture + `/add-coach-fixture`) or mined rank-clean from seeded generation
(`scripts/mine-coach-fixtures.js`, V3). Rank numbers follow the 21-rank V3 ladder
(aspec-harder-tiers.md §2).

---

## Capture Snippet

Paste in the browser console when the coach fires the target technique:

```javascript
(function() {
  const s = window.gameState.getState();
  const cells = Array.from(s.pen).map((v, i) => s.conflicts.has(i) ? 0 : v);
  const grid = Array.from({length: 9}, (_, r) =>
    cells.slice(r*9, r*9+9).map(v => v || '.').join('')
  ).join('\n');
  const p = Array.from(s.pencil || new Uint16Array(81));
  const pencilStr = Array.from({length: 9}, (_, r) =>
    p.slice(r*9, r*9+9).join(',') + ',  // r' + r
  ).join('\n    ');
  console.log('Board:\n' + grid + '\n\nPencil:\n    ' + pencilStr);
})();
```

Copy the full output (board grid + pencil rows), note the technique the coach displayed,
then run `/add-coach-fixture`.

---

## Fixture Status

| Rank | Technique        | Fixture export   | Status    | Notes                                                                               |
|------|------------------|------------------|-----------|-------------------------------------------------------------------------------------|
| 1    | Naked Single     | `rank01`         | Complete  |                                                                                     |
| 2    | Hidden Single    | `rank02`         | Complete  |                                                                                     |
| 3    | Locked Candidates| `rank03`         | Complete  |                                                                                     |
| 4    | Naked Pair       | `rank04`         | Complete  | Source: `080090030030000000002060108020800500800907006004005070503040900000000010010050020` |
| 5    | Hidden Pair      | `rank05`         | Complete  | Source: `720400030000000047001076802010039000000801000000260080209680400340000000060003075`; also needs regression fixture — see below |
| 6    | Naked Triple     | `rank06`         | Pending   | AS candidates solved before rank 6; export in index.js is an invalid placeholder (fires rank 3) |
| 7    | Hidden Triple    | `rank07`         | Pending   | AS candidate solved before rank 7; export in index.js is an invalid placeholder (fires rank 1) |
| 8    | X-Wing (row)     | `rank08`         | Complete  | Source: `100000569402000008050009040000640801000010000208035000040500010900000402621000005` |
| 8    | X-Wing (col)     | `rank08Transpose`| Complete  | Source: `000000004760010050090002081070050010000709000080030060240100070010090045900000000` |
| 9    | Swordfish (row)  | `rank09` / `rank09Row` | Complete | Source: `020040069003806200060020000890500010000000000030001026000010070009604300270050090`; `rank09Row` is a re-export alias |
| 9    | Swordfish (col)  | `rank09Col`      | Pending   | All AS Swordfish candidates fired row-locked under our solver; needs organic capture or new source |
| 10   | Jellyfish        | `rank10`         | Complete  | Source: `000000000070030920019025630004000210000000000057090460095140370000000000042367590` |
| 11   | XY-Wing          | `rank11`         | Complete  | Source: `034500000802060400600008000003900004050000090900005800000300008001040605000007120` |
| 12   | XYZ-Wing         | `rank12`         | Complete  | Mined rank-clean (seed 640019); pencil state included (V3 ladder)            |
| 13   | WXYZ-Wing        | `rank13`         | Complete  | Mined rank-clean (seed 640003); pencil state included                        |
| 14   | Finned X-Wing    | `rank14`         | Complete  | Mined rank-clean (seed 640000); pencil state included                        |
| 15   | Finned Swordfish | `rank15`         | Complete  | Mined rank-clean (seed 640000); pencil state included                        |
| 16   | Simple Coloring (Rule 2) | `rank16` | Complete  | Mined rank-clean Rule-2 shape (seed 922831); replaces pre-V3 `rank12` board (no longer rank-clean under the 21-rank ladder) |
| 16   | Simple Coloring (Rule 4) | `rank16Rule4` | Complete | Former `rank12Rule4` board (still rank-clean); rank field updated            |
| 17   | Multi-Coloring   | `rank17`         | Complete  | Mined rank-clean (seed 640098); replaces pre-V3 `rank13` board               |
| 18   | XY-Chain (B)     | `rank18B`        | Complete  | Former `rank14Short` board; under the sound DFS the chain found is long. A genuinely short-chain fixture was not reachable by mining (depth-first search bias) — the mapper's short arm is a documented coverage exception |
| 18   | XY-Chain (long)  | `rank18Long`     | Complete  | Mined rank-clean (seed 640004); chain > 6; acknowledged: true; replaces pre-V3 `rank14Long` |
| 19   | Forcing Chain    | `rank19`         | Complete  | Mined rank-clean (seed 640041) — first valid FC fixture (pre-V3 closures were unreachable; see bugs-forcing-chains-soundness.md) |
| 20   | Unique Rectangle | `rank20`         | Complete  | Mined rank-clean (seed 640112); pencil state included                        |
| 21   | ALS-XZ           | `rank21`         | Complete  | Mined rank-clean (seed 640000); limited-coaching technique                   |

---

## Regression Test Fixtures

These cover specific edge cases discovered in production, independent of the rank-based
fixture ladder. Each needs a captured board state (same capture procedure above) and a
dedicated test in `analyzer.test.js`.

| Bug                              | Fixture export          | Status  | What to assert                                                                  |
|----------------------------------|-------------------------|---------|---------------------------------------------------------------------------------|
| Hidden Pair — one elim cell      | `rank05OneElimCell`     | Pending | `step.digits.length === 2`, `step.roles.cause.length === 2`, no `"undefined"` in `step.supportingText`. Board: a Hidden Pair where one pair cell already holds only the two hidden digits (no extras) so the solver emits eliminations from only one cell. The test was written to catch the bug where `pairCells` was built solely from `step.eliminations`, leaving the clean pair cell out of `roles.cause` and `A`/`B` as `undefined`. |
