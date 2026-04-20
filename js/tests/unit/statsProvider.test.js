/**
 * @fileoverview Unit tests for js/providers/statsProvider.js (SP1–SP2).
 */

import { createStatsProvider } from '../../providers/statsProvider.js';

describe('providers/statsProvider.js', () => {
  function makeStore() {
    const calls = { load: 0, save: [] };
    const fakeMap = { easy: { attempted: 1, won: 0 } };
    return {
      calls,
      fakeMap,
      load: () => { calls.load++; return Promise.resolve(fakeMap); },
      save: (stats) => { calls.save.push(stats); return Promise.resolve(); },
    };
  }

  // SP1: load() delegates to store.load
  it('SP1: load() calls store.load and returns its result', async () => {
    const store = makeStore();
    const provider = createStatsProvider(store);

    const result = await provider.load();

    expect(store.calls.load).to.equal(1);
    expect(result).to.equal(store.fakeMap);
  });

  // SP2: save() delegates to store.save
  it('SP2: save() calls store.save with the given stats map', async () => {
    const store = makeStore();
    const provider = createStatsProvider(store);

    const map = { hard: { attempted: 2, won: 1 } };
    await provider.save(map);

    expect(store.calls.save).to.have.length(1);
    expect(store.calls.save[0]).to.equal(map);
  });
});
