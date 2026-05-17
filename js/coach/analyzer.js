/**
 * @fileoverview Coach Mode analyzer — pure-function module.
 *
 * Given the current puzzle and player state, returns a fully-realised CoachStep
 * describing the lowest-ranked logical move available, or a NoTechniqueResult
 * when no move is possible.
 *
 * No DOM, no events, no global state. Every call is independent.
 */

import { solveLogically } from '../solver/logical.js';
import { initialCandidates } from '../solver/candidates.js';
import { UNITS, UNITS_OF, PEERS, rowOf, colOf, boxOf } from '../util/grid.js';
import { iterate, count } from '../util/bitset.js';

// ---------------------------------------------------------------------------
// Module-private constants
// ---------------------------------------------------------------------------

/** @type {Record<string, number>} Maps canonical technique name to rank (1–15). */
const RANK_BY_NAME = {
  'Naked Single':     1,
  'Hidden Single':    2,
  'Locked Candidates': 3,
  'Naked Pair':       4,
  'Hidden Pair':      5,
  'Naked Triple':     6,
  'Hidden Triple':    7,
  'X-Wing':           8,
  'Swordfish':        9,
  'Jellyfish':        10,
  'XY-Wing':          11,
  'Simple Coloring':  12,
  'Multi-Coloring':   13,
  'XY-Chain':         14,
  'Forcing Chain':    15,
};

/**
 * Chain length threshold above which XY-Chain uses elision mode.
 * @type {number}
 */
const COMPLEXITY_THRESHOLD = 6;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze the current puzzle state and return the next coachable move.
 *
 * @param {{ givens: Uint8Array, solution: Uint8Array }} puzzle
 * @param {{ pen: Uint8Array, conflicts: Set<number>, pencil?: Uint16Array|null }} playerState
 *   Optional `pencil` field: when provided (and non-null), the logical candidate set is
 *   intersected with the user's current pencil marks before the technique ladder runs.
 *   Cells with no pencil marks (pencil[i] === 0) use the full logical set unchanged.
 *   When omitted, null, or undefined, behavior is identical to the pre-pencil form.
 * @returns {CoachStep|NoTechniqueResult}
 */
export function analyze(puzzle, playerState) {
  // Any visible conflict means the board is in an invalid state: refuse to coach.
  // This also covers the case where a correct cell is dragged into the conflict
  // set by a wrong cell carrying the same digit in the same unit, which would
  // cause buildWorkingBoard to exclude the correct value and mislead the solver.
  if (playerState.conflicts.size > 0) {
    return { type: 'no-technique', reason: 'error' };
  }

  // Detect pen entries that contradict the solution but aren't visible as
  // conflicts (no peer has the same digit) — they would corrupt the working
  // board and produce misleading advice if not caught here.
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] !== 0) continue;
    if (playerState.pen[i] === 0) continue;
    if (playerState.pen[i] !== puzzle.solution[i]) {
      return { type: 'no-technique', reason: 'error' };
    }
  }

  const workingBoard = buildWorkingBoard(puzzle, playerState);

  // Compute the initial logical candidate set.
  const candidates = initialCandidates(workingBoard);

  // Intersect logical candidates with user pencil marks where available.
  // Cells with no pencil marks (pencil[i] === 0) use the full logical set.
  if (playerState.pencil != null) {
    for (let i = 0; i < 81; i++) {
      if (playerState.pen[i] !== 0) continue;          // filled cell — pencil irrelevant
      if (playerState.pencil[i] !== 0) {
        candidates[i] &= playerState.pencil[i];        // restrict to what user has noted
      }
    }
  }

  // Run the technique ladder against the (possibly intersected) candidates.
  // solveLogically accepts pre-computed candidates so techniques that require
  // candidates the user has already cleared will not fire.
  const result = solveLogically(workingBoard.slice(), { candidates: candidates.slice() });
  if (result.trace.length === 0) {
    return buildNullStep(workingBoard);
  }
  const step = result.trace[0];
  const techniqueName = canonicalise(step.technique);
  const mapper = MAPPERS[techniqueName];
  const partial = mapper(step, workingBoard, candidates);
  const rank = RANK_BY_NAME[techniqueName];
  return {
    ...partial,
    technique: techniqueName,
    rank,
    type: (rank <= 2) ? 'placement' : 'elimination',
    eliminations: [...step.eliminations],
    autoReveal: buildAutoReveal(partial.roles, candidates, rank),
  };
}

// ---------------------------------------------------------------------------
// Working-board construction
// ---------------------------------------------------------------------------

/**
 * Build the working board: givens overlaid with non-conflicted pen entries.
 *
 * @param {{ givens: Uint8Array }} puzzle
 * @param {{ pen: Uint8Array, conflicts: Set<number> }} playerState
 * @returns {Uint8Array}
 */
function buildWorkingBoard(puzzle, playerState) {
  const working = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] !== 0) {
      working[i] = puzzle.givens[i];
    } else if (playerState.pen[i] !== 0 && !playerState.conflicts.has(i)) {
      working[i] = playerState.pen[i];
    }
    // else remains 0
  }
  return working;
}

