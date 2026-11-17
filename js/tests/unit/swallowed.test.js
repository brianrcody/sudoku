/**
 * @fileoverview Every silent catch in the always-loaded modules reports on the
 * diagnostics channel and keeps its fallback (tspec-debug-instrumentation SW1).
 *
 * The foreground-request site (`foreground.request`, in game/foreground.js) is
 * tested in foreground.test.js, which drives it with a fake provider.
 */

import { diagnostics } from '../../util/events.js';
import { getItem, setItem, removeItem } from '../../persist/storage.js';
import { copyText } from '../../util/clipboard.js';
import { createStatistics } from '../../game/statistics.js';
import { cookieStatsStore } from '../../providers/cookieStatsStore.js';
import { createClientGenProvider } from '../../providers/clientGenProvider.js';
import { createPuzzleLoader } from '../../game/puzzleLoader.js';
import { MSG } from '../../worker/protocol.js';
import { KIDDIE } from '../fixtures/puzzles/loadable.js';

const PREGEN_PREFIX = 'sudoku.pregen.v1.';

/** Records every `swallowed` event until `off()`. */
function captureSwallowed() {
  const events = [];
  const off = diagnostics.on('swallowed', payload => { events.push(payload); });
  return { events, off };
}

/**
 * Makes `localStorage[method]` throw `error` while `act` runs. An earlier test
 * (LS4) leaves an own `setItem` on the instance, which shadows the prototype,
 * so the stub goes wherever the effective method lives.
 */
async function withStorageFailure(method, error, act) {
  const target = Object.prototype.hasOwnProperty.call(localStorage, method)
    ? localStorage
    : Storage.prototype;
  const original = target[method];
  target[method] = function () { throw error; };
  try {
    return await act();
  } finally {
    target[method] = original;
  }
}

/** A generator-worker stand-in; the test drives `onmessage` by hand. */
class FakeWorker {
  constructor() {
    this.posted = [];
    this.onmessage = null;
    this.onerror = null;
    FakeWorker.last = this;
  }
  postMessage(msg) { this.posted.push(msg); }
  terminate() {}
}

function cachedPuzzle(difficulty) {
  return {
    id: `cached-${difficulty}`,
    difficulty,
    givens: Array.from({ length: 81 }, () => 0),
    solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
    solveTrace: [],
  };
}

