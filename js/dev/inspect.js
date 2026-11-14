/**
 * @fileoverview Pure helpers behind the developer tools: solver step
 * inspection, computed-vs-pencil candidate comparison, and generation
 * diagnostics. No DOM and no game-state access — devPanel.js does the wiring.
 */

import { solveLogically, tierForRank } from '../solver/logical.js';
import { initialCandidates } from '../solver/candidates.js';
import { rowOf, colOf } from '../util/grid.js';
import { iterate } from '../util/bitset.js';
import { TIER_LABELS } from '../config.js';

/**
 * Keys under which technique results report cell indices, at any depth of a
 * trace step's pattern fields (`pivot`, `chain.nodes[].cell`,
 * `colorChains[].groupA`, …). Digit-valued keys (`z`, `x`, `digit`,
 * `urDigits`, …) are deliberately absent.
 */
const CELL_KEYS = new Set([
  'pivot', 'wings', 'cells', 'baseCells', 'fins', 'urCells',
  'alsA', 'alsB', 'groupA', 'groupB', 'cell',
]);

/** Trace-step fields that are not technique pattern data. */
const CORE_KEYS = new Set(['cellIndex', 'digit', 'technique', 'eliminations']);

/**
 * @param {number} index - Cell index 0–80.
 * @returns {string} 1-based reference such as `r3c7`.
 */
export function cellRef(index) {
  return `r${rowOf(index) + 1}c${colOf(index) + 1}`;
}

/**
 * Describe one solver trace step.
 *
 * @param {import('../solver/logical.js').Step} step
 * @returns {string} e.g. `Naked Pair — eliminate 4 from r1c2, r1c3; 7 from r1c3`
 */
export function formatStep(step) {
  if (step.digit !== null) {
    return `${step.technique} — place ${step.digit} at ${cellRef(step.cellIndex)}`;
  }
  const cellsByDigit = new Map();
  for (const { cellIndex, digit } of step.eliminations) {
    if (!cellsByDigit.has(digit)) cellsByDigit.set(digit, []);
    cellsByDigit.get(digit).push(cellRef(cellIndex));
  }
  const clauses = [...cellsByDigit.entries()]
    .sort(([a], [b]) => a - b)
    .map(([digit, cells]) => `${digit} from ${cells.join(', ')}`);
  return `${step.technique} — eliminate ${clauses.join('; ')}`;
}

/** Collect cell indices found under CELL_KEYS anywhere inside `value`. */
function _collectCells(value, isCell, out) {
  if (typeof value === 'number') {
    if (isCell) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) _collectCells(item, isCell, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      _collectCells(child, CELL_KEYS.has(key), out);
    }
  }
}

/**
 * The cells a step involves, by role. A cell appears in one role only, with
 * precedence placement > elimination > pattern.
 *
 * @param {import('../solver/logical.js').Step} step
 * @returns {{place: number[], elim: number[], pattern: number[]}}
 */
export function stepCells(step) {
  const place = step.digit !== null ? [step.cellIndex] : [];
  const elim = [...new Set(step.eliminations.map(e => e.cellIndex))];

  const found = new Set();
  for (const [key, value] of Object.entries(step)) {
    if (!CORE_KEYS.has(key)) _collectCells(value, CELL_KEYS.has(key), found);
  }
  const taken = new Set([...place, ...elim]);
  const pattern = [...found].filter(cell => !taken.has(cell));

  return { place, elim, pattern };
}

/**
 * @typedef {Object} InspectorStep
 * @property {number} index - 0-based position in the trace.
 * @property {string} technique
 * @property {string} text - `formatStep` output.
 * @property {{place: number[], elim: number[], pattern: number[]}} cells
 * @property {{cellIndex: number, digit: number}|null} placement - The digit
 *   this step places, or null for an elimination step.
 */

/**
 * Run the logical solver on a copy of `board` with fresh candidates and
 * describe every step it takes. The input is never modified.
 *
 * @param {Uint8Array} board - Givens plus pen digits; 0 = empty.
 * @returns {{steps: InspectorStep[], solved: boolean, remaining: number,
 *            hardest: number, alreadyFull: boolean}}
 *   `remaining` is the number of cells still empty when the solver stopped;
 *   `hardest` is the highest technique rank used (0 if none).
 */
export function runInspector(board) {
  const alreadyFull = !board.includes(0);
  const result = solveLogically(board.slice());
  const steps = result.trace.map((step, index) => ({
    index,
    technique: step.technique,
    text: formatStep(step),
    cells: stepCells(step),
    placement: step.digit !== null ? { cellIndex: step.cellIndex, digit: step.digit } : null,
  }));
  const remaining = result.board.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
  return { steps, solved: result.solved, remaining, hardest: result.hardestRank, alreadyFull };
}

/**
 * The board as the solver leaves it after a given step: `base` plus every
 * digit placed by steps 0…`upTo`. Elimination steps place nothing.
 *
 * @param {Uint8Array} base - The board the inspector was run on.
 * @param {InspectorStep[]} steps
 * @param {number} upTo - Index of the last step to include.
 * @returns {Uint8Array} A new board; `base` is not modified.
 */
