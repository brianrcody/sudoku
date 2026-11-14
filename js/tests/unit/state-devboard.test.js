/**
 * @fileoverview Unit tests for the developer-only DEV_SET_BOARD action in
 * js/game/state.js (SD1–SD9).
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

function makeGs(difficulty = 'easy', { load = true } = {}) {
  const stats = new FakeStats();
  const gs = createGameState({ stats, hintProvider: { nextHint: () => null } });
  if (load) gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: makePuzzle(difficulty) });
  const events = [];
  gs.on('changed', e => events.push(e));
  return { gs, stats, events };
}

function enter(gs, index, digit) {
  gs.dispatch({ type: 'SELECT_CELL', index });
  gs.dispatch({ type: 'PEN_ENTER', digit });
}

const board = (cells = {}) => {
  const pen = new Uint8Array(81);
  for (const [i, d] of Object.entries(cells)) pen[i] = d;
  return pen;
};

const fakeStep = {
  type: 'placement', technique: 'Naked Single',
  roles: { target: 1, cause: [], elimTarget: [], unitMember: [], scA: [], scB: [], fin: [] },
  digits: [2], eliminations: [], autoReveal: { required: false, cells: [] },
};

describe('game/state.js — DEV_SET_BOARD', () => {
  it('SD1: replaces every non-given cell, adding and removing digits', () => {
    const { gs, events } = makeGs();
    enter(gs, 5, 9);
    events.length = 0;
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 2, 2: 3 }) });
    const { pen } = gs.getState();
    expect([pen[1], pen[2], pen[5]]).to.deep.equal([2, 3, 0]);
    expect(events).to.have.length(1);
    expect(events[0].action.type).to.equal('DEV_SET_BOARD');
    expect(events[0].changed.has('pen')).to.be.true;
  });

  it('SD2: givens cannot be overwritten or removed', () => {
    const { gs } = makeGs();
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 0: 7 }) });
    expect(gs.getState().pen[0]).to.equal(1);
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board() });
    expect(gs.getState().pen[0]).to.equal(1);
  });

  it('SD3: it is not a move — no undo snapshot survives and no attempt is recorded', () => {
    const { gs, stats } = makeGs();
    enter(gs, 5, 9);
    expect(gs.getState().undoSnapshot).to.not.be.null;
    stats.attempts.length = 0;
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 2 }) });
    expect(gs.getState().undoSnapshot).to.be.null;
    expect(stats.attempts).to.deep.equal([]);
  });

  it('SD4: conflicts are recomputed for the new board', () => {
    const { gs } = makeGs();
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 5, 2: 5 }) });
    expect([...gs.getState().conflicts].sort()).to.deep.equal([1, 2]);
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 5 }) });
    expect(gs.getState().conflicts.size).to.equal(0);
  });

  it('SD5: setting the board to the full solution is not a win', () => {
    const { gs, stats } = makeGs();
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: gs.getState().puzzle.solution.slice() });
    expect(gs.getState().pen.includes(0)).to.be.false;
    expect(gs.getState().won).to.be.false;
    expect(stats.wins).to.deep.equal([]);
  });

  it('SD6: incorrect-cell marks and their pending timer are cleared', () => {
    const { gs } = makeGs(UNRATED);
    enter(gs, 1, 9);
    gs.dispatch({ type: 'CHECK' });
    expect(gs.getState().incorrect.size).to.equal(1);
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 2 }) });
    expect(gs.getState().incorrect.size).to.equal(0);
    expect(gs.getState().incorrectShownUntil).to.equal(0);
    expect(gs.getState().completionMessage).to.equal('');
  });

  it('SD7: an active coach session is ended', () => {
    const { gs, events } = makeGs();
    gs.dispatch({ type: 'COACH_START', result: fakeStep });
    expect(gs.getState().coachSession).to.not.be.null;
    events.length = 0;
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 2 }) });
    expect(gs.getState().coachSession).to.be.null;
    expect(events[0].changed.has('coachSession')).to.be.true;
  });

  it('SD8: ignored when no puzzle is loaded', () => {
    const { gs, events } = makeGs('easy', { load: false });
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board({ 1: 2 }) });
    expect(events).to.have.length(0);
  });

  it('SD9: ignored on a won board', () => {
    const { gs, events } = makeGs();
    const { solution } = gs.getState().puzzle;
    for (let i = 1; i < 81; i++) enter(gs, i, solution[i]);
    expect(gs.getState().won).to.be.true;
    events.length = 0;
    gs.dispatch({ type: 'DEV_SET_BOARD', pen: board() });
    expect(events).to.have.length(0);
    expect(gs.getState().pen[5]).to.equal(solution[5]);
  });
});
