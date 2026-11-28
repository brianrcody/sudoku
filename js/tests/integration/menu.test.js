/**
 * @fileoverview Integration tests for the header menu and control
 * consolidation (HMI1–HMI24, tspec-hamburger-menu §3.1): the real app in a
 * sized iframe. Every test waits for `state.puzzle !== null` before acting,
 * except HMI12, which acts before the first puzzle on purpose.
 *
 * Keys are synthetic `KeyboardEvent`s dispatched on the frame's active
 * element. They run the app's listeners but never a browser default: a
 * synthetic Tab moves no focus and a synthetic Enter on a button clicks
 * nothing. Where a step relies on such a default (Tab to a dialog button,
 * Enter on it), the test performs it directly (`focus()`, `click()`).
 */

import {
  createApp, waitFor, waitForPuzzle, appFrame, gsOf, seedSavedGame, readStats, enter,
  openMenu, clickMenuItem, DIFF_KEY,
} from './_app.js';
import { contrast } from './sharing.test.js';
import { KIDDIE, KIDDIE_SOLUTION } from '../fixtures/puzzles/loadable.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIDE = { width: 1100, height: 900 };
const THEMES = ['minimalist', 'coffee', 'school', 'terminal', 'mountain'];
const FIRST_EMPTY = KIDDIE.indexOf('0');

/** Wraps a booted frame with the helpers every test uses. */
function rig(iframe) {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const $ = id => doc.getElementById(id);
  return {
    iframe, doc, win, $,
    gs: gsOf(iframe),
    css: el => win.getComputedStyle(el),
    active: () => doc.activeElement,
    key(k, mods = {}) {
      const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
      doc.activeElement.dispatchEvent(e);
      return e;
    },
    menuOpen: () => $('menu-button').getAttribute('aria-expanded') === 'true',
    /** Focuses the menu button and opens the menu with Enter (keyboard path). */
    openByKey() {
      $('menu-button').focus();
      this.key('Enter');
    },
    cell: i => doc.querySelector(`.cell[data-index="${i}"]`),
    grid: () => doc.querySelector('.sudoku-grid'),
    srText: () => $('sr-live').textContent,
  };
}

/** Displayed, enabled, Tab-reachable elements in document order. */
function tabStops(doc) {
  const sel = 'a[href], button, select, input, textarea, [tabindex]';
  return [...doc.querySelectorAll(sel)].filter(el =>
    el.tabIndex >= 0 && !el.disabled && el.getClientRects().length > 0 &&
    el.getAttribute('tabindex') !== '-1');
}

/** A comparable snapshot of the game state the menu must never touch. */
function snapshot(gs) {
  const s = gs.getState();
  return JSON.stringify({
    pen: [...s.pen], pencil: [...s.pencil], activeMode: s.activeMode, selected: s.selected,
    coachSession: s.coachSession ?? null, undo: s.undoSnapshot ?? null, hints: s.hintsRemaining,
  });
}

/** Every `rgb()/rgba()` stop of body's computed background, or its colour. */
function backdropStops(r) {
  const style = r.css(r.doc.body);
  const stops = style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [];
  return stops.length > 0 ? stops : [style.backgroundColor];
}

const worstContrast = (color, stops) => Math.min(...stops.map(s => contrast(color, s)));