export function boardAtStep(base, steps, upTo) {
  const board = base.slice();
  for (const { placement } of steps.slice(0, upTo + 1)) {
    if (placement) board[placement.cellIndex] = placement.digit;
  }
  return board;
}

/**
 * @param {ReturnType<typeof runInspector>} result
 * @returns {string} The inspector's summary line.
 */
export function summarize(result) {
  if (result.alreadyFull) return 'The board is already full.';
  const n = result.steps.length;
  const steps = `${n} step${n === 1 ? '' : 's'}`;
  if (!result.solved) {
    const m = result.remaining;
    return `Stalled after ${steps} with ${m} cell${m === 1 ? '' : 's'} unsolved.`;
  }
  return `Solved in ${steps}. Hardest rank ${result.hardest} (${TIER_LABELS[tierForRank(result.hardest)]}).`;
}

/**
 * Compare computed candidates (row/column/box elimination from the board)
 * with the player's pencil marks.
 *
 * @param {Uint8Array} pen - Givens plus pen digits.
 * @param {Uint16Array} pencil - Player pencil bitsets.
 * @returns {Array<null|{agree: number, missing: number, extra: number}>}
 *   Per cell: null when filled, else three bitsets. `missing` = computed but
 *   not marked; `extra` = marked but not computed. A cell with no marks at all
 *   is not a divergence: every computed candidate is reported as `agree`.
 */
export function candidateDiff(pen, pencil) {
  const computed = initialCandidates(pen);
  const diff = new Array(81).fill(null);
  for (let i = 0; i < 81; i++) {
    if (pen[i] !== 0) continue;
    const marks = pencil[i];
    diff[i] = marks === 0
      ? { agree: computed[i], missing: 0, extra: 0 }
      : { agree: computed[i] & marks, missing: computed[i] & ~marks, extra: marks & ~computed[i] };
  }
  return diff;
}

/**
 * Accessible name for an empty cell while the candidate overlay is on.
 *
 * @param {number} index
 * @param {{agree: number, missing: number, extra: number}} diff
 * @returns {string}
 */
export function overlayLabel(index, diff) {
  const computed = iterate(diff.agree | diff.missing);
  let label = `Row ${rowOf(index) + 1}, column ${colOf(index) + 1}: `;
  label += computed.length > 0 ? `candidates ${computed.join(', ')}` : 'no candidates';
  if (diff.missing !== 0) label += `. Missing from your marks: ${iterate(diff.missing).join(', ')}`;
  if (diff.extra !== 0) label += `. Extra marks: ${iterate(diff.extra).join(', ')}`;
  return label;
}

/**
 * Count technique uses in a solve trace.
 *
 * @param {import('../solver/logical.js').Step[]} trace
 * @returns {Array<{technique: string, count: number}>} Most-used first; ties alphabetical.
 */
export function techniqueProfile(trace) {
  const counts = new Map();
  for (const { technique } of trace) {
    counts.set(technique, (counts.get(technique) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([technique, count]) => ({ technique, count }))
    .sort((a, b) => b.count - a.count || a.technique.localeCompare(b.technique));
}

/**
 * Generation diagnostics for a puzzle, as display rows or a single message
 * when there is nothing to show.
 *
 * @param {object|null} puzzle
 * @param {function(Uint8Array): Array} getTrace - Recomputes the solve trace
 *   from givens; used when the puzzle's own trace is empty (restored games do
 *   not persist it).
 * @returns {{message: string} | {rows: Array<[string, string]>}}
 */
export function describeGeneration(puzzle, getTrace) {
  if (!puzzle) return { message: 'No puzzle loaded.' };
  if (puzzle.source === 'link' || puzzle.source === 'string') {
    return { message: 'This puzzle was loaded, not generated.' };
  }
  if (!puzzle.gen) return { message: 'No generation data was recorded for this puzzle.' };

  const { requestedTier, budget, attempts, rejected, fallback } = puzzle.gen;
  const byTier = Object.entries(rejected.byTier)
    .map(([tier, n]) => `${TIER_LABELS[tier]} ${n}`)
    .join(', ');
  const trace = puzzle.solveTrace.length > 0 ? puzzle.solveTrace : getTrace(puzzle.givens);
  const profile = techniqueProfile(trace)
    .map(({ technique, count }) => `${technique} × ${count}`)
    .join('\n');

  return {
    rows: [
      ['Requested tier', TIER_LABELS[requestedTier]],
      ['Achieved tier', TIER_LABELS[puzzle.difficulty]],
      ['Fallback used', fallback ? 'Yes' : 'No'],
      ['Attempts', `${attempts} of ${budget}`],
      ['Rejected — unsolvable by solver', String(rejected.unsolved)],
      ['Rejected — wrong tier', byTier ? `${rejected.wrongTier} (${byTier})` : String(rejected.wrongTier)],
      ['Technique profile', profile],
    ],
  };
}
