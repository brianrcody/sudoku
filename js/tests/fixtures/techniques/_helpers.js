/**
 * Shared fixture helpers — not imported by production code.
 */

/**
 * Build solver state from a board (inline peers to avoid import deps).
 * @param {Uint8Array} board
 * @returns {{ board: Uint8Array, candidates: Uint16Array }}
 */
export function makeState(board) {
  function peers(i) {
    const r = (i / 9) | 0;
    const c = i % 9;
    const br = (r / 3) | 0;
    const bc = (c / 3) | 0;
    const ps = new Set();
    for (let cc = 0; cc < 9; cc++) ps.add(r * 9 + cc);
    for (let rr = 0; rr < 9; rr++) ps.add(rr * 9 + c);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        ps.add((br * 3 + dr) * 9 + (bc * 3 + dc));
    ps.delete(i);
    return ps;
  }
  const ALL = 0b111111111;
  const candidates = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) {
      candidates[i] = 1 << (board[i] - 1);
    } else {
      let mask = ALL;
      for (const p of peers(i)) {
        if (board[p] !== 0) mask &= ~(1 << (board[p] - 1));
      }
      candidates[i] = mask;
    }
  }
  return { board, candidates };
}

/**
 * Build a board from a flat 81-element array (or shorter with trailing zeros).
 * @param {number[]} arr
 * @returns {Uint8Array}
 */
export function board(arr) {
  const b = new Uint8Array(81);
  for (let i = 0; i < arr.length; i++) b[i] = arr[i];
  return b;
}

/**
 * Build a state from a flat 81-element array.
 * @param {number[]} arr
 * @returns {{ board: Uint8Array, candidates: Uint16Array }}
 */
export function stateFrom(arr) {
  return makeState(board(arr));
}
