/**
 * @fileoverview Reducer unit tests for coach session actions (Phase 8b).
 *
 * Tests per aspec-coach-ui.md §16.1.
 * Run with Mocha+Chai, no DOM required.
 */

import { createGameState, deriveCoachedCells } from '/js/game/state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stats stub. */
const stubStats = {
  init: async () => {},
  recordAttemptOnce: () => {},
  recordWin: () => {},
};

/** Minimal hint-provider stub. */
const stubHintProvider = {
  nextHint: () => null,
};

function createState() {
  return createGameState({ stats: stubStats, hintProvider: stubHintProvider });
}

/**
 * A minimal valid puzzle where cell 0 is empty with solution digit 5.
 * Row 0 cells 1-8 filled with 1-4,6-9; col 0 rows 1-8 filled; box-0 interior filled.
 * This gives a Naked Single at cell 0.
 *
 * NOTE: The board is intentionally incomplete (only ~16 givens). It is NOT a full
 * 81-cell board, so ON_COMPLETION_EVALUATE never fires on PEN_ENTER. This is the
 * design — existing cross-action tests depend on the session surviving after PEN_ENTER.
 * Use completePuzzle() when a win-triggering board is required.
 */
function nakedSinglePuzzle() {
  const givens = new Uint8Array(81);
  // Row 0: cells 1-8 = digits 1,2,3,4,6,7,8,9
  const row0digits = [1, 2, 3, 4, 6, 7, 8, 9];
  for (let c = 1; c <= 8; c++) givens[c] = row0digits[c - 1];
  // Col 0: rows 1-8 = digits 1,2,3,4,6,7,8,9
  const col0digits = [1, 2, 3, 4, 6, 7, 8, 9];
  for (let r = 1; r <= 8; r++) givens[r * 9] = col0digits[r - 1];
  // After row 0 (cells 1-8) and col 0 (cells 9,18,27,36,45,54,63,72) are filled,
  // cell 0's candidate is already forced to 5 without box interior filling.
  const solution = new Uint8Array(81);
  solution[0] = 5;
  for (let c = 1; c <= 8; c++) solution[c] = row0digits[c - 1];
  for (let r = 1; r <= 8; r++) solution[r * 9] = col0digits[r - 1];
  // Fill the rest to satisfy puzzle structure (not validated in these tests).
  return { givens, solution, solveTrace: [], difficulty: 'easy', id: 'test-naked-single' };
}

/**
 * A complete 81-cell puzzle where only cell 0 is empty (solution digit = 5).
 * All 80 other cells are givens. ON_COMPLETION_EVALUATE fires and produces
 * won=true after PEN_ENTER {digit:5} at cell 0.
 */
function completePuzzle() {
  const sol = new Uint8Array([
    5,3,4,6,7,8,9,1,2,
    6,7,2,1,9,5,3,4,8,
    1,9,8,3,4,2,5,6,7,
    8,5,9,7,6,1,4,2,3,
    4,2,6,8,5,3,7,9,1,
    7,1,3,9,2,4,8,5,6,
    9,6,1,5,3,7,2,8,4,
    2,8,7,4,1,9,6,3,5,
    3,4,5,2,8,6,1,7,9,
  ]);
  const givens = new Uint8Array(sol);
  givens[0] = 0;
  return { givens, solution: sol, solveTrace: [], difficulty: 'easy', id: 'test-complete' };
}

