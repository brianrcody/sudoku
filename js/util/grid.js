/**
 * @fileoverview Index helpers and precomputed lookup tables for a 9×9 Sudoku
 * grid. Cells are indexed 0–80, row-major.
 */

/**
 * @param {number} i - Cell index 0–80.
 * @returns {number} Row index 0–8.
 */
export function rowOf(i) {
  return (i / 9) | 0;
}

/**
 * @param {number} i - Cell index 0–80.
 * @returns {number} Column index 0–8.
 */
export function colOf(i) {
  return i % 9;
}

/**
 * Box index in reading order (top-left=0, top-right=2, bottom-right=8).
 *
 * @param {number} i - Cell index 0–80.
 * @returns {number} Box index 0–8.
 */
export function boxOf(i) {
  return (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);
}

/**
 * @param {number} r - Row 0–8.
 * @param {number} c - Column 0–8.
 * @returns {number} Cell index 0–80.
 */
export function cellIndex(r, c) {
  return r * 9 + c;
}

// ---------------------------------------------------------------------------
// Precomputed tables
// ---------------------------------------------------------------------------

/** 27 units: 9 rows, then 9 columns, then 9 boxes. Each is a length-9 array. */
export const UNITS = (() => {
  const units = [];

  // Rows
  for (let r = 0; r < 9; r++) {
    const unit = [];
    for (let c = 0; c < 9; c++) unit.push(r * 9 + c);
    units.push(unit);
  }

  // Columns
  for (let c = 0; c < 9; c++) {
    const unit = [];
    for (let r = 0; r < 9; r++) unit.push(r * 9 + c);
    units.push(unit);
  }

  // Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const unit = [];
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          unit.push((br * 3 + dr) * 9 + (bc * 3 + dc));
        }
      }
      units.push(unit);
    }
  }

  return units;
})();

/**
 * For each cell, the 3 units it belongs to: [rowUnit, colUnit, boxUnit].
 * Each entry is a length-3 array of references into UNITS.
 *
 * @type {Array<Array<number[]>>}
 */
export const UNITS_OF = (() => {
  return Array.from({ length: 81 }, (_, i) => {
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    return [UNITS[r], UNITS[9 + c], UNITS[18 + b]];
  });
})();

/**
 * For each cell, its 20 peers — all cells sharing a row, column, or box,
 * excluding the cell itself.
 *
 * @type {number[][]}
 */
export const PEERS = (() => {
  return Array.from({ length: 81 }, (_, i) => {
    const seen = new Set();
    for (const unit of UNITS_OF[i]) {
      for (const j of unit) {
        if (j !== i) seen.add(j);
      }
    }
    return Array.from(seen);
  });
})();
