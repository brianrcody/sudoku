/**
 * @fileoverview Unit tests for js/game/statistics.js (ST1–ST10).
 */

import { createStatistics } from '../../game/statistics.js';

/** Default zero stats map. */
function zeroMap() {
  return {
    kiddie:       { attempted: 0, won: 0 },
    easy:         { attempted: 0, won: 0 },
    medium:       { attempted: 0, won: 0 },
    hard:         { attempted: 0, won: 0 },
    'death-march': { attempted: 0, won: 0 },
  };
}

/** Creates a fake StatsProvider. */
function makeFakeProvider({ loadResolve = null, saveReject = false } = {}) {
  const calls = { load: 0, save: [] };
  return {
    calls,
    load: () => {
      calls.load++;
      const map = loadResolve ?? zeroMap();
      return Promise.resolve(map);
    },
    save: (stats) => {
      calls.save.push(stats);
      if (saveReject) return Promise.reject(new Error('save failed'));
      return Promise.resolve();
    },
  };
}

describe('game/statistics.js', () => {

  // ST1: init loads from provider and emits stats-changed
  it('ST1: init loads from provider and emits stats-changed', async () => {
    const loadedMap = { ...zeroMap(), easy: { attempted: 5, won: 2 } };
    const provider = makeFakeProvider({ loadResolve: loadedMap });
    const stats = createStatistics(provider);

    let emitCount = 0;
    let emittedMap = null;
    stats.on('stats-changed', (m) => { emitCount++; emittedMap = m; });

    await stats.init();

    expect(provider.calls.load).to.equal(1);
    expect(emitCount).to.equal(1);
    expect(emittedMap).to.deep.equal(loadedMap);
  });

  // ST2: init handles missing/default map (all zeros)
  it('ST2: init populates cache with zero map when provider returns zeros', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    const map = stats.get();
    for (const key of ['kiddie', 'easy', 'medium', 'hard', 'death-march']) {
      expect(map[key].attempted).to.equal(0);
      expect(map[key].won).to.equal(0);
    }
  });

  // ST3: get returns cached map synchronously after init
  it('ST3: get returns the cached map synchronously after init', async () => {
    const loadedMap = zeroMap();
    loadedMap.hard.attempted = 3;
    const provider = makeFakeProvider({ loadResolve: loadedMap });
    const stats = createStatistics(provider);
    await stats.init();

    const map = stats.get();
    expect(map).to.equal(stats.get()); // same reference
    expect(map.hard.attempted).to.equal(3);
  });

  // ST4: recordAttemptOnce increments attempted and persists
  it('ST4: recordAttemptOnce increments attempted for the given tier', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    await stats.recordAttemptOnce('easy');

    expect(stats.get().easy.attempted).to.equal(1);
    expect(provider.calls.save).to.have.length(1);
  });

  // ST5: recordAttemptOnce emits stats-changed
  it('ST5: recordAttemptOnce emits stats-changed', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    let fired = false;
    const unsub = stats.on('stats-changed', () => { fired = true; });
    await stats.recordAttemptOnce('medium');
    unsub();

    expect(fired).to.be.true;
  });

  // ST6: recordWin increments won and persists
  it('ST6: recordWin increments won for the given tier', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    await stats.recordWin('hard');

    expect(stats.get().hard.won).to.equal(1);
    expect(provider.calls.save.length).to.be.at.least(1);
  });

  // ST7: Concurrent recordAttemptOnce + recordWin both persist
  it('ST7: concurrent recordAttemptOnce and recordWin both reflect in cache', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    await Promise.all([
      stats.recordAttemptOnce('kiddie'),
      stats.recordWin('kiddie'),
    ]);

    expect(stats.get().kiddie.attempted).to.equal(1);
    expect(stats.get().kiddie.won).to.equal(1);
  });

  // ST8: Provider save errors are swallowed
  it('ST8: save errors are swallowed; in-memory state still updated', async () => {
    const provider = makeFakeProvider({ saveReject: true });
    const stats = createStatistics(provider);
    await stats.init();

    // Should not throw even when provider.save rejects.
    await stats.recordAttemptOnce('easy');

    // In-memory still updated.
    expect(stats.get().easy.attempted).to.equal(1);
  });

  // ST9: on/off subscription
  it('ST9: unsubscribed listener no longer receives events', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    await stats.init();

    let callCount = 0;
    const unsub = stats.on('stats-changed', () => callCount++);

    await stats.recordAttemptOnce('easy'); // fires once
    unsub();
    await stats.recordAttemptOnce('easy'); // should not fire

    expect(callCount).to.equal(1);
  });

  // ST10: No throw when init emits with no listeners
  it('ST10: init does not throw when there are no listeners', async () => {
    const provider = makeFakeProvider();
    const stats = createStatistics(provider);
    // No listener registered — should not throw.
    await stats.init();
  });
});
