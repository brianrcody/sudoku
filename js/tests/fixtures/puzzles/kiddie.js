/**
 * A Kiddie-tier puzzle fixture — solvable by Naked Singles only.
 *
 * givens: puzzle with ~47 clues, one-by-one naked singles complete it.
 * solution: the unique complete solution.
 *
 * Derived from the classic example grid by leaving 47 cells filled,
 * selecting cells that can be solved purely by naked singles.
 */

const SOLUTION_GRID = [
  5,3,4, 6,7,8, 9,1,2,
  6,7,2, 1,9,5, 3,4,8,
  1,9,8, 3,4,2, 5,6,7,
  8,5,9, 7,6,1, 4,2,3,
  4,2,6, 8,5,3, 7,9,1,
  7,1,3, 9,2,4, 8,5,6,
  9,6,1, 5,3,7, 2,8,4,
  2,8,7, 4,1,9, 6,3,5,
  3,4,5, 2,8,6, 1,7,9,
];

// Cells left as givens (0-based index) — enough clues that every empty cell
// has exactly one candidate initially or becomes one after a single propagation.
const GIVEN_INDICES = new Set([
  0,1,4,6,7,8,           // row 0: 5,3,_,6,7,8,9,1,2  → leave col 2 (digit 4)
  9,10,12,13,14,16,17,   // row 1
  18,20,22,23,24,25,26,  // row 2
  27,28,29,31,32,33,35,  // row 3
  36,37,38,39,41,42,43,  // row 4
  45,46,47,49,50,51,52,  // row 5
  54,55,57,58,59,61,62,  // row 6
  63,65,66,67,68,70,71,  // row 7
  72,73,74,76,77,78,79,  // row 8
]);

export const kiddie = (() => {
  const givens = new Uint8Array(81);
  const solution = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    solution[i] = SOLUTION_GRID[i];
    givens[i] = GIVEN_INDICES.has(i) ? SOLUTION_GRID[i] : 0;
  }
  return { givens, solution };
})();

export default kiddie;
