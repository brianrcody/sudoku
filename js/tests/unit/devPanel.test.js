/**
 * @fileoverview Unit tests for js/dev/devPanel.js (DP1–DP69).
 *
 * The panel is mounted in the Mocha page against a fake game state and a real
 * ui/grid.js mount, so the grid-decorator tools are tested through the actual
 * renderer. `loadPuzzle` and `copy` are injected.
 */

import { mount } from '../../dev/devPanel.js';
import { mount as mountGrid, setCellDecorator } from '../../ui/grid.js';
import { mount as mountSrLive } from '../../ui/srLive.js';
import { KIDDIE, KIDDIE_SOLUTION, HARD, toGivens } from '../fixtures/puzzles/loadable.js';

const { makeFakeGameState } = window;

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await frame(); };

/** r1c3 of KIDDIE — empty, computed candidates 1, 2, 4. */
const EMPTY = 2;

function makeGenerated(givensString = KIDDIE) {
  return {
    id: 'gen',
    difficulty: 'kiddie',
    givens: toGivens(givensString),
    solution: toGivens(KIDDIE_SOLUTION),
    solveTrace: [{ technique: 'Naked Single' }, { technique: 'Naked Single' }],
    source: 'generated',
    gen: {
      requestedTier: 'kiddie', budget: 20, attempts: 2, fallback: false,
      rejected: { unsolved: 0, wrongTier: 1, byTier: { easy: 1 } },
    },
  };
}

