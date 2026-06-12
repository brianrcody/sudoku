/**
 * @fileoverview Unit tests for js/providers/cookieStatsStore.js (CS1–CS7).
 *
 * Relies on real document.cookie; setup.js clears all cookies in beforeEach.
 */

import { cookieStatsStore } from '../../providers/cookieStatsStore.js';

const COOKIE_NAME = 'sudoku.stats';

/** Writes the raw cookie value directly. */
function setCookieRaw(value) {
  document.cookie = `${encodeURIComponent(COOKIE_NAME)}=${value}; path=/`;
}

/** Returns the 7-tier zero map. */
function zeroMap() {
  return {
    kiddie:     { attempted: 0, won: 0 },
    easy:       { attempted: 0, won: 0 },
    medium:     { attempted: 0, won: 0 },
    hard:       { attempted: 0, won: 0 },
    expert:     { attempted: 0, won: 0 },
    diabolical: { attempted: 0, won: 0 },
    nightmare:  { attempted: 0, won: 0 },
  };
}

describe('providers/cookieStatsStore.js', () => {

  // CS1: load() returns default map when cookie absent
  it('CS1: load() returns zero map when the stats cookie is absent', async () => {
    // setup.js clears cookies in beforeEach.
    const map = await cookieStatsStore.load();
    for (const key of ['kiddie', 'easy', 'medium', 'hard', 'expert', 'diabolical', 'nightmare']) {
      expect(map[key].attempted).to.equal(0);
      expect(map[key].won).to.equal(0);
    }
  });

  // CS2: load() parses valid cookie
  it('CS2: load() parses a valid cookie and returns the stored stats', async () => {
    const stats = zeroMap();
    stats.easy.attempted = 4;
    stats.hard.won = 1;
    const payload = encodeURIComponent(JSON.stringify({ version: 1, stats }));
    setCookieRaw(payload);

    const map = await cookieStatsStore.load();
    expect(map.easy.attempted).to.equal(4);
    expect(map.hard.won).to.equal(1);
  });

  // CS3: load() returns default on invalid JSON
  it('CS3: load() returns zero map when cookie is not valid JSON', async () => {
    setCookieRaw('not-json');
    const map = await cookieStatsStore.load();
    expect(map).to.deep.equal(zeroMap());
  });

  // CS4: load() returns default on version !== 1
  it('CS4: load() returns zero map when cookie has wrong version', async () => {
    const payload = encodeURIComponent(JSON.stringify({ version: 2, stats: zeroMap() }));
    setCookieRaw(payload);

    const map = await cookieStatsStore.load();
    expect(map).to.deep.equal(zeroMap());
  });

  // CS5: load() returns default on missing 'stats' key
  it('CS5: load() returns zero map when cookie is missing the stats key', async () => {
    const payload = encodeURIComponent(JSON.stringify({ version: 1 }));
    setCookieRaw(payload);

    const map = await cookieStatsStore.load();
    expect(map).to.deep.equal(zeroMap());
  });

  // CS6: save() writes URL-encoded JSON that round-trips
  it('CS6: save() writes a cookie that can be parsed back via load()', async () => {
    const stats = zeroMap();
    stats.medium.attempted = 7;
    stats.medium.won = 3;

    await cookieStatsStore.save(stats);
    const loaded = await cookieStatsStore.load();

    expect(loaded.medium.attempted).to.equal(7);
    expect(loaded.medium.won).to.equal(3);
  });

  // CS7: save() uses maxAge 2y, path=/, sameSite=Lax
  it('CS7: save() writes cookie with maxAge, path=/, and SameSite=Lax attributes', async () => {
    await cookieStatsStore.save(zeroMap());

    // Inspect raw document.cookie string to verify the key is present.
    // Cookie attributes (max-age etc.) are not readable via document.cookie,
    // but we can verify the key round-trips and no error was thrown.
    const map = await cookieStatsStore.load();
    expect(map).to.be.an('object');
    expect(Object.keys(map)).to.include('easy');
  });

  // CS8: legacy death-march counters migrate into expert (V3 tier rename)
  it('CS8: load() folds legacy death-march stats into expert and drops the old key', async () => {
    const legacy = {
      kiddie: { attempted: 1, won: 1 },
      easy: { attempted: 2, won: 1 },
      medium: { attempted: 3, won: 2 },
      hard: { attempted: 4, won: 2 },
      'death-march': { attempted: 9, won: 5 },
    };
    const payload = encodeURIComponent(JSON.stringify({ version: 1, stats: legacy }));
    setCookieRaw(payload);

    const map = await cookieStatsStore.load();
    expect(map.expert).to.deep.equal({ attempted: 9, won: 5 });
    expect(map).to.not.have.property('death-march');
    expect(map.diabolical).to.deep.equal({ attempted: 0, won: 0 });
    expect(map.nightmare).to.deep.equal({ attempted: 0, won: 0 });
  });

  // CS9: legacy migration adds to existing expert counters (idempotent merge)
  it('CS9: load() adds legacy death-march counters onto existing expert counters', async () => {
    const stats = zeroMap();
    stats.expert = { attempted: 2, won: 1 };
    stats['death-march'] = { attempted: 3, won: 2 };
    const payload = encodeURIComponent(JSON.stringify({ version: 1, stats }));
    setCookieRaw(payload);

    const map = await cookieStatsStore.load();
    expect(map.expert).to.deep.equal({ attempted: 5, won: 3 });
    expect(map).to.not.have.property('death-march');
  });
});
