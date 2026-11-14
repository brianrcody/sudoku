/**
 * @fileoverview Puzzle strings for loader, sharing, and developer-mode tests.
 * Each one's loader outcome is asserted by loadPuzzle.test.js.
 */

/** Unique solution; rated Kiddie (naked singles only). */
export const KIDDIE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

/** The unique solution of KIDDIE. */
export const KIDDIE_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/** Unique solution; rated Medium. */
export const MEDIUM = '900002801160009040800400000009000060020084000007050180038001005010090074700005010';

/** Unique solution; rated Hard (rank 11). Its trace includes elimination steps. */
export const HARD = '400035007006040001000000000652000700100060000000500300000450000780601090091080006';

/** Unique solution the solver cannot finish ("Golden Nugget") → Unrated. */
export const UNRATED = '000000039000001005003050800008090006070002000100400000009080050020000600400700000';

/** KIDDIE with r1c3 = 1: no repeated digit, but no solution. */
export const NO_SOLUTION = '531070000600195000098000060800060003400803001700020006060000280000419005000080079';

/** KIDDIE with r1c3 = 5: 5 repeats in row 1. */
export const CONTRADICTION = '535070000600195000098000060800060003400803001700020006060000280000419005000080079';

/** No givens: many solutions. */
export const MULTIPLE = '0'.repeat(81);

/** @param {string} s @returns {Uint8Array} */
export function toGivens(s) {
  return Uint8Array.from(s, c => Number(c));
}
