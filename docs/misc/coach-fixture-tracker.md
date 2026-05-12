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

| Rank | Technique        | Fixture export   | Status    | Notes                                      |
|------|------------------|------------------|-----------|--------------------------------------------|
| 1    | Naked Single     | `rank01`         | Complete  |                                            |
| 2    | Hidden Single    | `rank02`         | Complete  |                                            |
| 3    | Locked Candidates| `rank03`         | Complete  |                                            |
| 4    | Naked Pair       | `rank04`         | Pending   |                                            |
| 5    | Hidden Pair      | `rank05`         | Pending   |                                            |
| 6    | Naked Triple     | `rank06`         | Pending   |                                            |
| 7    | Hidden Triple    | `rank07`         | Pending   |                                            |
| 8    | X-Wing           | `rank08`         | Pending   |                                            |
| 9    | Swordfish        | `rank09`         | Pending   |                                            |
| 10   | Jellyfish        | `rank10`         | Pending   |                                            |
| 11   | XY-Wing          | `rank11`         | Pending   |                                            |
| 12   | Simple Coloring  | `rank12`         | Pending   |                                            |
| 13   | Multi-Coloring   | `rank13`         | Pending   |                                            |
| 14   | XY-Chain (short) | `rank14Short`    | Pending   | Chain length ≤ 6; elision off              |
| 14   | XY-Chain (long)  | `rank14Long`     | Pending   | Chain length > 6; elision on               |
| 15   | Forcing Chain    | `rank15`         | Pending   | `complexityAcknowledged` will be `true`    |