// ---------------------------------------------------------------------------
// Null / no-technique case
// ---------------------------------------------------------------------------

/**
 * @param {Uint8Array} workingBoard
 * @returns {{ type: 'no-technique', reason: 'complete'|'inconsistent' }}
 */
function buildNullStep(workingBoard) {
  const allFilled = workingBoard.every(v => v !== 0);
  return { type: 'no-technique', reason: allFilled ? 'complete' : 'inconsistent' };
}

// ---------------------------------------------------------------------------
// Auto-reveal payload
// ---------------------------------------------------------------------------

/**
 * Build the autoReveal payload from cell roles.
 *
 * @param {object} roles
 * @param {Uint16Array} candidates
 * @param {number} rank
 * @returns {{ required: boolean, cells: Array<{cellIndex:number, candidates:number}> }}
 */
function buildAutoReveal(roles, candidates, rank) {
  const required = rank >= 3;
  const all = new Set();
  if (roles.target !== null) all.add(roles.target);
  for (const c of roles.cause)      all.add(c);
  for (const c of roles.elimTarget) all.add(c);
  for (const c of roles.unitMember) all.add(c);
  for (const c of roles.scA)        all.add(c);
  for (const c of roles.scB)        all.add(c);
  const sorted = [...all].sort((a, b) => a - b);
  return {
    required,
    cells: sorted.map(i => ({ cellIndex: i, candidates: candidates[i] })),
  };
}

// ---------------------------------------------------------------------------
// Technique name normalisation
// ---------------------------------------------------------------------------

/**
 * Strip any parenthetical suffix from a technique name.
 * e.g. 'Locked Candidates (pointing)' → 'Locked Candidates'
 *
 * @param {string} name
 * @returns {string}
 */
