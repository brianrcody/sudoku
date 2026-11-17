/**
 * @fileoverview `window.sudokuDev` (tspec-debug-instrumentation DA1–DA5;
 * fspec-007 §6.1, §6.9; aspec §11.5): the frozen surface, forwarding with the
 * API's stated intent, the wrapping that turns every exception or rejection
 * into a `failed` result, budget validation after tier and seed, and which
 * methods are asynchronous. Then, over a real controller: no argument,
 * however hostile, makes a method throw or reject, and a failed call leaves
 * the game, the history and the logging switches as they were.
 */

import { install } from '../../dev/devApi.js';
import { KIDDIE } from '../fixtures/puzzles/loadable.js';
import { SOLUTION } from '../helpers/codecFixtures.js';
import { devSessionRig, withProgress, liveRegion, twoActionDoc, sel, pen, LOAD } from '../helpers/devSessionRig.js';

const METHODS = [
  'state', 'load', 'inspect', 'coachStep', 'candidates', 'setPencilMarks', 'fillPencilMarks',
  'exportSession', 'replay', 'generate', 'clearHistory', 'logging', 'setLogging',
];
const ASYNC = new Set(['load', 'replay', 'generate']);

/** A controller that records every call and answers with `{ ok: true, from: name }`. */
function fakeSession() {
  const calls = [];
  const session = { calls, mode: 'answer' };
  for (const name of METHODS) {
    session[name] = (...args) => {
      calls.push([name, ...args]);
      if (session.mode === 'throw') throw new Error(`${name} exploded`);
      if (session.mode === 'reject') return Promise.reject(new Error(`${name} rejected`));
      const answer = { ok: true, from: name };
      return ASYNC.has(name) ? Promise.resolve(answer) : answer;
    };
  }
  return session;
}

/** Valid arguments for each method. */
const ARGS = {
  state: [], load: [KIDDIE], inspect: [], coachStep: [], candidates: [], setPencilMarks: ['r1c3', [1]],
  fillPencilMarks: [], exportSession: [], replay: ['{}'], generate: ['kiddie', 1], clearHistory: [],
  logging: [], setLogging: ['actions', true],
};

