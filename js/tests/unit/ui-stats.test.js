/**
 * @fileoverview Unit tests for js/ui/stats.js (US1–US21; US6–US21 tspec-hamburger-menu §2.3).
 *
 * US22 (missing-tbody guard) is dropped: the rework removed the `if (!tbody)` guard.
 */

import { mount, open, close, isOpen } from '../../ui/stats.js';
import { DIFFICULTY_ORDER } from '../../config.js';

const { makeFakeGameState } = window;

function makePuzzle({ difficulty = 'easy' } = {}) {
  return {
    id: 'test',
    difficulty,
    givens: new Uint8Array(81),
    solution: new Uint8Array(81).fill(1),
    solveTrace: [],
  };
}

function makeStatsMap(overrides = {}) {
  const base = {
    kiddie:     { attempted: 0, won: 0 },
    easy:       { attempted: 0, won: 0 },
    medium:     { attempted: 0, won: 0 },
    hard:       { attempted: 0, won: 0 },
    expert:     { attempted: 0, won: 0 },
    diabolical: { attempted: 0, won: 0 },
    nightmare:  { attempted: 0, won: 0 },
  };
  return { ...base, ...overrides };
}

function makeFakeStatistics(statsMap = makeStatsMap()) {
  const listeners = [];
  const writes = [];
  return {
    writes,
    get: () => statsMap,
    recordAttemptOnce: (...a) => { writes.push(['recordAttemptOnce', ...a]); },
    recordWin: (...a) => { writes.push(['recordWin', ...a]); },
    on: (event, fn) => {
      listeners.push({ event, fn });
      return () => {};
    },
    _fire: (event, data) => {
      for (const l of listeners) {
        if (l.event === event) l.fn(data);
      }
    },
  };
}

/** Finds a table row by its Level cell, whatever its accessible name. */
function rowFor(root, label) {
  return [...root.querySelectorAll('#stats-tbody tr')]
    .find(r => r.cells[0].textContent.trim() === label);
}

