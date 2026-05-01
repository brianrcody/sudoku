/**
 * @fileoverview Unit tests for js/ui/grid.js (UG1–UG13).
 */

import { mount } from '../../ui/grid.js';

const { makeFakeGameState } = window;

function makeGivens(...indices) {
  const g = new Uint8Array(81);
  for (const i of indices) g[i] = 5;
  return g;
}

function makePuzzle({ givens } = {}) {
  return {
    id: 'test',
    difficulty: 'easy',
    givens: givens ?? new Uint8Array(81),
    solution: new Uint8Array(81).fill(1),
    solveTrace: [],
  };
}

/** Creates a full grid-root structure matching index.html. */
function makeGridRoot() {
  const root = document.createElement('div');
  root.id = 'grid-root';
  const grid = document.createElement('div');
  grid.className = 'sudoku-grid';
  grid.setAttribute('role', 'grid');
  root.appendChild(grid);
  document.body.appendChild(root);
  return root;
}

describe('ui/grid.js', () => {
  let root;
  let fakeGs;

  afterEach(() => {
    root?.remove();
    root = null;
  });

  // UG1: mount creates 81 gridcells
  it('UG1: mount creates 81 elements with role=gridcell', () => {
    root = makeGridRoot();
    fakeGs = makeFakeGameState({ puzzle: makePuzzle() });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('[role="gridcell"]');
    expect(cells.length).to.equal(81);
  });

  // UG2: Given cells marked aria-readonly
  it('UG2: given cells have aria-readonly=true', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle({ givens: makeGivens(0, 5, 10) });
    fakeGs = makeFakeGameState({ puzzle });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    expect(cells[0].getAttribute('aria-readonly')).to.equal('true');
    expect(cells[5].getAttribute('aria-readonly')).to.equal('true');
    expect(cells[1].getAttribute('aria-readonly')).to.be.null;
  });

  // UG3: Selected cell has tabindex=0 (all cells do, selection is via class/aria)
  it('UG3: selected cell has aria-selected=true', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    fakeGs = makeFakeGameState({ puzzle, selected: 3 });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    expect(cells[3].getAttribute('aria-selected')).to.equal('true');
    expect(cells[4].getAttribute('aria-selected')).to.equal('false');
  });

  // UG4: Click dispatches SELECT_CELL
  it('UG4: clicking a non-given cell dispatches SELECT_CELL with the cell index', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle(); // no givens
    fakeGs = makeFakeGameState({ puzzle });
    mount(root, fakeGs);
    const cell = root.querySelector('.cell[data-index="7"]');
    cell.click();
    const dispatched = fakeGs.dispatch.calls;
    const selectCall = dispatched.find(a => a.type === 'SELECT_CELL' && a.index === 7);
    expect(selectCall).to.exist;
  });

  // UG5: Arrow keydown dispatches ARROW_NAV
  it('UG5: ArrowRight keydown on a cell dispatches ARROW_NAV with direction=right', () => {
    root = makeGridRoot();
    fakeGs = makeFakeGameState({ puzzle: makePuzzle(), selected: 5 });
    mount(root, fakeGs);
    const cell = root.querySelector('.cell[data-index="5"]');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const navCall = fakeGs.dispatch.calls.find(a => a.type === 'ARROW_NAV');
    expect(navCall).to.exist;
    expect(navCall.direction).to.equal('right');
  });

  // UG6: Conflict class applied to conflict cells
  it('UG6: cells in the conflicts set have class "conflict"', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    fakeGs = makeFakeGameState({ puzzle, conflicts: new Set([2, 11]) });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    expect(cells[2].classList.contains('conflict')).to.be.true;
    expect(cells[11].classList.contains('conflict')).to.be.true;
    expect(cells[0].classList.contains('conflict')).to.be.false;
  });

  // UG7: Incorrect class applied to incorrect cells
  it('UG7: cells in the incorrect set have class "incorrect"', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    fakeGs = makeFakeGameState({ puzzle, incorrect: new Set([4]) });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    expect(cells[4].classList.contains('incorrect')).to.be.true;
    expect(cells[0].classList.contains('incorrect')).to.be.false;
  });

  // UG8: Pen digit rendered
  it('UG8: cell with pen digit shows that digit as text content', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    const pen = new Uint8Array(81);
    pen[6] = 5;
    fakeGs = makeFakeGameState({ puzzle, pen });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    expect(cells[6].textContent).to.equal('5');
  });

  // UG9: Pencil marks rendered
  it('UG9: cell with pencil bits renders a pencil-marks container', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    const pencil = new Uint16Array(81);
    pencil[9] = 0b000000111; // digits 1,2,3
    fakeGs = makeFakeGameState({ puzzle, pencil });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    const marksEl = cells[9].querySelector('.pencil-marks');
    expect(marksEl).to.exist;
  });

  // UG10: aria-label includes "conflict" term for conflict cell
  it('UG10: aria-label for a conflict cell contains the word "conflict"', () => {
    root = makeGridRoot();
    const puzzle = makePuzzle();
    const pen = new Uint8Array(81);
    pen[0] = 3;
    fakeGs = makeFakeGameState({ puzzle, pen, conflicts: new Set([0]) });
    mount(root, fakeGs);
    const cells = root.querySelectorAll('.cell');
    const label = cells[0].getAttribute('aria-label');
    expect(label.toLowerCase()).to.include('conflict');
  });

  // UG11: Re-render skipped when changed keys are irrelevant
  it('UG11: changing a non-grid key does not mutate the DOM', () => {
    root = makeGridRoot();
    fakeGs = makeFakeGameState({ puzzle: makePuzzle() });
    mount(root, fakeGs);

    const cellsBefore = root.querySelectorAll('.cell');
    const firstCellHtml = cellsBefore[0].outerHTML;

    // Emit a 'changed' event with a key that grid.js does not care about.
    fakeGs._emit('changed', { action: { type: 'SET_GENERATING' }, changed: new Set(['generating']) });

    const cellsAfter = root.querySelectorAll('.cell');
    expect(cellsAfter[0].outerHTML).to.equal(firstCellHtml);
  });

  // UG12: Outside-grid click dispatches DESELECT
  it('UG12: clicking outside the grid dispatches DESELECT', () => {
    root = makeGridRoot();
    fakeGs = makeFakeGameState({ puzzle: makePuzzle() });
    mount(root, fakeGs);

    // Click on document body (outside the grid).
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const deselectCall = fakeGs.dispatch.calls.find(a => a.type === 'DESELECT');
    expect(deselectCall).to.exist;
  });

  // UG13: Clicking inside #numpad-root does NOT dispatch DESELECT
  it('UG13: clicking inside #numpad-root does not dispatch DESELECT', () => {
    root = makeGridRoot();
    fakeGs = makeFakeGameState({ puzzle: makePuzzle() });
    mount(root, fakeGs);

    const numpadRoot = document.createElement('div');
    numpadRoot.id = 'numpad-root';
    const btn = document.createElement('button');
    numpadRoot.appendChild(btn);
    document.body.appendChild(numpadRoot);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    numpadRoot.remove();

    const deselectCall = fakeGs.dispatch.calls.find(a => a.type === 'DESELECT');
    expect(deselectCall).to.not.exist;
  });
});