function canonicalise(name) {
  return name.replace(/\s*\(.*?\)\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Unit identification helpers
// ---------------------------------------------------------------------------

/**
 * Return { type, index } for a UNITS_OF entry.
 *
 * @param {number} cellIdx
 * @param {number} unitSlot - 0=row, 1=col, 2=box
 * @returns {{ type: 'row'|'col'|'box', index: number }}
 */
function unitDescriptor(cellIdx, unitSlot) {
  const types = ['row', 'col', 'box'];
  const indexFns = [rowOf, colOf, boxOf];
  return { type: types[unitSlot], index: indexFns[unitSlot](cellIdx) };
}

/**
 * Find the shared unit for a set of cells. Returns the first unit (row, col,
 * box order) that contains ALL of the given cells.
 *
 * @param {number[]} cells
 * @returns {{ type: 'row'|'col'|'box', index: number }|null}
 */
function sharedUnit(cells) {
  if (cells.length === 0) return null;
  for (let slot = 0; slot < 3; slot++) {
    const unitOf = UNITS_OF[cells[0]][slot];
    if (cells.every(c => unitOf.includes(c))) {
      return unitDescriptor(cells[0], slot);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Coloring chain-edge derivation
// ---------------------------------------------------------------------------

/**
 * Given a set of chain cells and a digit, derive the bilocation edges.
 * Two cells a,b share an edge iff they share a unit where digit D has exactly
 * 2 candidates, one in a and one in b.
 *
 * @param {number[]} chainCells - All cells in the chain (both groups).
 * @param {number} d - The coloring digit.
 * @param {Uint16Array} candidates
 * @returns {Array<{from:number, to:number}>}
 */
function deriveChainEdges(chainCells, d, candidates) {
  const bit = 1 << (d - 1);
  const cellSet = new Set(chainCells);
  const edges = [];
  const seen = new Set();

  for (const unit of UNITS) {
    const inChain = unit.filter(c => cellSet.has(c) && (candidates[c] & bit));
    if (inChain.length !== 2) continue;
    const [a, b] = inChain;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: a, to: b });
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Per-technique mappers
// ---------------------------------------------------------------------------

/**
 * Each mapper receives (step, workingBoard, candidates) and returns a partial
 * CoachStep (everything except technique, rank, type, eliminations, autoReveal).
 */

/** @type {Record<string, Function>} */
const MAPPERS = {

  // -------------------------------------------------------------------------
  // Rank 1: Naked Single
  // -------------------------------------------------------------------------
  'Naked Single'(step, workingBoard, candidates) {
    const target = step.cellIndex;
    const D = step.digit;
    const dBit = 1 << (D - 1);

    // For each non-D digit that is absent from candidates[target], find the
    // first (row-major) peer that eliminates it. Deduplicate.
    const causeCells = [];
    const seen = new Set();
    for (let d = 1; d <= 9; d++) {
      if (d === D) continue;
      const dBitD = 1 << (d - 1);
      if (candidates[target] & dBitD) continue; // d is still a candidate — not eliminated
      // Find first peer (row-major) with value d
      let first = null;
      for (const peer of PEERS[target]) {
        if (workingBoard[peer] === d && (first === null || peer < first)) {
          first = peer;
        }
      }
      if (first !== null && !seen.has(first)) {
        seen.add(first);
        causeCells.push(first);
      }
    }
    causeCells.sort((a, b) => a - b);

    return {
      roles: {
        target,
        cause: causeCells,
        elimTarget: [],
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows: causeCells.map(peer => ({ from: peer, to: target, style: 'straight-arrow' })),
      supportingText: `Only *${D}* can go here — all other digits appear in this cell's row, column, or box.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 2: Hidden Single
  // -------------------------------------------------------------------------
  'Hidden Single'(step, workingBoard, candidates) {
    const target = step.cellIndex;
    const D = step.digit;
    const dBit = 1 << (D - 1);

    // Find which unit D is hidden in: first unit (row, col, box) where all
    // other 8 cells have D eliminated or are filled.
    let hidingUnitSlot = -1;
    let unitDesc = null;
    for (let slot = 0; slot < 3; slot++) {
      const unit = UNITS_OF[target][slot];
      const others = unit.filter(c => c !== target);
      const allEliminated = others.every(c =>
        workingBoard[c] !== 0 || !(candidates[c] & dBit)
      );
      if (allEliminated) {
        hidingUnitSlot = slot;
        unitDesc = unitDescriptor(target, slot);
        break;
      }
    }

    const unitMembers = hidingUnitSlot >= 0
      ? UNITS_OF[target][hidingUnitSlot].filter(c => c !== target)
      : [];

    const unitTypeName = unitDesc ? unitDesc.type : 'unit';
    const hidingUnitType = unitDesc ? unitDesc.type : null;

    // For each empty non-target cell E in the unit, find which filled D-cells
    // outside the unit force its elimination. Check columns (for row/box HS),
    // rows (for col/box HS), and boxes (for row/col HS). Deduplicate (from,to).
    const checkCol = hidingUnitType !== 'col';
    const checkRow = hidingUnitType !== 'row';
    const checkBox = hidingUnitType !== 'box';

    const arrowKeys = new Set();
    const arrows = [];
    const causeSet = new Set();

    for (const E of unitMembers) {
      if (workingBoard[E] !== 0) continue;

      if (checkCol) {
        for (const c of UNITS_OF[E][1]) {
          if (workingBoard[c] === D) {
            const key = `${c},${E}`;
            if (!arrowKeys.has(key)) {
              arrowKeys.add(key);
              arrows.push({ from: c, to: E, style: 'elim-line' });
              causeSet.add(c);
            }
            break;
          }
        }
      }

      if (checkRow) {
        for (const c of UNITS_OF[E][0]) {
          if (workingBoard[c] === D) {
            const key = `${c},${E}`;
            if (!arrowKeys.has(key)) {
              arrowKeys.add(key);
              arrows.push({ from: c, to: E, style: 'elim-line' });
              causeSet.add(c);
            }
            break;
          }
        }
      }

      if (checkBox) {
        for (const c of UNITS_OF[E][2]) {
          if (workingBoard[c] === D) {
            const key = `${c},${E}`;
            if (!arrowKeys.has(key)) {
              arrowKeys.add(key);
              arrows.push({ from: c, to: E, style: 'elim-line' });
              causeSet.add(c);
            }
            break;
          }
        }
      }
    }

    const causeCells = [...causeSet].sort((a, b) => a - b);

    return {
      roles: {
        target,
        cause: causeCells,
        elimTarget: [],
        unitMember: unitMembers,
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: unitDesc,
      arrows,
      supportingText: `*${D}* can only go in one place in this *${unitTypeName}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 3: Locked Candidates
  // -------------------------------------------------------------------------
  'Locked Candidates'(step, workingBoard, candidates) {
    const D = step.eliminations[0].digit;
    const dBit = 1 << (D - 1);
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);

    // Re-derive the locked intersection from the current candidate set,
    // mirroring the solver's own checks. This gives us both the correct
    // variant text and the actual cause cells (used for highlighting and
    // arrows), avoiding the heuristic "sees all elim targets" approach which
    // picks up spurious cells and can misplace arrows.
    const dCandCells = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] === 0 && (candidates[i] & dBit)) dCandCells.push(i);
    }
    const elimSet = new Set(elimTargets);

    let variantText = '';
    let causeCells = [];

    // Try pointing: some box has all its D candidates in one row or column,
    // and the elim targets are exactly the D candidates in that line outside the box.
    let found = false;
    for (let b = 0; b < 9 && !found; b++) {
      const inBox = dCandCells.filter(c => boxOf(c) === b);
      if (inBox.length < 2) continue;

      const boxRows = [...new Set(inBox.map(rowOf))];
      if (boxRows.length === 1) {
        const r = boxRows[0];
        const exp = dCandCells.filter(c => rowOf(c) === r && boxOf(c) !== b);
        if (exp.length === elimTargets.length && exp.every(e => elimSet.has(e))) {
          variantText = `*${D}* in this box is confined to this *row* — eliminate it from the rest of that *row*.`;
          causeCells = inBox;
          found = true;
          break;
        }
      }

      const boxCols = [...new Set(inBox.map(colOf))];
      if (!found && boxCols.length === 1) {
        const col = boxCols[0];
        const exp = dCandCells.filter(c => colOf(c) === col && boxOf(c) !== b);
        if (exp.length === elimTargets.length && exp.every(e => elimSet.has(e))) {
          variantText = `*${D}* in this box is confined to this *column* — eliminate it from the rest of that *column*.`;
          causeCells = inBox;
          found = true;
        }
      }
    }

    // Try claiming: some row or column has all its D candidates in one box,
    // and the elim targets are exactly the D candidates in that box outside the line.
    for (let r = 0; r < 9 && !found; r++) {
      const inRow = dCandCells.filter(c => rowOf(c) === r);
      if (inRow.length < 2) continue;
      const rowBoxes = [...new Set(inRow.map(boxOf))];
      if (rowBoxes.length === 1) {
        const b = rowBoxes[0];
        const exp = dCandCells.filter(c => boxOf(c) === b && rowOf(c) !== r);
        if (exp.length === elimTargets.length && exp.every(e => elimSet.has(e))) {
          variantText = `*${D}* in this *row* is confined to this box — eliminate it from the rest of that box.`;
          causeCells = inRow;
          found = true;
        }
      }
    }

    for (let col = 0; col < 9 && !found; col++) {
      const inCol = dCandCells.filter(c => colOf(c) === col);
      if (inCol.length < 2) continue;
      const colBoxes = [...new Set(inCol.map(boxOf))];
      if (colBoxes.length === 1) {
        const b = colBoxes[0];
        const exp = dCandCells.filter(c => boxOf(c) === b && colOf(c) !== col);
        if (exp.length === elimTargets.length && exp.every(e => elimSet.has(e))) {
          variantText = `*${D}* in this *column* is confined to this box — eliminate it from the rest of that box.`;
          causeCells = inCol;
          found = true;
        }
      }
    }

    const arrows = elimTargets.map(e => ({
      from: causeCells[0] ?? step.cellIndex,
      to: e,
      style: 'dashed-arrow',
    }));

    return {
      roles: {
        target: null,
        cause: causeCells,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows,
      supportingText: variantText,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 4: Naked Pair
  // -------------------------------------------------------------------------
  'Naked Pair'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const allElimDigits = new Set(step.eliminations.map(e => e.digit));

    // Find the two pair cells: cells with identical 2-bit candidate masks whose
    // digits match the elimination digits and that share a unit with all elim targets.
    let pairCells = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0) continue;
      if (count(candidates[i]) !== 2) continue;
      const mask = candidates[i];
      // Pair digits must match the elim digits (guards against wrong pair in same unit).
      if (!iterate(mask).every(d => allElimDigits.has(d))) continue;
      // Find a partner
      for (let j = i + 1; j < 81; j++) {
        if (workingBoard[j] !== 0) continue;
        if (candidates[j] !== mask) continue;
        // Both share a unit
        const pairUnit = sharedUnit([i, j]);
        if (!pairUnit) continue;
        // All elim targets must be in the same unit as the pair
        const pairUnitCells = UNITS_OF[i][['row', 'col', 'box'].indexOf(pairUnit.type)];
        if (elimTargets.every(e => pairUnitCells.includes(e) && e !== i && e !== j)) {
          pairCells = [i, j];
          break;
        }
      }
      if (pairCells.length === 2) break;
    }

    pairCells.sort((a, b) => a - b);
    const digits = pairCells.length === 2 ? iterate(candidates[pairCells[0]]) : [];
    const unitDesc = pairCells.length === 2 ? sharedUnit(pairCells) : null;
    const unitTypeName = unitDesc ? unitDesc.type : 'unit';

    const arrows = [];
    if (pairCells.length === 2) {
      arrows.push({ from: pairCells[0], to: pairCells[1], style: 'bezier-arc' });
    }
    for (const e of elimTargets) {
      arrows.push({ from: pairCells[0] ?? step.cellIndex, to: e, style: 'dashed-arrow' });
    }

    const [A, B] = digits;
    return {
      roles: {
        target: null,
        cause: pairCells,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits,
      unit: unitDesc,
      arrows,
      supportingText: `These two cells must contain *${A}* and *${B}* — eliminate both from the rest of this *${unitTypeName}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 5: Hidden Pair
  // -------------------------------------------------------------------------
  'Hidden Pair'(step, workingBoard, candidates) {
    // Elim targets are within the cause cells (non-pair candidates removed).
    const elimCells = [...new Set(step.eliminations.map(e => e.cellIndex))];
    // The pair cells are the cells receiving eliminations.
    let pairCells = [...elimCells].sort((a, b) => a - b);

    // One pair cell may already hold only the hidden digits (no extras), so
    // the solver emits no eliminations for it and it won't appear in elimCells.
    // Recover the missing partner by scanning units for the cell that contains
    // exactly the hidden digits (candidates of the known cell minus its elims).
    if (pairCells.length === 1) {
      const knownCell = pairCells[0];
      const elimBits = step.eliminations
        .reduce((m, e) => m | (1 << (e.digit - 1)), 0);
      const hiddenMask = candidates[knownCell] & ~elimBits;
      outer:
      for (let slot = 0; slot < 3; slot++) {
        const unit = UNITS_OF[knownCell][slot];
        for (const c of unit) {
          if (c === knownCell || workingBoard[c] !== 0) continue;
          if ((candidates[c] & hiddenMask) === hiddenMask) {
            const others = unit.filter(x => x !== knownCell && x !== c);
            if (others.every(x => workingBoard[x] !== 0 || !(candidates[x] & hiddenMask))) {
              pairCells = [knownCell, c].sort((a, b) => a - b);
              break outer;
            }
          }
        }
      }
    }

    const unitDesc = sharedUnit(pairCells);

    // Find the two hidden digits: digits that appear only in these two cells within the unit.
    let hiddenDigits = [];
    if (unitDesc && pairCells.length === 2) {
      const slotIndex = ['row', 'col', 'box'].indexOf(unitDesc.type);
      const unit = UNITS_OF[pairCells[0]][slotIndex];
      const others = unit.filter(c => !pairCells.includes(c));
      for (let d = 1; d <= 9; d++) {
        const dBit = 1 << (d - 1);
        const inPair = pairCells.some(c => candidates[c] & dBit);
        const inOthers = others.some(c => workingBoard[c] === 0 && (candidates[c] & dBit));
        if (inPair && !inOthers) hiddenDigits.push(d);
      }
    }
    hiddenDigits.sort((a, b) => a - b);
    const [A, B] = hiddenDigits;
    const unitTypeName = unitDesc ? unitDesc.type : 'unit';

    return {
      roles: {
        target: null,
        cause: pairCells,
        elimTarget: [],
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: hiddenDigits,
      unit: unitDesc,
      arrows: [],
      supportingText: `*${A}* and *${B}* can only go in these two cells in this *${unitTypeName}* — all other candidates in these cells can be removed.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 6: Naked Triple
  // -------------------------------------------------------------------------
  'Naked Triple'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);

    // Find the three triple cells: each holds 2–3 of the 3 shared digits,
    // all in the same unit as the elim targets.
    let tripleCells = [];
    const allElimDigits = new Set(step.eliminations.map(e => e.digit));

    // Search: find 3 empty cells sharing a unit where their union of candidates
    // equals exactly 3 bits matching allElimDigits, and each cell is a subset.
    outer:
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0 || count(candidates[i]) === 0) continue;
      for (let j = i + 1; j < 81; j++) {
        if (workingBoard[j] !== 0 || count(candidates[j]) === 0) continue;
        for (let k = j + 1; k < 81; k++) {
          if (workingBoard[k] !== 0 || count(candidates[k]) === 0) continue;
          const union = candidates[i] | candidates[j] | candidates[k];
          if (count(union) !== 3) continue;
          // All digits in union must match
          const unionDigits = iterate(union);
          if (!unionDigits.every(d => allElimDigits.has(d))) continue;
          // Must share a unit
          const tripleUnit = sharedUnit([i, j, k]);
          if (!tripleUnit) continue;
          // Elim targets must be in the same unit
          const slotIndex = ['row', 'col', 'box'].indexOf(tripleUnit.type);
          const unitCells = UNITS_OF[i][slotIndex];
          if (elimTargets.every(e => unitCells.includes(e) && e !== i && e !== j && e !== k)) {
            tripleCells = [i, j, k];
            break outer;
          }
        }
      }
    }

    tripleCells.sort((a, b) => a - b);
    const tripleUnion = tripleCells.reduce((acc, c) => acc | candidates[c], 0);
    const digits = iterate(tripleUnion);
    const unitDesc = sharedUnit(tripleCells);
    const unitTypeName = unitDesc ? unitDesc.type : 'unit';

    const arrows = [];
    for (let idx = 0; idx < tripleCells.length - 1; idx++) {
      arrows.push({ from: tripleCells[idx], to: tripleCells[idx + 1], style: 'bezier-arc' });
    }
    for (const e of elimTargets) {
      arrows.push({ from: tripleCells[0] ?? step.cellIndex, to: e, style: 'dashed-arrow' });
    }

    const [A, B, C] = digits;
    return {
      roles: {
        target: null,
        cause: tripleCells,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits,
      unit: unitDesc,
      arrows,
      supportingText: `These three cells hold only *${A}*, *${B}*, and *${C}* — eliminate those candidates from the rest of this *${unitTypeName}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 7: Hidden Triple
  // -------------------------------------------------------------------------
  'Hidden Triple'(step, workingBoard, candidates) {
    // Same structure as Hidden Pair but with 3 cells.
    const elimCells = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const tripleCells = elimCells;
    const unitDesc = sharedUnit(tripleCells);

    let hiddenDigits = [];
    if (unitDesc && tripleCells.length === 3) {
      const slotIndex = ['row', 'col', 'box'].indexOf(unitDesc.type);
      const unit = UNITS_OF[tripleCells[0]][slotIndex];
      const others = unit.filter(c => !tripleCells.includes(c));
      for (let d = 1; d <= 9; d++) {
        const dBit = 1 << (d - 1);
        const inTriple = tripleCells.some(c => candidates[c] & dBit);
        const inOthers = others.some(c => workingBoard[c] === 0 && (candidates[c] & dBit));
        if (inTriple && !inOthers) hiddenDigits.push(d);
      }
    }
    hiddenDigits.sort((a, b) => a - b);
    const [A, B, C] = hiddenDigits;
    const unitTypeName = unitDesc ? unitDesc.type : 'unit';

    return {
      roles: {
        target: null,
        cause: tripleCells,
        elimTarget: [],
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: hiddenDigits,
      unit: unitDesc,
      arrows: [],
      supportingText: `*${A}*, *${B}*, and *${C}* can only appear in these three cells in this *${unitTypeName}* — remove all other candidates from these cells.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 8: X-Wing
  // -------------------------------------------------------------------------
  'X-Wing'(step, workingBoard, candidates) {
    const D = step.eliminations[0].digit;
    const dBit = 1 << (D - 1);
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);

    // Identify the 4 corner cells: all empty cells with D as candidate that share
    // a unit with at least one elim target but are NOT elim targets.
    // The X-Wing cause cells are the cells from which eliminations derive.
    // They form a 2×2 rectangle.
    const causeCandidates = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0) continue;
      if (!(candidates[i] & dBit)) continue;
      if (elimTargets.includes(i)) continue;
      causeCandidates.push(i);
    }

    // Pick the 4 corners: find the unique r1,r2,c1,c2 rectangle.
    // The X-Wing pattern means cause cells share exactly 2 rows and 2 columns.
    const rows = [...new Set(causeCandidates.map(c => rowOf(c)))].sort((a, b) => a - b);
    const cols = [...new Set(causeCandidates.map(c => colOf(c)))].sort((a, b) => a - b);

    // Use the min/max rows and cols as the bounding box corners.
    const r1 = rows[0], r2 = rows[rows.length - 1];
    const c1 = cols[0], c2 = cols[cols.length - 1];

    // Clockwise from top-left: TL, TR, BR, BL
    const corners = [
      r1 * 9 + c1,
      r1 * 9 + c2,
      r2 * 9 + c2,
      r2 * 9 + c1,
    ];

    // Determine orientation: row-locked if base units are rows, col-locked if columns.
    // Check whether elim targets share rows with corners (col-locked) or share cols (row-locked).
    const elimRows = new Set(elimTargets.map(e => rowOf(e)));
    const cornerRows = new Set([r1, r2]);
    // If elim targets are in the same rows as corners → row-locked orientation
    // (elims are in the cover columns).
    // If elim targets are in the same cols as corners → col-locked.
    const cornerCols = new Set([c1, c2]);
    const elimCols = new Set(elimTargets.map(e => colOf(e)));
    const sameRows = [...elimRows].every(r => cornerRows.has(r));
    const sameCols = [...elimCols].every(c => cornerCols.has(c));

    let supportingText;
    if (sameCols && !sameRows) {
      // Column-locked: base units are columns, cover units are rows
      supportingText = `*${D}* only appears in these two rows within these two columns — it can't appear elsewhere in those rows.`;
    } else {
      // Row-locked (default): base units are rows, cover units are columns
      supportingText = `*${D}* only appears in these two columns within these two rows — it can't appear elsewhere in those columns.`;
    }

    const arrows = [
      { points: corners, style: 'connector-chain' },
      ...elimTargets.map(e => ({ from: corners[0], to: e, style: 'dashed-arrow' })),
    ];

    return {
      roles: {
        target: null,
        cause: corners,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows,
      supportingText,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 9: Swordfish
  // -------------------------------------------------------------------------
  'Swordfish'(step, workingBoard, candidates) {
    const D = step.eliminations[0].digit;
    const dBit = 1 << (D - 1);
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);

    // Pattern cells: empty cells with D candidate that are not elim targets.
    const patternCells = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0) continue;
      if (!(candidates[i] & dBit)) continue;
      if (elimTargets.includes(i)) continue;
      patternCells.push(i);
    }
    patternCells.sort((a, b) => a - b);

    const rows = [...new Set(patternCells.map(c => rowOf(c)))].sort((a, b) => a - b);
    const cols = [...new Set(patternCells.map(c => colOf(c)))].sort((a, b) => a - b);

    const r1 = rows[0], r3 = rows[rows.length - 1];
    const c1 = cols[0], c3 = cols[cols.length - 1];

    // Orientation: if 3 distinct rows → row-based; if 3 distinct cols → col-based.
    const elimRows = new Set(elimTargets.map(e => rowOf(e)));
    const patRows = new Set(rows);
    const elimCols = new Set(elimTargets.map(e => colOf(e)));
    const patCols = new Set(cols);
    const rowLocked = [...elimCols].every(c => patCols.has(c));

    const corners = [
      r1 * 9 + c1,
      r1 * 9 + c3,
      r3 * 9 + c3,
      r3 * 9 + c1,
    ];

    const supportingText = rowLocked
      ? `*${D}* across these three rows is locked to these three columns — eliminate it from the rest of those columns.`
      : `*${D}* across these three columns is locked to these three rows — eliminate it from the rest of those rows.`;

    return {
      roles: {
        target: null,
        cause: patternCells,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows: [{ points: corners, style: 'connector-chain' }],
      supportingText,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 10: Jellyfish
  // -------------------------------------------------------------------------
  'Jellyfish'(step, workingBoard, candidates) {
    const D = step.eliminations[0].digit;
    const dBit = 1 << (D - 1);
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);

    const patternCells = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0) continue;
      if (!(candidates[i] & dBit)) continue;
      if (elimTargets.includes(i)) continue;
      patternCells.push(i);
    }
    patternCells.sort((a, b) => a - b);

    const rows = [...new Set(patternCells.map(c => rowOf(c)))].sort((a, b) => a - b);
    const cols = [...new Set(patternCells.map(c => colOf(c)))].sort((a, b) => a - b);

    const r1 = rows[0], r4 = rows[rows.length - 1];
    const c1 = cols[0], c4 = cols[cols.length - 1];

    const elimCols = new Set(elimTargets.map(e => colOf(e)));
    const patCols = new Set(cols);
    const rowLocked = [...elimCols].every(c => patCols.has(c));

    const corners = [
      r1 * 9 + c1,
      r1 * 9 + c4,
      r4 * 9 + c4,
      r4 * 9 + c1,
    ];

    const supportingText = rowLocked
      ? `*${D}* across these four rows is locked to these four columns — eliminate it from the rest of those columns.`
      : `*${D}* across these four columns is locked to these four rows — eliminate it from the rest of those rows.`;

    return {
      roles: {
        target: null,
        cause: patternCells,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows: [{ points: corners, style: 'connector-chain' }],
      supportingText,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 11: XY-Wing
  // -------------------------------------------------------------------------
  'XY-Wing'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const Z = step.eliminations[0].digit;
    const zBit = 1 << (Z - 1);

    // Find hinge and wings from the bivalue cells involved.
    // The hinge is the cell {X,Y}; wing1 {X,Z}; wing2 {Y,Z}.
    // All three must be bivalue and the hinge must peer both wings.
    let hinge = -1, wing1 = -1, wing2 = -1;

    // Collect all bivalue empty cells that see any elim target.
    const bivalue = [];
    for (let i = 0; i < 81; i++) {
      if (workingBoard[i] !== 0) continue;
      if (count(candidates[i]) !== 2) continue;
      bivalue.push(i);
    }

    outer:
    for (const h of bivalue) {
      const [X, Y] = iterate(candidates[h]);
      for (const w1 of bivalue) {
        if (w1 === h) continue;
        if (!PEERS[h].includes(w1)) continue;
        const w1Cands = candidates[w1];
        if (!(w1Cands & (1 << (X - 1))) && !(w1Cands & (1 << (Y - 1)))) continue;
        const sharedXW1 = !!(w1Cands & (1 << (X - 1)));
        if (sharedXW1 && !!(w1Cands & (1 << (Y - 1)))) continue;
        const zFromW1 = iterate(w1Cands).find(d => d !== (sharedXW1 ? X : Y));
        if (zFromW1 !== Z) continue;

        const otherHinge = sharedXW1 ? Y : X;
        const neededMask = (1 << (otherHinge - 1)) | zBit;

        for (const w2 of bivalue) {
          if (w2 === h || w2 === w1) continue;
          if (!PEERS[h].includes(w2)) continue;
          if (candidates[w2] !== neededMask) continue;
          hinge = h; wing1 = w1; wing2 = w2;
          break outer;
        }
      }
    }

    const cause = hinge >= 0 ? [hinge, wing1, wing2].sort((a, b) => a - b) : [];
    // Preserve hinge-first order per spec, but keep hinge first.
    const causeSorted = hinge >= 0
      ? [hinge, ...[wing1, wing2].sort((a, b) => a - b)]
      : [];

    const arrows = [];
    if (hinge >= 0) {
      arrows.push({ from: hinge, to: wing1, style: 'chain-edge', strong: true });
      arrows.push({ from: hinge, to: wing2, style: 'chain-edge', strong: true });
      for (const e of elimTargets) {
        arrows.push({ from: wing1, to: e, style: 'dashed-arrow' });
        arrows.push({ from: wing2, to: e, style: 'dashed-arrow' });
      }
    }

    return {
      roles: {
        target: null,
        cause: causeSorted,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [Z],
      unit: null,
      arrows,
      supportingText: `One of these two wings must contain *${Z}* — cells seeing both wings can't contain *${Z}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 12: Simple Coloring
  // -------------------------------------------------------------------------
  'Simple Coloring'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const colorChain = step.colorChain;
    const D = colorChain.digit;

    const allChainCells = [...colorChain.groupA, ...colorChain.groupB];
    const edges = deriveChainEdges(allChainCells, D, candidates);

    return {
      roles: {
        target: null,
        cause: [],
        elimTarget: elimTargets,
        unitMember: [],
        scA: colorChain.groupA,
        scB: colorChain.groupB,
      },
      digits: [D],
      unit: null,
      arrows: edges.map(e => ({ from: e.from, to: e.to, style: 'chain-edge', strong: true })),
      supportingText: `These linked cells must alternate between two values for *${D}*. Two same-color cells see each other — that group can't be *${D}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 13: Multi-Coloring
  // -------------------------------------------------------------------------
  'Multi-Coloring'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const colorChains = step.colorChains;
    const D = colorChains[0].digit;

    const groupA = colorChains[0].groupA;
    const groupB = colorChains[0].groupB;

    // Derive intra-chain edges for both chains.
    const edgesA = deriveChainEdges(groupA, D, candidates);
    const edgesB = deriveChainEdges(groupB, D, candidates);
    const allEdges = [...edgesA, ...edgesB];

    return {
      roles: {
        target: null,
        cause: [],
        elimTarget: elimTargets,
        unitMember: [],
        scA: groupA,
        scB: groupB,
      },
      digits: [D],
      unit: null,
      arrows: allEdges.map(e => ({ from: e.from, to: e.to, style: 'chain-edge', strong: true })),
      supportingText: `Two separate chains for *${D}* interact. A cell that sees one color from each chain can't be *${D}*.`,
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 14: XY-Chain
  // -------------------------------------------------------------------------
  'XY-Chain'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const chain = step.chain; // { cells: int[], digit: int }
    const D = chain.digit;
    const cells = chain.cells;
    const L = cells.length;
    const endpoints = [cells[0], cells[L - 1]];
    const isLong = L > COMPLEXITY_THRESHOLD;

    let cause, arrows;
    if (isLong) {
      cause = endpoints.slice();
      arrows = [{ from: endpoints[0], to: endpoints[1], style: 'dashed-arrow' }];
    } else {
      cause = cells.slice();
      arrows = [];
      for (let i = 0; i < cells.length - 1; i++) {
        arrows.push({ from: cells[i], to: cells[i + 1], style: 'chain-edge', strong: false });
      }
    }

    return {
      roles: {
        target: null,
        cause,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [D],
      unit: null,
      arrows,
      supportingText: `A chain of two-candidate cells passes *${D}* from one end to the other. Cells seeing both ends can't contain *${D}*.`,
      complexity: {
        acknowledged: isLong,
        note: isLong
          ? 'This is a long chain — the highlights show the endpoints. Trace the links yourself to verify.'
          : null,
        endpoints,
      },
    };
  },

  // -------------------------------------------------------------------------
  // Rank 15: Forcing Chain
  // -------------------------------------------------------------------------
  'Forcing Chain'(step, workingBoard, candidates) {
    const elimTargets = [...new Set(step.eliminations.map(e => e.cellIndex))].sort((a, b) => a - b);
    const chain = step.chain; // { nodes: Array<{cell, digit, strong}> }
    const nodes = chain.nodes;
    const L = nodes.length;
    const endpointCells = [nodes[0].cell, nodes[L - 1].cell];
    const isLong = L > COMPLEXITY_THRESHOLD;

    // cause: endpoints only for long; interior + endpoints for short.
    const cause = isLong
      ? endpointCells
      : [...new Set(nodes.map(n => n.cell))].sort((a, b) => a - b);

    const arrows = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      arrows.push({
        from: nodes[i].cell,
        to: nodes[i + 1].cell,
        style: 'chain-edge',
        strong: nodes[i + 1].strong,
      });
    }

    const targetRef = step.eliminations[0].cellIndex;
    const targetRow = rowOf(targetRef) + 1;
    const targetCol = colOf(targetRef) + 1;

    return {
      roles: {
        target: null,
        cause,
        elimTarget: elimTargets,
        unitMember: [],
        scA: [],
        scB: [],
      },
      digits: [nodes[0].digit],
      unit: null,
      arrows,
      supportingText: `An alternating chain of strong and weak links forces *${nodes[0].digit}* into (or out of) *row ${targetRow}, column ${targetCol}*.`,
      complexity: {
        acknowledged: true,
        note: 'This technique involves a long chain of forced inferences. The highlighted cells show where to start and what the conclusion is. Working through the full chain is an advanced exercise.',
        endpoints: endpointCells,
      },
    };
  },
};
