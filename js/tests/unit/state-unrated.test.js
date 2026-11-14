/**
 * @fileoverview Unit tests for the Unrated tier and statistics gating in
 * js/game/state.js (SU1–SU22).
 */

import { createGameState } from '../../game/state.js';
import { UNRATED } from '../../config.js';

class FakeStats {
  constructor() { this.attempts = []; this.wins = []; }
  recordAttemptOnce(d) { this.attempts.push(d); return Promise.resolve(); }
  recordWin(d) { this.wins.push(d); return Promise.resolve(); }
}

/** givens[0] = 1; solution cell i = (i % 9) + 1 (not a real Sudoku — the reducer doesn't care). */
function makePuzzle(difficulty) {
  const givens = new Uint8Array(81);
  const solution = new Uint8Array(81);
  givens[0] = 1;
  for (let i = 0; i < 81; i++) solution[i] = (i % 9) + 1;
  return { id: `test-${difficulty}`, difficulty, givens, solution, solveTrace: [] };
}

function makeGs({ difficulty = UNRATED, suppressed, hint = null } = {}) {
  const stats = new FakeStats();
  const flag = { suppressed: suppressed ?? false };
  const deps = { stats, hintProvider: { nextHint: () => hint } };
  if (suppressed !== undefined) deps.statsSuppressed = () => flag.suppressed;
  const gs = createGameState(deps);
  gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: makePuzzle(difficulty) });
  return { gs, stats, flag };
}

function enter(gs, index, digit) {
  gs.dispatch({ type: 'SELECT_CELL', index });
  gs.dispatch({ type: 'PEN_ENTER', digit });
}

/** Fill every non-given cell with its solution digit. */
function solve(gs) {
  const { puzzle } = gs.getState();
  for (let i = 1; i < 81; i++) enter(gs, i, puzzle.solution[i]);
}

const fakeStep = {
  type: 'placement', technique: 'Naked Single',
  roles: { target: 1, cause: [], elimTarget: [], unitMember: [], scA: [], scB: [], fin: [] },
  digits: [2], eliminations: [], autoReveal: { required: false, cells: [] },
};

describe('game/state.js — Unrated puzzles', () => {
  it('SU1: an Unrated puzzle loads with zero hints', () => {
    const { gs } = makeGs();
    expect(gs.getState().puzzle.difficulty).to.equal(UNRATED);
    expect(gs.getState().hintsRemaining).to.equal(0);
  });

  it('SU2: pen entry works but records no attempt and leaves attemptRecorded unset', () => {
    const { gs, stats } = makeGs();
    enter(gs, 1, 2);
    expect(gs.getState().pen[1]).to.equal(2);
    expect(stats.attempts).to.deep.equal([]);
    expect(gs.getState().attemptRecorded).to.be.false;
  });

  it('SU3: pencil marks, undo, and erase work normally', () => {
    const { gs } = makeGs();
    gs.dispatch({ type: 'SELECT_CELL', index: 1 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    expect(gs.getState().pencil[1]).to.equal(0b100);
    gs.dispatch({ type: 'UNDO' });
    expect(gs.getState().pencil[1]).to.equal(0);
    gs.dispatch({ type: 'PEN_ENTER', digit: 7 });
    gs.dispatch({ type: 'ERASE' });
    expect(gs.getState().pen[1]).to.equal(0);
  });

  it('SU4: conflicts are still detected', () => {
    const { gs } = makeGs();
    enter(gs, 1, 1);   // duplicates the given 1 in row 1
    expect(gs.getState().conflicts.has(1)).to.be.true;
  });

  it('SU5: Check flags wrong digits (on-demand mistake checking)', () => {
    const { gs } = makeGs();
    enter(gs, 1, 9);
    gs.dispatch({ type: 'CHECK' });
    expect([...gs.getState().incorrect]).to.deep.equal([1]);
    gs.dispatch({ type: 'CLEAR_INCORRECT' });
  });

  it('SU6: a correct full board is a win, with no win recorded', () => {
    const { gs, stats } = makeGs();
    solve(gs);
    expect(gs.getState().won).to.be.true;
    expect(gs.getState().winHandled).to.be.true;
    expect(stats.wins).to.deep.equal([]);
    expect(stats.attempts).to.deep.equal([]);
  });

  it('SU7: HINT does nothing', () => {
    const { gs } = makeGs({ hint: { cellIndex: 1, digit: 2, technique: 'x' } });
    gs.dispatch({ type: 'SELECT_CELL', index: 1 });
    gs.dispatch({ type: 'HINT' });
    expect(gs.getState().pen[1]).to.equal(0);
    expect(gs.getState().hintsRemaining).to.equal(0);
  });

  it('SU8: COACH_START is refused', () => {
    const { gs } = makeGs();
    gs.dispatch({ type: 'COACH_START', result: fakeStep });
    expect(gs.getState().coachSession).to.be.null;
  });

  it('SU9: COACH_START still works on a rated puzzle', () => {
    const { gs } = makeGs({ difficulty: 'easy' });
    gs.dispatch({ type: 'COACH_START', result: fakeStep });
    expect(gs.getState().coachSession).to.not.be.null;
  });

  it('SU10: RESET_PUZZLE keeps the puzzle Unrated with zero hints', () => {
    const { gs } = makeGs();
    enter(gs, 1, 2);
    gs.dispatch({ type: 'RESET_PUZZLE' });
    expect(gs.getState().puzzle.difficulty).to.equal(UNRATED);
    expect(gs.getState().hintsRemaining).to.equal(0);
    expect(gs.getState().pen[1]).to.equal(0);
  });

  it('SU11: CHANGE_DIFFICULTY does not relabel an Unrated puzzle or grant hints', () => {
    const { gs } = makeGs();
    const before = gs.getState().puzzle;
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'kiddie' });
    expect(gs.getState().puzzle).to.equal(before);
    expect(gs.getState().puzzle.difficulty).to.equal(UNRATED);
    expect(gs.getState().hintsRemaining).to.equal(0);
  });

  it('SU12: CHANGE_DIFFICULTY on an Unrated puzzle still publishes the action, with no changed keys', () => {
    const { gs } = makeGs();
    const events = [];
    gs.on('changed', e => events.push(e));
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'hard' });
    expect(events).to.have.length(1);
    expect(events[0].action).to.deep.equal({ type: 'CHANGE_DIFFICULTY', difficulty: 'hard' });
    expect(events[0].changed.size).to.equal(0);
  });

  it('SU13: CHANGE_DIFFICULTY on an Unrated puzzle keeps the undo snapshot', () => {
    const { gs } = makeGs();
    enter(gs, 1, 2);
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'hard' });
    expect(gs.getState().undoSnapshot).to.not.be.null;
  });

  it('SU14: CHANGE_DIFFICULTY still relabels a rated puzzle', () => {
    const { gs } = makeGs({ difficulty: 'easy' });
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'kiddie' });
    expect(gs.getState().puzzle.difficulty).to.equal('kiddie');
    expect(gs.getState().hintsRemaining).to.equal(Infinity);
  });

  it('SU15: CHANGE_DIFFICULTY with no puzzle loaded still sets the hint limit', () => {
    const gs = createGameState({ stats: new FakeStats(), hintProvider: { nextHint: () => null } });
    gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'easy' });
    expect(gs.getState().puzzle).to.be.null;
    expect(gs.getState().hintsRemaining).to.equal(3);
  });
});