describe('swallowed exceptions are reported on the diagnostics channel', () => {
  let capture;
  let realWorker;

  beforeEach(() => {
    capture = captureSwallowed();
    realWorker = window.Worker;
  });

  afterEach(() => {
    capture.off();
    window.Worker = realWorker;
  });

  it('SW1: storage.getItem reports invalid JSON and returns null', () => {
    localStorage.setItem('sw-get', '{not json');

    const value = getItem('sw-get');

    expect(value).to.equal(null);
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('storage.getItem');
    expect(capture.events[0].error).to.be.instanceOf(SyntaxError);
  });

  it('SW1: storage.setItem reports a failing write and does not throw', async () => {
    const failure = new DOMException('full', 'QuotaExceededError');

    await withStorageFailure('setItem', failure, () => setItem('sw-set', { a: 1 }));

    expect(capture.events).to.deep.equal([{ where: 'storage.setItem', error: failure }]);
    expect(capture.events[0].error).to.equal(failure);
  });

  it('SW1: storage.removeItem reports a failing remove and does not throw', async () => {
    const failure = new Error('remove refused');

    await withStorageFailure('removeItem', failure, () => removeItem('sw-remove'));

    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('storage.removeItem');
    expect(capture.events[0].error).to.equal(failure);
  });

  it('SW1: clipboard.copyText reports a refused write and resolves false', async () => {
    const failure = new Error('denied');

    const ok = await copyText('text', { writeText: () => Promise.reject(failure) });

    expect(ok).to.be.false;
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('clipboard.copyText');
    expect(capture.events[0].error).to.equal(failure);
  });

  for (const method of ['recordAttemptOnce', 'recordWin']) {
    it(`SW1: statistics.save reports a rejected save from ${method} and keeps the count`, async () => {
      const failure = new Error('save failed');
      const stats = createStatistics({
        load: async () => ({ easy: { attempted: 0, won: 0 } }),
        save: () => Promise.reject(failure),
      });
      await stats.init();

      await stats[method]('easy');

      expect(capture.events).to.have.length(1);
      expect(capture.events[0].where).to.equal('statistics.save');
      expect(capture.events[0].error).to.equal(failure);
      const field = method === 'recordWin' ? 'won' : 'attempted';
      expect(stats.get().easy[field]).to.equal(1);
    });
  }

  it('SW1: cookieStatsStore.load reports a corrupt cookie and returns the zero map', async () => {
    document.cookie = `${encodeURIComponent('sudoku.stats')}=not-json; path=/`;

    const map = await cookieStatsStore.load();

    expect(map.easy).to.deep.equal({ attempted: 0, won: 0 });
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('cookieStatsStore.load');
    expect(capture.events[0].error).to.be.instanceOf(SyntaxError);
  });

  it('SW1: cookieStatsStore.save reports a failing cookie write and resolves', async () => {
    const failure = new Error('cookies blocked');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: () => { throw failure; },
    });

    try {
      await cookieStatsStore.save({ easy: { attempted: 1, won: 0 } });
    } finally {
      delete document.cookie;
    }

    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('cookieStatsStore.save');
    expect(capture.events[0].error).to.equal(failure);
  });

  it('SW1: pregen.load reports a corrupt cache entry and discards it', () => {
    window.Worker = FakeWorker;
    localStorage.setItem(PREGEN_PREFIX + 'hard', 'not valid json {{{');

    const provider = createClientGenProvider();

    expect(provider.peekReady('hard')).to.equal(null);
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('pregen.load');
    expect(capture.events[0].error).to.be.instanceOf(SyntaxError);
  });

  it('SW1: pregen.save reports a failing write of a background result and still caches it', async () => {
    window.Worker = FakeWorker;
    const provider = createClientGenProvider();
    const failure = new DOMException('full', 'QuotaExceededError');

    await withStorageFailure('setItem', failure, () => {
      FakeWorker.last.onmessage({ data: { type: MSG.GEN_RESULT, id: 'bg-1', puzzle: cachedPuzzle('easy') } });
    });

    expect(provider.peekReady('easy').id).to.equal('cached-easy');
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('pregen.save');
    expect(capture.events[0].error).to.equal(failure);
  });

  it('SW1: pregen.clear reports a failing remove on a cache hit and still serves the puzzle', async () => {
    window.Worker = FakeWorker;
    localStorage.setItem(PREGEN_PREFIX + 'easy',
      JSON.stringify({ version: 1, puzzle: cachedPuzzle('easy'), generatedAt: new Date().toISOString() }));
    const provider = createClientGenProvider();
    const failure = new Error('remove refused');

    const result = await withStorageFailure('removeItem', failure,
      () => provider.requestPuzzle({ difficulty: 'easy' }));

    expect(result.puzzle.id).to.equal('cached-easy');
    expect(capture.events).to.have.length(1);
    expect(capture.events[0].where).to.equal('pregen.clear');
    expect(capture.events[0].error).to.equal(failure);
  });

  it('SW1: puzzleLoader.rateGivens reports a worker failure and rejects the load', async () => {
    const failure = new Error('worker died');
    const loader = createPuzzleLoader({
      gameState: window.makeFakeGameState(),
      rateGivens: () => Promise.reject(failure),
      confirm: async () => true,
      beforeReplace: () => {},
    });

    const outcome = await loader.load(KIDDIE, { source: 'string' });

    expect(outcome.status).to.equal('rejected');
    expect(outcome.reason).to.equal('error');
    expect(capture.events).to.deep.equal([{ where: 'puzzleLoader.rateGivens', error: failure }]);
  });
});
