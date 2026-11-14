/**
 * @fileoverview Unit tests for js/generator/loadPuzzle.js (LP1–LP10).
 *
 * loadFromGivens runs inside the worker in production; it is imported directly
 * here because worker scripts are outside the coverage collector.
 */

import { loadFromGivens } from '../../generator/loadPuzzle.js';
import { countSolutions } from '../../solver/uniqueness.js';
import { UNRATED } from '../../config.js';
import {
  KIDDIE, KIDDIE_SOLUTION, MEDIUM, HARD, UNRATED as UNRATED_PUZZLE,
  NO_SOLUTION, CONTRADICTION, MULTIPLE, toGivens,
} from '../fixtures/puzzles/loadable.js';

describe('generator/loadPuzzle.js', () => {
  it('LP1: a rateable puzzle loads under its rated tier', () => {
    expect(loadFromGivens(toGivens(KIDDIE)).puzzle.difficulty).to.equal('kiddie');
    expect(loadFromGivens(toGivens(MEDIUM)).puzzle.difficulty).to.equal('medium');
    expect(loadFromGivens(toGivens(HARD)).puzzle.difficulty).to.equal('hard');
  });

  it('LP2: the loaded puzzle carries givens, the unique solution, and a solve trace', () => {
    const givens = toGivens(KIDDIE);
    const { ok, puzzle } = loadFromGivens(givens);
    expect(ok).to.be.true;
    expect(Array.from(puzzle.givens)).to.deep.equal(Array.from(givens));
    expect(Array.from(puzzle.solution).join('')).to.equal(KIDDIE_SOLUTION);
    expect(puzzle.solveTrace).to.have.length(51);
    expect(puzzle.source).to.equal('loaded');
    expect(puzzle).to.not.have.property('gen');
  });

  it('LP3: the id depends only on the puzzle, so reloading yields the same id', () => {
    const a = loadFromGivens(toGivens(KIDDIE)).puzzle.id;
    const b = loadFromGivens(toGivens(KIDDIE)).puzzle.id;
    expect(a).to.match(/^[0-9a-f]{8}$/).and.to.equal(b);
    expect(loadFromGivens(toGivens(MEDIUM)).puzzle.id).to.not.equal(a);
  });

  it('LP4: a puzzle the solver cannot finish loads as Unrated with an empty trace', () => {
    const { ok, puzzle } = loadFromGivens(toGivens(UNRATED_PUZZLE));
    expect(ok).to.be.true;
    expect(puzzle.difficulty).to.equal(UNRATED);
    expect(puzzle.solveTrace).to.deep.equal([]);
  });

  it('LP5: an Unrated puzzle still carries its true unique solution', () => {
    const givens = toGivens(UNRATED_PUZZLE);
    const { puzzle } = loadFromGivens(givens);
    expect(Array.from(puzzle.solution)).to.deep.equal(Array.from(countSolutions(givens).solution));
    expect(puzzle.solution.includes(0)).to.be.false;
  });

  it('LP6: a repeated digit in a unit is rejected as contradiction', () => {
    expect(loadFromGivens(toGivens(CONTRADICTION))).to.deep.equal({ ok: false, reason: 'contradiction' });
  });

  it('LP7: a grid with no empty cell is rejected as complete', () => {
    expect(loadFromGivens(toGivens(KIDDIE_SOLUTION))).to.deep.equal({ ok: false, reason: 'complete' });
  });

  it('LP8: a consistent-looking puzzle with no solution is rejected as no-solution', () => {
    expect(loadFromGivens(toGivens(NO_SOLUTION))).to.deep.equal({ ok: false, reason: 'no-solution' });
  });

  it('LP9: a puzzle with several solutions is rejected as multiple', () => {
    expect(loadFromGivens(toGivens(MULTIPLE))).to.deep.equal({ ok: false, reason: 'multiple' });
  });

  it('LP10: loadFromGivens does not modify its input', () => {
    const givens = toGivens(HARD);
    loadFromGivens(givens);
    expect(Array.from(givens).join('')).to.equal(HARD);
  });
});
