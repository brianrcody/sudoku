/**
 * @fileoverview Naked Single technique (rank 1).
 *
 * A cell with exactly one candidate digit must contain that digit.
 */

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array<{cellIndex:number,digit:number}>, eliminations: Array, technique: string }|null}
 */
export default function nakedSingle(state) {
  const { board, candidates } = state;
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    const c = candidates[i];
    if (c !== 0 && (c & (c - 1)) === 0) {
      // Exactly one bit set.
      const digit = 31 - Math.clz32(c) + 1;
      return {
        placements: [{ cellIndex: i, digit }],
        eliminations: [],
        technique: 'Naked Single',
      };
    }
  }
  return null;
}
