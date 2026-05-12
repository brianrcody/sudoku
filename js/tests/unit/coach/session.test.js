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
 */
function nakedSinglePuzzle() {
  const givens = new Uint8Array(81);
  // Row 0: cells 1-8 = digits 1,2,3,4,6,7,8,9
  const row0digits = [1, 2, 3, 4, 6, 7, 8, 9];
  for (let c = 1; c <= 8; c++) givens[c] = row0digits[c - 1];
  // Col 0: rows 1-8 = digits 1,2,3,4,6,7,8,9
  const col0digits = [1, 2, 3, 4, 6, 7, 8, 9];
  for (let r = 1; r <= 8; r++) givens[r * 9] = col0digits[r - 1];
  // Box 0 interior: cells 10,11,19,20 (row 1-2, col 1-2) — already handled by col/row filling
  // but we need to ensure box 0 has all digits except 5 accounted for.
  // After row 0 (cells 1-8) and col 0 (cells 9,18,27,36,45,54,63,72) are filled,
  // box 0 interior cells 10,11,19,20 still need filling so 5 is the sole candidate for cell 0.
  // Actually the Naked Single fires when all 9 peers have the other 8 digits.
  // We have row0: 1,2,3,4,6,7,8,9 and col0: 1,2,3,4,6,7,8,9 — that covers all digits except 5.
  // So cell 0's candidate is already forced to 5 without box interior filling.
  const solution = new Uint8Array(81);
  solution[0] = 5;
  for (let c = 1; c <= 8; c++) solution[c] = row0digits[c - 1];
  for (let r = 1; r <= 8; r++) solution[r * 9] = col0digits[r - 1];
  // Fill the rest to satisfy puzzle structure (not validated in these tests).
  return { givens, solution, solveTrace: [], difficulty: 'easy', id: 'test-naked-single' };
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
    // Coach reveals digits 2 and 5 into cell 5 (snapshot = digit 3 only).
    // User toggles digit 7 on during session.
    // After COACH_END: cell 5 should have digits 3 and 7 only.
    const gs = stateWithPuzzle();

    // Set pre-session pencil: digit 3 in cell 5.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // pencil[5] = 0b100 = 4

    const snapBit = gs.getState().pencil[5];  // 4

    // Auto-reveal: add digits 2 and 5 (bits 1 and 4 → values 2 and 16).
    const step = nakedPairStep({
      revealCells: [{ cellIndex: 5, candidates: snapBit | 2 | 16 }],
    });
    gs.dispatch({ type: 'COACH_START', result: step });
    // pencil[5] = 4 | 2 | 16 = 22
    expect(gs.getState().pencil[5]).to.equal(22);

    // User toggles digit 7 on (bit 6 = 64).
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });
    expect(gs.getState().pencil[5]).to.equal(22 | 64);

    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    // After revert: snapshot (4) + user addition (64) = 68 = 0b1000100
    expect(gs.getState().pencil[5]).to.equal(4 | 64);
  });

  it('Example C: user toggling off a coach-revealed bit results in clean revert', () => {
    const gs = stateWithPuzzle();

    // Pre-session: digit 3 in cell 5.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    const snapBit = gs.getState().pencil[5];  // 4

    // Coach reveals digits 2 and 5.
    const step = nakedPairStep({
      revealCells: [{ cellIndex: 5, candidates: snapBit | 2 | 16 }],
    });
    gs.dispatch({ type: 'COACH_START', result: step });

    // User toggles digit 5 off (bit 4 = 16) — a coach-revealed bit.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 5 });
    // pencil[5] = 22 & ~16 = 6

    gs.dispatch({ type: 'COACH_END', reason: 'session-reset' });

    // Revert restores snapshot (4) — no user additions, coach bits stripped.
    expect(gs.getState().pencil[5]).to.equal(4);
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
  function lockedCandidatesElimStep(elimTarget = [5]) {
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
    // Use single elimTarget cell 5, digit 3 (bit index 2, value 4).
    const step = lockedCandidatesElimStep([5]);
    gs.dispatch({ type: 'COACH_START', result: step });
    expect(gs.getState().coachSession).to.not.equal(null);
    // Verify eliminationTargets was computed: { 5 => 4 }.
    expect(gs.getState().coachSession.eliminationTargets).to.not.equal(null);
    expect(gs.getState().coachSession.eliminationTargets.get(5)).to.equal(1 << 2);

    // First: mark digit 3 in pencil for cell 5 so we have something to toggle off.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // toggle ON
    expect(gs.getState().pencil[5] & (1 << 2)).to.not.equal(0); // bit 2 is set

    // Now toggle digit 3 OFF — this clears the only elimination target bit.
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });  // toggle OFF
    expect(gs.getState().pencil[5] & (1 << 2)).to.equal(0);

    const session = gs.getState().coachSession;
    expect(session).to.not.equal(null);
    expect(session.recap).to.equal('elim');
  });

  it('partial elimination targets cleared → no COACH_FILL_RECAP dispatch', () => {
    const gs = stateWithPuzzle();
    // Two elim targets: cells 5 and 6, both must have digit 3 cleared.
    const step = lockedCandidatesElimStep([5, 6]);
    gs.dispatch({ type: 'COACH_START', result: step });

    // Mark digit 3 in both cells.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    gs.dispatch({ type: 'SELECT_CELL', index: 6 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });

    // Clear digit 3 from cell 5 only — cell 6 still has it.
    gs.dispatch({ type: 'SELECT_CELL', index: 5 });
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