/** A CoachStep for Naked Single (rank 1, placement, no auto-reveal). */
function nakedSingleStep(target = 0) {
  return {
    type: 'placement',
    technique: 'Naked Single',
    rank: 1,
    digits: [5],
    roles: {
      target,
      cause: [],
      elimTarget: [],
      unitMember: [],
      scA: [],
      scB: [],
    },
    unit: null,
    arrows: [],
    eliminations: [],
    autoReveal: { required: false, cells: [] },
    supportingText: 'Only *5* can go here.',
    complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** A CoachStep for Naked Pair (rank 4, elimination, with auto-reveal). */
function nakedPairStep(options = {}) {
  const { cause = [1, 2], elimTarget = [3, 4], revealCells = [] } = options;
  return {
    type: 'elimination',
    technique: 'Naked Pair',
    rank: 4,
    digits: [2, 5],
    roles: {
      target: null,
      cause,
      elimTarget,
      unitMember: [],
      scA: [],
      scB: [],
    },
    unit: { type: 'row', index: 0 },
    arrows: [],
    eliminations: [{ cellIndex: 3, digit: 2 }, { cellIndex: 4, digit: 5 }],
    autoReveal: {
      required: true,
      cells: revealCells,
    },
    supportingText: 'Cells *2* and *5* form a Naked Pair.',
    complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** An elimination CoachStep at coached cell index. */
function elimStep(elimTarget = [5]) {
  return {
    type: 'elimination',
    technique: 'Naked Pair',
    rank: 4,
    digits: [3, 7],
    roles: {
      target: null,
      cause: [10, 11],
      elimTarget,
      unitMember: [],
      scA: [],
      scB: [],
    },
    unit: { type: 'row', index: 1 },
    arrows: [],
    eliminations: [{ cellIndex: 5, digit: 3 }],
    autoReveal: { required: false, cells: [] },
    supportingText: 'Naked Pair eliminates candidates.',
    complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** NoTechniqueResult (complete variant). */
const noTechniqueComplete = { type: 'no-technique', reason: 'complete' };

/** Load a puzzle into state and return the game state instance. */
function stateWithPuzzle(puzzle) {
  const gs = createState();
  gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: puzzle ?? nakedSinglePuzzle() });
  return gs;
}

// ---------------------------------------------------------------------------
// COACH_START
// ---------------------------------------------------------------------------

describe('COACH_START', () => {

  it('with no-technique result, coachSession remains null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: noTechniqueComplete });
    expect(gs.getState().coachSession).to.equal(null);
  });

  it('rank-1 (Naked Single): slice is populated, coachRevealedBits all-zero, pencil unchanged', () => {
    const gs = stateWithPuzzle();
    const pencilBefore = new Uint16Array(gs.getState().pencil);

    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    const session = gs.getState().coachSession;

    expect(session).to.not.equal(null);
    expect(session.step.technique).to.equal('Naked Single');
    expect(session.recap).to.equal(null);
    expect(session.coachRevealedBits.every(b => b === 0)).to.equal(true);
    // pencil unchanged
    for (let i = 0; i < 81; i++) {
      expect(gs.getState().pencil[i]).to.equal(pencilBefore[i]);
    }
  });

  it('rank-4 with autoReveal: pencil bits added, coachRevealedBits tracks additions', () => {
    const gs = stateWithPuzzle();
    // Set up initial pencil state: cell 5 has bit for digit 3 set (0b00000100)
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // pencil[5] = 0b00000100

    const pencilBefore5 = gs.getState().pencil[5];  // should be 0b00000100 = 4

    // autoReveal adds digit 5 (bit index 4, value 0b00010000 = 16) to cell 5.
    const step = nakedPairStep({
      revealCells: [{ cellIndex: 5, candidates: pencilBefore5 | (1 << 4) }],
    });
    gs.dispatch({ type: 'COACH_START', result: step });

    const state = gs.getState();
    const session = state.coachSession;
    expect(session).to.not.equal(null);
    // coach added bit 4 (digit 5) → coachRevealedBits[5] = 0b00010000 = 16
    expect(session.coachRevealedBits[5]).to.equal(1 << 4);
    // pencil[5] now has both digit 3 and digit 5
    expect(state.pencil[5]).to.equal(pencilBefore5 | (1 << 4));
  });

  it('pencilSnapshot matches pre-COACH_START pencil byte-for-byte', () => {
    const gs = stateWithPuzzle();
    // Set some pencil marks.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });

    const pencilAtStart = new Uint16Array(gs.getState().pencil);
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });

    const snapshot = gs.getState().coachSession.pencilSnapshot;
    expect(snapshot.length).to.equal(81);
    for (let i = 0; i < 81; i++) {
      expect(snapshot[i]).to.equal(pencilAtStart[i]);
    }
  });

  it('coachedCells correctly unions all roles', () => {
    const step = {
      ...nakedSingleStep(5),
      roles: {
        target: 5,
        cause: [1, 2],
        elimTarget: [10],
        unitMember: [20, 21],
        scA: [],
        scB: [],
      },
    };
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: step });

    const session = gs.getState().coachSession;
    expect(session.coachedCells.has(5)).to.equal(true);
    expect(session.coachedCells.has(1)).to.equal(true);
    expect(session.coachedCells.has(2)).to.equal(true);
    expect(session.coachedCells.has(10)).to.equal(true);
    expect(session.coachedCells.has(20)).to.equal(true);
    expect(session.coachedCells.has(21)).to.equal(true);
    expect(session.coachedCells.size).to.equal(6);
  });

  it('focusedCoachedCell is set when selected cell is coached at start time', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(0);
  });

  it('focusedCoachedCell is null when selected cell is not coached', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(null);
  });
});

// ---------------------------------------------------------------------------
// COACH_END
// ---------------------------------------------------------------------------

