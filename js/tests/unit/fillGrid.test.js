/**
 * Tests for js/generator/fillGrid.js — §2.9 FG1–FG5
 */

import { fillGrid } from '/js/generator/fillGrid.js';
import { mulberry32 } from '/js/prng.js';

/**
 * Verify a grid is fully filled and has no row/col/box duplicates.
 * @param {Uint8Array} grid
 * @returns {boolean}
 */
function isValidFullGrid(grid) {
  if (grid.length !== 81) return false;
  for (let i = 0; i < 81; i++) {
    if (grid[i] < 1 || grid[i] > 9) return false;
  }
  // Rows
  for (let r = 0; r < 9; r++) {
    const seen = new Set();
    for (let c = 0; c < 9; c++) {
      const v = grid[r * 9 + c];
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  // Cols
  for (let c = 0; c < 9; c++) {
    const seen = new Set();
    for (let r = 0; r < 9; r++) {
      const v = grid[r * 9 + c];
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  // Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const seen = new Set();
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const v = grid[(br * 3 + dr) * 9 + (bc * 3 + dc)];
          if (seen.has(v)) return false;
          seen.add(v);
        }
      }
    }
  }
  return true;
}

describe('fillGrid', function () {

  // FG1: Produces a valid full grid
  it('FG1: produces a valid fully-filled 9×9 grid with no duplicates', function () {
    const rng = mulberry32(1);
    const grid = fillGrid(rng);
    expect(grid).to.be.instanceof(Uint8Array);
    expect(grid.length).to.equal(81);
    expect(isValidFullGrid(grid)).to.be.true;
  });

  // FG2: Deterministic given seed
  it('FG2: identical seeds produce identical grids', function () {
    const grid1 = fillGrid(mulberry32(42));
    const grid2 = fillGrid(mulberry32(42));
    expect(Array.from(grid1)).to.deep.equal(Array.from(grid2));
  });

  // FG3: Different seeds produce different grids
  it('FG3: different seeds produce different grids', function () {
    const grid1 = fillGrid(mulberry32(1));
    const grid2 = fillGrid(mulberry32(2));
    const same = grid1.every((v, i) => v === grid2[i]);
    expect(same).to.be.false;
  });

  // FG4: Completes within 10ms
  it('FG4: fillGrid completes in under 10ms', function () {
    const rng = mulberry32(1);
    const t0 = performance.now();
    fillGrid(rng);
    const elapsed = performance.now() - t0;
    expect(elapsed).to.be.below(10);
  });

  // FG5: Backtrack branch exercised — still produces valid result
  it('FG5: produces valid grid for seeds that exercise backtracking', function () {
    // Try several seeds — at least some will trigger the backtrack path.
    for (const seed of [100, 200, 300, 999, 12345]) {
      const grid = fillGrid(mulberry32(seed));
      expect(isValidFullGrid(grid)).to.be.true;
    }
  });
});
