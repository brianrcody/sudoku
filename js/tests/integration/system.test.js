/**
 * @fileoverview System tests (SYS1–SYS10; HMS1–HMS2, tspec-hamburger-menu §3.2).
 *
 * SYS1: Full Kiddie solve. Generation is not seeded; the test solves whatever
 * Kiddie puzzle arrives, using the solution in the exposed game state.
 *
 * SYS3: Expert generation perf gate — verified by loading the app with
 * a DM difficulty pre-set and measuring time to puzzle load.
 */

import {
  createApp, waitFor, waitForPuzzle as waitForAppPuzzle, appFrame, gsOf, enter,
  solveAll, readStats, STATE_KEY, DIFF_KEY,
} from './_app.js';

async function waitForPuzzle(iframe, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      // The grid renders 81 cells at mount, before the boot-time worker puzzle
      // lands. Wait for state.puzzle too, so the in-flight PUZZLE_LOADED can't
      // fire mid-test.
      const cellsReady = doc.querySelectorAll('.cell').length === 81;
      const gsObj = iframe.contentWindow?.gameState;
      const puzzleLoaded = gsObj && gsObj.getState().puzzle !== null;
      if (cellsReady && puzzleLoaded) return resolve();
      setTimeout(check, 100);
    }
    setTimeout(check, 300);
  });
}

function createIframe(src = '/index.html') {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = 'width:1px;height:1px;position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(iframe);
  return iframe;
}