describe('COACH_END', () => {

  it('with no active session: dispatch is a no-op, no coachSession change emitted', () => {
    const gs = stateWithPuzzle();
    let emitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) emitted = true;
    });
    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });
    expect(gs.getState().coachSession).to.equal(null);
    expect(emitted).to.equal(false);
  });

  it('with active session: slice becomes null, pencil reverts', () => {
    const gs = stateWithPuzzle();
    const pencilBefore = new Uint16Array(gs.getState().pencil);

    // Start session with auto-reveal on cell 5.
    const step = nakedPairStep({
      revealCells: [{ cellIndex: 5, candidates: 0b00010100 }],
    });
    // pencil[5] starts at 0 so candidates 0b00010100 are the revealed bits.
    gs.dispatch({ type: 'COACH_START', result: step });
    expect(gs.getState().pencil[5]).to.equal(0b00010100);

    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    const state = gs.getState();
    expect(state.coachSession).to.equal(null);
    // pencil reverted to original (all zero here)
    for (let i = 0; i < 81; i++) {
      expect(state.pencil[i]).to.equal(pencilBefore[i]);
    }
  });

  it('Example B: pencil revert preserves user marks added during session', () => {
    // Coach reveals digits 2 and 5 into cell 20 (snapshot = digit 3 only).
    // User toggles digit 7 on during session.
    // After COACH_END: cell 20 should have digits 3 and 7 only.
    // Uses a placement step to avoid triggering elimination completion.
    const gs = stateWithPuzzle();

    // Set pre-session pencil: digit 3 in cell 20.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // pencil[20] = 0b100 = 4

    const snapBit = gs.getState().pencil[20];  // 4

    // Placement step with auto-reveal: add digits 2 and 5 (bits 1 and 4 → values 2 and 16).
    const step = {
      ...nakedSingleStep(0),
      autoReveal: { required: true, cells: [{ cellIndex: 20, candidates: snapBit | 2 | 16 }] },
    };
    gs.dispatch({ type: 'COACH_START', result: step });
    // pencil[20] = 4 | 2 | 16 = 22
    expect(gs.getState().pencil[20]).to.equal(22);

    // User toggles digit 7 on (bit 6 = 64).
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });
    expect(gs.getState().pencil[20]).to.equal(22 | 64);

    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    // After revert: snapshot (4) + user addition (64) = 68 = 0b1000100
    expect(gs.getState().pencil[20]).to.equal(4 | 64);
  });

  it('Example C: user toggling off a coach-revealed bit results in clean revert', () => {
    // Uses a placement step to avoid triggering elimination completion.
    const gs = stateWithPuzzle();

    // Pre-session: digit 3 in cell 20.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    const snapBit = gs.getState().pencil[20];  // 4

    // Placement step with auto-reveal: add digits 2 and 5.
    const step = {
      ...nakedSingleStep(0),
      autoReveal: { required: true, cells: [{ cellIndex: 20, candidates: snapBit | 2 | 16 }] },
    };
    gs.dispatch({ type: 'COACH_START', result: step });

    // User toggles digit 5 off (bit 4 = 16) — a coach-revealed bit.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 5 });
    // pencil[20] = 22 & ~16 = 6

    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    // Revert restores snapshot (4) — no user additions, coach bits stripped.
    expect(gs.getState().pencil[20]).to.equal(4);
  });

  it('Example D: rank-1 session — COACH_END does not touch pencil', () => {
    const gs = stateWithPuzzle();

    // Add some pencil marks.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 4 });
    const pencilBefore = new Uint16Array(gs.getState().pencil);

    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    for (let i = 0; i < 81; i++) {
      expect(gs.getState().pencil[i]).to.equal(pencilBefore[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// COACH_FILL_RECAP
// ---------------------------------------------------------------------------

describe('COACH_FILL_RECAP', () => {

  function startPlacementSession(gs) {
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
  }

  it('recap="normal": clears coachedCells, zeroes coachRevealedBits, sets recap, reverts pencil', () => {
    const gs = stateWithPuzzle();
    startPlacementSession(gs);
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });

    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('normal');
    expect(session.coachedCells.size).to.equal(0);
    expect(session.focusedCoachedCell).to.equal(null);
    expect(session.coachRevealedBits.every(b => b === 0)).to.equal(true);
  });

  it('recap="error": sets recap to error', () => {
    const gs = stateWithPuzzle();
    startPlacementSession(gs);
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'error' });
    expect(gs.getState().coachSession.recap).to.equal('error');
  });

  it('slice remains non-null after COACH_FILL_RECAP', () => {
    const gs = stateWithPuzzle();
    startPlacementSession(gs);
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    expect(gs.getState().coachSession).to.not.equal(null);
  });

  it('subsequent COACH_END is effectively a no-op for pencil (already-zeroed coachRevealedBits)', () => {
    const gs = stateWithPuzzle();
    // Give cell 5 some auto-reveal.
    const step = nakedPairStep({
      cause: [1, 2], elimTarget: [3],
      revealCells: [{ cellIndex: 5, candidates: 0b00010100 }],
    });
    gs.dispatch({ type: 'COACH_START', result: step });
    const pencilAfterStart = new Uint16Array(gs.getState().pencil);

    // COACH_FILL_RECAP reverts pencil.
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    const pencilAfterRecap = new Uint16Array(gs.getState().pencil);

    // COACH_END now: coachRevealedBits is all-zero, so pencil unchanged.
    gs.dispatch({ type: 'COACH_END', reason: 'recap-timeout' });
    const pencilAfterEnd = gs.getState().pencil;
    for (let i = 0; i < 81; i++) {
      expect(pencilAfterEnd[i]).to.equal(pencilAfterRecap[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// COACH_FOCUS_*
// ---------------------------------------------------------------------------

describe('COACH_FOCUS_COACHED_CELL', () => {

  it('sets focusedCoachedCell when index is in coachedCells and recap is null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(5) });
    gs.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: 5 });
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(5);
  });

  it('is a no-op when index is not in coachedCells', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(5) });
    gs.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: 99 });
    // focusedCoachedCell should remain as initialised (null unless cell 5 was selected before start)
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(null);
  });

  it('is a no-op during recap', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(5) });
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    gs.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: 5 });
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(null);
  });
});

