/**
 * @fileoverview Stub SolverHintProvider for independent App Brain development.
 * Returns a hint by looking up the solution directly, without running the
 * logical solver.
 *
 * Matches the real SolverHintProvider interface exactly.
 */

/**
 * Returns a hint for the given puzzle and player state.
 *
 * @param {object} puzzle
 * @param {Uint8Array} puzzle.solution
 * @param {object} playerState
 * @param {Uint8Array} playerState.pen
 * @param {Set<number>} playerState.conflicts
 * @param {object} [opts]
 * @param {number} [opts.targetCell]
 * @returns {{ cellIndex: number, digit: number, technique: string }|null}
 */
export function nextHint(puzzle, playerState, { targetCell } = {}) {
  if (targetCell !== undefined) {
    return {
      cellIndex: targetCell,
      digit: puzzle.solution[targetCell],
      technique: 'solution-lookup',
    };
  }

  // No target: find the first unfilled non-conflict cell.
  for (let i = 0; i < 81; i++) {
    if (playerState.pen[i] === 0 && !playerState.conflicts.has(i)) {
      return {
        cellIndex: i,
        digit: puzzle.solution[i],
        technique: 'solution-lookup',
      };
    }
  }
  return null;
}
