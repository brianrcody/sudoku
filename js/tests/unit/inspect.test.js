/**
 * @fileoverview Unit tests for js/dev/inspect.js (IN1–IN34).
 */

import {
  cellRef, formatStep, stepCells, runInspector, summarize,
  candidateDiff, overlayLabel, techniqueProfile, describeGeneration,
} from '../../dev/inspect.js';
import { generateForTier } from '../../generator/pipeline.js';
import { rate } from '../../generator/rater.js';
import { mulberry32 } from '../../prng.js';
import {
  KIDDIE, KIDDIE_SOLUTION, HARD, UNRATED, toGivens,
} from '../fixtures/puzzles/loadable.js';

const placement = (cellIndex, digit, technique = 'Naked Single') =>
  ({ cellIndex, digit, technique, eliminations: [] });

const elimination = (eliminations, extra = {}, technique = 'Naked Pair') =>
  ({ cellIndex: eliminations[0].cellIndex, digit: null, technique, eliminations, ...extra });

describe('dev/inspect.js', () => {
  describe('cellRef', () => {
    it('IN1: cellRef is 1-based row then column', () => {
      expect(cellRef(0)).to.equal('r1c1');
      expect(cellRef(8)).to.equal('r1c9');
      expect(cellRef(9)).to.equal('r2c1');
      expect(cellRef(80)).to.equal('r9c9');
    });
  });

  describe('formatStep', () => {
    it('IN2: a placement reads "technique — place d at cell"', () => {
      expect(formatStep(placement(20, 7, 'Hidden Single'))).to.equal('Hidden Single — place 7 at r3c3');
    });

    it('IN3: an elimination of one digit lists its cells', () => {
      const step = elimination([{ cellIndex: 1, digit: 4 }, { cellIndex: 2, digit: 4 }]);
      expect(formatStep(step)).to.equal('Naked Pair — eliminate 4 from r1c2, r1c3');
    });

    it('IN4: eliminations of several digits become one clause per digit, in digit order', () => {
      const step = elimination([
        { cellIndex: 2, digit: 7 }, { cellIndex: 1, digit: 4 }, { cellIndex: 2, digit: 4 },
      ]);
      expect(formatStep(step)).to.equal('Naked Pair — eliminate 4 from r1c2, r1c3; 7 from r1c3');
    });
  });

  describe('stepCells', () => {
    it('IN5: a placement has its cell in place and nothing else', () => {
      expect(stepCells(placement(20, 7))).to.deep.equal({ place: [20], elim: [], pattern: [] });
    });

    it('IN6: elimination cells are listed once each', () => {
      const step = elimination([{ cellIndex: 1, digit: 4 }, { cellIndex: 1, digit: 7 }, { cellIndex: 2, digit: 4 }]);
      expect(stepCells(step)).to.deep.equal({ place: [], elim: [1, 2], pattern: [] });
    });

    it('IN7: a scalar cell key and an array cell key are pattern cells; digit keys are not', () => {
      const step = elimination([{ cellIndex: 5, digit: 8 }], { pivot: 42, wings: [15, 43], z: 8 }, 'XYZ-Wing');
      expect(stepCells(step).pattern).to.have.members([42, 15, 43]);
    });

    it('IN8: cells nested in chain nodes are found; their digits are not', () => {
      const chain = { nodes: [{ cell: 15, digit: 2, strong: true }, { cell: 51, digit: 8, strong: false }] };
      const step = elimination([{ cellIndex: 5, digit: 2 }], { chain }, 'Forcing Chain');
      expect(stepCells(step).pattern).to.have.members([15, 51]);
    });

    it('IN9: cells in an XY-Chain cells array are found', () => {
      const step = elimination([{ cellIndex: 5, digit: 2 }], { chain: { cells: [12, 22, 31], digit: 2 } }, 'XY-Chain');
      expect(stepCells(step).pattern).to.have.members([12, 22, 31]);
    });

    it('IN10: colour groups inside an array of chains are found', () => {
      const colorChains = [{ digit: 7, groupA: [10, 16], groupB: [57] }];
      const step = elimination([{ cellIndex: 5, digit: 7 }], { colorChains }, 'Multi-Coloring');
      expect(stepCells(step).pattern).to.have.members([10, 16, 57]);
    });

    it('IN11: a null pattern field is skipped', () => {
      const step = elimination([{ cellIndex: 5, digit: 2 }],
        { urType: 1, urCells: [1, 2, 55, 56], urDigits: [2, 6], urExtra: null }, 'Unique Rectangle');
      expect(stepCells(step).pattern).to.have.members([1, 2, 55, 56]);
    });

    it('IN12: a cell that is also an elimination target is not repeated as pattern', () => {
      const step = elimination([{ cellIndex: 43, digit: 8 }], { pivot: 42, wings: [15, 43] }, 'XYZ-Wing');
      const cells = stepCells(step);
      expect(cells.elim).to.deep.equal([43]);
      expect(cells.pattern).to.have.members([42, 15]);
    });
  });

  describe('runInspector / summarize', () => {
    it('IN13: a solvable board yields every step and a solved summary with rank and tier', () => {
      const result = runInspector(toGivens(HARD));
      expect(result.solved).to.be.true;
      expect(result.remaining).to.equal(0);
      expect(result.steps).to.have.length(60);
      expect(result.hardest).to.equal(11);
      expect(summarize(result)).to.equal('Solved in 60 steps. Hardest rank 11 (Hard).');
    });

    it('IN14: steps are indexed in order and carry text and cells', () => {
      const { steps } = runInspector(toGivens(KIDDIE));
      steps.forEach((step, i) => expect(step.index).to.equal(i));
      expect(steps[0].technique).to.equal('Naked Single');
      expect(steps[0].text).to.match(/^Naked Single — place [1-9] at r[1-9]c[1-9]$/);
      expect(steps[0].cells.place).to.have.length(1);
    });

    it('IN15: runInspector never modifies the board it is given', () => {
      const board = toGivens(HARD);
      runInspector(board);
      expect(Array.from(board).join('')).to.equal(HARD);
    });

    it('IN16: a board the solver cannot start reports a stall with 0 steps', () => {
      const result = runInspector(toGivens(UNRATED));
      expect(result.solved).to.be.false;
      expect(result.steps).to.have.length(0);
      expect(summarize(result)).to.equal('Stalled after 0 steps with 60 cells unsolved.');
    });

    it('IN17: a full board is reported as already full', () => {
      const result = runInspector(toGivens(KIDDIE_SOLUTION));
      expect(result.alreadyFull).to.be.true;
      expect(summarize(result)).to.equal('The board is already full.');
    });

    it('IN18: singular wording for one step and one unsolved cell', () => {
      expect(summarize({ alreadyFull: false, solved: false, remaining: 1, hardest: 1, steps: [{}] }))
        .to.equal('Stalled after 1 step with 1 cell unsolved.');
      expect(summarize({ alreadyFull: false, solved: true, remaining: 0, hardest: 1, steps: [{}] }))
        .to.equal('Solved in 1 step. Hardest rank 1 (Kiddie).');
    });

    it('IN19: one cell from done solves in a single step', () => {
      const board = toGivens(KIDDIE_SOLUTION);
      board[40] = 0;
      const result = runInspector(board);
      expect(result.steps).to.have.length(1);
      expect(result.steps[0].cells.place).to.deep.equal([40]);
      expect(result.solved).to.be.true;
    });
  });

  describe('candidateDiff', () => {
    const pen = toGivens(KIDDIE);
    const EMPTY = KIDDIE.indexOf('0');   // r1c3: candidates 1, 2, 4

    it('IN20: filled cells have no diff', () => {
      const diff = candidateDiff(pen, new Uint16Array(81));
      expect(diff[0]).to.be.null;
      expect(diff).to.have.length(81);
    });

    it('IN21: an unmarked empty cell reports all computed candidates as agree', () => {
      const diff = candidateDiff(pen, new Uint16Array(81));
      expect(diff[EMPTY]).to.deep.equal({ agree: 0b1011, missing: 0, extra: 0 });
    });

    it('IN22: marks matching the computed set all agree', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b1011;
      expect(candidateDiff(pen, pencil)[EMPTY]).to.deep.equal({ agree: 0b1011, missing: 0, extra: 0 });
    });

    it('IN23: a computed candidate the player lacks is missing', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b0011;   // 1, 2 — no 4
      expect(candidateDiff(pen, pencil)[EMPTY]).to.deep.equal({ agree: 0b0011, missing: 0b1000, extra: 0 });
    });

    it('IN24: a player mark that is not a candidate is extra', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b1011 | 0b100000000;   // plus 9
      expect(candidateDiff(pen, pencil)[EMPTY])
        .to.deep.equal({ agree: 0b1011, missing: 0, extra: 0b100000000 });
    });

    it('IN25: candidateDiff does not modify the pencil marks', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b0011;
      candidateDiff(pen, pencil);
      expect(pencil[EMPTY]).to.equal(0b0011);
      expect(pencil.filter(v => v !== 0)).to.have.length(1);
    });
  });

  describe('overlayLabel', () => {
    it('IN26: lists the computed candidates', () => {
      expect(overlayLabel(2, { agree: 0b1011, missing: 0, extra: 0 }))
        .to.equal('Row 1, column 3: candidates 1, 2, 4');
    });

    it('IN27: computed candidates include missing ones, which are also called out', () => {
      expect(overlayLabel(2, { agree: 0b0011, missing: 0b1000, extra: 0 }))
        .to.equal('Row 1, column 3: candidates 1, 2, 4. Missing from your marks: 4');
    });

    it('IN28: extra marks are called out', () => {
      expect(overlayLabel(2, { agree: 0b0001, missing: 0b0010, extra: 0b100000000 }))
        .to.equal('Row 1, column 3: candidates 1, 2. Missing from your marks: 2. Extra marks: 9');
    });

    it('IN29: a cell with no computed candidates says so', () => {
      expect(overlayLabel(80, { agree: 0, missing: 0, extra: 0b1 }))
        .to.equal('Row 9, column 9: no candidates. Extra marks: 1');
    });
  });

  describe('techniqueProfile', () => {
    it('IN30: counts each technique, most-used first, ties alphabetical', () => {
      const trace = ['Naked Single', 'X-Wing', 'Hidden Single', 'Naked Single', 'Hidden Single', 'Naked Single', 'Naked Pair']
        .map(technique => ({ technique }));
      expect(techniqueProfile(trace)).to.deep.equal([
        { technique: 'Naked Single', count: 3 },
        { technique: 'Hidden Single', count: 2 },
        { technique: 'Naked Pair', count: 1 },
        { technique: 'X-Wing', count: 1 },
      ]);
    });

    it('IN31: an empty trace has an empty profile', () => {
      expect(techniqueProfile([])).to.deep.equal([]);
    });
  });

  describe('describeGeneration', () => {
    const noTrace = () => { throw new Error('getTrace must not be called'); };

    it('IN32: explains each case that has no diagnostics', () => {
      expect(describeGeneration(null, noTrace)).to.deep.equal({ message: 'No puzzle loaded.' });
      expect(describeGeneration({ source: 'link' }, noTrace))
        .to.deep.equal({ message: 'This puzzle was loaded, not generated.' });
      expect(describeGeneration({ source: 'string' }, noTrace))
        .to.deep.equal({ message: 'This puzzle was loaded, not generated.' });
      expect(describeGeneration({ id: 'old' }, noTrace))
        .to.deep.equal({ message: 'No generation data was recorded for this puzzle.' });
    });

    it('IN33: a generated puzzle yields all seven rows from its own trace', () => {
      const puzzle = {
        difficulty: 'easy',
        source: 'generated',
        solveTrace: [{ technique: 'Naked Single' }, { technique: 'Naked Single' }, { technique: 'Hidden Single' }],
        gen: {
          requestedTier: 'nightmare', budget: 300, attempts: 300, fallback: true,
          rejected: { unsolved: 21, wrongTier: 279, byTier: { hard: 200, expert: 79 } },
        },
      };
      expect(describeGeneration(puzzle, noTrace).rows).to.deep.equal([
        ['Requested tier', 'Nightmare'],
        ['Achieved tier', 'Easy'],
        ['Fallback used', 'Yes'],
        ['Attempts', '300 of 300'],
        ['Rejected — unsolvable by solver', '21'],
        ['Rejected — wrong tier', '279 (Hard 200, Expert 79)'],
        ['Technique profile', 'Naked Single × 2\nHidden Single × 1'],
      ]);
    });

    it('IN34: with an empty stored trace the profile is recomputed from the givens, and a first-try success shows no breakdown', () => {
      const puzzle = {
        difficulty: 'kiddie',
        source: 'generated',
        givens: toGivens(KIDDIE),
        solveTrace: [],
        gen: {
          requestedTier: 'kiddie', budget: 20, attempts: 1, fallback: false,
          rejected: { unsolved: 0, wrongTier: 0, byTier: {} },
        },
      };
      const asked = [];
      const rows = Object.fromEntries(describeGeneration(puzzle, givens => {
        asked.push(givens);
        return rate(givens).trace;
      }).rows);
      expect(asked).to.deep.equal([puzzle.givens]);
      expect(rows['Fallback used']).to.equal('No');
      expect(rows['Attempts']).to.equal('1 of 20');
      expect(rows['Rejected — wrong tier']).to.equal('0');
      expect(rows['Technique profile']).to.equal('Naked Single × 51');
    });

    it('IN35: works on a real generateForTier result', () => {
      const puzzle = generateForTier('easy', { rng: mulberry32(42), seed: 42 });
      const rows = Object.fromEntries(describeGeneration(puzzle, noTrace).rows);
      expect(rows['Requested tier']).to.equal('Easy');
      expect(rows['Achieved tier']).to.equal('Easy');
      expect(rows['Technique profile']).to.include('Naked Single × ');
    });
  });
});