describe('game/state.js — statistics suppression', () => {
  it('SU16: by default a rated puzzle records its attempt and win', () => {
    const { gs, stats } = makeGs({ difficulty: 'easy' });
    solve(gs);
    expect(stats.attempts).to.deep.equal(['easy']);
    expect(stats.wins).to.deep.equal(['easy']);
  });

  for (const difficulty of ['hard', 'expert']) {
    it(`SU16b: by default a ${difficulty} win is recorded`, () => {
      const { gs, stats } = makeGs({ difficulty });
      solve(gs);
      expect(gs.getState().won).to.be.true;
      expect(stats.wins).to.deep.equal([difficulty]);
    });
  }

  it('SU17: while suppressed, an on-demand puzzle records neither attempt nor win', () => {
    const { gs, stats } = makeGs({ difficulty: 'easy', suppressed: true });
    solve(gs);
    expect(gs.getState().won).to.be.true;
    expect(stats.attempts).to.deep.equal([]);
    expect(stats.wins).to.deep.equal([]);
  });

  it('SU18: while suppressed, an on-complete (Hard) win is not recorded', () => {
    const { gs, stats } = makeGs({ difficulty: 'hard', suppressed: true });
    solve(gs);
    expect(gs.getState().won).to.be.true;
    expect(stats.wins).to.deep.equal([]);
  });

  it('SU19: while suppressed, an on-complete-silent (Expert) win is not recorded', () => {
    const { gs, stats } = makeGs({ difficulty: 'expert', suppressed: true });
    solve(gs);
    expect(gs.getState().won).to.be.true;
    expect(stats.wins).to.deep.equal([]);
  });

  it('SU20: while suppressed, a hint is applied but records no attempt', () => {
    const { gs, stats } = makeGs({
      difficulty: 'easy', suppressed: true, hint: { cellIndex: 1, digit: 2, technique: 'x' },
    });
    gs.dispatch({ type: 'SELECT_CELL', index: 1 });
    gs.dispatch({ type: 'HINT' });
    expect(gs.getState().pen[1]).to.equal(2);
    expect(gs.getState().hintsRemaining).to.equal(2);
    expect(stats.attempts).to.deep.equal([]);
    expect(gs.getState().attemptRecorded).to.be.false;
  });

  it('SU21: when suppression lifts, the next player digit records the attempt and the win follows', () => {
    const { gs, stats, flag } = makeGs({ difficulty: 'easy', suppressed: true });
    enter(gs, 1, 2);
    expect(stats.attempts).to.deep.equal([]);
    flag.suppressed = false;
    enter(gs, 2, 3);
    expect(stats.attempts).to.deep.equal(['easy']);
    expect(gs.getState().attemptRecorded).to.be.true;
    solve(gs);
    expect(stats.wins).to.deep.equal(['easy']);
    expect(stats.attempts).to.deep.equal(['easy']);
  });

  it('SU22: an attempt recorded before suppression is not recorded again, and the suppressed win is dropped', () => {
    const { gs, stats, flag } = makeGs({ difficulty: 'easy', suppressed: false });
    enter(gs, 1, 2);
    flag.suppressed = true;
    solve(gs);
    expect(stats.attempts).to.deep.equal(['easy']);
    expect(stats.wins).to.deep.equal([]);
  });
});