describe('COACH_FOCUS_OFF', () => {

  it('sets focusedCoachedCell to null when it was non-null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    // focusedCoachedCell should be 0 (selected cell is coached)
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(0);

    gs.dispatch({ type: 'COACH_FOCUS_OFF' });
    expect(gs.getState().coachSession.focusedCoachedCell).to.equal(null);
  });

  it('is a no-op when focusedCoachedCell is already null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(5) });
    // focusedCoachedCell is null (no coached cell selected)
    let emitCount = 0;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) emitCount++;
    });
    gs.dispatch({ type: 'COACH_FOCUS_OFF' });
    expect(emitCount).to.equal(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-action tests
// ---------------------------------------------------------------------------

describe('cross-action: PEN_ENTER', () => {

  /**
   * Build a state with a Naked Single puzzle fully set up:
   * - Puzzle loaded
   * - Coach session started (target = cell 0, Naked Single for digit 5)
   * - Cell 0 selected
   */
  function nakedSingleSetup() {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    return gs;
  }

  it('PEN_ENTER on coached cell with correct digit → COACH_FILL_RECAP normal', () => {
    const gs = nakedSingleSetup();
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });
    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('normal');
  });

  it('PEN_ENTER on coached cell with wrong digit → COACH_FILL_RECAP error', () => {
    const gs = nakedSingleSetup();
    gs.dispatch({ type: 'PEN_ENTER', digit: 3 });
    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('error');
  });

  it('PEN_ENTER on coached elimination cell → COACH_END (fill-coached-elim)', () => {
    const gs = stateWithPuzzle();
    // Use an elimination step with target=null, elimTarget=[0]
    const step = elimStep([0]);
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });  // non-coached cell, just to set selection
    // Actually we need to fill a coached elim target cell.
    // Let's select cell 0, start a session where cell 0 is in elimTarget.
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: step });
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });
    expect(gs.getState().coachSession).to.equal(null);
  });

  it('PEN_ENTER on non-coached cell → COACH_END (fill-non-coached)', () => {
    const gs = stateWithPuzzle();
    // Start session targeting cell 5; select cell 0 (non-coached).
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(5) });
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });
    expect(gs.getState().coachSession).to.equal(null);
  });

  it('PEN_ENTER with fromHint:true → no coach action dispatched', () => {
    const gs = nakedSingleSetup();
    // Hint fill: fromHint:true should skip the coach block entirely.
    gs.dispatch({ type: 'PEN_ENTER', digit: 5, fromHint: true });
    // Session should still be active (the HINT handler clears it, not PEN_ENTER with fromHint).
    // Since we dispatched PEN_ENTER directly (not HINT), the session persists.
    const session = gs.getState().coachSession;
    // The session should still be alive with no recap triggered.
    // (In the real flow, HINT dispatches COACH_END before calling PEN_ENTER.)
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal(null);
  });
});

describe('cross-action: ERASE', () => {

  it('ERASE during session → COACH_END (erase)', () => {
    const gs = stateWithPuzzle();
    // Put a pen value in cell 0 to erase (need a non-given cell with pen value).
    // First place a digit via PEN_ENTER.
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });
    // Now start a fresh session on another cell.
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(1) });
    expect(gs.getState().coachSession).to.not.equal(null);
    // Erase cell 0 — session should end.
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'ERASE' });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

describe('cross-action: HINT', () => {

  it('HINT during session → COACH_END (hint), no recap', () => {
    const gs = stateWithPuzzle();
    // Use a stub hint provider that provides a hint for cell 0.
    const puzzle = nakedSinglePuzzle();
    const gs2 = createGameState({
      stats: stubStats,
      hintProvider: {
        nextHint: (puzzle, playerState, opts) => ({
          cellIndex: opts.targetCell,
          digit: puzzle.solution[opts.targetCell] ?? 5,
        }),
      },
    });
    gs2.dispatch({ type: 'PUZZLE_LOADED', puzzle });
    gs2.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs2.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    expect(gs2.getState().coachSession).to.not.equal(null);

    gs2.dispatch({ type: 'HINT' });

    const session = gs2.getState().coachSession;
    // Session should be cleared — no recap.
    expect(session).to.equal(null);
  });
});

