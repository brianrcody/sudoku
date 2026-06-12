Add a new rank-clean board fixture to the coach analyzer test suite.

## Inputs

The user will provide (either as arguments or in the conversation):
- **Technique name** — the technique the coach displayed (e.g. "XY-Wing")
- **Board state** — 9 lines of 9 characters, digits 1–9 and `.` for empty
- **Pencil state** — 9 lines of 9 comma-separated integers (from the capture snippet), or omitted if none

If technique name or board state are missing, ask for them before proceeding.
Pencil state is optional — if not provided, `pencil: null` is used.

For XY-Chain, also ask: was this a **short** chain (≤ 6 cells) or a **long** chain (> 6)?
The coach UI displays chain length in the supporting text; the user can check there.
Note: sound XY-Chains are almost always long (the DFS is depth-biased) — `rank18Short`
has never been captured, and landing one would close a documented coverage gap
(`docs/misc/CodeCoverageV3.md` §2, analyzer short-arm).

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
| XYZ-Wing          | 12   | rank12        | false                  |
| WXYZ-Wing         | 13   | rank13        | false                  |
| Finned X-Wing     | 14   | rank14        | false                  |
| Finned Swordfish  | 15   | rank15        | false                  |
| Simple Coloring   | 16   | rank16        | false                  |
| Multi-Coloring    | 17   | rank17        | false                  |
| XY-Chain (short)  | 18   | rank18Short   | false                  |
| XY-Chain (long)   | 18   | rank18Long    | false                  |
| Forcing Chain     | 19   | rank19        | true                   |
| Unique Rectangle  | 20   | rank20        | false                  |
| ALS-XZ            | 21   | rank21        | true                   |

If a fixture for the technique already exists and you are adding a variant rather than
replacing it, append with a distinguishing suffix (existing examples: `rank16Rule4`,
`rank18B`, `rank20Type2`, `rank20Type4`).

Type is `'placement'` for ranks 1–2, `'elimination'` for ranks 3–21.

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

Fixture template **without** pencil (ranks 1–15 or any board that is rank-clean on raw candidates):
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

Fixture template **with** pencil (rank 16+ or any board where pencil marks suppress lower techniques):
```javascript
// ===========================================================================
// Rank N: Technique Name
// Captured from live play — rank-clean with pencil marks.
// ===========================================================================
export const EXPORT_NAME = {
  givens: board([
    /* 81-element array, 9 per row with // rN comments */
  ]),
  playerPen: null,
  pencil: pencil([
    /* 81-element array from capture snippet, 9 per row with // rN comments */
  ]),
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
- If the technique test fails (wrong technique returned), two causes are possible:
  1. A lower-rank technique fires first even with pencil marks — discard and recapture
  2. Pencil state was omitted or stale — re-run the capture snippet and include the pencil output
