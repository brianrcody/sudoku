/**
 * A valid, complete Sudoku grid exported as Uint8Array(81).
 *
 * Source: Classic example grid, verified valid.
 */
export const validGrid = (() => {
  const b = new Uint8Array(81);
  const grid = [
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
  for (let i = 0; i < 81; i++) b[i] = grid[i];
  return b;
})();

export default validGrid;
