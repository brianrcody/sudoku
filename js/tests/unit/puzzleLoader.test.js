/**
 * @fileoverview Unit tests for js/game/puzzleLoader.js (PL-L1–PL-L26).
 *
 * The loader's collaborators are all injected, so every branch is driven here
 * with fakes: rateGivens (the worker), confirm (the dialog), beforeReplace.
 */

import {
  createPuzzleLoader, hasProgress, rejectionMessage, rejectionDetail, loadedMessage,
} from '../../game/puzzleLoader.js';
import { loadFromGivens } from '../../generator/loadPuzzle.js';
import { UNRATED } from '../../config.js';
import { KIDDIE, UNRATED as UNRATED_PUZZLE, MULTIPLE, toGivens } from '../fixtures/puzzles/loadable.js';

const { makeFakeGameState } = window;

function makeState(overrides = {}) {
  return {
    puzzle: { id: 'cur', difficulty: 'easy', givens: toGivens(KIDDIE), solution: new Uint8Array(81) },
    pen: toGivens(KIDDIE),
    pencil: new Uint16Array(81),
    won: false,
    ...overrides,
  };
}

/** Index of the first empty cell of KIDDIE. */
const EMPTY = KIDDIE.indexOf('0');

function makeLoader({ state = makeState(), rateGivens, confirmAnswer = true } = {}) {
  const gameState = makeFakeGameState(state);
  const log = { confirms: [], replaced: 0, order: [] };
  const loader = createPuzzleLoader({
    gameState,
    rateGivens: rateGivens ?? (async givens => loadFromGivens(givens)),
    confirm: async opts => { log.confirms.push(opts); return confirmAnswer; },
    beforeReplace: () => { log.replaced++; log.order.push('beforeReplace'); },
  });
  const realDispatch = gameState.dispatch;
  return { loader, gameState, log, dispatched: realDispatch.calls };
}