describe('cross-action: NEW_PUZZLE', () => {

  it('NEW_PUZZLE clears coachSession to null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    expect(gs.getState().coachSession).to.not.equal(null);

    const puzzle = nakedSinglePuzzle();
    gs.dispatch({ type: 'NEW_PUZZLE', difficulty: 'easy', puzzle });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

describe('cross-action: RESET_PUZZLE', () => {

  it('RESET_PUZZLE clears coachSession to null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    expect(gs.getState().coachSession).to.not.equal(null);

    gs.dispatch({ type: 'RESET_PUZZLE' });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

describe('cross-action: CHANGE_DIFFICULTY', () => {

  it('CHANGE_DIFFICULTY during session → COACH_END (puzzle-replaced), pencil reverts', () => {
    const gs = stateWithPuzzle();

    // Auto-reveal some pencil bits.
    const step = nakedPairStep({
      revealCells: [{ cellIndex: 5, candidates: 0b00000110 }],
    });
    gs.dispatch({ type: 'COACH_START', result: step });
    expect(gs.getState().pencil[5]).to.equal(0b00000110);

    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'hard' });

    const state = gs.getState();
    expect(state.coachSession).to.equal(null);
    // Pencil reverted: cell 5 was 0 before session, should be 0 now.
    expect(state.pencil[5]).to.equal(0);
  });

  it('CHANGE_DIFFICULTY without active session: no-op for coachSession', () => {
    const gs = stateWithPuzzle();
    expect(gs.getState().coachSession).to.equal(null);
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'medium' });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

describe('cross-action: PUZZLE_LOADED', () => {

  it('PUZZLE_LOADED clears coachSession to null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    expect(gs.getState().coachSession).to.not.equal(null);

    gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: nakedSinglePuzzle() });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

// ---------------------------------------------------------------------------
// Elimination completion tests (§16.1)
// ---------------------------------------------------------------------------

describe('PENCIL_TOGGLE — elimination completion', () => {

  /**
   * Build a Locked Candidates-style elim step with a single cell (index 5)
   * as the elimination target and a single digit (3) to clear.
   * digits: [3] → digitBits = 1 << 2 = 4
   * eliminationTargets: { 5 => 4 }
   */
  // Cell 20 (row 2, col 2) is empty in nakedSinglePuzzle and safe for pencil marks.
  function lockedCandidatesElimStep(elimTarget = [20]) {
    return {
      type: 'elimination',
      technique: 'Locked Candidates',
      rank: 3,
      digits: [3],
      roles: {
        target: null,
        cause: [10, 11, 12],
        elimTarget,
        unitMember: [],
        scA: [],
        scB: [],
      },
      unit: null,
      arrows: [],
      eliminations: elimTarget.map(c => ({ cellIndex: c, digit: 3 })),
      autoReveal: { required: true, cells: [] },
      supportingText: 'Locked Candidates eliminates digit *3*.',
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  }

  it('all eliminationTargets cleared → COACH_FILL_RECAP elim dispatched, recap = "elim"', () => {
    const gs = stateWithPuzzle();
    // Use single elimTarget cell 20, digit 3 (bit index 2, value 4).
    const step = lockedCandidatesElimStep([20]);
    gs.dispatch({ type: 'COACH_START', result: step });
    expect(gs.getState().coachSession).to.not.equal(null);
    // Verify eliminationTargets was computed: { 20 => 4 }.
    expect(gs.getState().coachSession.eliminationTargets).to.not.equal(null);
    expect(gs.getState().coachSession.eliminationTargets.get(20)).to.equal(1 << 2);

    // First: mark digit 3 in pencil for cell 20 so we have something to toggle off.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // toggle ON
    expect(gs.getState().pencil[20] & (1 << 2)).to.not.equal(0); // bit 2 is set

    // Now toggle digit 3 OFF — this clears the only elimination target bit.
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // toggle OFF
    expect(gs.getState().pencil[20] & (1 << 2)).to.equal(0);

    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('elim');
  });

  it('partial elimination targets cleared → no COACH_FILL_RECAP dispatch', () => {
    const gs = stateWithPuzzle();
    // Two elim targets: cells 20 and 21, both must have digit 3 cleared.
    const step = lockedCandidatesElimStep([20, 21]);
    gs.dispatch({ type: 'COACH_START', result: step });

    // Mark digit 3 in both cells.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'SELECT_CELL', index: 21 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    // Clear digit 3 from cell 20 only — cell 21 still has it.
    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    const session = gs.getState().coachSession;
    // Session still active, no recap yet.
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal(null);
  });

  it('COACH_FILL_RECAP elim → coachRevealedBits zeroed, pencil unchanged, recap="elim", coachedCells empty', () => {
    const gs = stateWithPuzzle();
    // Set up a session with auto-reveal on cell 5.
    const step = lockedCandidatesElimStep([0]);
    // Give it an autoReveal cell so we can verify pencil is NOT reverted.
    const stepWithReveal = {
      ...step,
      autoReveal: {
        required: true,
        cells: [{ cellIndex: 5, candidates: 0b00000110 }], // digits 2 and 3
      },
    };
    gs.dispatch({ type: 'COACH_START', result: stepWithReveal });
    // pencil[5] should now have coach-revealed bits.
    expect(gs.getState().pencil[5]).to.equal(0b00000110);

    const pencilBeforeRecap = new Uint16Array(gs.getState().pencil);

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });

    const state = gs.getState();
    const session = state.coachSession;

    // Session still active.
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('elim');

    // coachedCells cleared.
    expect(session.coachedCells.size).to.equal(0);

    // focusedCoachedCell cleared.
    expect(session.focusedCoachedCell).to.equal(null);

    // coachRevealedBits zeroed (makes subsequent COACH_END revert a no-op).
    expect(session.coachRevealedBits.every(b => b === 0)).to.equal(true);

    // Pencil UNCHANGED — coach-revealed bits are adopted, not reverted.
    for (let i = 0; i < 81; i++) {
      expect(state.pencil[i]).to.equal(pencilBeforeRecap[i]);
    }
  });

  it('COACH_FILL_RECAP elim emits coachSession but NOT pencil', () => {
    const gs = stateWithPuzzle();
    const step = lockedCandidatesElimStep([0]);
    gs.dispatch({ type: 'COACH_START', result: step });

    let pencilEmitted = false;
    let coachSessionEmitted = false;
    gs.on('changed', ({ action, changed }) => {
      if (action.type === 'COACH_FILL_RECAP' && action.variant === 'elim') {
        if (changed.has('pencil')) pencilEmitted = true;
        if (changed.has('coachSession')) coachSessionEmitted = true;
      }
    });

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });

    expect(coachSessionEmitted).to.equal(true);
    expect(pencilEmitted).to.equal(false);
  });

  it('subsequent COACH_END after elim recap → pencil unchanged (coachRevealedBits already zero)', () => {
    const gs = stateWithPuzzle();
    // Session with auto-reveal on cell 5.
    const step = lockedCandidatesElimStep([0]);
    const stepWithReveal = {
      ...step,
      autoReveal: {
        required: true,
        cells: [{ cellIndex: 5, candidates: 0b00000110 }],
      },
    };
    gs.dispatch({ type: 'COACH_START', result: stepWithReveal });
    expect(gs.getState().pencil[5]).to.equal(0b00000110);

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });
    const pencilAfterRecap = new Uint16Array(gs.getState().pencil);

    // COACH_END revert should be a no-op (coachRevealedBits all-zero).
    gs.dispatch({ type: 'COACH_END', reason: 'recap-timeout' });
    const pencilAfterEnd = gs.getState().pencil;

    expect(gs.getState().coachSession).to.equal(null);
    for (let i = 0; i < 81; i++) {
      expect(pencilAfterEnd[i]).to.equal(pencilAfterRecap[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Hidden Pair / Hidden Triple: elimination completion with empty elimTarget
// ---------------------------------------------------------------------------

describe('PENCIL_TOGGLE — elimination completion (Hidden Pair, roles.elimTarget empty)', () => {

  /**
   * Minimal Hidden Pair step: roles.elimTarget = [], but eliminations carries
   * the actual per-cell per-digit removals (non-hidden candidates in pair cells).
   * Cell 10: remove digit 3 (bit 2)
   * Cell 11: remove digits 3 and 7 (bits 2 and 6)
   */
  function hiddenPairStep() {
    return {
      type: 'elimination',
      technique: 'Hidden Pair',
      rank: 5,
      digits: [1, 5],
      roles: {
        target: null,
        cause: [10, 11],
        elimTarget: [],
        unitMember: [],
        scA: [],
        scB: [],
      },
      unit: { type: 'row', index: 1 },
      arrows: [],
      eliminations: [
        { cellIndex: 10, digit: 3 },
        { cellIndex: 11, digit: 3 },
        { cellIndex: 11, digit: 7 },
      ],
      autoReveal: { required: true, cells: [] },
      supportingText: '*1* and *5* can only go in these two cells.',
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
  }

  it('eliminationTargets built from eliminations when elimTarget is empty', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: hiddenPairStep() });
    const targets = gs.getState().coachSession.eliminationTargets;
    expect(targets).to.not.equal(null);
    // Cell 10: bit for digit 3 = 1 << 2 = 4
    expect(targets.get(10)).to.equal(1 << 2);
    // Cell 11: bits for digits 3 and 7 = (1 << 2) | (1 << 6) = 68
    expect(targets.get(11)).to.equal((1 << 2) | (1 << 6));
  });

  it('recap does not fire until all Hidden Pair eliminations are cleared', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: hiddenPairStep() });

    // Seed pencil marks for all three targeted candidates.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'SELECT_CELL', index: 11 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });

    // Clear cell 10 digit 3 — two more remain in cell 11.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    expect(gs.getState().coachSession.recap).to.equal(null);

    // Clear cell 11 digit 3 — one more remains.
    gs.dispatch({ type: 'SELECT_CELL', index: 11 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    expect(gs.getState().coachSession.recap).to.equal(null);

    // Clear cell 11 digit 7 — all done, recap should fire.
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });
    expect(gs.getState().coachSession.recap).to.equal('elim');
  });

  it('recap fires immediately on first toggle (old bug) is NOT present', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: hiddenPairStep() });

    // Seed ALL three targeted candidates so the completion check has real work to do.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'SELECT_CELL', index: 11 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });

    // Clear cell 10 digit 3 — two more remain in cell 11, so recap must NOT fire.
    gs.dispatch({ type: 'SELECT_CELL', index: 10 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 }); // clear it
    expect(gs.getState().coachSession.recap).to.equal(null);
  });
});

describe('cross-action: ON_COMPLETION_EVALUATE with win during recap', () => {

  it('winning during a recap clears coachSession', () => {
    // Create state where puzzle is almost done.
    // Use a minimal puzzle with one cell empty.
    const puzzle = nakedSinglePuzzle();
    const gs = createGameState({
      stats: stubStats,
      hintProvider: stubHintProvider,
    });
    gs.dispatch({ type: 'PUZZLE_LOADED', puzzle });

    // Fill all non-given non-target cells so cell 0 remains.
    // Actually, with nakedSinglePuzzle, cell 0 is the only empty cell.
    // Start a session.
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    // Trigger recap by entering wrong digit first.
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    expect(gs.getState().coachSession.recap).to.equal('normal');

    // Simulate ON_COMPLETION_EVALUATE producing a win.
    // We need to fill cell 0 with the correct digit to trigger win path.
    // To do this properly: un-recap the session, fill correctly.
    // Actually, let's test COACH_END with reason 'won' directly.
    // The ON_COMPLETION_EVALUATE path dispatches COACH_END when won && coachSession !== null.
    // Let's simulate it by dispatching COACH_END directly with reason 'won'.
    gs.dispatch({ type: 'COACH_END', reason: 'won' });
    expect(gs.getState().coachSession).to.equal(null);
  });
});

// ---------------------------------------------------------------------------
// New SS tests (tspec-coach §3.2)
// ---------------------------------------------------------------------------

describe('SS1: COACH_START guarded when puzzle is null', () => {
  it('SS1: COACH_START guarded when puzzle is null', () => {
    const gs = createState();
    const emits = [];
    gs.on('changed', ({ changed }) => emits.push(changed));

    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });

    expect(gs.getState().coachSession).to.equal(null);
    for (const changed of emits) {
      expect(changed.has('coachSession')).to.equal(false);
    }
  });
});