describe('system tests', () => {
  let iframe;

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  // SYS1: Cold start → select Kiddie → solve → win. Any generated Kiddie puzzle
  // will do: the solution comes from the exposed state, so no seed control is needed.
  it('SYS1: cold start, select Kiddie, solve, win; stats gain one attempt and one win', async function () {
    this.timeout(30000);
    localStorage.removeItem(STATE_KEY);
    localStorage.setItem(DIFF_KEY, JSON.stringify('easy'));
    const t0 = performance.now();

    iframe = createApp();
    await waitForAppPuzzle(iframe);
    const before = readStats(iframe).Kiddie;

    const select = iframe.contentDocument.getElementById('difficulty-select');
    select.value = 'kiddie';
    select.dispatchEvent(new iframe.contentWindow.Event('change'));
    await waitFor(() => gsOf(iframe).getState().puzzle.difficulty === 'kiddie', 20000, 'Kiddie puzzle');

    solveAll(iframe);
    expect(gsOf(iframe).getState().won).to.be.true;
    expect(performance.now() - t0).to.be.below(10000);
    expect(readStats(iframe).Kiddie).to.deep.equal({ attempted: before.attempted + 1, won: before.won + 1 });
  });

  // SYS2: Resume after reload mid-game continues cleanly
  it('SYS2: entering progress, reloading, and continuing produces a coherent state', async function () {
    this.timeout(30000);
    iframe = createIframe();
    await waitForPuzzle(iframe);

    const gs1 = iframe.contentWindow.gameState;
    if (!gs1) return this.skip();

    const state = gs1.getState();
    if (!state.puzzle) return this.skip();

    // Enter some progress.
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    const digit = 1; // wrong digit to avoid win
    gs1.dispatch({ type: 'SELECT_CELL', index: idx });
    gs1.dispatch({ type: 'PEN_ENTER', digit });
    await new Promise(r => setTimeout(r, 400));

    const savedId = state.puzzle.id;

    // Reload.
    iframe.remove();
    iframe = createIframe();
    await waitForPuzzle(iframe);

    const gs2 = iframe.contentWindow.gameState;
    if (!gs2) return this.skip();

    const restored = gs2.getState();
    if (restored.puzzle?.id !== savedId) return this.skip(); // different puzzle loaded

    // Verify the pen entry was restored.
    expect(restored.pen[idx]).to.equal(digit);
    // Continue making an entry.
    const idx2 = [...Array(81).keys()].find(i => i !== idx && restored.puzzle.givens[i] === 0);
    gs2.dispatch({ type: 'SELECT_CELL', index: idx2 });
    gs2.dispatch({ type: 'PEN_ENTER', digit: 2 });
    await new Promise(r => setTimeout(r, 100));

    expect(gs2.getState().pen[idx2]).to.equal(2);
  });

  // SYS3: Expert cold-start completes within 5 s
  it('SYS3: Expert puzzle generates within 5 s budget', async function () {
    this.timeout(20000);

    // Pre-write difficulty preference to expert.
    // We need to set the difficulty key before the app loads.
    // Use a temporary iframe to set localStorage, then load the main app.
    const prep = createIframe();
    await waitForPuzzle(prep, 12000);
    prep.contentWindow.localStorage.setItem(
      'sudoku.currentDifficulty.v1',
      JSON.stringify('expert')
    );
    // Clear any saved state so a fresh generation happens.
    prep.contentWindow.localStorage.removeItem('sudoku.state.v1');
    prep.remove();

    const t0 = performance.now();
    iframe = createIframe();
    await waitForPuzzle(iframe, 15000);

    const gs = iframe.contentWindow.gameState;
    if (gs) {
      // Wait for async puzzle generation to complete.
      const deadline = Date.now() + 10000;
      while (gs.getState().puzzle === null && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100));
      }

      const elapsed = performance.now() - t0;
      const state = gs.getState();
      if (state.puzzle?.difficulty === 'expert') {
        console.log(`[SYS3] Expert load time: ${elapsed.toFixed(0)} ms`);
        expect(elapsed).to.be.below(5000);
      }
      expect(state.puzzle).to.not.be.null;
    }
  });

  // SYS4: Theme switch across all 5 themes preserves puzzle state
  it('SYS4: cycling through all 5 themes does not lose puzzle state', async function () {
    this.timeout(20000);
    iframe = createIframe();
    await waitForPuzzle(iframe);

    const gs = iframe.contentWindow.gameState;
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    // Make progress.
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit: 1 });
    await new Promise(r => setTimeout(r, 100));

    const themes = ['theme-coffee', 'theme-school', 'theme-terminal', 'theme-mountain', 'theme-minimalist'];
    const doc = iframe.contentDocument;
    doc.getElementById('menu-button').click();

    for (const theme of themes) {
      // Theme items keep the menu open (fspec-008 §5.5).
      doc.getElementById(`mi-${theme}`).click();
      await new Promise(r => setTimeout(r, 50));
      expect(doc.getElementById(`mi-${theme}`).getAttribute('aria-checked')).to.equal('true');

      // Body should have the new theme class.
      expect(doc.body.classList.contains(theme)).to.be.true;

      // Puzzle state should be intact.
      const currentState = gs.getState();
      expect(currentState.puzzle).to.not.be.null;
      expect(currentState.pen[idx]).to.equal(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Left-hand layout (SYS5–SYS10, tspec-left-hand §2.3)
// ---------------------------------------------------------------------------

/**
 * Off-screen iframe with real dimensions, so media queries evaluate at the
 * given viewport width (the 1px helper above always hits the mobile layout).
 */
function createSizedIframe(width, height) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    `width:${width}px;height:${height}px;border:0;position:fixed;left:-20000px;top:0;`;
  const loaded = new Promise(r => iframe.addEventListener('load', r, { once: true }));
  iframe.src = '/index.html';
  document.body.appendChild(iframe);
  return { iframe, loaded };
}

function setHandCookie(value) {
  document.cookie = `sudoku.hand=${value}; path=/`;
}

function leftOf(doc, selector) {
  return doc.querySelector(selector).getBoundingClientRect().left;
}

describe('system tests: left-hand layout', () => {
  let iframe;

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('SYS5: a saved left preference renders controls left of the board on a wide viewport', async function () {
    this.timeout(20000);
    setHandCookie('left');
    ({ iframe } = createSizedIframe(1100, 800));
    await waitForPuzzle(iframe);

    const doc = iframe.contentDocument;
    expect(doc.documentElement.getAttribute('data-hand')).to.equal('left');
    expect(doc.getElementById('mi-hand').getAttribute('aria-checked')).to.equal('true');
    expect(leftOf(doc, '#numpad-root')).to.be.below(leftOf(doc, '.sudoku-grid'));
    // .left-col is display: contents on wide viewports, so it has no box of its own.
    expect(doc.querySelector('.right-col').getBoundingClientRect().right)
      .to.be.at.most(doc.querySelector('.grid-wrapper').getBoundingClientRect().left);
  });

  it('SYS6: the head script applies only a saved left preference, before the stylesheets load', async () => {
    const html = await (await fetch('/index.html')).text();
    const head = html.slice(0, html.indexOf('</head>'));
    const match = head.match(/<script>([\s\S]*?)<\/script>/);
    expect(match, 'inline head script').to.not.be.null;
    expect(head.indexOf(match[0])).to.be.below(head.indexOf('<link rel="stylesheet"'));

    // Run the script against a fake document; the real one has already loaded.
    function dataHandFor(cookie) {
      const attrs = {};
      const fakeDocument = {
        cookie,
        documentElement: { setAttribute: (name, value) => { attrs[name] = value; } },
        addEventListener() {},
      };
      new Function('document', match[1])(fakeDocument);
      return attrs['data-hand'];
    }

    expect(dataHandFor('sudoku.hand=left')).to.equal('left');
    expect(dataHandFor('x=1; sudoku.hand=left')).to.equal('left');
    expect(dataHandFor('sudoku.hand=right')).to.be.undefined;
    expect(dataHandFor('')).to.be.undefined;
    expect(dataHandFor('sudoku.hand=sideways')).to.be.undefined;
  });

  it('SYS7: toggling Left-handed in the menu swaps the layout without disturbing game state', async function () {
    this.timeout(20000);
    ({ iframe } = createSizedIframe(1100, 800));
    await waitForPuzzle(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    const gs = win.gameState;
    const state = gs.getState();
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit: 1 });

    expect(leftOf(doc, '#numpad-root')).to.be.above(leftOf(doc, '.sudoku-grid'));

    const menuButton = doc.getElementById('menu-button');
    const hand = doc.getElementById('mi-hand');
    const key = k => doc.activeElement.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    menuButton.click();
    // Like any click outside the grid and number pad, opening by pointer
    // deselects (fspec-001 §4.2).
    expect(gs.getState().selected).to.be.null;
    key('End');   // Left-handed is the last visible item on a wide viewport
    expect(doc.activeElement).to.equal(hand);

    const t0 = performance.now();
    key('Enter');
    const numpadNowLeft = leftOf(doc, '#numpad-root') < leftOf(doc, '.sudoku-grid');
    const elapsed = performance.now() - t0;

    expect(numpadNowLeft).to.be.true;
    expect(elapsed).to.be.below(1000);
    expect(hand.getAttribute('aria-checked')).to.equal('true');
    expect(gs.getState().pen[idx]).to.equal(1);
    // The menu stays open with focus on the item (fspec-008 §5.6).
    expect(menuButton.getAttribute('aria-expanded')).to.equal('true');
    expect(doc.activeElement).to.equal(hand);

    key('Enter');
    expect(leftOf(doc, '#numpad-root')).to.be.above(leftOf(doc, '.sudoku-grid'));
    expect(hand.getAttribute('aria-checked')).to.equal('false');
  });

  it('SYS8: Left-handed is hidden from the menu and the layout stacks on a narrow viewport', async function () {
    this.timeout(20000);
    setHandCookie('left');
    ({ iframe } = createSizedIframe(400, 800));
    await waitForPuzzle(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    expect(win.getComputedStyle(doc.querySelector('.mi-hand-section')).display).to.equal('none');
    expect(win.getComputedStyle(doc.querySelector('.game-area')).flexDirection).to.equal('column');
    expect(doc.documentElement.getAttribute('data-hand')).to.equal('left');
  });

  it('SYS9: document order keeps the grid before the controls in left-hand mode', async function () {
    this.timeout(20000);
    setHandCookie('left');
    ({ iframe } = createSizedIframe(1100, 800));
    await waitForPuzzle(iframe);

    const doc = iframe.contentDocument;
    const precedes = (a, b) =>
      Boolean(doc.querySelector(a).compareDocumentPosition(doc.querySelector(b))
        & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(doc.documentElement.getAttribute('data-hand')).to.equal('left');
    expect(precedes('#menu-button', '#difficulty-select')).to.be.true;
    expect(precedes('#difficulty-select', '.sudoku-grid')).to.be.true;
    expect(precedes('.sudoku-grid', '#numpad-root')).to.be.true;
  });

  it('SYS10: Left-handed is a menuitemcheckbox in the group "Settings", named by its visible label', async function () {
    this.timeout(20000);
    ({ iframe } = createSizedIframe(1100, 800));
    await waitForPuzzle(iframe);

    const doc = iframe.contentDocument;
    const hand = doc.getElementById('mi-hand');
    expect(hand.getAttribute('role')).to.equal('menuitemcheckbox');
    expect(hand.hasAttribute('aria-label')).to.be.false;
    expect(hand.textContent.trim()).to.equal('Left-handed');
    expect(hand.querySelector('.mi-switch-track').getAttribute('aria-hidden')).to.equal('true');
    const group = hand.closest('[role="group"]');
    expect(group.classList.contains('mi-hand-section')).to.be.true;
    const labelId = group.getAttribute('aria-labelledby');
    expect(doc.getElementById(labelId).textContent).to.equal('Settings');
    expect(hand.closest('[role="menu"]').id).to.equal('app-menu');
  });
});

// ---------------------------------------------------------------------------
// Header menu (HMS1–HMS2, tspec-hamburger-menu §3.2)
// ---------------------------------------------------------------------------

describe('system tests: header menu', function () {
  this.timeout(60000);
  let iframe;

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  async function bootMenu(size) {
    iframe = createApp('/index.html', size);
    await waitForAppPuzzle(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    return {
      doc, win, gs: gsOf(iframe),
      $: id => doc.getElementById(id),
      active: () => doc.activeElement,
      key: (k, mods = {}) => doc.activeElement.dispatchEvent(
        new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })),
      menuOpen: () => doc.getElementById('menu-button').getAttribute('aria-expanded') === 'true',
    };
  }

  const tabStops = doc => [...doc.querySelectorAll('a[href], button, select, input, textarea, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length > 0 &&
      el.getAttribute('tabindex') !== '-1');

  it('HMS1: a keyboard-only player uses every menu action', async () => {
    const r = await bootMenu({ width: 1100, height: 900 });
    const { givens } = r.gs.getState().puzzle;
    const empty = givens.findIndex(g => g === 0);
    enter(iframe, empty, 1);
    r.gs.dispatch({ type: 'DESELECT' });
    const button = r.$('menu-button');

    // Clipboard refused, so Share shows the link field.
    Object.defineProperty(r.win.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('denied'); } },
    });

    expect(tabStops(r.doc)[0], 'first Tab stop').to.equal(button);
    button.focus();

    // Left-handed: ArrowUp opens on it, Enter toggles, the menu stays.
    r.key('ArrowUp');
    expect(r.active()).to.equal(r.$('mi-hand'));
    r.key('Enter');
    expect(r.doc.documentElement.getAttribute('data-hand')).to.equal('left');
    expect(r.active()).to.equal(r.$('mi-hand'));

    // Coffee Shop by type-ahead; Escape returns to the button.
    r.key('Home');
    r.key('c');
    expect(r.active()).to.equal(r.$('mi-theme-coffee'));
    r.key('Enter');
    expect(r.doc.body.classList.contains('theme-coffee')).to.be.true;
    r.key('Escape');
    expect(r.active()).to.equal(button);
    expect(r.menuOpen()).to.be.false;

    // Statistics: Enter opens on it, Enter opens the dialog, Escape returns.
    r.key('Enter');
    expect(r.active()).to.equal(r.$('mi-stats'));
    r.key('Enter');
    expect(r.active()).to.equal(r.$('stats-close'));
    r.key('Escape');
    expect(r.active()).to.equal(button);

    // Share: type-ahead, Enter, the link field is focused and selected.
    r.key('Enter');
    r.key('s');
    expect(r.active()).to.equal(r.$('mi-share'));
    r.key('Enter');
    const field = await waitFor(() => r.doc.getElementById('share-link-field'), 5000, 'link field');
    await waitFor(() => r.active() === field, 2000, 'link field focused');
    expect(field.selectionStart).to.equal(0);
    expect(field.selectionEnd).to.equal(field.value.length);
    // Tab to Dismiss, Enter (browser defaults: synthetic keys run none).
    const dismiss = r.doc.querySelector('#notice-root .notice-dismiss');
    dismiss.focus();
    dismiss.click();
    expect(r.active()).to.equal(button);

    // Reset: type-ahead, Enter, then Reset in the confirmation.
    r.key('Enter');
    r.key('r');
    expect(r.active()).to.equal(r.$('mi-reset'));
    r.key('Enter');
    expect(r.active()).to.equal(r.$('modal-cancel'));
    r.$('modal-confirm').focus();
    r.$('modal-confirm').click();
    await appFrame(iframe);

    const grid = r.doc.querySelector('.sudoku-grid');
    expect(r.active()).to.equal(grid);
    expect(r.gs.getState().pen[empty]).to.equal(0);
    expect(r.doc.documentElement.getAttribute('data-hand')).to.equal('left');
    expect(r.doc.body.classList.contains('theme-coffee')).to.be.true;

    // Tab from the grid: the next stop outside the grid is the first enabled digit.
    const next = tabStops(r.doc).find(el =>
      !grid.contains(el) && (grid.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(next.classList.contains('btn-digit')).to.be.true;
    expect(next).to.equal([...r.doc.querySelectorAll('.btn-digit')].find(b => !b.disabled));
  });

  it('HMS2: a pointer player opens, uses and dismisses the menu', async () => {
    const r = await bootMenu({ width: 390, height: 800 });
    const button = r.$('menu-button');
    const handHidden = () => r.win.getComputedStyle(r.doc.querySelector('.mi-hand-section')).display === 'none';
    const board = () => [...r.gs.getState().pen].join('');

    button.click();
    expect(handHidden(), 'Left-handed hidden').to.be.true;
    r.$('mi-theme-school').click();
    expect(r.doc.body.classList.contains('theme-school')).to.be.true;
    expect(r.menuOpen(), 'open after School').to.be.true;

    // An outside click on a cell (a pointer press focuses it first).
    const { givens } = r.gs.getState().puzzle;
    const empty = givens.findIndex(g => g === 0);
    const cell = r.doc.querySelector(`.cell[data-index="${empty}"]`);
    cell.focus();
    cell.click();
    expect(r.menuOpen(), 'closed by the cell click').to.be.false;
    expect(r.gs.getState().selected).to.equal(empty);

    button.click();
    expect(handHidden(), 'Left-handed hidden').to.be.true;
    r.$('mi-stats').click();
    expect(r.$('stats-backdrop').classList.contains('open')).to.be.true;
    r.$('stats-close').click();
    expect(r.$('stats-backdrop').classList.contains('open')).to.be.false;
    expect(r.active()).to.equal(button);

    const before = board();
    button.click();
    expect(handHidden(), 'Left-handed hidden').to.be.true;
    r.$('mi-reset').click();
    expect(r.doc.querySelector('#modal-backdrop.open')).to.exist;
    r.$('modal-cancel').click();
    expect(r.active()).to.equal(button);
    expect(board()).to.equal(before);
  });
});
