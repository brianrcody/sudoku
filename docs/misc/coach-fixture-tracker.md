# Coach Analyzer Fixture Tracker

Fixtures for ranks 1–3 are complete. Ranks 4–15 are collected organically: when the
coach fires a given technique during manual play, capture the board state and invoke
`/add-coach-fixture` to build the fixture.

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
| 12   | Simple Coloring (Rule 2) | `rank12` | Complete | Source: `000000030002090500080706004900054006030000070600380009300601020007020600060000000` |
| 12   | Simple Coloring (Rule 4) | `rank12Rule4` | Complete | Source: `007000200000054009061000008300740905000000000508016002700000590800370000005000300` |
| 13   | Multi-Coloring   | `rank13`         | Complete  | Source: `030700080710000035005000100350204090000090000090308072003000500170000046080006020` |
| 14   | XY-Chain (short) | `rank14Short`    | Complete  | Source: `004009200070010604500000000010500080060127050050006070000000007306070040007200900`; chain ≤ 6; acknowledged: false |
| 14   | XY-Chain (long)  | `rank14Long`     | Complete  | Source: `080103070000000000001408020570001039000609000920800051030905200000000000010702060`; chain > 6; acknowledged: true |
| 15   | Forcing Chain    | `rank15`         | Pending   | Export in index.js is an invalid placeholder (fires rank 1); AS source URL not found |

---

## Regression Test Fixtures

These cover specific edge cases discovered in production, independent of the rank-based
fixture ladder. Each needs a captured board state (same capture procedure above) and a
dedicated test in `analyzer.test.js`.

| Bug                              | Fixture export          | Status  | What to assert                                                                  |
|----------------------------------|-------------------------|---------|---------------------------------------------------------------------------------|
| Hidden Pair — one elim cell      | `rank05OneElimCell`     | Pending | `step.digits.length === 2`, `step.roles.cause.length === 2`, no `"undefined"` in `step.supportingText`. Board: a Hidden Pair where one pair cell already holds only the two hidden digits (no extras) so the solver emits eliminations from only one cell. The test was written to catch the bug where `pairCells` was built solely from `step.eliminations`, leaving the clean pair cell out of `roles.cause` and `A`/`B` as `undefined`. |