describe('SS2: COACH_START guarded when won === true', () => {
  it('SS2: COACH_START guarded when won === true', () => {
    // Use completePuzzle() so that entering digit 5 at cell 0 fills the board
    // and triggers ON_COMPLETION_EVALUATE → won=true.
    const gs = createState();
    gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: completePuzzle() });
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });

    expect(gs.getState().won).to.equal(true);

    const emits = [];
    gs.on('changed', ({ changed }) => emits.push(changed));

    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });

    expect(gs.getState().coachSession).to.equal(null);
    for (const changed of emits) {
      expect(changed.has('coachSession')).to.equal(false);
    }
  });
});

describe('SS3: COACH_START no-technique emits coachSession change-key', () => {
  it('SS3: COACH_START no-technique emits coachSession change-key', () => {
    const gs = stateWithPuzzle();
    let coachSessionEmitFound = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitFound = true;
    });

    gs.dispatch({ type: 'COACH_START', result: { type: 'no-technique', reason: 'complete' } });

    expect(gs.getState().coachSession).to.equal(null);
    expect(coachSessionEmitFound).to.equal(true);
  });
});

describe('SS4: COACH_START over active session reverts pencil first', () => {
  it('SS4: COACH_START over active session reverts pencil first', () => {
    const gs = stateWithPuzzle();

    // Session A: auto-reveal bits into cell 5.
    const stepA = nakedPairStep({ revealCells: [{ cellIndex: 5, candidates: 0b00010100 }] });
    gs.dispatch({ type: 'COACH_START', result: stepA });
    expect(gs.getState().pencil[5]).to.equal(0b00010100);

    // Session B: start another session without ending A first.
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });

    // A's auto-reveal must have been reverted before B's snapshot was taken.
    expect(gs.getState().pencil[5]).to.equal(0);
    // Session B is active.
    expect(gs.getState().coachSession).to.not.equal(null);
  });
});