describe('dev/devApi.js', () => {
  afterEach(() => {
    delete window.sudokuDev;
  });

  it('DA1: install assigns a frozen window.sudokuDev with exactly the thirteen operations', () => {
    install(fakeSession());

    expect(Object.isFrozen(window.sudokuDev)).to.equal(true);
    expect(Object.keys(window.sudokuDev).sort()).to.deep.equal([...METHODS].sort());
  });

  describe('DA2: forwarding with the API intent', () => {
    const doc = { format: 'sudoku-session' };
    const cases = [
      ['state', () => window.sudokuDev.state(), ['state']],
      ['load with replace', () => window.sudokuDev.load(KIDDIE, { replace: true }), ['load', KIDDIE, { ask: false, replace: true }]],
      ['load without options', () => window.sudokuDev.load(KIDDIE), ['load', KIDDIE, { ask: false, replace: undefined }]],
      ['load with options that are not an object', () => window.sudokuDev.load(KIDDIE, 'yes'), ['load', KIDDIE, { ask: false, replace: undefined }]],
      ['inspect', () => window.sudokuDev.inspect(), ['inspect']],
      ['coachStep', () => window.sudokuDev.coachStep(), ['coachStep']],
      ['candidates', () => window.sudokuDev.candidates(), ['candidates']],
      ['setPencilMarks', () => window.sudokuDev.setPencilMarks('r4c7', [2, 3]), ['setPencilMarks', 'r4c7', [2, 3]]],
      ['fillPencilMarks', () => window.sudokuDev.fillPencilMarks(), ['fillPencilMarks']],
      ['exportSession', () => window.sudokuDev.exportSession(), ['exportSession']],
      ['replay with every option', () => window.sudokuDev.replay(doc, { stopAfter: 3, replace: true, discardHistory: true }),
        ['replay', doc, { stopAfter: 3 }, { ask: false, replace: true, discardHistory: true }, 'api']],
      ['replay of text without options', () => window.sudokuDev.replay('{"x":1}'),
        ['replay', '{"x":1}', { stopAfter: undefined }, { ask: false, replace: undefined, discardHistory: undefined }, 'api']],
      ['generate with every option', () => window.sudokuDev.generate('Kiddie', '7', { replace: true, acceptFallback: true, budget: 2 }),
        ['generate', 'Kiddie', '7', { ask: false, replace: true, acceptFallback: true, budget: 2 }]],
      ['clearHistory', () => window.sudokuDev.clearHistory({ discardHistory: true }), ['clearHistory', { ask: false, discardHistory: true }]],
      ['clearHistory without options', () => window.sudokuDev.clearHistory(), ['clearHistory', { ask: false, discardHistory: undefined }]],
      ['logging', () => window.sudokuDev.logging(), ['logging']],
      ['setLogging', () => window.sudokuDev.setLogging('actions', true), ['setLogging', 'actions', true]],
    ];
    for (const [label, call, expected] of cases) {
      it(`${label} calls the controller with its arguments and returns its result`, async () => {
        const session = fakeSession();
        install(session);

        const result = await call();

        expect(session.calls).to.deep.equal([expected]);
        expect(result).to.deep.equal({ ok: true, from: expected[0] });
      });
    }

    it('replay passes the document object itself, not a copy', async () => {
      const session = fakeSession();
      install(session);

      await window.sudokuDev.replay(doc);

      expect(session.calls[0][1]).to.equal(doc);
    });
  });

  describe('DA3: nothing throws or rejects when the controller fails', () => {
    for (const name of METHODS) {
      it(`${name} turns a thrown exception into a failed result`, async () => {
        const session = fakeSession();
        session.mode = 'throw';
        install(session);

        const result = await window.sudokuDev[name](...ARGS[name]);

        expect(result).to.deep.equal({ ok: false, reason: 'failed', message: `${name} exploded` });
      });
    }

    for (const name of ASYNC) {
      it(`${name} resolves with a failed result when the controller rejects`, async () => {
        const session = fakeSession();
        session.mode = 'reject';
        install(session);

        const result = await window.sudokuDev[name](...ARGS[name]);

        expect(result).to.deep.equal({ ok: false, reason: 'failed', message: `${name} rejected` });
      });
    }

    for (const [label, thrown, message] of [['a string', 'plain text', 'plain text'], ['null', null, 'null']]) {
      it(`a thrown value that is ${label} becomes the message`, () => {
        install({ ...fakeSession(), state() { throw thrown; } });

        expect(window.sudokuDev.state()).to.deep.equal({ ok: false, reason: 'failed', message });
      });
    }
  });

  describe('DA4: budget, checked after tier and seed', () => {
    const INVALID_BUDGET = { ok: false, reason: 'invalid-budget', message: 'Budget must be a whole number of 1 or more.' };

    it('a bad tier with a bad budget fails with invalid-tier', async () => {
      const session = fakeSession();
      install(session);

      expect((await window.sudokuDev.generate('bogus', 1, { budget: 0 })).reason).to.equal('invalid-tier');
      expect(session.calls).to.deep.equal([]);
    });

    it('a bad seed with a bad budget fails with invalid-seed', async () => {
      const session = fakeSession();
      install(session);

      expect((await window.sudokuDev.generate('easy', -1, { budget: 0 })).reason).to.equal('invalid-seed');
      expect(session.calls).to.deep.equal([]);
    });

    for (const budget of [0, -1, 1.5, '3', NaN, null]) {
      it(`budget ${typeof budget === 'string' ? JSON.stringify(budget) : String(budget)} fails with invalid-budget`, async () => {
        const session = fakeSession();
        install(session);

        expect(await window.sudokuDev.generate('easy', 1, { budget })).to.deep.equal(INVALID_BUDGET);
        expect(session.calls).to.deep.equal([]);
      });
    }

    it('budget 1 is forwarded', async () => {
      const session = fakeSession();
      install(session);

      await window.sudokuDev.generate('easy', 1, { budget: 1 });

      expect(session.calls[0][3].budget).to.equal(1);
    });

    it('an omitted budget is forwarded as undefined', async () => {
      const session = fakeSession();
      install(session);

      await window.sudokuDev.generate('easy', 1);

      expect(session.calls[0][3]).to.deep.equal({ ask: false, replace: undefined, acceptFallback: undefined, budget: undefined });
    });
  });

  it('DA5: load, replay and generate return promises; every other method returns its object directly', () => {
    install(fakeSession());

    for (const name of METHODS) {
      const result = window.sudokuDev[name](...ARGS[name]);
      expect(result instanceof Promise, name).to.equal(ASYNC.has(name));
    }
  });

  // ── Over a real controller ───────────────────────────────────────────────

  describe('over a real controller', () => {
    let live;
    let rig;

    beforeEach(async () => {
      live = liveRegion();
      rig = await devSessionRig();
      install(rig.session);
    });

    afterEach(async () => {
      rig.dispose();
      await live.dispose();
    });

    const throwingToString = () => ({ toString() { throw new Error('hostile toString'); } });
    const throwingProxy = () => new Proxy({}, { get() { throw new Error('hostile get'); }, has() { throw new Error('hostile has'); } });
    const throwingArrayProxy = () => new Proxy([1], { get() { throw new Error('hostile get'); } });
    const hostiles = [
      ['an object whose toString throws', throwingToString],
      ['a Proxy whose every trap throws', throwingProxy],
      ['an array Proxy whose every read throws', throwingArrayProxy],
      ['a Symbol', () => Symbol('hostile')],
    ];
    const calls = {
      load: h => [h, h], setPencilMarks: h => [h, h], setPencilMarksDigits: h => ['r1c4', h],
      replay: h => [h, h], generate: h => [h, h, h], generateOptions: h => ['easy', 1, h],
      clearHistory: h => [h], setLogging: h => [h, h], setLoggingValue: h => ['actions', h],
      loadOptions: h => [KIDDIE, h], replayOptions: h => [twoActionDoc(), h],
    };
    const methodOf = key => key.replace(/(Digits|Options|Value)$/, '');

    for (const [label, make] of hostiles) {
      for (const [key, args] of Object.entries(calls)) {
        it(`${key} with ${label} neither throws nor rejects, fails, and changes nothing`, async () => {
          withProgress(rig);
          const before = rig.snapshot();

          let result;
          let threw = null;
          try {
            result = await window.sudokuDev[methodOf(key)](...args(make()));
          } catch (err) {
            threw = err;
          }

          expect(threw).to.equal(null);
          expect(result.ok).to.equal(false);
          expect(result.reason).to.be.a('string');
          expect(result.message).to.be.a('string');
          expect(rig.snapshot()).to.equal(before);
        });
      }
    }

    const failures = [
      ['load of a malformed string', () => window.sudokuDev.load('123'), 'rejected'],
      ['load over progress without replace', () => window.sudokuDev.load(KIDDIE), 'needs-replace'],
      ['setPencilMarks on a given', () => window.sudokuDev.setPencilMarks('r1c1', [1]), 'cell-filled'],
      ['replay of text that is not JSON', () => window.sudokuDev.replay('{', { replace: true, discardHistory: true }), 'rejected'],
      ['replay without the flags', () => window.sudokuDev.replay(twoActionDoc()), 'needs-replace'],
      ['replay with replace only over progress and history', () => window.sudokuDev.replay(twoActionDoc(), { replace: true }), 'needs-discard-history'],
      ['generate of an unknown tier', () => window.sudokuDev.generate('bogus', 1), 'invalid-tier'],
      ['generate over progress without replace', () => window.sudokuDev.generate('easy', 1), 'needs-replace'],
      ['generate with a bad budget', () => window.sudokuDev.generate('easy', 1, { budget: 0, replace: true }), 'invalid-budget'],
      ['clearHistory without the flag', () => window.sudokuDev.clearHistory(), 'needs-discard-history'],
      ['setLogging with a truthy non-boolean', () => window.sudokuDev.setLogging('actions', 1), 'invalid-value'],
    ];
    for (const [label, call, reason] of failures) {
      it(`a failed ${label} (${reason}) leaves the game, the history and the switches as they were`, async () => {
        withProgress(rig);
        const before = rig.snapshot();

        const result = await call();

        expect(result.reason).to.equal(reason);
        expect(rig.snapshot()).to.equal(before);
        expect(rig.calls.generated).to.deep.equal([]);
      });
    }

    it('generate with arguments that are not valid fails with busy during a replay commit', async () => {
      const results = [];
      rig.gs.on('changed', ({ action }) => {
        if (action.type !== 'DEV_RESTORE_POSITION') return;
        results.push(window.sudokuDev.generate('bogus', 1), window.sudokuDev.generate('easy', 1, { budget: 0 }));
      });

      await window.sudokuDev.replay(twoActionDoc());

      const busy = { ok: false, reason: 'busy', message: 'A replay is running.' };
      expect(await Promise.all(results)).to.deep.equal([busy, busy]);
    });

    it('a game-changing call through the API is recorded as an action', async () => {
      rig.gs.dispatch(LOAD());

      window.sudokuDev.setPencilMarks('r1c3', [1, 2]);

      expect(rig.recorder.exportDocument().actions.at(-1).action).to.deep.equal({ type: 'DEV_SET_PENCIL', index: 2, digits: [1, 2] });
    });

    it('the API reads the same live game the board shows', () => {
      rig.gs.dispatch(LOAD());
      rig.gs.dispatch(sel(2));
      rig.gs.dispatch(pen(SOLUTION[2]));

      expect(window.sudokuDev.state().board[2]).to.equal(String(SOLUTION[2]));
    });
  });
});
