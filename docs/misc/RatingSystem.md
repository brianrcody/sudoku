# Puzzle Difficulty Rating System

Difficulty is determined by the **hardest logical technique required to solve the puzzle**,
not by clue count. Clue count targets are soft guidance for the cell-removal loop only;
the rater has final say.

---

## Generation Pipeline

1. **Fill** — generate a random complete valid grid.
2. **Remove cells** — iteratively remove givens (in random order), keeping only removals
   that leave the puzzle uniquely solvable.
3. **Rate** — run the logical solver; the hardest technique actually applied determines
   the tier.
4. **Accept or retry** — if the rated tier matches the requested difficulty, accept;
   otherwise retry (up to the attempt budget for that tier).

---

## Technique Ladder (ranks 1–21, V3)

| Rank | Technique         | Tier           |
|------|-------------------|----------------|
| 1    | Naked Single      | **Kiddie**     |
| 2    | Hidden Single     | **Easy**       |
| 3    | Locked Candidates | **Medium**     |
| 4    | Naked Pair        | **Medium**     |
| 5    | Hidden Pair       | **Medium**     |
| 6    | Naked Triple      | **Medium**     |
| 7    | Hidden Triple     | **Medium**     |
| 8    | X-Wing            | **Hard**       |
| 9    | Swordfish         | **Hard**       |
| 10   | Jellyfish         | **Hard**       |
| 11   | XY-Wing           | **Hard**       |
| 12   | XYZ-Wing          | **Expert**     |
| 13   | WXYZ-Wing         | **Expert**     |
| 14   | Finned X-Wing     | **Expert**     |
| 15   | Finned Swordfish  | **Expert**     |
| 16   | Simple Coloring   | **Expert**     |
| 17   | Multi-Coloring    | **Expert**     |
| 18   | XY-Chain          | **Expert**     |
| 19   | Forcing Chain (AIC) | **Expert**   |
| 20   | Unique Rectangle (Types 1/2/4) | **Diabolical** |
| 21   | ALS-XZ            | **Nightmare**  |

A puzzle lands in the tier corresponding to the highest-ranked technique the solver had
to use. "Expert" is the renamed pre-V3 "Death March" tier; ranks 12–15 were inserted
inside it (Kiddie–Hard ratings and Expert set-membership are unaffected — see
aspec-harder-tiers.md §2). If the logical solver gets stuck even with all 21 techniques
enabled, the puzzle is classified `beyond-nightmare` — the pipeline rejects it and
retries.

---

## Soft Clue-Count Targets

These guide how aggressively the cell-removal loop strips givens before rating. The
actual tier is always determined by the solver.

| Tier        | Target givens |
|-------------|---------------|
| Kiddie      | 45–50         |
| Easy        | 36–42         |
| Medium      | 30–34         |
| Hard        | 26–30         |
| Expert      | 22–26         |
| Diabolical  | 20–27 (strips to minimality) |
| Nightmare   | 20–27 (strips to minimality) |

---

## Key Implementation Files

| File | Role |
|------|------|
| `js/solver/techniques/index.js` | Ordered technique ladder (rank 1–15) |
| `js/solver/logical.js` | Logical solver + `tierForRank()` mapping |
| `js/generator/rater.js` | `rate(givens)` — runs solver, returns tier |
| `js/generator/removeCells.js` | Cell-removal loop with uniqueness checking |
| `js/generator/pipeline.js` | End-to-end generation pipeline |
| `js/config.js` | Per-tier attempt budgets and clue-count targets |