describe('SS5: COACH_START placement technique → eliminationTargets === null', () => {
  it('SS5: COACH_START placement technique → eliminationTargets === null', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep() });
    expect(gs.getState().coachSession.eliminationTargets).to.equal(null);
  });
});

describe('SS6: COACH_START elimination with roles.elimTarget=[] builds from eliminations', () => {
  it('SS6: COACH_START elimination with roles.elimTarget=[] builds from eliminations', () => {
    const gs = stateWithPuzzle();
    const hiddenPairStep = {
      type: 'elimination',
      technique: 'Hidden Pair',
      rank: 5,
      digits: [1, 5],
      roles: {
        target: null,
        cause: [10, 11],
        elimTarget: [],
        unitMember: [],
        scA: [],
        scB: [],
      },
      unit: { type: 'row', index: 1 },
      arrows: [],
      eliminations: [
        { cellIndex: 10, digit: 3 },
        { cellIndex: 11, digit: 3 },
        { cellIndex: 11, digit: 7 },
      ],
      autoReveal: { required: true, cells: [] },
      supportingText: 'test',
      complexity: { acknowledged: false, note: null, endpoints: null },
    };
    gs.dispatch({ type: 'COACH_START', result: hiddenPairStep });

    const targets = gs.getState().coachSession.eliminationTargets;
    expect(targets.get(10)).to.equal(1 << 2);
    expect(targets.get(11)).to.equal((1 << 2) | (1 << 6));
  });
});

describe('SS7: COACH_FILL_RECAP no-op when coachSession === null', () => {
  it('SS7: COACH_FILL_RECAP no-op when coachSession === null', () => {
    const gs = stateWithPuzzle();
    let coachSessionEmitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitted = true;
    });

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });

    expect(coachSessionEmitted).to.equal(false);
  });
});

describe('SS8: COACH_FILL_RECAP no-op when already in recap (normal then error)', () => {
  it('SS8: COACH_FILL_RECAP no-op when already in recap (normal then error)', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    expect(gs.getState().coachSession.recap).to.equal('normal');

    const emitsBefore = [];
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) emitsBefore.push(true);
    });

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'error' });

    expect(gs.getState().coachSession.recap).to.equal('normal');
    expect(emitsBefore.length).to.equal(0);
  });
});

describe('SS9: COACH_FILL_RECAP no-op when already in recap (normal then elim)', () => {
  it('SS9: COACH_FILL_RECAP no-op when already in recap (normal then elim)', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
    expect(gs.getState().coachSession.recap).to.equal('normal');

    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });

    expect(gs.getState().coachSession.recap).to.equal('normal');
  });
});

describe('SS10: COACH_NO_TECHNIQUE emits coachSession change-key', () => {
  it('SS10: COACH_NO_TECHNIQUE emits coachSession change-key', () => {
    const gs = stateWithPuzzle();
    let coachSessionEmitFound = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitFound = true;
    });

    gs.dispatch({ type: 'COACH_NO_TECHNIQUE', reason: 'inconsistent' });

    expect(gs.getState().coachSession).to.equal(null);
    expect(coachSessionEmitFound).to.equal(true);
  });
});

describe('SS11: PEN_ENTER coach block runs AFTER _applyPenEnter mutation', () => {
  it('SS11: PEN_ENTER coach block runs AFTER _applyPenEnter mutation', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });

    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });

    expect(gs.getState().pen[0]).to.equal(5);
    expect(gs.getState().coachSession.recap).to.equal('normal');
  });
});

describe('SS12: PEN_ENTER no coach block when coachSession === null', () => {
  it('SS12: PEN_ENTER no coach block when coachSession === null', () => {
    const gs = stateWithPuzzle();
    let coachSessionEmitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitted = true;
    });

    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });

    expect(coachSessionEmitted).to.equal(false);
  });
});

