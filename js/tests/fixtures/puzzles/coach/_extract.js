/**
 * @fileoverview Dev-only CLI tool for extracting mid-game board state fixtures
 * from sudoku puzzle strings.
 *
 * Usage:
 *   node js/tests/fixtures/puzzles/coach/_extract.js <puzzle-string> <target-rank>
 *
 * Advances a puzzle string to the point where all techniques cheaper than
 * <target-rank> are exhausted, then emits a paste-ready fixture block.
 *
 * NOT a test. NOT shipped. NOT imported by anything else.
 */

import { solveLogically } from '../../../../solver/logical.js';
import { countSolutions } from '../../../../solver/uniqueness.js';
import { analyze } from '../../../../coach/analyzer.js';

// ---------------------------------------------------------------------------
// Technique name → rank map (mirrors analyzer.js RANK_BY_NAME)
// ---------------------------------------------------------------------------
const RANK_BY_NAME = {
  'Naked Single':      1,
  'Hidden Single':     2,
  'Locked Candidates': 3,
  'Naked Pair':        4,
  'Hidden Pair':       5,
  'Naked Triple':      6,
  'Hidden Triple':     7,
  'X-Wing':            8,
  'Swordfish':         9,
  'Jellyfish':         10,
  'XY-Wing':           11,
  'Simple Coloring':   12,
  'Multi-Coloring':    13,
  'XY-Chain':          14,
  'Forcing Chain':     15,
};

const NAME_BY_RANK = Object.fromEntries(
  Object.entries(RANK_BY_NAME).map(([k, v]) => [v, k])
);

// ---------------------------------------------------------------------------
// Argument parsing and validation
// ---------------------------------------------------------------------------

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

const [, , rawPuzzle, rawRank] = process.argv;

if (!rawPuzzle || !rawRank) {
  die('Usage: node _extract.js <puzzle-string> <target-rank>');
}

// Normalize: replace dots with zeros.
const puzzleStr = rawPuzzle.replace(/\./g, '0');

if (puzzleStr.length !== 81) {
  die(`Puzzle string must be 81 characters; got ${puzzleStr.length}.`);
}
if (!/^[0-9]{81}$/.test(puzzleStr)) {
  die('Puzzle string contains invalid characters (only digits 0–9 and "." are allowed).');
}

const givens = new Uint8Array(81);
for (let i = 0; i < 81; i++) givens[i] = parseInt(puzzleStr[i], 10);

if (!givens.some(v => v === 0)) {
  die('Puzzle string has no empty cells — it is already solved.');
}

const targetRank = parseInt(rawRank, 10);
if (isNaN(targetRank) || targetRank < 4 || targetRank > 15) {
  die(`target-rank must be an integer from 4 to 15; got "${rawRank}".`);
}

// ---------------------------------------------------------------------------
// Step 2 — Verify uniqueness and get solution
// ---------------------------------------------------------------------------

const { count, solution } = countSolutions(givens);

if (count !== 1) {
  if (count === 0) {
    die('Puzzle has no solution — cannot use as fixture source.');
  } else {
    die('Puzzle has multiple solutions — cannot use as fixture source.');
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Advance board to rank-N floor
// ---------------------------------------------------------------------------

const board = givens.slice();
const result = solveLogically(board, { techniqueLimit: targetRank - 1 });

// ---------------------------------------------------------------------------
// Step 4 — Build playerPen
// ---------------------------------------------------------------------------

const playerPen = new Uint8Array(81);
for (let i = 0; i < 81; i++) {
  if (givens[i] === 0 && result.board[i] !== 0) {
    playerPen[i] = result.board[i];
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Pencil = evolved candidates from the solver
// ---------------------------------------------------------------------------

const pencilMarks = result.candidates; // Uint16Array — technique-pruned candidates

// ---------------------------------------------------------------------------
// Step 6 — Verify rank-cleanliness
// ---------------------------------------------------------------------------

const step = analyze(
  { givens, solution },
  { pen: playerPen, conflicts: new Set(), pencil: pencilMarks }
);

if (step.type === 'no-technique') {
  process.stderr.write(
    `Error: analyze() returned no-technique (reason: ${step.reason}).\n` +
    `The board may be fully solved or inconsistent after advancing to rank ${targetRank - 1}.\n`
  );
  process.exit(1);
}

if (step.rank !== targetRank) {
  process.stderr.write(
    `Error: Expected rank ${targetRank}, but rank ${step.rank} fired ("${step.technique}").\n` +
    `Solver disagreement — this puzzle is a candidate for rank ${step.rank} instead.\n`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step 7 — Format and emit fixture block
// ---------------------------------------------------------------------------

const rankLabel = String(targetRank).padStart(2, '0');
const techniqueName = NAME_BY_RANK[targetRank] ?? `rank${rankLabel}`;
const stepType = targetRank <= 2 ? 'placement' : 'elimination';

/** Format a flat 81-element array as 9 rows of 9, with row comments. */
function formatArray9x9(values, formatter) {
  const rows = [];
  for (let r = 0; r < 9; r++) {
    const rowVals = [];
    for (let c = 0; c < 9; c++) {
      rowVals.push(formatter(values[r * 9 + c]));
    }
    rows.push(`    /* row ${r} */ ${rowVals.join(',')}`);
  }
  return rows.join(',\n');
}

const givensFormatted  = formatArray9x9(givens, v => v);
const playerPenFormatted = formatArray9x9(playerPen, v => v);
const pencilFormatted  = formatArray9x9(pencilMarks, v => v); // decimal integers

const output = [
  `// ===== rank${rankLabel} fixture — paste into js/tests/fixtures/puzzles/coach/index.js =====`,
  `// Source: ${rawPuzzle}`,
  `// Verified: analyze() returns rank ${targetRank} (${techniqueName})`,
  `export const rank${rankLabel} = {`,
  `  givens: board([`,
  givensFormatted + ',',
  `  ]),`,
  `  playerPen: board([`,
  playerPenFormatted + ',',
  `  ]),`,
  `  pencil: pencil([`,
  pencilFormatted + ',',
  `  ]),`,
  `  expected: {`,
  `    technique: '${techniqueName}',`,
  `    rank: ${targetRank},`,
  `    type: '${stepType}',`,
  `  },`,
  `};`,
].join('\n');

process.stdout.write(output + '\n');