describe('ui/stats.js', () => {
  let root;

  afterEach(() => {
    close();
    root?.remove();
    root = null;
  });

  function mountStats(gsOverrides = {}, statsMapOverrides = {}) {
    const puzzle = makePuzzle({ difficulty: gsOverrides.difficulty ?? 'easy' });
    const fakeGs = makeFakeGameState({ puzzle, ...gsOverrides });
    const fakeStats = makeFakeStatistics(makeStatsMap(statsMapOverrides));
    root = document.createElement('div');
    root.id = 'stats-dialog-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);
    return { fakeGs, fakeStats };
  }

  // US1: Renders 7 rows in DIFFICULTY_ORDER
  it('US1: renders exactly 7 rows in DIFFICULTY_ORDER sequence', () => {
    mountStats();
    const rows = root.querySelectorAll('#stats-tbody tr');
    expect(rows.length).to.equal(7);
    // Verify order by checking aria-labels contain the difficulty names in order.
    const labels = DIFFICULTY_ORDER.map((_, i) => rows[i].getAttribute('aria-label').toLowerCase());
    expect(labels[0]).to.include('kiddie');
    expect(labels[1]).to.include('easy');
    expect(labels[2]).to.include('medium');
    expect(labels[3]).to.include('hard');
    expect(labels[4]).to.include('expert');
    expect(labels[5]).to.include('diabolical');
    expect(labels[6]).to.include('nightmare');
  });

  // US2: Active-diff marker on current difficulty
  it('US2: the row matching current puzzle difficulty has .active-diff class', () => {
    mountStats({ difficulty: 'hard' });
    const hardRow = rowFor(root, 'Hard');
    expect(hardRow.classList.contains('active-diff')).to.be.true;
    // Other rows do not.
    const easyRow = rowFor(root, 'Easy');
    expect(easyRow.classList.contains('active-diff')).to.be.false;
  });

  // US3: Re-renders on stats-changed event
  it('US3: re-renders when the statistics object fires stats-changed', () => {
    const statsMap = makeStatsMap();
    const puzzle = makePuzzle();
    const fakeGs = makeFakeGameState({ puzzle });
    const fakeStats = makeFakeStatistics(statsMap);
    root = document.createElement('div');
    root.id = 'stats-dialog-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);

    // Initial render: easy attempted=0.
    const easyRowBefore = rowFor(root, 'Easy');
    expect(easyRowBefore.textContent).to.include('0');

    // Update stats in place, then fire event.
    statsMap.easy.attempted = 7;
    fakeStats._fire('stats-changed', statsMap);

    const easyRowAfter = rowFor(root, 'Easy');
    expect(easyRowAfter.textContent).to.include('7');
  });

  // US4: Re-computes active row on puzzle change event
  it('US4: moves .active-diff marker when puzzle difficulty changes', () => {
    const puzzle = makePuzzle({ difficulty: 'easy' });
    const fakeGs = makeFakeGameState({ puzzle });
    const fakeStats = makeFakeStatistics();
    root = document.createElement('div');
    root.id = 'stats-dialog-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);

    let hardRow = rowFor(root, 'Hard');
    expect(hardRow.classList.contains('active-diff')).to.be.false;

    // Change puzzle difficulty in state and emit.
    fakeGs.getState().puzzle.difficulty = 'hard';
    fakeGs._emit('changed', { action: { type: 'CHANGE_DIFFICULTY' }, changed: new Set(['puzzle']) });

    hardRow = rowFor(root, 'Hard');
    expect(hardRow.classList.contains('active-diff')).to.be.true;
  });

  // US5: Skips render when unrelated changed keys
  it('US5: does not re-render when changed set contains only unrelated keys', () => {
    const { fakeGs } = mountStats();
    const tbody = root.querySelector('#stats-tbody');
    const htmlBefore = tbody.innerHTML;

    fakeGs._emit('changed', { action: { type: 'PEN_ENTER' }, changed: new Set(['pen', 'pencil']) });

    expect(tbody.innerHTML).to.equal(htmlBefore);
  });
  // ── Statistics dialog (tspec-hamburger-menu §2.3) ─────────────────────────

  describe('dialog', () => {
    let trigger, other, spy;

    const key = (el, k, mods = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
      el.dispatchEvent(e);
      return e;
    };

    beforeEach(() => {
      trigger = document.createElement('button');
      trigger.id = 't-trigger';
      other = document.createElement('button');
      other.id = 't-other';
      document.body.append(trigger, other);
      spy = null;
    });

    afterEach(() => {
      spy?.remove();
      trigger.remove();
      other.remove();
    });

    function docKeySpy() {
      const counts = { document: 0, window: 0 };
      const onDoc = () => { counts.document++; };
      const onWin = () => { counts.window++; };
      document.addEventListener('keydown', onDoc);
      window.addEventListener('keydown', onWin);
      counts.remove = () => {
        document.removeEventListener('keydown', onDoc);
        window.removeEventListener('keydown', onWin);
      };
      return counts;
    }

    const $ = sel => root.querySelector(sel);
    const closeBtn = () => $('#stats-close');
    const backdrop = () => $('#stats-backdrop');

    it('US6: builds a closed, labelled modal dialog', () => {
      mountStats();
      const bd = backdrop();
      expect(bd.classList.contains('modal-backdrop')).to.be.true;
      expect(bd.getAttribute('role')).to.equal('dialog');
      expect(bd.getAttribute('aria-modal')).to.equal('true');
      expect(bd.getAttribute('aria-labelledby')).to.equal('stats-dialog-title');
      expect($('#stats-dialog-title').textContent).to.equal('Statistics');
      expect(bd.classList.contains('open')).to.be.false;
      expect(bd.querySelector('.modal.modal-stats')).to.exist;
      expect($('table').getAttribute('aria-label')).to.equal('Game statistics by difficulty');
      const ths = [...root.querySelectorAll('th')];
      expect(ths.map(th => th.textContent)).to.deep.equal(['Level', 'Tried', 'Won']);
      expect(ths.every(th => th.getAttribute('scope') === 'col')).to.be.true;
      expect(closeBtn().getAttribute('type')).to.equal('button');
      expect(closeBtn().textContent).to.equal('Close');
      expect($('.stats-heading')).to.be.null;
      expect(isOpen()).to.be.false;
    });

    it("US7: the current row's name says it is the current level", () => {
      mountStats({ difficulty: 'medium' }, { medium: { attempted: 4, won: 2 } });
      const medium = rowFor(root, 'Medium');
      expect(medium.getAttribute('aria-label')).to.equal('Medium, current level: 4 attempted, 2 won');
      expect(medium.classList.contains('active-diff')).to.be.true;
      for (const tr of root.querySelectorAll('#stats-tbody tr')) {
        if (tr === medium) continue;
        expect(tr.getAttribute('aria-label')).to.match(/^[A-Za-z]+: \d+ attempted, \d+ won$/);
        expect(tr.classList.contains('active-diff')).to.be.false;
      }
    });

    it('US8: no row is current before a puzzle', () => {
      mountStats({ puzzle: null });
      expect(root.querySelector('.active-diff')).to.be.null;
      for (const tr of root.querySelectorAll('#stats-tbody tr')) {
        expect(tr.getAttribute('aria-label')).not.to.include('current level');
      }
    });

    it('US9: no row is current for an Unrated puzzle', () => {
      mountStats({ difficulty: 'unrated' });
      expect(root.querySelector('.active-diff')).to.be.null;
      for (const tr of root.querySelectorAll('#stats-tbody tr')) {
        expect(tr.getAttribute('aria-label')).not.to.include('current level');
      }
    });

    it('US10: the table stays current while open', () => {
      const { fakeGs, fakeStats } = mountStats({ difficulty: 'easy' });
      open(trigger);
      fakeStats.get().hard.attempted = 9;
      fakeStats.get().hard.won = 3;
      fakeStats._fire('stats-changed');
      expect(rowFor(root, 'Hard').getAttribute('aria-label')).to.equal('Hard: 9 attempted, 3 won');

      fakeGs.getState().puzzle.difficulty = 'hard';
      fakeGs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
      expect(rowFor(root, 'Hard').getAttribute('aria-label')).to.equal('Hard, current level: 9 attempted, 3 won');
      expect(rowFor(root, 'Hard').classList.contains('active-diff')).to.be.true;
      expect(rowFor(root, 'Easy').classList.contains('active-diff')).to.be.false;
      expect(isOpen()).to.be.true;
    });

    it('US11: open moves focus to Close', () => {
      mountStats();
      open(trigger);
      expect(backdrop().classList.contains('open')).to.be.true;
      expect(document.activeElement).to.equal(closeBtn());
      expect(isOpen()).to.be.true;
    });

    it('US12: Close returns focus to the trigger', () => {
      mountStats();
      open(trigger);
      closeBtn().click();
      expect(backdrop().classList.contains('open')).to.be.false;
      expect(document.activeElement).to.equal(trigger);
      expect(isOpen()).to.be.false;
    });

    it('US13: Escape closes and returns focus', () => {
      mountStats();
      open(trigger);
      const e = key(closeBtn(), 'Escape');
      expect(isOpen()).to.be.false;
      expect(document.activeElement).to.equal(trigger);
      expect(e.defaultPrevented).to.be.true;
    });

    it('US14: Tab and Shift+Tab are trapped on Close', () => {
      mountStats();
      open(trigger);
      for (const mods of [{}, { shiftKey: true }]) {
        const e = key(closeBtn(), 'Tab', mods);
        expect(document.activeElement).to.equal(closeBtn());
        expect(isOpen()).to.be.true;
        expect(e.defaultPrevented).to.be.true;
      }
    });

    it('US15: no key inside the dialog reaches the game', () => {
      mountStats();
      open(trigger);
      spy = docKeySpy();
      const keys = [['5'], ['p'], ['c'], ['Backspace'], ['ArrowDown'], ['Home'], ['z', { ctrlKey: true }], ['Tab'], ['Escape']];
      for (const [k, mods] of keys) {
        key(closeBtn(), k, mods);
        expect(spy.document, k).to.equal(0);
        expect(spy.window, k).to.equal(0);
      }
    });

    it('US16: other keys keep their default', () => {
      mountStats();
      open(trigger);
      for (const [k, mods] of [['5'], ['z', { ctrlKey: true }]]) {
        const e = key(closeBtn(), k, mods);
        expect(e.defaultPrevented, k).to.be.false;
        expect(isOpen(), k).to.be.true;
      }
    });

    it('US17: close() when not open does nothing', () => {
      mountStats();
      other.focus();
      close();
      expect(document.activeElement).to.equal(other);
    });

    it('US18: the trigger is forgotten after closing', () => {
      mountStats();
      open(trigger);
      close();
      other.focus();
      close();
      expect(document.activeElement).to.equal(other);
    });

    it('US19: a backdrop click does not close', () => {
      mountStats();
      open(trigger);
      backdrop().click();
      expect(isOpen()).to.be.true;
    });

    it('US20: opening and closing change no game or statistics state', () => {
      const { fakeGs, fakeStats } = mountStats();
      open(trigger);
      close();
      expect(fakeGs.dispatch.calls).to.be.empty;
      expect(fakeStats.writes).to.be.empty;
    });

    it('US21: a stats map of null renders zeros', () => {
      const puzzle = makePuzzle();
      const fakeGs = makeFakeGameState({ puzzle });
      const fakeStats = { get: () => null, on: () => () => {} };
      root = document.createElement('div');
      root.id = 'stats-dialog-root';
      document.body.appendChild(root);
      mount(root, fakeGs, fakeStats);
      const rows = [...root.querySelectorAll('#stats-tbody tr')];
      expect(rows).to.have.length(7);
      for (const tr of rows) {
        expect([tr.cells[1].textContent.trim(), tr.cells[2].textContent.trim()]).to.deep.equal(['0', '0']);
      }
    });
  });
});