describe('game/puzzleLoader.js', () => {
  describe('hasProgress', () => {
    it('PL-L1: false when no puzzle is loaded', () => {
      expect(hasProgress(makeState({ puzzle: null }))).to.be.false;
    });

    it('PL-L2: false for an untouched board', () => {
      expect(hasProgress(makeState())).to.be.false;
    });

    it('PL-L3: true when the player has entered a digit', () => {
      const state = makeState();
      state.pen[EMPTY] = 4;
      expect(hasProgress(state)).to.be.true;
    });

    it('PL-L4: true when the player has only pencil marks', () => {
      const state = makeState();
      state.pencil[EMPTY] = 0b101;
      expect(hasProgress(state)).to.be.true;
    });

    it('PL-L5: false on a won board even though it holds player digits', () => {
      const state = makeState({ won: true });
      state.pen[EMPTY] = 4;
      expect(hasProgress(state)).to.be.false;
    });
  });

  describe('messages', () => {
    it('PL-L6: rejectionMessage states the cell count for a wrong length', () => {
      expect(rejectionMessage('length', 80))
        .to.equal('This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 80.');
    });

    it('PL-L7: rejectionMessage has distinct text for every other reason', () => {
      const reasons = ['chars', 'contradiction', 'complete', 'no-solution', 'multiple', 'error'];
      const messages = reasons.map(r => rejectionMessage(r));
      for (const m of messages) expect(m).to.match(/^This puzzle can't be loaded\. \S/);
      expect(new Set(messages).size).to.equal(reasons.length);
    });

    it('PL-L8: loadedMessage names the tier of a rated puzzle', () => {
      expect(loadedMessage('hard')).to.equal('Puzzle loaded. Difficulty: Hard.');
    });

    it('PL-L9: loadedMessage explains what Unrated disables', () => {
      expect(loadedMessage(UNRATED)).to.match(/Unrated/).and.to.match(/hints and coach are unavailable/);
    });
  });

  describe('load', () => {
    it('PL-L10: a malformed string is rejected without contacting the worker', async () => {
      let rated = 0;
      const { loader, log, dispatched } = makeLoader({ rateGivens: async () => { rated++; } });
      const outcome = await loader.load('abc', { source: 'link' });
      expect(outcome.status).to.equal('rejected');
      expect(outcome.reason).to.equal('chars');
      expect(rated).to.equal(0);
      expect(dispatched).to.have.length(0);
      expect(log.replaced).to.equal(0);
    });

    it('PL-L11: a wrong-length string is rejected with its cell count in the message', async () => {
      const { loader } = makeLoader();
      const outcome = await loader.load('123', { source: 'link' });
      expect(outcome.reason).to.equal('length');
      expect(outcome.message).to.include('this one has 3');
    });

    it('PL-L12: onChecking fires once parsing has passed', async () => {
      const { loader } = makeLoader();
      let checking = 0;
      await loader.load(KIDDIE, { source: 'link', onChecking: () => { checking++; } });
      expect(checking).to.equal(1);
    });

    it('PL-L13: onChecking does not fire for a malformed string', async () => {
      const { loader } = makeLoader();
      let checking = 0;
      await loader.load('abc', { source: 'link', onChecking: () => { checking++; } });
      expect(checking).to.equal(0);
    });

    it('PL-L14: a validation failure is rejected and leaves the game untouched', async () => {
      const { loader, log, dispatched } = makeLoader();
      const outcome = await loader.load(MULTIPLE, { source: 'link' });
      expect(outcome).to.deep.equal({
        status: 'rejected',
        reason: 'multiple',
        message: 'This puzzle can\'t be loaded. The puzzle has more than one solution.',
      });
      expect(dispatched).to.have.length(0);
      expect(log.confirms).to.have.length(0);
      expect(log.replaced).to.equal(0);
    });

    it('PL-L15: a worker failure becomes a rejected outcome, not a thrown error', async () => {
      const { loader, dispatched } = makeLoader({ rateGivens: () => Promise.reject(new Error('boom')) });
      const outcome = await loader.load(KIDDIE, { source: 'link' });
      expect(outcome.status).to.equal('rejected');
      expect(outcome.reason).to.equal('error');
      expect(outcome.message).to.include('couldn\'t be checked');
      expect(dispatched).to.have.length(0);
    });

    it('PL-L16: with no progress, a valid puzzle loads without asking', async () => {
      const { loader, log, dispatched } = makeLoader();
      const outcome = await loader.load(KIDDIE, { source: 'link' });
      expect(outcome.status).to.equal('loaded');
      expect(outcome.message).to.equal('Puzzle loaded. Difficulty: Kiddie.');
      expect(log.confirms).to.have.length(0);
      expect(dispatched).to.have.length(1);
      expect(dispatched[0].type).to.equal('PUZZLE_LOADED');
      expect(dispatched[0].puzzle).to.equal(outcome.puzzle);
      expect(dispatched[0].puzzle.difficulty).to.equal('kiddie');
    });

    it('PL-L17: beforeReplace runs exactly once, before the dispatch', async () => {
      const { loader, gameState, log } = makeLoader();
      const original = gameState.dispatch;
      gameState.dispatch = action => { log.order.push(action.type); original(action); };
      await loader.load(KIDDIE, { source: 'link' });
      expect(log.order).to.deep.equal(['beforeReplace', 'PUZZLE_LOADED']);
    });

    it('PL-L18: the source is recorded on the loaded puzzle', async () => {
      const a = await makeLoader().loader.load(KIDDIE, { source: 'link' });
      const b = await makeLoader().loader.load(KIDDIE, { source: 'string' });
      expect(a.puzzle.source).to.equal('link');
      expect(b.puzzle.source).to.equal('string');
    });

    it('PL-L19: an unrateable puzzle loads as Unrated with the Unrated message', async () => {
      const { loader } = makeLoader();
      const outcome = await loader.load(UNRATED_PUZZLE, { source: 'link' });
      expect(outcome.status).to.equal('loaded');
      expect(outcome.puzzle.difficulty).to.equal(UNRATED);
      expect(outcome.message).to.equal(loadedMessage(UNRATED));
    });

    it('PL-L20: with progress, the link confirmation is asked and confirming loads', async () => {
      const state = makeState();
      state.pen[EMPTY] = 4;
      const { loader, log, dispatched } = makeLoader({ state, confirmAnswer: true });
      const outcome = await loader.load(KIDDIE, { source: 'link' });
      expect(log.confirms).to.deep.equal([{
        title: 'Load shared puzzle?',
        body: 'Your current progress will be lost.',
        confirmLabel: 'Load Puzzle',
      }]);
      expect(outcome.status).to.equal('loaded');
      expect(dispatched).to.have.length(1);
    });

    it('PL-L21: the developer-string confirmation has its own title', async () => {
      const state = makeState();
      state.pencil[EMPTY] = 1;
      const { loader, log } = makeLoader({ state });
      await loader.load(KIDDIE, { source: 'string' });
      expect(log.confirms[0].title).to.equal('Load this puzzle?');
    });

    it('PL-L22: declining keeps the current game', async () => {
      const state = makeState();
      state.pen[EMPTY] = 4;
      const { loader, log, dispatched } = makeLoader({ state, confirmAnswer: false });
      const outcome = await loader.load(KIDDIE, { source: 'link' });
      expect(outcome).to.deep.equal({ status: 'declined', message: 'Puzzle not loaded. Your game continues.' });
      expect(dispatched).to.have.length(0);
      expect(log.replaced).to.equal(0);
    });

    it('PL-L23: progress is judged when checking finishes, not when the load starts', async () => {
      const state = makeState();
      let release;
      const gate = new Promise(r => { release = r; });
      const { loader, log } = makeLoader({
        state,
        rateGivens: async givens => { await gate; return loadFromGivens(givens); },
      });
      const pending = loader.load(KIDDIE, { source: 'link' });
      state.pen[EMPTY] = 4;   // the player moves while the puzzle is being checked
      release();
      await pending;
      expect(log.confirms).to.have.length(1);
    });

    it('PL-L24: a won board is replaced without asking', async () => {
      const state = makeState({ won: true });
      state.pen[EMPTY] = 4;
      const { loader, log } = makeLoader({ state });
      const outcome = await loader.load(KIDDIE, { source: 'link' });
      expect(outcome.status).to.equal('loaded');
      expect(log.confirms).to.have.length(0);
    });
  });

  describe('per-call confirmation', () => {
    it('PL-L25a: a confirm passed to load is asked instead of the loader\'s own', async () => {
      const state = makeState();
      state.pen[EMPTY] = 4;
      const { loader, log, dispatched } = makeLoader({ state, confirmAnswer: false });
      const asked = [];

      const outcome = await loader.load(KIDDIE, {
        source: 'string',
        confirm: async opts => { asked.push(opts); return true; },
      });

      expect(asked).to.deep.equal([{
        title: 'Load this puzzle?',
        body: 'Your current progress will be lost.',
        confirmLabel: 'Load Puzzle',
      }]);
      expect(log.confirms).to.have.length(0);
      expect(outcome.status).to.equal('loaded');
      expect(dispatched).to.have.length(1);
    });

    it('PL-L25b: without a per-call confirm the loader\'s own is asked', async () => {
      const state = makeState();
      state.pen[EMPTY] = 4;
      const { loader, log } = makeLoader({ state });

      await loader.load(KIDDIE, { source: 'string' });

      expect(log.confirms).to.have.length(1);
    });
  });

  describe('rejectionDetail', () => {
    const PREFIX = 'This puzzle can\'t be loaded. ';
    const DETAILS = {
      chars: 'Puzzles can contain only the digits 1–9, with 0 or . for empty cells.',
      contradiction: 'A digit repeats in a row, column, or box.',
      complete: 'The puzzle has no empty cells.',
      'no-solution': 'The puzzle has no solution.',
      multiple: 'The puzzle has more than one solution.',
      error: 'The puzzle couldn\'t be checked.',
    };

    it('PL-L26: length — the detail states the cell count and the message is prefix + detail', () => {
      expect(rejectionDetail('length', 80)).to.equal('A puzzle needs exactly 81 cells; this one has 80.');
      expect(rejectionMessage('length', 80)).to.equal(PREFIX + rejectionDetail('length', 80));
    });

    for (const [reason, detail] of Object.entries(DETAILS)) {
      it(`PL-L26: ${reason} — the detail ignores any length and the message is prefix + detail`, () => {
        expect(rejectionDetail(reason)).to.equal(detail);
        expect(rejectionDetail(reason, 80)).to.equal(detail);
        expect(rejectionMessage(reason)).to.equal(PREFIX + detail);
        expect(rejectionMessage(reason, 80)).to.equal(PREFIX + detail);
      });
    }
  });
});
