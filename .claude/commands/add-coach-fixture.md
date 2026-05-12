Add a new rank-clean board fixture to the coach analyzer test suite.

## Inputs

The user will provide (either as arguments or in the conversation):
- **Technique name** — the technique the coach displayed (e.g. "XY-Wing")
- **Board state** — 9 lines of 9 characters, digits 1–9 and `.` for empty

If either is missing, ask for it before proceeding.

For XY-Chain, also ask: was this a **short** chain (≤ 6 cells) or a **long** chain (> 6)?
The coach UI displays chain length in the supporting text; the user can check there.

---

## Rank table

Use this to derive rank, export name, and complexityAcknowledged:

| Technique         | Rank | Export name   | complexityAcknowledged |
|-------------------|------|---------------|------------------------|
| Naked Single      | 1    | rank01        | false                  |
| Hidden Single     | 2    | rank02        | false                  |
| Locked Candidates | 3    | rank03        | false                  |
| Naked Pair        | 4    | rank04        | false                  |
| Hidden Pair       | 5    | rank05        | false                  |
| Naked Triple      | 6    | rank06        | false                  |
| Hidden Triple     | 7    | rank07        | false                  |
| X-Wing            | 8    | rank08        | false                  |
| Swordfish         | 9    | rank09        | false                  |
| Jellyfish         | 10   | rank10        | false                  |
| XY-Wing           | 11   | rank11        | false                  |
| Simple Coloring   | 12   | rank12        | false                  |
| Multi-Coloring    | 13   | rank13        | false                  |
| XY-Chain (short)  | 14   | rank14Short   | false                  |
| XY-Chain (long)   | 14   | rank14Long    | false                  |
| Forcing Chain     | 15   | rank15        | true                   |

Type is `'placement'` for ranks 1–2, `'elimination'` for ranks 3–15.

---

## Steps

### 1. Parse the board string

Convert the 9×9 character grid into an 81-element JS array literal.
- Replace each `.` with `0`.
- Each row becomes 9 numbers. Preserve row grouping as a comment.

Example input:
```
53..7....
6..195...
.98....6.
8...6...3
4..8.3..1
7...2...6
.6....28.
...419..5
....8..79
```

Example output (the `board([...])` call body):
```javascript
5,3,0,0,7,0,0,0,0,  // r0
6,0,0,1,9,5,0,0,0,  // r1
0,9,8,0,0,0,0,6,0,  // r2
8,0,0,0,6,0,0,0,3,  // r3
4,0,0,8,0,3,0,0,1,  // r4
7,0,0,0,2,0,0,0,6,  // r5
0,6,0,0,0,0,2,8,0,  // r6
0,0,0,4,1,9,0,0,5,  // r7
0,0,0,0,8,0,0,7,9,  // r8
```

### 2. Write the fixture block

Open `js/tests/fixtures/puzzles/coach/index.js`. Locate the existing placeholder export
for this technique (e.g. `export const rank04 = { ... }`) and replace it entirely with
the new fixture. If no placeholder exists, append the new export at the end of the file
before the final blank line.

Fixture template:
```javascript
// ===========================================================================
// Rank N: Technique Name
// Captured from live play — rank-clean by construction.
// ===========================================================================
export const EXPORT_NAME = {
  givens: board([
    /* paste the 81-element array here, 9 per row with // rN comments */
  ]),
  playerPen: null,
  expected: {
    technique: 'TECHNIQUE_NAME',
    rank: N,
    type: 'TYPE',
    complexityAcknowledged: BOOL,
  },
};
```

### 3. Update the tracker

Open `docs/misc/coach-fixture-tracker.md`. Find the row for this technique and change
`Pending` to `Complete`.

### 4. Confirm

Tell the user:
- Which export was written
- That the tracker row is now marked Complete
- That they should run the test suite to confirm the board is rank-clean
  (`open js/tests/setup.html` or however they normally run tests)
- If any test for this technique fails, it means a lower-rank technique fires first on
  this board — discard it and wait for another board from live play
