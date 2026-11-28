/**
 * @fileoverview Unit tests for js/ui/requestFocus.js (RQF1–RQF32,
 * tspec-hamburger-menu §2.2; aspec-hamburger-menu §6).
 *
 * Each row sets where focus is when the request's outcome arrives, then checks
 * which target (if any) the policy focused. "Nowhere (body)" blurs everything;
 * "nowhere (null)" uses a fake document whose activeElement is null.
 */

import { createRequestFocus } from '../../ui/requestFocus.js';

describe('ui/requestFocus.js', () => {
  let els;
  let focused;

  beforeEach(() => {
    const mk = (tag, id, attrs = {}) => {
      const el = document.createElement(tag);
      if (id) el.id = id;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (tag === 'select') el.innerHTML = '<option>x</option>';
      document.body.appendChild(el);
      return el;
    };
    els = {
      newPuzzle: mk('button', 't-new'),
      difficulty: mk('select', 't-diff'),
      grid: mk('div', 't-grid', { tabindex: '0' }),
      cancel: mk('button', null, { class: 'busy-cancel' }),
      other: mk('button', 't-other'),
      cancelDiv: mk('div', 't-cancel-div', { class: 'busy-cancel', tabindex: '0' }),
    };
    focused = [];
    for (const name of ['newPuzzle', 'difficulty', 'grid']) {
      const el = els[name];
      const orig = el.focus.bind(el);
      el.focus = (...a) => { focused.push(name); orig(...a); };
    }
  });

  afterEach(() => {
    for (const el of Object.values(els)) el.remove();
  });

  const realFocus = el => HTMLElement.prototype.focus.call(el);
  const policy = (overrides = {}) => createRequestFocus({
    newPuzzle: () => els.newPuzzle,
    difficulty: () => els.difficulty,
    grid: () => els.grid,
    doc: document,
    ...overrides,
  });
  const nullDoc = { activeElement: null, body: document.body };

  /**
   * @param {'newPuzzle'|'cancel'|'other'|'grid'|'body'|'null'} before
   * @returns {object} createRequestFocus overrides for `before`.
   */
  function arrange(before) {
    if (before === 'null') return { doc: nullDoc };
    if (before === 'body') document.activeElement?.blur();
    else realFocus(els[before]);
    return {};
  }

  function check(id, origin, status, before, expected) {
    const label = before === 'null' ? 'null (fake doc)' : before;
    it(`${id}: ${origin} / ${status} with focus on ${label} focuses ${expected ?? 'nothing'}`, () => {
      const overrides = arrange(before);
      if (before === 'body') expect(document.activeElement).to.equal(document.body);
      policy(overrides)(origin, { status });
      expect(focused).to.deep.equal(expected ? [expected] : []);
    });
  }

  describe('new-puzzle origin', () => {
    check('RQF1', 'new-puzzle', 'loaded', 'newPuzzle', 'grid');
    check('RQF2', 'new-puzzle', 'loaded', 'cancel', 'grid');
    check('RQF3', 'new-puzzle', 'loaded', 'body', 'grid');
    check('RQF4', 'new-puzzle', 'loaded', 'null', 'grid');
    check('RQF5', 'new-puzzle', 'loaded', 'other', null);
    check('RQF6', 'new-puzzle', 'cancelled', 'other', 'newPuzzle');
    check('RQF7', 'new-puzzle', 'cancelled', 'cancel', 'newPuzzle');
    check('RQF8', 'new-puzzle', 'fallback-declined', 'newPuzzle', 'newPuzzle');
    check('RQF9', 'new-puzzle', 'fallback-declined', 'body', 'newPuzzle');
    check('RQF10', 'new-puzzle', 'fallback-declined', 'cancel', null);
    check('RQF11', 'new-puzzle', 'fallback-declined', 'other', null);
    check('RQF12', 'new-puzzle', 'failed', 'cancel', 'newPuzzle');
    check('RQF13', 'new-puzzle', 'failed', 'body', 'newPuzzle');
    check('RQF14', 'new-puzzle', 'failed', 'null', 'newPuzzle');
    check('RQF15', 'new-puzzle', 'failed', 'other', null);
  });

  describe('difficulty origin', () => {
    check('RQF16', 'difficulty', 'loaded', 'other', 'difficulty');
    check('RQF17', 'difficulty', 'loaded', 'grid', 'difficulty');
    ['cancelled', 'fallback-declined', 'failed'].forEach((status, i) => {
      check(`RQF${18 + i}`, 'difficulty', status, 'cancel', 'difficulty');
      check(`RQF${21 + i}`, 'difficulty', status, 'body', 'difficulty');
      check(`RQF${24 + i}`, 'difficulty', status, 'other', null);
    });
    check('RQF27', 'difficulty', 'failed', 'null', 'difficulty');
  });

  describe('statuses that move nothing and defaults', () => {
    for (const origin of ['new-puzzle', 'difficulty']) {
      for (const status of ['replaced', 'needs-accept-fallback']) {
        check('RQF28', origin, status, 'body', null);
      }
    }
    check('RQF29', 'new-puzzle', 'mystery-status', 'body', null);

    it('RQF30: doc omitted defaults to document', () => {
      document.activeElement?.blur();
      createRequestFocus({
        newPuzzle: () => els.newPuzzle, difficulty: () => els.difficulty, grid: () => els.grid,
      })('new-puzzle', { status: 'failed' });
      expect(focused).to.deep.equal(['newPuzzle']);
    });

    it('RQF31: a target getter returning null does not throw', () => {
      document.activeElement?.blur();
      expect(() => policy({ grid: () => null })('new-puzzle', { status: 'loaded' })).not.to.throw();
      expect(focused).to.deep.equal([]);
    });

    it('RQF32: "on Cancel" is judged by class, not identity', () => {
      realFocus(els.cancelDiv);
      policy()('new-puzzle', { status: 'failed' });
      expect(focused).to.deep.equal(['newPuzzle']);
    });
  });
});