/** Composites `rgba()` `top` over opaque `under`; returns an `rgb()` string. */
function flatten(top, under) {
  const t = top.match(/[\d.]+/g).map(Number);
  const u = under.match(/[\d.]+/g).map(Number);
  const a = t.length > 3 ? t[3] : 1;
  const mix = i => Math.round(t[i] * a + u[i] * (1 - a));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

describe('integration: header menu (HMI)', function () {
  this.timeout(60000);

  let iframe;

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  async function boot(size = WIDE, src = '/index.html') {
    iframe = createApp(src, size);
    await waitForPuzzle(iframe);
    return rig(iframe);
  }

  const seedKiddie = (opts = {}) =>
    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'easy', ...opts });

  // ── Layout and the narrow rule ────────────────────────────────────────────

  it('HMI1: the menu button is the first tab stop and the menu overlays the board', async () => {
    for (const size of [WIDE, { width: 400, height: 800 }]) {
      iframe?.remove();
      const r = await boot(size);
      const what = `${size.width}px`;
      expect(tabStops(r.doc)[0], what).to.equal(r.$('menu-button'));

      openMenu(iframe);
      await sleep(200);   // the open animation translates the panel
      for (const item of r.doc.querySelectorAll('#app-menu .mi')) {
        const rect = item.getBoundingClientRect();
        if (rect.width === 0) continue;   // Left-handed at ≤720px
        const hit = r.doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        expect(hit?.closest('.mi'), `${what} ${item.id}`).to.equal(item);
      }
      const m = r.$('app-menu').getBoundingClientRect();
      expect(m.left, what).to.be.at.least(0);
      expect(m.top, what).to.be.at.least(0);
      expect(m.right, what).to.be.at.most(r.win.innerWidth);
      expect(m.bottom, what).to.be.at.most(r.win.innerHeight);
    }
  });

  it('HMI2: the menu fits the viewport at narrow widths', async () => {
    for (const size of [{ width: 320, height: 640 }, { width: 390, height: 800 }, { width: 720, height: 800 }]) {
      iframe?.remove();
      const r = await boot(size);
      const what = `${size.width}px`;
      openMenu(iframe);
      await sleep(200);
      const m = r.$('app-menu').getBoundingClientRect();
      expect(m.left, what).to.be.at.least(0);
      expect(m.right, what).to.be.at.most(r.win.innerWidth);
      for (const item of r.doc.querySelectorAll('#app-menu .mi')) {
        const h = item.getBoundingClientRect().height;
        if (h === 0) continue;
        expect(h, `${what} ${item.id}`).to.be.at.least(44);
      }
    }
  });

  it('HMI3: Left-handed is hidden exactly at ≤720px, in CSS and in the keyboard model', async () => {
    for (const [width, display, focus] of [[720, false, 'mi-theme-mountain'], [721, true, 'mi-hand']]) {
      iframe?.remove();
      const r = await boot({ width, height: 800 });
      r.$('menu-button').focus();
      r.key('ArrowUp');
      const shown = r.css(r.doc.querySelector('.mi-hand-section')).display !== 'none';
      expect(shown, `${width}px display`).to.equal(display);
      expect(r.active().id, `${width}px focus`).to.equal(focus);
    }
  });

  it('HMI4: crossing the breakpoint while Left-handed has focus moves focus to Mountain', async () => {
    const r = await boot(WIDE);
    await appFrame(iframe);
    const sr = r.srText();
    r.openByKey();
    r.key('End');
    expect(r.active()).to.equal(r.$('mi-hand'));

    iframe.style.width = '400px';
    iframe.style.height = '800px';
    await waitFor(() => r.active() === r.$('mi-theme-mountain'), 5000, 'focus on Mountain');

    expect(r.menuOpen()).to.be.true;
    await appFrame(iframe);
    expect(r.srText()).to.equal(sr);
  });

  // ── Keyboard isolation and outside clicks ─────────────────────────────────

  it('HMI5: game shortcuts are suppressed while a menu item has focus, with the real listeners', async () => {
    const r = await boot(WIDE);
    const { givens } = r.gs.getState().puzzle;
    const empties = [...Array(81).keys()].filter(i => givens[i] === 0);
    enter(iframe, empties[0], 1);   // something for Ctrl+Z to undo
    r.gs.dispatch({ type: 'SELECT_CELL', index: empties[1] });
    r.cell(empties[1]).focus();

    r.openByKey();
    expect(r.menuOpen()).to.be.true;
    expect(r.gs.getState().selected, 'keyboard open keeps the selection').to.equal(empties[1]);

    const before = snapshot(r.gs);
    for (const [k, mods] of [['5'], ['p'], ['c'], ['Backspace'], ['ArrowRight'], ['Home'], ['z', { ctrlKey: true }]]) {
      r.key(k, mods);
      if (k === 'c') expect(r.active()).to.equal(r.$('mi-theme-coffee'));
    }
    await appFrame(iframe);
    expect(snapshot(r.gs)).to.equal(before);
    expect(r.menuOpen()).to.be.true;
  });

  it('HMI6: a pointer click on the menu button deselects; outside clicks route focus', async () => {
    const r = await boot(WIDE);
    const { givens } = r.gs.getState().puzzle;
    const empty = givens.findIndex(g => g === 0);
    r.gs.dispatch({ type: 'SELECT_CELL', index: empty });

    r.$('menu-button').click();
    expect(r.gs.getState().selected).to.be.null;

    // (a) a cell: focus lands on it (focusin closes), the click selects it.
    r.cell(empty).focus();
    r.cell(empty).click();
    expect(r.menuOpen(), '(a) closed').to.be.false;
    expect(r.active(), '(a) focus').to.equal(r.cell(empty));
    expect(r.gs.getState().selected, '(a) selected').to.equal(empty);

    // (b) a number pad digit takes no focus.
    r.$('menu-button').click();
    r.doc.querySelector('.btn-digit').click();
    expect(r.menuOpen(), '(b) closed').to.be.false;
    expect(r.active(), '(b) focus').to.equal(r.$('menu-button'));

    // (c) empty page area.
    r.$('menu-button').click();
    r.doc.querySelector('main').click();
    expect(r.menuOpen(), '(c) closed').to.be.false;
    expect(r.active(), '(c) focus').to.equal(r.$('menu-button'));
  });

  // ── Reset, Statistics, New Puzzle ─────────────────────────────────────────

  it('HMI7: Reset through the menu by keyboard, confirmed', async () => {
    const r = await boot(WIDE);
    const { givens } = r.gs.getState().puzzle;
    const empty = givens.findIndex(g => g === 0);
    enter(iframe, empty, 1);

    r.openByKey();
    r.key('ArrowDown');
    r.key('ArrowDown');
    expect(r.active()).to.equal(r.$('mi-reset'));
    r.key('Enter');
    expect(r.doc.querySelector('#modal-backdrop.open'), 'dialog open').to.exist;
    expect(r.active()).to.equal(r.$('modal-cancel'));

    // Tab to Reset, Enter (browser defaults; see the file comment).
    r.$('modal-confirm').focus();
    r.$('modal-confirm').click();
    await appFrame(iframe);

    const s = r.gs.getState();
    expect(s.pen[empty]).to.equal(0);
    expect(s.selected).to.be.null;
    expect(r.srText()).to.equal('Puzzle reset.');
    expect(r.active()).to.equal(r.grid());
    expect(r.grid().matches(':focus-visible')).to.be.true;
    const ring = r.css(r.grid());
    expect([ring.outlineWidth, ring.outlineStyle, ring.outlineOffset]).to.deep.equal(['2px', 'solid', '3px']);

    r.key('ArrowRight');
    await appFrame(iframe);
    expect(r.active()).to.equal(r.cell(0));
    expect(r.gs.getState().selected).to.equal(0);
  });

  it('HMI8: Statistics end to end', async () => {
    seedKiddie({ difficulty: 'medium' });
    const r = await boot(WIDE);
    expect(r.gs.getState().puzzle.difficulty).to.equal('medium');
    r.gs.dispatch({ type: 'SELECT_CELL', index: FIRST_EMPTY });

    r.openByKey();
    r.key('Enter');   // Statistics is the first item

    const dlg = r.$('stats-backdrop');
    expect(dlg.classList.contains('open')).to.be.true;
    expect(dlg.getAttribute('role')).to.equal('dialog');
    expect(r.$(dlg.getAttribute('aria-labelledby')).textContent).to.equal('Statistics');
    expect(r.active()).to.equal(r.$('stats-close'));
    const stats = readStats(iframe);
    expect(Object.keys(stats)).to.have.length(7);
    const medium = [...r.doc.querySelectorAll('#stats-tbody tr')]
      .find(tr => tr.cells[0].textContent.trim() === 'Medium');
    expect(medium.getAttribute('aria-label')).to.include('current level');

    r.key('5');
    expect(r.gs.getState().pen[FIRST_EMPTY], 'digit key inside the dialog').to.equal(0);

    r.key('Escape');
    expect(dlg.classList.contains('open')).to.be.false;
    expect(r.active()).to.equal(r.$('menu-button'));
    expect(r.menuOpen()).to.be.false;
  });

  it('HMI9: New Puzzle with no progress: focus stays while generating, then the grid', async () => {
    const r = await boot(WIDE);
    const id = r.gs.getState().puzzle.id;
    r.$('btn-new').focus();
    r.$('btn-new').click();
    const during = r.active();

    await waitFor(() => r.gs.getState().puzzle.id !== id && !r.gs.getState().generating, 20000, 'new puzzle');
    expect(during).to.equal(r.$('btn-new'));
    expect(r.active()).to.equal(r.grid());
    expect(r.gs.getState().selected).to.be.null;
  });

  it('HMI10: New Puzzle over progress: confirm keeps New Puzzle then the grid; cancel returns to New Puzzle', async () => {
    const r = await boot(WIDE);
    const { givens } = r.gs.getState().puzzle;
    const empty = givens.findIndex(g => g === 0);

    // Cancel first: nothing is requested.
    enter(iframe, empty, 1);
    r.gs.dispatch({ type: 'DESELECT' });
    const id = r.gs.getState().puzzle.id;
    r.$('btn-new').focus();
    r.$('btn-new').click();
    expect(r.active()).to.equal(r.$('modal-cancel'));
    r.$('modal-cancel').click();
    expect(r.active(), 'after cancel').to.equal(r.$('btn-new'));
    await sleep(500);
    expect(r.gs.getState().puzzle.id).to.equal(id);
    expect(r.gs.getState().generating).to.not.be.ok;

    // Confirm.
    r.$('btn-new').click();
    r.$('modal-confirm').click();
    expect(r.active(), 'while generating').to.equal(r.$('btn-new'));
    await waitFor(() => r.gs.getState().puzzle.id !== id && !r.gs.getState().generating, 20000, 'new puzzle');
    expect(r.active(), 'after load').to.equal(r.grid());
  });

  it('HMI11: the load guard keeps an open menu open', async () => {
    const r = await boot(WIDE);
    const id = r.gs.getState().puzzle.id;
    r.$('btn-new').click();
    r.openByKey();

    await waitFor(() => r.gs.getState().puzzle.id !== id && !r.gs.getState().generating, 20000, 'new puzzle');
    await appFrame(iframe);
    expect(r.menuOpen()).to.be.true;
    expect(r.active().closest('#app-menu .mi')).to.exist;
    expect(r.$('mi-share').hasAttribute('aria-disabled')).to.be.false;
  });

  it('HMI12: Share and Reset are disabled before the first puzzle and enable live', async () => {
    let r = null;
    for (let attempt = 0; attempt < 3 && r === null; attempt++) {
      iframe?.remove();
      localStorage.clear();
      localStorage.setItem(DIFF_KEY, JSON.stringify('hard'));
      iframe = createApp('/index.html', WIDE);
      await waitFor(() => iframe.contentDocument?.getElementById('mi-share'), 20000, 'menu mounted');
      const candidate = rig(iframe);
      candidate.openByKey();
      if (candidate.gs.getState().puzzle === null) r = candidate;
    }
    expect(r, 'menu opened before the first puzzle in 3 boots').to.not.be.null;

    for (const id of ['mi-share', 'mi-reset']) {
      expect(r.$(id).getAttribute('aria-disabled'), id).to.equal('true');
    }
    r.$('mi-reset').focus();
    r.key('Enter');
    expect(r.doc.querySelector('#modal-backdrop.open'), 'no Reset dialog').to.be.null;
    expect(r.active()).to.equal(r.$('mi-reset'));
    expect(r.menuOpen()).to.be.true;

    await waitForPuzzle(iframe, 30000);
    expect(r.$('mi-share').hasAttribute('aria-disabled')).to.be.false;
    expect(r.$('mi-reset').hasAttribute('aria-disabled')).to.be.false;
    expect(r.menuOpen()).to.be.true;
  });

  it('HMI13: Difficulty path: load returns to the selector; a load closes an open menu (O3)', async () => {
    const r = await boot(WIDE);
    const select = r.$('difficulty-select');
    const change = tier => {
      select.value = tier;
      select.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    };
    const loaded = (id, tier) => waitFor(() => {
      const s = r.gs.getState();
      return s.puzzle.id !== id && s.puzzle.difficulty === tier && !s.generating;
    }, 20000, `${tier} puzzle`);

    // (a)
    let id = r.gs.getState().puzzle.id;
    select.focus();
    change('easy');
    await loaded(id, 'easy');
    expect(r.active(), '(a)').to.equal(select);

    // (b)
    id = r.gs.getState().puzzle.id;
    change('kiddie');
    r.openByKey();
    expect(r.menuOpen(), '(b) open while generating').to.be.true;
    await loaded(id, 'kiddie');
    expect(r.menuOpen(), '(b) closed by the load').to.be.false;
    expect(r.active(), '(b)').to.equal(select);
  });

  it('HMI14: busy Cancel returns focus to its origin', async function () {
    this.timeout(120000);
    // Nightmare often generates in under the busy card's 3 s delay here, and the
    // pre-generation cache serves the next one at once, so the tspec's
    // retry-on-real-generation precondition was never met. Instead the frame's
    // worker drops every generation request from now on: a request that misses
    // the cache stays pending until cancelled, and no new cache entry is primed.
    const stallGeneration = r => {
      const proto = r.win.Worker.prototype;
      const post = proto.postMessage;
      proto.postMessage = function (msg, ...rest) {
        if (msg?.type === 'GEN_REQUEST') return undefined;
        return post.call(this, msg, ...rest);
      };
    };

    /** Starts a request with `start()` until the busy card's Cancel shows (≤ 3 requests). */
    async function untilCancelShows(r, start) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const id = r.gs.getState().puzzle.id;
        start();
        const cancel = r.doc.querySelector('.busy-cancel');
        await waitFor(() => !cancel.hidden || r.gs.getState().puzzle.id !== id ||
          r.doc.querySelector('#modal-backdrop.open'), 25000, 'busy Cancel');
        if (!cancel.hidden) return cancel;
        if (r.doc.querySelector('#modal-backdrop.open')) r.$('modal-cancel').click();
      }
      throw new Error('busy Cancel never appeared in 3 requests');
    }

    // (a) New Puzzle origin: Cancel takes focus itself.
    seedKiddie({ difficulty: 'nightmare' });
    let r = await boot(WIDE);
    stallGeneration(r);
    let cancel = await untilCancelShows(r, () => { r.$('btn-new').focus(); r.$('btn-new').click(); });
    await waitFor(() => r.active() === cancel, 2000, 'Cancel focused');
    cancel.click();
    await appFrame(iframe);
    expect(r.active(), '(a)').to.equal(r.$('btn-new'));
    expect(r.srText()).to.equal('Puzzle search cancelled.');

    // (b) Difficulty origin.
    iframe.remove();
    seedKiddie({ difficulty: 'easy' });
    r = await boot(WIDE);
    stallGeneration(r);
    const select = r.$('difficulty-select');
    cancel = await untilCancelShows(r, () => {
      select.focus();
      select.value = select.value === 'nightmare' ? 'diabolical' : 'nightmare';
      select.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    });
    cancel.focus();
    cancel.click();
    await appFrame(iframe);
    expect(r.active(), '(b)').to.equal(select);
  });

  // ── Dialog precedence ─────────────────────────────────────────────────────

  /** Opens a confirmation through the frame's own dialog module instance. */
  async function openConfirmation(r) {
    const dialog = await r.win.eval("import('/js/ui/dialog.js')");
    dialog.open({ title: 'Test', body: 'Body', confirmLabel: 'OK', onConfirm: () => {} });
  }

  it('HMI15: a programmatic confirmation over the open menu returns focus to the menu button', async () => {
    const r = await boot(WIDE);
    r.openByKey();
    r.key('ArrowDown');
    const order = [];
    r.doc.addEventListener('focusin', e => order.push(e.target.id));

    await openConfirmation(r);

    expect(r.menuOpen()).to.be.false;
    expect(order).to.deep.equal(['menu-button', 'modal-cancel']);
    expect(r.active()).to.equal(r.$('modal-cancel'));
    r.key('Escape');
    expect(r.active()).to.equal(r.$('menu-button'));
  });

  it('HMI16: a confirmation over the Statistics dialog closes Statistics first (O1)', async () => {
    const r = await boot(WIDE);
    clickMenuItem(iframe, 'mi-stats');
    expect(r.$('stats-backdrop').classList.contains('open')).to.be.true;

    await openConfirmation(r);

    expect(r.$('stats-backdrop').classList.contains('open')).to.be.false;
    expect(r.doc.querySelectorAll('.modal-backdrop.open')).to.have.length(1);
    r.$('modal-cancel').click();
    expect(r.active()).to.equal(r.$('menu-button'));
  });

  it('HMI17: the win state with the menu open closes it and focuses New Puzzle', async () => {
    const entries = {};
    for (let i = 0; i < 81; i++) {
      if (KIDDIE[i] === '0' && i !== FIRST_EMPTY) entries[i] = Number(KIDDIE_SOLUTION[i]);
    }
    seedKiddie({ entries });
    const r = await boot(WIDE);
    r.openByKey();
    expect(r.menuOpen()).to.be.true;

    enter(iframe, FIRST_EMPTY, Number(KIDDIE_SOLUTION[FIRST_EMPTY]));

    expect(r.gs.getState().won).to.be.true;
    expect(r.menuOpen()).to.be.false;
    await waitFor(() => r.active() === r.$('btn-new'), 3000, 'focus on New Puzzle');
  });

  // ── Settings from the menu ────────────────────────────────────────────────

  it('HMI18: theme and Left-handed from the menu keep the menu open and the game intact', async () => {
    const r = await boot(WIDE);
    const left = sel => r.doc.querySelector(sel).getBoundingClientRect().left;
    const before = snapshot(r.gs);

    r.openByKey();
    r.key('c');
    r.key('Enter');
    await appFrame(iframe);
    expect(r.doc.body.classList.contains('theme-coffee')).to.be.true;
    expect(r.srText()).to.equal('Theme changed to Coffee Shop.');

    r.key('End');
    r.key('Enter');
    await new Promise(res => r.win.requestAnimationFrame(res));
    expect(r.doc.documentElement.getAttribute('data-hand')).to.equal('left');
    expect(left('#numpad-root')).to.be.below(left('.sudoku-grid'));
    expect(r.menuOpen()).to.be.true;
    expect(r.active()).to.equal(r.$('mi-hand'));
    expect(snapshot(r.gs)).to.equal(before);

    r.key('Tab');
    expect(r.menuOpen()).to.be.false;
    expect(r.active()).to.equal(r.$('difficulty-select'));
  });

  // ── Layout ────────────────────────────────────────────────────────────────

  it('HMI19: wide layout: the pad top is the grid top in both hands and every theme', async () => {
    const r = await boot(WIDE);
    const rect = sel => r.doc.querySelector(sel).getBoundingClientRect();
    for (const theme of THEMES) {
      clickMenuItem(iframe, `mi-theme-${theme}`);
      for (const hand of ['right', 'left']) {
        if ((r.doc.documentElement.getAttribute('data-hand') === 'left') !== (hand === 'left')) {
          clickMenuItem(iframe, 'mi-hand');
        }
        r.key('Escape');
        await sleep(300);   // theme transitions
        const what = `${theme}/${hand}`;
        expect(Math.abs(rect('#numpad-root').top - rect('.sudoku-grid').top), `${what} tops`).to.be.at.most(1);
        if (hand === 'left') {
          expect(rect('.right-col').right, `${what} columns`).to.be.at.most(rect('.grid-wrapper').left);
        } else {
          expect(rect('.grid-wrapper').right, `${what} columns`).to.be.at.most(rect('.right-col').left);
        }
        for (const [a, b] of [['#btn-mode', '#btn-undo'], ['#btn-coach', '#btn-clear'], ['#btn-hint', '#btn-erase-all']]) {
          expect(rect(a).top, `${what} ${a}/${b}`).to.equal(rect(b).top);
        }
      }
    }
  });

  it('HMI20: narrow layout stacks cluster, grid, pad identically in both hands', async () => {
    for (const hand of ['right', 'left']) {
      iframe?.remove();
      document.cookie = `sudoku.hand=${hand}; path=/`;
      const r = await boot({ width: 400, height: 800 });
      const rect = sel => r.doc.querySelector(sel).getBoundingClientRect();
      const grid = rect('.sudoku-grid');
      expect(rect('.next-game').bottom, `${hand} cluster`).to.be.at.most(grid.top);
      expect(grid.bottom, `${hand} pad`).to.be.at.most(rect('#numpad-root').top);
      for (const id of ['btn-new', 'difficulty-select']) {
        expect(r.$(id).getClientRects().length, `${hand} ${id}`).to.be.above(0);
        expect(r.css(r.$(id)).display, `${hand} ${id}`).not.to.equal('none');
      }
    }
  });

  // ── Contrast (R15) ────────────────────────────────────────────────────────

  /** The R15 indicators on the page backdrop, as [name, element, pseudo-class]. */
  const backdropIndicators = r => [
    ['digit', r.doc.querySelector('.btn-digit'), ':focus-visible'],
    ['New Puzzle', r.$('btn-new'), ':focus-visible'],
    ['Difficulty', r.$('difficulty-select'), ':focus'],
    ['grid', r.grid(), ':focus-visible'],
  ];

  it('HMI21: Coffee focus indicators on the page backdrop reach 3:1 (R15)', async () => {
    const r = await boot(WIDE);
    clickMenuItem(iframe, 'mi-theme-coffee');
    r.key('Escape');
    await sleep(300);
    const stops = backdropStops(r);
    for (const [name, el, pseudo] of backdropIndicators(r)) {
      el.focus();
      expect(el.matches(pseudo), `${name} ${pseudo}`).to.be.true;
      const color = r.css(el).outlineColor;
      expect(color, name).to.equal('rgb(201, 169, 122)');
      expect(worstContrast(color, stops), name).to.be.at.least(3);
    }

    clickMenuItem(iframe, 'mi-stats');
    expect(r.active()).to.equal(r.$('stats-close'));
    expect(r.css(r.$('stats-close')).outlineColor).to.equal('rgb(139, 69, 19)');
  });

  it('HMI22: indicators on the page backdrop reach 3:1 in the other four themes', async () => {
    const r = await boot(WIDE);
    for (const theme of THEMES.filter(t => t !== 'coffee')) {
      clickMenuItem(iframe, `mi-theme-${theme}`);
      r.key('Escape');
      await sleep(300);
      const stops = backdropStops(r);
      for (const [name, el] of backdropIndicators(r)) {
        el.focus();
        const ratio = worstContrast(r.css(el).outlineColor, stops);
        expect(ratio, `${theme} ${name}`).to.be.at.least(3);
      }
    }
  });

  it('HMI23: a focused disabled menu item keeps a full-strength ring in every theme', async () => {
    const r = await boot(WIDE);
    for (const theme of THEMES) {
      clickMenuItem(iframe, `mi-theme-${theme}`);
      const share = r.$('mi-share');
      share.setAttribute('aria-disabled', 'true');   // after opening, which resyncs it
      share.focus();
      await sleep(200);   // item background transition
      const style = r.css(share);
      expect(style.opacity, `${theme} item`).to.equal('1');
      for (const child of share.children) {
        const want = child.classList.contains('mi-hint') ? '0.3' : '0.38';
        expect(r.css(child).opacity, `${theme} ${child.className}`).to.equal(want);
      }
      const ring = style.boxShadow.match(/rgba?\([^)]*\)/)[0];
      const bg = flatten(style.backgroundColor, r.css(r.$('app-menu')).backgroundColor);
      expect(contrast(ring, bg), `${theme} ring`).to.be.at.least(3);
      r.key('Escape');
    }
  });

  it('HMI24: the grid ring is keyboard-only by rule', async () => {
    const r = await boot(WIDE);
    const rules = [];
    for (const sheet of r.doc.styleSheets) {
      for (const rule of sheet.cssRules) if (rule.selectorText) rules.push(rule);
    }
    const focus = rules.find(x => x.selectorText === '.sudoku-grid:focus');
    const visible = rules.find(x => x.selectorText === '.sudoku-grid:focus-visible');
    expect(focus, '.sudoku-grid:focus rule').to.exist;
    expect(focus.style.outlineStyle).to.equal('none');
    expect(visible, '.sudoku-grid:focus-visible rule').to.exist;
    // A shorthand holding var() leaves its longhands unset in the CSSOM.
    expect(visible.style.outline).to.equal('2px solid var(--accent)');
    expect(visible.style.outlineOffset).to.equal('3px');
  });
});
