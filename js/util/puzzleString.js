/**
 * @fileoverview Puzzle-string codec: 81 cells, row-major, digits 1–9 for givens.
 */

/**
 * Parse a puzzle string. `0` and `.` both mean an empty cell; whitespace is
 * ignored anywhere.
 *
 * @param {string} text
 * @returns {{ok: true, givens: Uint8Array}
 *          | {ok: false, reason: 'chars'}
 *          | {ok: false, reason: 'length', length: number}}
 */
export function parsePuzzleString(text) {
  const cells = text.replace(/\s+/g, '');
  if (!/^[0-9.]*$/.test(cells)) return { ok: false, reason: 'chars' };
  if (cells.length !== 81) return { ok: false, reason: 'length', length: cells.length };

  const givens = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    // '.' is char code 46, below '0' (48); both map to an empty cell.
    givens[i] = Math.max(0, cells.charCodeAt(i) - 48);
  }
  return { ok: true, givens };
}

/**
 * Encode givens as 81 digits, `0` for empty.
 *
 * @param {Uint8Array} givens
 * @returns {string}
 */
export function encodeGivens(givens) {
  return Array.from(givens).join('');
}