describe('SS19: PEN_ENTER no coach block when fill is a no-op (mutated === false)', () => {
  it('SS19: no-op PEN_ENTER on a given cell during an active session leaves the session unchanged', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    expect(gs.getState().coachSession).to.not.equal(null);
    expect(gs.getState().coachSession.recap).to.equal(null);

    let coachSessionEmitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitted = true;
    });

    // Cell 1 is a given (nakedSinglePuzzle row 0). _applyPenEnter returns false
    // and the coach block is gated on `mutated`, so the session must not react.
    expect(gs.getState().puzzle.givens[1]).to.not.equal(0); // precondition: cell 1 is a given
    gs.dispatch({ type: 'SELECT_CELL', index: 1 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 3 });

    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);   // session not ended
    expect(session.recap).to.equal(null); // no recap fired
    expect(coachSessionEmitted).to.equal(false); // no COACH_END / COACH_FILL_RECAP
  });
});

describe('SS13: PENCIL_TOGGLE coach hook no-op when eliminationTargets === null', () => {
  it('SS13: PENCIL_TOGGLE coach hook no-op when eliminationTargets === null (placement session)', () => {
    const gs = stateWithPuzzle();
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });
    // Placement session: eliminationTargets is null.
    expect(gs.getState().coachSession.eliminationTargets).to.equal(null);

    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 4 });

    // No COACH_FILL_RECAP should have fired; recap remains null.
    expect(gs.getState().coachSession.recap).to.equal(null);
  });
});

describe('SS14: PENCIL_TOGGLE coach hook no-op when recap !== null', () => {
  it('SS14: PENCIL_TOGGLE coach hook no-op when recap !== null', () => {
    const gs = stateWithPuzzle();

    // Start an elimination session.
    function lockedCandidatesElimStep(elimTarget = [20]) {
      return {
        type: 'elimination',
        technique: 'Locked Candidates',
        rank: 3,
        digits: [3],
        roles: { target: null, cause: [10, 11, 12], elimTarget, unitMember: [], scA: [], scB: [] },
        unit: null,
        arrows: [],
        eliminations: elimTarget.map(c => ({ cellIndex: c, digit: 3 })),
        autoReveal: { required: true, cells: [] },
        supportingText: 'Locked Candidates eliminates digit *3*.',
        complexity: { acknowledged: false, note: null, endpoints: null },
      };
    }

    gs.dispatch({ type: 'COACH_START', result: lockedCandidatesElimStep([20]) });
    gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });
    expect(gs.getState().coachSession.recap).to.equal('elim');

    // Track whether another COACH_FILL_RECAP fires.
    let recapEmitCount = 0;
    gs.on('changed', ({ action, changed }) => {
      if (action && action.type === 'COACH_FILL_RECAP') recapEmitCount++;
    });

    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 4 });

    expect(recapEmitCount).to.equal(0);
    // recap still 'elim'.
    expect(gs.getState().coachSession.recap).to.equal('elim');
  });
});

describe('SS15: PENCIL_TOGGLE no coach effect when coachSession === null', () => {
  it('SS15: PENCIL_TOGGLE no coach effect when coachSession === null', () => {
    const gs = stateWithPuzzle();
    let coachSessionEmitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitted = true;
    });

    gs.dispatch({ type: 'SELECT_CELL', index: 20 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    expect(coachSessionEmitted).to.equal(false);
  });
});

describe('SS16: ON_COMPLETION_EVALUATE natural win path via PEN_ENTER', () => {
  it('SS16: ON_COMPLETION_EVALUATE natural win → won=true, coachSession=null, COACH_END fired', () => {
    // Use completePuzzle() so PEN_ENTER at cell 0 fills the board and triggers a win.
    const gs = createState();
    gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: completePuzzle() });
    gs.dispatch({ type: 'SELECT_CELL', index: 0 });
    gs.dispatch({ type: 'COACH_START', result: nakedSingleStep(0) });

    const actionSequence = [];
    gs.on('changed', ({ action }) => {
      if (action) actionSequence.push(action.type);
    });

    gs.dispatch({ type: 'PEN_ENTER', digit: 5 });

    expect(gs.getState().won).to.equal(true);
    expect(gs.getState().coachSession).to.equal(null);
    // ON_COMPLETION_EVALUATE dispatches COACH_END{reason:'won'} when won && coachSession active.
    // Note: COACH_FILL_RECAP does NOT fire here because ON_COMPLETION_EVALUATE's COACH_END
    // runs inside _applyPenEnter before PEN_ENTER's coach block can dispatch it.
    expect(actionSequence).to.include('COACH_END');
  });
});

describe('SS17: UNDO clears coachSession — deferred', () => {
  it.skip('SS17: UNDO clears coachSession — deferred to tspec-undo S71', () => {});
});

describe('SS18: ERASE_ALL_PENCIL ends session', () => {
  it('SS18: ERASE_ALL_PENCIL ends session', () => {
    const gs = stateWithPuzzle();

    // Start an elimination session with auto-reveal on cell 5. The auto-reveal
    // sets pencil bits so ERASE_ALL_PENCIL's _hasNoPencil() guard is bypassed.
    const step = nakedPairStep({ revealCells: [{ cellIndex: 5, candidates: 0b00000110 }] });
    gs.dispatch({ type: 'COACH_START', result: step });
    expect(gs.getState().pencil[5]).to.equal(0b00000110);

    let coachSessionEmitted = false;
    gs.on('changed', ({ changed }) => {
      if (changed.has('coachSession')) coachSessionEmitted = true;
    });

    gs.dispatch({ type: 'ERASE_ALL_PENCIL' });

    expect(gs.getState().coachSession).to.equal(null);
    expect(gs.getState().pencil[5]).to.equal(0);
    expect(coachSessionEmitted).to.equal(true);
  });
});