describe('dev/devPanel.js', () => {
  let main, gridRoot, sr, gs;

  beforeEach(() => {
    main = document.createElement('main');
    gridRoot = document.createElement('div');
    gridRoot.id = 'grid-root';
    gridRoot.innerHTML = '<div class="sudoku-grid" role="grid"></div>';
    sr = document.createElement('div');
    sr.id = 'sr-live';
    document.body.append(main, gridRoot, sr);
    mountSrLive(document.body);
  });

  afterEach(() => {
    setCellDecorator(null);
    main.remove();
    gridRoot.remove();
    sr.remove();
    document.getElementById('dev-badge')?.remove();
    document.getElementById('dev-stylesheet')?.remove();
  });

  function mountPanel({ state = {}, loadPuzzle, copy } = {}) {
    const puzzle = state.puzzle === undefined ? makeGenerated() : state.puzzle;
    gs = makeFakeGameState({
      pen: puzzle ? Uint8Array.from(puzzle.givens) : new Uint8Array(81),
      pencil: new Uint16Array(81),
      coachSession: null,
      ...state,
      puzzle,
    });
    mountGrid(gridRoot, gs);
    const calls = { load: [], copy: [] };
    mount({
      gameState: gs,
      loadPuzzle: loadPuzzle ?? (async text => { calls.load.push(text); return { status: 'loaded', message: 'Puzzle loaded. Difficulty: Kiddie.' }; }),
      copy: copy ?? (async text => { calls.copy.push(text); return true; }),
    });
    return calls;
  }

  const $ = id => document.getElementById(id);
  const cell = i => gridRoot.querySelector(`.cell[data-index="${i}"]`);
  // The grid deselects on any click outside itself; that is its rule, not a
  // board change made by the tools.
  const boardActions = () => gs.dispatch.calls.filter(a => a.type !== 'DESELECT');
  const emit = (...keys) => gs._emit('changed', { action: { type: 'TEST' }, changed: new Set(keys) });
  const steps = () => [...$('dev-inspect-list').querySelectorAll('button')];
  /** Cell index a placement step's button names ("… place 4 at r1c3"). */
  const placedCell = (button) => {
    const [, r, c] = button.textContent.match(/at r(\d)c(\d)$/);
    return (r - 1) * 9 + (c - 1);
  };
  const key = (el, k) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  /** KIDDIE plus the solution digits of the cells the first `n` steps place. */
  const kiddieThrough = (n) => {
    const pen = toGivens(KIDDIE);
    const solution = toGivens(KIDDIE_SOLUTION);
    for (const b of steps().slice(0, n)) pen[placedCell(b)] = solution[placedCell(b)];
    return Array.from(pen).join('');
  };
  const lastBoardSet = () => {
    const sets = gs.dispatch.calls.filter(a => a.type === 'DEV_SET_BOARD');
    return sets.length ? Array.from(sets[sets.length - 1].pen).join('') : null;
  };

  // ── Shell ────────────────────────────────────────────────────────────────

  describe('shell', () => {
    it('DP1: mount adds the panel to <main> as a labelled, focusable region', () => {
      mountPanel();
      expect(main.classList.contains('dev-host')).to.be.true;
      const panel = $('dev-root');
      expect(panel.parentElement).to.equal(main);
      expect(panel.tagName).to.equal('SECTION');
      expect(panel.getAttribute('aria-labelledby')).to.equal('dev-title');
      expect($('dev-title').textContent).to.equal('Developer tools');
      expect(panel.tabIndex).to.equal(-1);
    });

    it('DP2: mount adds the DEV badge as a labelled link to the panel', () => {
      mountPanel();
      const badge = $('dev-badge');
      expect(badge.tagName).to.equal('A');
      expect(badge.textContent).to.equal('DEV');
      expect(badge.getAttribute('href')).to.equal('#dev-root');
      expect(badge.getAttribute('aria-label')).to.equal('Developer mode on — skip to developer tools');
    });

    it('DP3: activating the badge moves focus to the panel', () => {
      mountPanel();
      $('dev-badge').addEventListener('click', e => e.preventDefault());  // keep the test page's URL
      $('dev-badge').click();
      expect(document.activeElement).to.equal($('dev-root'));
    });

    it('DP4: mount injects the dev stylesheet', () => {
      mountPanel();
      const link = $('dev-stylesheet');
      expect(link.rel).to.equal('stylesheet');
      expect(new URL(link.href).pathname).to.equal('/css/dev.css');
    });

    it('DP5: the panel says statistics are off and how to leave dev mode', () => {
      mountPanel();
      const note = $('dev-root').querySelector('.dev-note').textContent;
      expect(note).to.include('Statistics are not recorded');
      expect(note).to.include('?dev=0');
    });

    it('DP6: the five tools are native disclosure sections, collapsed initially', () => {
      mountPanel();
      const tools = [...$('dev-root').querySelectorAll('details.dev-tool')];
      expect(tools.map(t => t.id)).to.deep.equal(['dev-load', 'dev-inspector', 'dev-overlay', 'dev-coach', 'dev-gen']);
      for (const tool of tools) {
        expect(tool.open, tool.id).to.be.false;
        expect(tool.querySelector('summary'), tool.id).to.not.be.null;
      }
    });
  });

  // ── Load from string ─────────────────────────────────────────────────────

  describe('load puzzle from string', () => {
    it('DP7: the text field has a visible label', () => {
      mountPanel();
      const label = $('dev-root').querySelector('label[for="dev-load-input"]');
      expect(label.textContent).to.include('Puzzle string');
      expect($('dev-load-input').tagName).to.equal('TEXTAREA');
    });

    it('DP8: Load passes the field text to the loader and shows "Checking puzzle…" meanwhile', async () => {
      let release;
      const texts = [];
      mountPanel({
        loadPuzzle: text => { texts.push(text); return new Promise(r => { release = r; }); },
      });
      $('dev-load-input').value = KIDDIE;
      $('dev-load-btn').click();
      expect(texts).to.deep.equal([KIDDIE]);
      expect($('dev-load-status').textContent).to.equal('Checking puzzle…');
      release({ status: 'loaded', message: 'Puzzle loaded. Difficulty: Kiddie.' });
      await settle();
      expect($('dev-load-status').textContent).to.equal('Puzzle loaded. Difficulty: Kiddie.');
    });

    it('DP9: a loaded outcome is shown plainly and announced; the field keeps its text', async () => {
      mountPanel();
      $('dev-load-input').value = KIDDIE;
      $('dev-load-btn').click();
      await settle();
      expect($('dev-load-status').classList.contains('dev-error')).to.be.false;
      expect(sr.textContent).to.equal('Puzzle loaded. Difficulty: Kiddie.');
      expect($('dev-load-input').value).to.equal(KIDDIE);
    });

    it('DP10: a rejection is shown as an inline error and announced', async () => {
      const message = 'This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 3.';
      mountPanel({ loadPuzzle: async () => ({ status: 'rejected', reason: 'length', message }) });
      $('dev-load-input').value = '123';
      $('dev-load-btn').click();
      await settle();
      expect($('dev-load-status').textContent).to.equal(message);
      expect($('dev-load-status').classList.contains('dev-error')).to.be.true;
      expect($('dev-load-status').getAttribute('role')).to.equal('status');
      expect(sr.textContent).to.equal(message);
    });

    it('DP11: the error styling is cleared by the next attempt', async () => {
      let outcome = { status: 'rejected', reason: 'chars', message: 'bad' };
      mountPanel({ loadPuzzle: async () => outcome });
      $('dev-load-btn').click();
      await settle();
      outcome = { status: 'declined', message: 'Puzzle not loaded. Your game continues.' };
      $('dev-load-btn').click();
      await settle();
      expect($('dev-load-status').classList.contains('dev-error')).to.be.false;
      expect($('dev-load-status').textContent).to.equal('Puzzle not loaded. Your game continues.');
    });
  });

  // ── Solver step inspector ────────────────────────────────────────────────

  describe('solver step inspector', () => {
    it('DP12: Run solver lists every step as a toggle button and shows the summary', async () => {
      mountPanel();
      $('dev-inspect-run').click();
      const buttons = $('dev-inspect-list').querySelectorAll('li > button');
      expect(buttons).to.have.length(51);
      expect(buttons[0].textContent).to.match(/^Naked Single — place /);
      expect(buttons[0].getAttribute('aria-pressed')).to.equal('false');
      expect($('dev-inspect-summary').textContent).to.equal('Solved in 51 steps. Hardest rank 1 (Kiddie).');
      await frame();
      expect(sr.textContent).to.equal('Solved in 51 steps. Hardest rank 1 (Kiddie).');
    });

    it('DP13: running the solver changes nothing in the game', () => {
      mountPanel();
      const before = Array.from(gs.getState().pen).join('');
      $('dev-inspect-run').click();
      expect(Array.from(gs.getState().pen).join('')).to.equal(before);
      expect(boardActions()).to.have.length(0);
    });

    it('DP14: the solver runs on givens plus the player\'s digits', () => {
      const pen = toGivens(KIDDIE_SOLUTION);
      pen[40] = 0;
      mountPanel({ state: { pen } });
      $('dev-inspect-run').click();
      expect($('dev-inspect-list').querySelectorAll('button')).to.have.length(1);
      expect($('dev-inspect-summary').textContent).to.equal('Solved in 1 step. Hardest rank 1 (Kiddie).');
    });

    it('DP15: selecting a step presses it, highlights its cell, and announces it', async () => {
      mountPanel();
      $('dev-inspect-run').click();
      const first = $('dev-inspect-list').querySelector('button');
      first.click();
      expect(first.getAttribute('aria-pressed')).to.equal('true');
      const placed = gridRoot.querySelectorAll('.cell.dev-hl-place');
      expect(placed).to.have.length(1);
      expect(placed[0].getAttribute('aria-label')).to.match(/ — solver step: placement$/);
      await frame();
      expect(sr.textContent).to.equal(`Step 1: ${first.textContent}. 1 cell highlighted.`);
      expect(boardActions()).to.deep.equal([{ type: 'SELECT_CELL', index: placedCell(first) }]);
    });

    it('DP16: selecting another step moves the selection', () => {
      mountPanel();
      $('dev-inspect-run').click();
      const [a, b] = $('dev-inspect-list').querySelectorAll('button');
      a.click();
      b.click();
      expect(a.getAttribute('aria-pressed')).to.equal('false');
      expect(b.getAttribute('aria-pressed')).to.equal('true');
      expect(gridRoot.querySelectorAll('.cell.dev-hl-place')).to.have.length(1);
    });

    it('DP17: clicking the selected step again keeps it selected', () => {
      mountPanel();
      $('dev-inspect-run').click();
      const first = $('dev-inspect-list').querySelector('button');
      first.click();
      first.click();
      expect(first.getAttribute('aria-pressed')).to.equal('true');
      expect(gridRoot.querySelectorAll('.cell.dev-hl-place')).to.have.length(1);
    });

    it('DP18: an elimination step highlights several cells and says so in the plural', async () => {
      mountPanel({ state: { puzzle: makeGenerated(HARD) } });
      $('dev-inspect-run').click();
      const elim = [...$('dev-inspect-list').querySelectorAll('button')]
        .find(b => b.textContent === 'Locked Candidates — eliminate 8 from r5c3, r5c4');
      elim.click();
      const highlighted = [...gridRoot.querySelectorAll('.cell.dev-hl-elim')].map(c => Number(c.dataset.index));
      expect(highlighted).to.deep.equal([38, 39]);
      expect(cell(38).getAttribute('aria-label')).to.match(/ — solver step: elimination$/);
      await frame();
      expect(sr.textContent).to.match(/\. 2 cells highlighted\.$/);
      // The board cursor goes to the first cell the step eliminates from.
      expect(boardActions()).to.deep.equal([{ type: 'SELECT_CELL', index: 38 }]);
    });

    it('DP19: a click on the list outside any step button does nothing', () => {
      mountPanel();
      $('dev-inspect-run').click();
      $('dev-inspect-list').click();
      expect($('dev-inspect-list').querySelector('[aria-pressed="true"]')).to.be.null;
    });

    it('DP20: the highlight survives a grid re-render', () => {
      mountPanel();
      $('dev-inspect-run').click();
      $('dev-inspect-list').querySelector('button').click();
      emit('selected');
      expect(gridRoot.querySelectorAll('.cell.dev-hl-place')).to.have.length(1);
    });

    it('DP21: a board change clears the list and highlight and says to run again', () => {
      mountPanel();
      $('dev-inspect-run').click();
      $('dev-inspect-list').querySelector('button').click();
      emit('pen');
      expect($('dev-inspect-list').children).to.have.length(0);
      expect($('dev-inspect-summary').textContent).to.equal('Board changed — run the solver again.');
      expect(gridRoot.querySelectorAll('[class*="dev-hl-"]')).to.have.length(0);
    });

    it('DP22: a new puzzle also clears it', () => {
      mountPanel();
      $('dev-inspect-run').click();
      emit('puzzle');
      expect($('dev-inspect-summary').textContent).to.equal('Board changed — run the solver again.');
    });

    it('DP23: a pencil-only change keeps the results', () => {
      mountPanel();
      $('dev-inspect-run').click();
      emit('pencil');
      expect($('dev-inspect-list').children).to.have.length(51);
    });

    it('DP24: a board change with no results on show leaves the summary empty', () => {
      mountPanel();
      emit('pen');
      expect($('dev-inspect-summary').textContent).to.equal('');
    });

    it('DP25: Clear empties the list, the highlight, and the summary', () => {
      mountPanel();
      $('dev-inspect-run').click();
      $('dev-inspect-list').querySelector('button').click();
      $('dev-inspect-clear').click();
      expect($('dev-inspect-list').children).to.have.length(0);
      expect($('dev-inspect-summary').textContent).to.equal('');
      expect(gridRoot.querySelectorAll('[class*="dev-hl-"]')).to.have.length(0);
    });

    it('DP26: re-running drops the previous selection', () => {
      mountPanel();
      $('dev-inspect-run').click();
      $('dev-inspect-list').querySelector('button').click();
      $('dev-inspect-run').click();
      expect($('dev-inspect-list').querySelector('[aria-pressed="true"]')).to.be.null;
      expect(gridRoot.querySelectorAll('[class*="dev-hl-"]')).to.have.length(0);
    });

    // ── Selection by keyboard ──────────────────────────────────────────────

    describe('keyboard selection', () => {
      let seen;
      const spy = e => seen.push(e.key);
      beforeEach(() => { seen = []; document.addEventListener('keydown', spy); });
      afterEach(() => document.removeEventListener('keydown', spy));

      function run() {
        mountPanel();
        $('dev-inspector').open = true;
        $('dev-inspect-run').click();
        return steps();
      }

      it('DP48: ArrowDown and ArrowUp move focus and selection exactly as a click would', async () => {
        const list = run();
        list[0].click();
        gs.dispatch.calls.length = 0;

        const down = key(list[0], 'ArrowDown');
        expect(down.defaultPrevented).to.be.true;
        expect(document.activeElement).to.equal(list[1]);
        expect(list[1].getAttribute('aria-pressed')).to.equal('true');
        expect(list[0].getAttribute('aria-pressed')).to.equal('false');
        expect(boardActions()).to.deep.equal([{ type: 'SELECT_CELL', index: placedCell(list[1]) }]);
        expect(gridRoot.querySelectorAll('.cell.dev-hl-place')).to.have.length(1);
        await frame();
        expect(sr.textContent).to.equal(`Step 2: ${list[1].textContent}. 1 cell highlighted.`);

        key(list[1], 'ArrowUp');
        expect(document.activeElement).to.equal(list[0]);
        expect(list[0].getAttribute('aria-pressed')).to.equal('true');
      });

      it('DP49: the list stops at its ends; Home and End jump to them', () => {
        const list = run();
        key(list[0], 'ArrowUp');
        expect(list[0].getAttribute('aria-pressed')).to.equal('true');
        key(list[0], 'End');
        expect(document.activeElement).to.equal(list[50]);
        expect(list[50].getAttribute('aria-pressed')).to.equal('true');
        key(list[50], 'ArrowDown');
        expect(list[50].getAttribute('aria-pressed')).to.equal('true');
        key(list[50], 'Home');
        expect(document.activeElement).to.equal(list[0]);
      });

      it('DP50: navigation and activation keys never reach the global key handler', () => {
        const list = run();
        for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ']) key(list[0], k);
        expect(seen).to.deep.equal([]);
      });

      it('DP51: other keys, and keys on the list itself, are left alone', () => {
        const list = run();
        gs.dispatch.calls.length = 0;
        const typed = key(list[0], 'a');
        expect(typed.defaultPrevented).to.be.false;
        key($('dev-inspect-list'), 'ArrowDown');
        expect(seen).to.deep.equal(['a', 'ArrowDown']);
        expect($('dev-inspect-list').querySelector('[aria-pressed="true"]')).to.be.null;
        expect(gs.dispatch.calls).to.have.length(0);
      });

      it('DP52: Escape drops the selection and highlight, and still propagates', () => {
        const list = run();
        list[0].click();
        gs.dispatch.calls.length = 0;
        const esc = key(list[0], 'Escape');
        expect(esc.defaultPrevented).to.be.false;
        expect(seen).to.deep.equal(['Escape']);
        expect(list[0].getAttribute('aria-pressed')).to.equal('false');
        expect(gridRoot.querySelectorAll('[class*="dev-hl-"]')).to.have.length(0);
        expect(gs.dispatch.calls).to.have.length(0);
        expect(steps()).to.have.length(51);
      });
    });

    // ── Set board to step ──────────────────────────────────────────────────

    describe('set board to step', () => {
      function run(state) {
        mountPanel(state ? { state } : undefined);
        $('dev-inspect-run').click();
        return steps();
      }

      it('DP53: Restore board is disabled until the board has been set to a step', () => {
        run();
        expect($('dev-inspect-restore').disabled).to.be.true;
        expect($('dev-inspect-board').textContent).to.equal('');
      });

      it('DP54: Enter on a selected step sets the board to the solver\'s position after it', async () => {
        const list = run();
        list[4].click();
        const enter = key(list[4], 'Enter');
        expect(enter.defaultPrevented).to.be.true;
        expect(lastBoardSet()).to.equal(kiddieThrough(5));
        expect($('dev-inspect-board').textContent).to.equal('Board set to step 5 of 51.');
        expect($('dev-inspect-restore').disabled).to.be.false;
        await frame();
        expect(sr.textContent).to.equal('Board set to step 5 of 51.');
      });

      it('DP55: the steps the board has been set through are marked, the last as current', () => {
        const list = run();
        key(list[4], 'Enter');
        expect(list.map(b => b.hasAttribute('data-applied')).lastIndexOf(true)).to.equal(4);
        expect(list.slice(0, 5).every(b => b.hasAttribute('data-applied'))).to.be.true;
        expect(list.filter(b => b.getAttribute('aria-current') === 'step')).to.deep.equal([list[4]]);
      });

      it('DP56: Space on a step that is not yet selected selects it and sets the board', () => {
        const list = run();
        key(list[2], ' ');
        expect(list[2].getAttribute('aria-pressed')).to.equal('true');
        expect(boardActions().map(a => a.type)).to.deep.equal(['SELECT_CELL', 'DEV_SET_BOARD']);
        expect(lastBoardSet()).to.equal(kiddieThrough(3));
      });

      it('DP57: double-clicking a step sets the board to it', () => {
        const list = run();
        list[9].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(lastBoardSet()).to.equal(kiddieThrough(10));
        $('dev-inspect-list').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(gs.dispatch.calls.filter(a => a.type === 'DEV_SET_BOARD')).to.have.length(1);
      });

      it('DP58: going to an earlier step removes the digits of the later ones', () => {
        const list = run();
        key(list[9], 'Enter');
        key(list[1], 'Enter');
        expect(lastBoardSet()).to.equal(kiddieThrough(2));
        expect(list.filter(b => b.hasAttribute('data-applied'))).to.have.length(2);
        expect(list[9].hasAttribute('aria-current')).to.be.false;
        expect($('dev-inspect-board').textContent).to.equal('Board set to step 2 of 51.');
      });

      it('DP59: positions are built on the board the solver was run on, player digits included', () => {
        const pen = toGivens(KIDDIE_SOLUTION);
        pen[40] = 0;
        pen[41] = 0;
        const list = run({ pen });
        key(list[0], 'Enter');
        const set = lastBoardSet();
        expect(set.split('').filter(d => d === '0')).to.have.length(1);
      });

      it('DP60: the inspector\'s own board write does not make its results stale', () => {
        const list = run();
        key(list[4], 'Enter');
        gs._emit('changed', { action: { type: 'DEV_SET_BOARD' }, changed: new Set(['pen']) });
        expect(steps()).to.have.length(51);
        expect($('dev-inspect-board').textContent).to.equal('Board set to step 5 of 51.');
      });

      it('DP61: Restore board puts back the board the solver started from', async () => {
        const list = run();
        key(list[4], 'Enter');
        $('dev-inspect-restore').click();
        expect(lastBoardSet()).to.equal(KIDDIE);
        expect(list.some(b => b.hasAttribute('data-applied'))).to.be.false;
        expect(list.some(b => b.hasAttribute('aria-current'))).to.be.false;
        expect($('dev-inspect-restore').disabled).to.be.true;
        expect($('dev-inspect-board').textContent).to.equal('Board restored to where the solver started.');
        expect(steps()).to.have.length(51);
      });

      it('DP62: a player\'s board change, Clear, and a re-run all reset the set-to-step state', () => {
        let list = run();
        key(list[4], 'Enter');
        emit('pen');
        expect($('dev-inspect-board').textContent).to.equal('');
        expect($('dev-inspect-restore').disabled).to.be.true;

        $('dev-inspect-run').click();
        list = steps();
        key(list[4], 'Enter');
        $('dev-inspect-clear').click();
        expect($('dev-inspect-board').textContent).to.equal('');
        expect($('dev-inspect-restore').disabled).to.be.true;

        $('dev-inspect-run').click();
        key(steps()[4], 'Enter');
        $('dev-inspect-run').click();
        expect($('dev-inspect-board').textContent).to.equal('');
        expect($('dev-inspect-restore').disabled).to.be.true;
        expect(steps().some(b => b.hasAttribute('data-applied'))).to.be.false;
      });

      const lastSet = () => gs.dispatch.calls.filter(a => a.type === 'DEV_SET_BOARD').at(-1);
      /** HARD with every candidate pencilled into every cell. */
      const hardFullyMarked = () => ({
        puzzle: makeGenerated(HARD),
        pencil: new Uint16Array(81).fill(0b111111111),
      });
      const firstElim = list => list.findIndex(b => b.textContent.includes('eliminate'));
      /** [cell index, digit bit] of the first candidate an elimination step's button names. */
      const elimTarget = (button) => {
        const [, d, r, c] = button.textContent.match(/eliminate (\d) from r(\d)c(\d)/);
        return [(r - 1) * 9 + (c - 1), 1 << (d - 1)];
      };

      it('DP64: setting the board to an elimination step removes its candidates from the player\'s marks', () => {
        const list = run(hardFullyMarked());
        const e = firstElim(list);
        const [target, bit] = elimTarget(list[e]);
        key(list[e - 1], 'Enter');
        expect(lastSet().pencil[target] & bit).to.equal(bit);
        key(list[e], 'Enter');
        expect(lastSet().pencil[target] & bit).to.equal(0);
      });

      it('DP65: going back to an earlier step brings the later steps\' marks back', () => {
        const list = run(hardFullyMarked());
        const e = firstElim(list);
        const [target, bit] = elimTarget(list[e]);
        key(list[e], 'Enter');
        // The fake state does not apply dispatches, so the marks on the board are
        // still the originals; the panel must nevertheless work from its snapshot.
        gs.getState().pencil = new Uint16Array(81);
        key(list[e - 1], 'Enter');
        expect(lastSet().pencil[target] & bit).to.equal(bit);
      });

      it('DP66: Restore board puts the player\'s marks back and takes a fresh snapshot next time', () => {
        const state = hardFullyMarked();
        const list = run(state);
        key(list[firstElim(list)], 'Enter');
        $('dev-inspect-restore').click();
        expect(Array.from(lastSet().pencil)).to.deep.equal(Array.from(state.pencil));

        gs.getState().pencil = new Uint16Array(81);
        key(list[0], 'Enter');
        expect(lastSet().pencil.some(m => m !== 0)).to.be.false;
      });

      it('DP67: an active coach session is ended before the marks are snapshotted, once', () => {
        const list = run();
        gs.getState().coachSession = {
          step: {}, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal',
        };
        gs.dispatch.calls.length = 0;
        key(list[0], 'Enter');
        key(list[1], 'Enter');
        expect(boardActions().map(a => a.type)).to.deep.equal(
          ['SELECT_CELL', 'COACH_END', 'DEV_SET_BOARD', 'SELECT_CELL', 'DEV_SET_BOARD']);
      });

      it('DP68: Restore board hands focus to the selected step, or the first, and keeps the board cursor', () => {
        const list = run();
        $('dev-inspector').open = true;   // nothing inside a closed <details> can take focus
        key(list[4], 'Enter');
        $('dev-inspect-restore').focus();
        gs.dispatch.calls.length = 0;
        $('dev-inspect-restore').click();
        expect(document.activeElement).to.equal(list[4]);
        expect(gs.dispatch.calls.map(a => a.type)).to.deep.equal(['DEV_SET_BOARD']);

        key(list[4], 'Enter');
        key(list[4], 'Escape');
        $('dev-inspect-restore').click();
        expect(document.activeElement).to.equal(list[0]);
      });

      it('DP69: while the board is set to a step the overlay shows the solver\'s candidates, and plain ones again after Restore', () => {
        const list = run({ puzzle: makeGenerated(HARD) });
        const e = firstElim(list);
        const [target, bit] = elimTarget(list[e]);
        const digit = Math.log2(bit);
        const shown = () => cell(target).querySelectorAll('.pencil-mark')[digit].className;
        $('dev-overlay-toggle').click();
        expect(shown()).to.include('dev-cand-agree');

        key(list[e], 'Enter');
        emit('pencil');   // the fake state does not re-render on dispatch
        expect(shown()).to.include('empty');

        $('dev-inspect-restore').click();
        emit('pencil');
        expect(shown()).to.include('dev-cand-agree');
      });

      it('DP63: clicking a step does not deselect the board cell the tool just selected', () => {
        const list = run();
        gs.dispatch.calls.length = 0;
        list[0].click();
        expect(gs.dispatch.calls.map(a => a.type)).to.deep.equal(['SELECT_CELL']);
      });
    });
  });

  // ── Candidate overlay ────────────────────────────────────────────────────

  describe('candidate overlay', () => {
    const marks = i => [...cell(i).querySelectorAll('.pencil-mark')].map(s => s.className.replace('pencil-mark ', ''));

    it('DP27: the switch starts off and exposes its state', () => {
      mountPanel();
      const toggle = $('dev-overlay-toggle');
      expect(toggle.getAttribute('role')).to.equal('switch');
      expect(toggle.getAttribute('aria-checked')).to.equal('false');
      expect(cell(EMPTY).textContent).to.equal('');
    });

    it('DP28: switching on shows computed candidates in every empty cell and announces it', async () => {
      mountPanel();
      $('dev-overlay-toggle').click();
      expect($('dev-overlay-toggle').getAttribute('aria-checked')).to.equal('true');
      expect(marks(EMPTY)).to.deep.equal(
        ['dev-cand-agree', 'dev-cand-agree', 'empty', 'dev-cand-agree', 'empty', 'empty', 'empty', 'empty', 'empty']);
      const emptyCells = [...KIDDIE].filter(c => c === '0').length;
      expect(gridRoot.querySelectorAll('.cell .pencil-marks')).to.have.length(emptyCells);
      await frame();
      expect(sr.textContent).to.equal('Candidate overlay on.');
    });

    it('DP29: filled cells are untouched by the overlay', () => {
      mountPanel();
      $('dev-overlay-toggle').click();
      expect(cell(0).textContent).to.equal('5');
      expect(cell(0).getAttribute('aria-label')).to.equal('Row 1, column 1: 5 (given)');
    });

    it('DP30: divergences from the player\'s marks are distinguished', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b0011 | 0b100000000;   // 1, 2, 9 — lacks 4, has a stray 9
      mountPanel({ state: { pencil } });
      $('dev-overlay-toggle').click();
      expect(marks(EMPTY)).to.deep.equal(
        ['dev-cand-agree', 'dev-cand-agree', 'empty', 'dev-cand-missing', 'empty', 'empty', 'empty', 'empty', 'dev-cand-extra']);
    });

    it('DP31: an overlay cell\'s accessible name describes candidates and divergences', () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b0011 | 0b100000000;
      mountPanel({ state: { pencil } });
      $('dev-overlay-toggle').click();
      expect(cell(EMPTY).getAttribute('aria-label'))
        .to.equal('Row 1, column 3: candidates 1, 2, 4. Missing from your marks: 4. Extra marks: 9');
    });

    it('DP32: the selected cell keeps its (selected) suffix under the overlay', () => {
      mountPanel({ state: { selected: EMPTY } });
      $('dev-overlay-toggle').click();
      expect(cell(EMPTY).getAttribute('aria-label')).to.equal('Row 1, column 3: candidates 1, 2, 4 (selected)');
    });

    it('DP33: the overlay follows the board live', () => {
      mountPanel();
      $('dev-overlay-toggle').click();
      gs.getState().pen[EMPTY + 1] = 2;   // r1c4 takes 2 → r1c3 loses it
      emit('pen');
      expect(marks(EMPTY)[1]).to.equal('empty');
      expect(cell(EMPTY + 1).textContent).to.equal('2');
    });

    it('DP34: switching off restores the player\'s marks, which were never modified', async () => {
      const pencil = new Uint16Array(81);
      pencil[EMPTY] = 0b0011 | 0b100000000;
      mountPanel({ state: { pencil } });
      $('dev-overlay-toggle').click();
      $('dev-overlay-toggle').click();
      expect($('dev-overlay-toggle').getAttribute('aria-checked')).to.equal('false');
      expect(pencil[EMPTY]).to.equal(0b0011 | 0b100000000);
      expect(cell(EMPTY).getAttribute('aria-label')).to.equal('Row 1, column 3: pencil marks 1, 2, 9');
      expect(cell(EMPTY).querySelector('[class*="dev-cand-"]')).to.be.null;
      expect(boardActions()).to.have.length(0);
      await frame();
      expect(sr.textContent).to.equal('Candidate overlay off.');
    });

    it('DP35: overlay and step highlight combine on the same cell', () => {
      mountPanel();
      $('dev-inspect-run').click();
      const first = $('dev-inspect-list').querySelector('button');
      first.click();
      $('dev-overlay-toggle').click();
      const target = gridRoot.querySelector('.cell.dev-hl-place');
      expect(target.querySelector('.pencil-marks')).to.not.be.null;
      expect(target.getAttribute('aria-label')).to.match(/: candidates .* — solver step: placement$/);
    });
  });

  // ── Coach step data ──────────────────────────────────────────────────────

  describe('coach step data', () => {
    const step = { technique: 'Naked Single', roles: { target: 5, cause: [1, 2] }, digits: [4] };

    it('DP36: with no session it says so and Copy is disabled', () => {
      mountPanel();
      expect($('dev-coach-json').textContent).to.equal('No active coach session.');
      expect($('dev-coach-copy').disabled).to.be.true;
      expect($('dev-coach-json').getAttribute('aria-label')).to.equal('Coach step JSON');
      expect($('dev-coach-json').tabIndex).to.equal(0);
    });

    it('DP37: an active session shows its CoachStep as two-space-indented JSON', () => {
      mountPanel({ state: { coachSession: { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' } } });
      expect($('dev-coach-json').textContent).to.equal(JSON.stringify(step, null, 2));
      expect($('dev-coach-copy').disabled).to.be.false;
    });

    it('DP38: the view updates as the session starts and ends', () => {
      mountPanel();
      gs.getState().coachSession = { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' };
      emit('coachSession');
      expect(JSON.parse($('dev-coach-json').textContent)).to.deep.equal(step);
      gs.getState().coachSession = null;
      emit('coachSession');
      expect($('dev-coach-json').textContent).to.equal('No active coach session.');
      expect($('dev-coach-copy').disabled).to.be.true;
    });

    it('DP39: Copy JSON copies the displayed text and confirms', async () => {
      const calls = mountPanel({ state: { coachSession: { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' } } });
      $('dev-coach-copy').click();
      await settle();
      expect(calls.copy).to.deep.equal([JSON.stringify(step, null, 2)]);
      expect($('dev-coach-status').textContent).to.equal('Copied.');
      expect($('dev-coach-status').classList.contains('dev-error')).to.be.false;
      expect(sr.textContent).to.equal('Copied.');
    });

    it('DP40: a failed copy explains the manual alternative', async () => {
      mountPanel({
        state: { coachSession: { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' } },
        copy: async () => false,
      });
      $('dev-coach-copy').click();
      await settle();
      expect($('dev-coach-status').textContent).to.equal('Couldn\'t copy — select the text and copy it manually.');
      expect($('dev-coach-status').classList.contains('dev-error')).to.be.true;
      expect(sr.textContent).to.equal('Couldn\'t copy — select the text and copy it manually.');
    });

    it('DP41: a session change clears a stale copy status', async () => {
      mountPanel({
        state: { coachSession: { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' } },
        copy: async () => false,
      });
      $('dev-coach-copy').click();
      await settle();
      emit('coachSession');
      expect($('dev-coach-status').textContent).to.equal('');
      expect($('dev-coach-status').classList.contains('dev-error')).to.be.false;
    });

    it('DP42: the default copy dependency is the clipboard helper', async () => {
      gs = makeFakeGameState({
        puzzle: makeGenerated(), pen: toGivens(KIDDIE), pencil: new Uint16Array(81),
        coachSession: { step, coachedCells: new Set(), coachRevealedBits: new Uint16Array(81), recap: 'normal' },
      });
      mountGrid(gridRoot, gs);
      mount({ gameState: gs, loadPuzzle: async () => ({}) });
      $('dev-coach-copy').click();
      await new Promise(r => setTimeout(r, 100));
      expect($('dev-coach-status').textContent).to.be.oneOf(
        ['Copied.', 'Couldn\'t copy — select the text and copy it manually.']);
    });
  });

  // ── Generation diagnostics ───────────────────────────────────────────────

  describe('generation diagnostics', () => {
    const rows = () => Object.fromEntries(
      [...$('dev-gen-body').querySelectorAll('tr')].map(tr => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));

    it('DP43: a generated puzzle shows the diagnostics table with row headers', () => {
      mountPanel();
      expect(rows()).to.deep.equal({
        'Requested tier': 'Kiddie',
        'Achieved tier': 'Kiddie',
        'Fallback used': 'No',
        'Attempts': '2 of 20',
        'Rejected — unsolvable by solver': '0',
        'Rejected — wrong tier': '1 (Easy 1)',
        'Technique profile': 'Naked Single × 2',
      });
      expect($('dev-gen-body').querySelector('th').scope).to.equal('row');
    });

    it('DP44: a loaded puzzle says it was not generated', () => {
      mountPanel({ state: { puzzle: { ...makeGenerated(), source: 'link', gen: undefined } } });
      expect($('dev-gen-body').textContent).to.equal('This puzzle was loaded, not generated.');
      expect($('dev-gen-body').querySelector('table')).to.be.null;
    });

    it('DP45: the view updates when the puzzle changes', () => {
      mountPanel();
      gs.getState().puzzle = { ...makeGenerated(), source: 'string', gen: undefined };
      emit('puzzle');
      expect($('dev-gen-body').textContent).to.equal('This puzzle was loaded, not generated.');
      gs.getState().puzzle = makeGenerated();
      emit('puzzle');
      expect(rows()['Attempts']).to.equal('2 of 20');
    });

    it('DP46: a restored puzzle with no stored trace gets its profile recomputed', () => {
      mountPanel({ state: { puzzle: { ...makeGenerated(), solveTrace: [] } } });
      expect(rows()['Technique profile']).to.equal('Naked Single × 51');
    });

    it('DP47: with no puzzle it says so', () => {
      mountPanel({ state: { puzzle: null } });
      expect($('dev-gen-body').textContent).to.equal('No puzzle loaded.');
    });
  });
});
