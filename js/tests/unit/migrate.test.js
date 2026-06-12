/**
 * Tests for js/persist/migrate.js — V3 tier-ID migration (fspec-003 §3).
 */

import { migrateTierIds } from '/js/persist/migrate.js';

const DIFF_KEY = 'sudoku.currentDifficulty.v1';
const STATE_KEY = 'sudoku.state.v1';
const LEGACY_PREGEN_KEY = 'sudoku.pregen.v1.death-march';

describe('persist/migrate.js', () => {

  beforeEach(() => {
    localStorage.removeItem(DIFF_KEY);
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(LEGACY_PREGEN_KEY);
  });

  it('MG1: rewrites a death-march difficulty preference to expert', () => {
    localStorage.setItem(DIFF_KEY, JSON.stringify('death-march'));
    migrateTierIds();
    expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('expert');
  });

  it('MG2: leaves a non-legacy difficulty preference untouched', () => {
    localStorage.setItem(DIFF_KEY, JSON.stringify('medium'));
    migrateTierIds();
    expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('medium');
  });

  it('MG3: rewrites a saved in-progress state from death-march to expert', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      version: 1, difficulty: 'death-march', puzzle: { id: 'x', givens: [], solution: [] },
    }));
    migrateTierIds();
    const blob = JSON.parse(localStorage.getItem(STATE_KEY));
    expect(blob.difficulty).to.equal('expert');
    expect(blob.puzzle.id).to.equal('x');
  });

  it('MG4: leaves a non-legacy saved state untouched', () => {
    const original = { version: 1, difficulty: 'hard', puzzle: { id: 'y' } };
    localStorage.setItem(STATE_KEY, JSON.stringify(original));
    migrateTierIds();
    expect(JSON.parse(localStorage.getItem(STATE_KEY))).to.deep.equal(original);
  });

  it('MG5: discards the legacy death-march pre-generated puzzle', () => {
    localStorage.setItem(LEGACY_PREGEN_KEY, JSON.stringify({ version: 1, puzzle: {} }));
    migrateTierIds();
    expect(localStorage.getItem(LEGACY_PREGEN_KEY)).to.equal(null);
  });

  it('MG6: is idempotent and a no-op when nothing is stored', () => {
    migrateTierIds();
    migrateTierIds();
    expect(localStorage.getItem(DIFF_KEY)).to.equal(null);
    expect(localStorage.getItem(STATE_KEY)).to.equal(null);

    localStorage.setItem(DIFF_KEY, JSON.stringify('death-march'));
    migrateTierIds();
    migrateTierIds();
    expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('expert');
  });
});
