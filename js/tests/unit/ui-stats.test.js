/**
 * @fileoverview Unit tests for js/ui/stats.js (US1–US5).
 */

import { mount } from '../../ui/stats.js';
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
    kiddie:        { attempted: 0, won: 0 },
    easy:          { attempted: 0, won: 0 },
    medium:        { attempted: 0, won: 0 },
    hard:          { attempted: 0, won: 0 },
    'death-march': { attempted: 0, won: 0 },
  };
  return { ...base, ...overrides };
}

function makeFakeStatistics(statsMap = makeStatsMap()) {
  const listeners = [];
  return {
    get: () => statsMap,
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

describe('ui/stats.js', () => {
  let root;

  afterEach(() => {
    root?.remove();
    root = null;
  });

  function mountStats(gsOverrides = {}, statsMapOverrides = {}) {
    const puzzle = makePuzzle({ difficulty: gsOverrides.difficulty ?? 'easy' });
    const fakeGs = makeFakeGameState({ puzzle, ...gsOverrides });
    const fakeStats = makeFakeStatistics(makeStatsMap(statsMapOverrides));
    root = document.createElement('div');
    root.id = 'stats-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);
    return { fakeGs, fakeStats };
  }

  // US1: Renders 5 rows in DIFFICULTY_ORDER
  it('US1: renders exactly 5 rows in DIFFICULTY_ORDER sequence', () => {
    mountStats();
    const rows = root.querySelectorAll('#stats-tbody tr');
    expect(rows.length).to.equal(5);
    // Verify order by checking aria-labels contain the difficulty names in order.
    const labels = DIFFICULTY_ORDER.map((_, i) => rows[i].getAttribute('aria-label').toLowerCase());
    expect(labels[0]).to.include('kiddie');
    expect(labels[1]).to.include('easy');
    expect(labels[2]).to.include('medium');
    expect(labels[3]).to.include('hard');
    expect(labels[4]).to.include('death');
  });

  // US2: Active-diff marker on current difficulty
  it('US2: the row matching current puzzle difficulty has .active-diff class', () => {
    mountStats({ difficulty: 'hard' });
    const rows = root.querySelectorAll('#stats-tbody tr');
    const hardRow = [...rows].find(r => r.getAttribute('aria-label').toLowerCase().includes('hard:'));
    expect(hardRow.classList.contains('active-diff')).to.be.true;
    // Other rows do not.
    const easyRow = [...rows].find(r => r.getAttribute('aria-label').toLowerCase().includes('easy:'));
    expect(easyRow.classList.contains('active-diff')).to.be.false;
  });

  // US3: Re-renders on stats-changed event
  it('US3: re-renders when the statistics object fires stats-changed', () => {
    const statsMap = makeStatsMap();
    const puzzle = makePuzzle();
    const fakeGs = makeFakeGameState({ puzzle });
    const fakeStats = makeFakeStatistics(statsMap);
    root = document.createElement('div');
    root.id = 'stats-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);

    // Initial render: easy attempted=0.
    const easyRowBefore = [...root.querySelectorAll('#stats-tbody tr')]
      .find(r => r.getAttribute('aria-label').includes('Easy:'));
    expect(easyRowBefore.textContent).to.include('0');

    // Update stats in place, then fire event.
    statsMap.easy.attempted = 7;
    fakeStats._fire('stats-changed', statsMap);

    const easyRowAfter = [...root.querySelectorAll('#stats-tbody tr')]
      .find(r => r.getAttribute('aria-label').includes('Easy:'));
    expect(easyRowAfter.textContent).to.include('7');
  });

  // US4: Re-computes active row on puzzle change event
  it('US4: moves .active-diff marker when puzzle difficulty changes', () => {
    const puzzle = makePuzzle({ difficulty: 'easy' });
    const fakeGs = makeFakeGameState({ puzzle });
    const fakeStats = makeFakeStatistics();
    root = document.createElement('div');
    root.id = 'stats-root';
    document.body.appendChild(root);
    mount(root, fakeGs, fakeStats);

    let hardRow = [...root.querySelectorAll('#stats-tbody tr')]
      .find(r => r.getAttribute('aria-label').toLowerCase().includes('hard:'));
    expect(hardRow.classList.contains('active-diff')).to.be.false;

    // Change puzzle difficulty in state and emit.
    fakeGs.getState().puzzle.difficulty = 'hard';
    fakeGs._emit('changed', { action: { type: 'CHANGE_DIFFICULTY' }, changed: new Set(['puzzle']) });

    hardRow = [...root.querySelectorAll('#stats-tbody tr')]
      .find(r => r.getAttribute('aria-label').toLowerCase().includes('hard:'));
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
});
