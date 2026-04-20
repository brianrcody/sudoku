/**
 * @fileoverview Unit tests for js/game/correctness.js (CR1–CR6).
 */

import { checkRealtime, checkAll, checkOnComplete } from '../../game/correctness.js';

/** Builds a minimal state object for correctness checks. */
function makeState({ givens, pen, solution } = {}) {
  const g = givens ?? new Uint8Array(81);
  const p = pen ?? new Uint8Array(81);
  const s = solution ?? new Uint8Array(81).fill(1);
  return {
    puzzle: { givens: g, solution: s },
    pen: p,
  };
}

describe('game/correctness.js', () => {

  // CR1: checkRealtime flags wrong digit
  it('CR1: checkRealtime returns true when cell has wrong digit', () => {
    const solution = new Uint8Array(81);
    solution[5] = 3;
    const pen = new Uint8Array(81);
    pen[5] = 9; // wrong

    const state = makeState({ solution, pen });
    expect(checkRealtime(state, 5)).to.be.true;
  });

  // CR2: checkRealtime clears on correct
  it('CR2: checkRealtime returns false when cell matches solution', () => {
    const solution = new Uint8Array(81);
    solution[5] = 7;
    const pen = new Uint8Array(81);
    pen[5] = 7; // correct

    const state = makeState({ solution, pen });
    expect(checkRealtime(state, 5)).to.be.false;
  });

  it('CR2b: checkRealtime returns false for empty cell (no pen digit)', () => {
    const state = makeState();
    // All pen zeros — should not flag.
    expect(checkRealtime(state, 10)).to.be.false;
  });

  // CR3: checkAll returns all wrong cells
  it('CR3: checkAll returns a set of all wrong player cells', () => {
    const givens = new Uint8Array(81);
    const solution = new Uint8Array(81);
    const pen = new Uint8Array(81);

    // Cell 1: correct (solution[1]=2, pen[1]=2)
    solution[1] = 2;
    pen[1] = 2;

    // Cells 5, 10, 20: wrong
    solution[5] = 3;  pen[5] = 9;
    solution[10] = 6; pen[10] = 1;
    solution[20] = 4; pen[20] = 7;

    const state = makeState({ givens, solution, pen });
    const wrong = checkAll(state);
    expect(wrong.size).to.equal(3);
    expect(wrong.has(5)).to.be.true;
    expect(wrong.has(10)).to.be.true;
    expect(wrong.has(20)).to.be.true;
    expect(wrong.has(1)).to.be.false;
  });

  // CR4: checkAll ignores empty cells
  it('CR4: checkAll does not flag empty cells', () => {
    const solution = new Uint8Array(81).fill(5);
    const pen = new Uint8Array(81); // all zero

    const state = makeState({ solution, pen });
    const wrong = checkAll(state);
    expect(wrong.size).to.equal(0);
  });

  it('CR4b: checkAll does not flag given cells', () => {
    const givens = new Uint8Array(81);
    const solution = new Uint8Array(81);
    const pen = new Uint8Array(81);

    // Make cell 0 a given with an intentionally wrong pen value.
    givens[0] = 5;
    solution[0] = 5;
    pen[0] = 9; // would be wrong if it were a player cell

    const state = makeState({ givens, solution, pen });
    const wrong = checkAll(state);
    // Given cells are excluded from checkAll.
    expect(wrong.has(0)).to.be.false;
  });

  // CR5: checkOnComplete returns correct=true when board matches solution
  it('CR5: checkOnComplete returns {correct:true, wrong:empty} for solved board', () => {
    const solution = new Uint8Array(81);
    for (let i = 0; i < 81; i++) solution[i] = (i % 9) + 1;
    const pen = new Uint8Array(solution); // identical

    const state = makeState({ solution, pen });
    const result = checkOnComplete(state);
    expect(result.correct).to.be.true;
    expect(result.wrong.size).to.equal(0);
  });

  // CR6: checkOnComplete returns correct=false with wrong set
  it('CR6: checkOnComplete returns {correct:false, wrong:[...]} for incorrect board', () => {
    const solution = new Uint8Array(81);
    const pen = new Uint8Array(81);
    for (let i = 0; i < 81; i++) {
      solution[i] = (i % 9) + 1;
      pen[i] = solution[i]; // start correct
    }
    // Make cells 3 and 7 wrong.
    pen[3] = 9;
    pen[7] = 8;
    solution[3] = 1;
    solution[7] = 1;

    const state = makeState({ solution, pen });
    const result = checkOnComplete(state);
    expect(result.correct).to.be.false;
    expect(result.wrong.has(3)).to.be.true;
    expect(result.wrong.has(7)).to.be.true;
  });
});
