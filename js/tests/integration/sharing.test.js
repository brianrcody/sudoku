/**
 * @fileoverview Integration tests for puzzle sharing and loaded puzzles
 * (SHR1–SHR24): the real app in an iframe, opened with and without a share
 * link. tspec-puzzle-sharing §2.3.
 */

import {
  createApp, waitFor, waitForPuzzle, waitForLinkHandled, appFrame, gsOf,
  seedSavedGame, readStats, enter, solveAll, boardString, digits, openMenu, clickMenuItem,
  STATE_KEY, DIFF_KEY, PREGEN_PREFIX,
} from './_app.js';
import {
  KIDDIE, KIDDIE_SOLUTION, MEDIUM, HARD, UNRATED, MULTIPLE, CONTRADICTION,
} from '../fixtures/puzzles/loadable.js';

const EMPTY = KIDDIE.indexOf('0');          // r1c3; solution 4
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (iframe, sel) => iframe.contentDocument.querySelector(sel);
const noticeText = iframe => $(iframe, '#notice-root .notice-message')?.textContent ?? null;
const dialogOpen = iframe => $(iframe, '#modal-backdrop.open') !== null;

/** WCAG contrast ratio between two computed `rgb()/rgba()` colours. */
export function contrast(a, b) {
  const lum = css => {
    const [r, g, bl] = css.match(/[\d.]+/g).slice(0, 3).map(v => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('integration: puzzle sharing', function () {
  this.timeout(40000);

  let iframe;
  const open = async (src, size) => { iframe?.remove(); iframe = createApp(src, size); return iframe; };

  afterEach(() => { iframe?.remove(); iframe = null; });

  // ── Receiving ────────────────────────────────────────────────────────────

  describe('opening a share link', () => {
    it('SHR1: loads the shared givens with an empty board, under the tier rated on this side', async () => {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      const s = gsOf(iframe).getState();
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(Array.from(s.pen).join('')).to.equal(KIDDIE);
      expect(s.pencil.every(v => v === 0)).to.be.true;
      expect(s.puzzle.difficulty).to.equal('kiddie');
      expect(s.puzzle.source).to.equal('link');
      expect(Array.from(s.puzzle.solution).join('')).to.equal(KIDDIE_SOLUTION);
      expect($(iframe, '#difficulty-select').value).to.equal('kiddie');
    });

    it('SHR2: shows and announces the outcome', async () => {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      await appFrame(iframe);
      expect(noticeText(iframe)).to.equal('Puzzle loaded. Difficulty: Kiddie.');
      expect($(iframe, '#sr-live').textContent).to.equal('Puzzle loaded. Difficulty: Kiddie.');
      expect($(iframe, '#notice-root .notice').classList.contains('notice-info')).to.be.true;
    });

    it('SHR3: removes p from the address bar without a reload, keeping other parameters and the fragment', async () => {
      await open(`/index.html?x=1&p=${KIDDIE}&y=2#frag`);
      const win = iframe.contentWindow;
      await waitFor(() => win.gameState !== undefined, 15000, 'boot');
      win.__sameDocument = true;
      await waitForLinkHandled(iframe);
      expect(win.location.search).to.equal('?x=1&y=2');
      expect(win.location.hash).to.equal('#frag');
      expect(iframe.contentWindow.__sameDocument).to.be.true;
    });

    it('SHR4: accepts . for empty cells in the link', async () => {
      await open(`/index.html?p=${KIDDIE.replace(/0/g, '.')}`);
      await waitForLinkHandled(iframe);
      expect(boardString(iframe)).to.equal(KIDDIE);
    });

    it('SHR5: the shared puzzle wins over boot-time generation still in flight', async () => {
      // A Diabolical cold start keeps the generation worker busy for seconds,
      // so generation is certainly still running when the link is ready.
      localStorage.setItem(DIFF_KEY, JSON.stringify('diabolical'));
      const t0 = performance.now();
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      const elapsed = performance.now() - t0;
      console.log(`[PERF] Share link load during Diabolical generation: ${elapsed.toFixed(0)} ms (page boot included)`);

      const s = gsOf(iframe).getState();
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(s.generating).to.be.false;
      expect($(iframe, '#busy-root').hidden).to.be.true;

      // The abandoned generation must never replace the shared puzzle.
      await sleep(2500);
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(gsOf(iframe).getState().generating).to.be.false;
    });

    it('SHR6: when generation finishes first, its untouched puzzle is replaced without asking', async () => {
      // A primed pre-generation cache makes the boot puzzle load synchronously.
      localStorage.setItem(PREGEN_PREFIX + 'easy', JSON.stringify({
        version: 1,
        puzzle: { id: 'pregen', difficulty: 'easy', givens: digits(MEDIUM), solution: digits(MEDIUM), solveTrace: [] },
      }));
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(dialogOpen(iframe)).to.be.false;
      expect(noticeText(iframe)).to.equal('Puzzle loaded. Difficulty: Kiddie.');
    });

    it('SHR7: a restored game with no progress is replaced without asking', async () => {
      seedSavedGame({ givens: MEDIUM, solution: MEDIUM, difficulty: 'medium' });
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(dialogOpen(iframe)).to.be.false;
    });
  });

  // ── Replace confirmation ─────────────────────────────────────────────────

  describe('replace confirmation', () => {
    async function openOverProgress(progress) {
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'easy', ...progress });
      await open(`/index.html?p=${MEDIUM}`);
      await waitFor(() => dialogOpen(iframe), 20000, 'replace confirmation');
    }

    it('SHR8: a restored game with a player digit asks before being replaced', async () => {
      await openOverProgress({ entries: { [EMPTY]: 4 } });
      expect($(iframe, '#modal-title').textContent).to.equal('Load shared puzzle?');
      expect($(iframe, '#modal-body').textContent).to.equal('Your current progress will be lost.');
      expect($(iframe, '#modal-confirm').textContent).to.equal('Load Puzzle');
      // Nothing is replaced, and the link is not yet spent, while the question is open.
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(iframe.contentWindow.location.search).to.include('p=');
    });

    it('SHR9: the confirmation is an accessible modal with focus on Cancel', async () => {
      await openOverProgress({ entries: { [EMPTY]: 4 } });
      const backdrop = $(iframe, '#modal-backdrop');
      expect(backdrop.getAttribute('role')).to.equal('dialog');
      expect(backdrop.getAttribute('aria-modal')).to.equal('true');
      expect(backdrop.getAttribute('aria-labelledby')).to.equal('modal-title');
      expect(iframe.contentDocument.activeElement.id).to.equal('modal-cancel');
    });

    it('SHR10: pencil marks alone count as progress', async () => {
      await openOverProgress({ pencil: { [EMPTY]: 0b1011 } });
      expect($(iframe, '#modal-title').textContent).to.equal('Load shared puzzle?');
    });

    it('SHR11: declining with Cancel keeps the game and its progress', async () => {
      await openOverProgress({ entries: { [EMPTY]: 4 } });
      $(iframe, '#modal-cancel').click();
      await waitForLinkHandled(iframe);
      await appFrame(iframe);
      const s = gsOf(iframe).getState();
      expect(s.puzzle.id).to.equal('seeded');
      expect(s.pen[EMPTY]).to.equal(4);
      expect(noticeText(iframe)).to.equal('Puzzle not loaded. Your game continues.');
      expect($(iframe, '#sr-live').textContent).to.equal('Puzzle not loaded. Your game continues.');
      expect(dialogOpen(iframe)).to.be.false;
    });

    it('SHR12: Escape declines', async () => {
      await openOverProgress({ entries: { [EMPTY]: 4 } });
      const Kbd = iframe.contentWindow.KeyboardEvent;
      $(iframe, '#modal-backdrop').dispatchEvent(new Kbd('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await waitForLinkHandled(iframe);
      expect(gsOf(iframe).getState().puzzle.id).to.equal('seeded');
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(4);
    });

    it('SHR13: confirming loads the shared puzzle with a fresh board', async () => {
      await openOverProgress({ entries: { [EMPTY]: 4 }, pencil: { [EMPTY + 1]: 0b11 } });
      $(iframe, '#modal-confirm').click();
      await waitForLinkHandled(iframe);
      const s = gsOf(iframe).getState();
      expect(boardString(iframe)).to.equal(MEDIUM);
      expect(Array.from(s.pen).join('')).to.equal(MEDIUM);
      expect(s.pencil.every(v => v === 0)).to.be.true;
      expect(s.puzzle.difficulty).to.equal('medium');
      expect(s.undoSnapshot).to.be.null;
    });
  });

  // ── Rejections ───────────────────────────────────────────────────────────

  describe('invalid links', () => {
    const cases = [
      ['a wrong-length string', '12345', 'This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 5.'],
      ['an empty value', '', 'This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 0.'],
      ['an illegal character', KIDDIE.slice(0, 80) + 'x', 'This puzzle can\'t be loaded. Puzzles can contain only the digits 1–9, with 0 or . for empty cells.'],
      ['a self-contradictory puzzle', CONTRADICTION, 'This puzzle can\'t be loaded. A digit repeats in a row, column, or box.'],
      ['a puzzle with several solutions', MULTIPLE, 'This puzzle can\'t be loaded. The puzzle has more than one solution.'],
    ];

    for (const [name, value, message] of cases) {
      it(`SHR14: ${name} is rejected with a clear message and the game continues untouched`, async () => {
        seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, entries: { [EMPTY]: 4 } });
        await open(`/index.html?p=${value}`);
        await waitForLinkHandled(iframe);
        await appFrame(iframe);
        const s = gsOf(iframe).getState();
        expect(s.puzzle.id).to.equal('seeded');
        expect(s.pen[EMPTY]).to.equal(4);
        expect(dialogOpen(iframe)).to.be.false;
        expect(noticeText(iframe)).to.equal(message);
        expect($(iframe, '#notice-root .notice').classList.contains('notice-error')).to.be.true;
        expect($(iframe, '#sr-live').textContent).to.equal(message);
      });
    }

    it('SHR15: a rejection notice stays until dismissed', async () => {
      await open('/index.html?p=nope');
      await waitForLinkHandled(iframe);
      await sleep(4500);
      expect($(iframe, '#notice-root').hidden).to.be.false;
      $(iframe, '#notice-root .notice-dismiss').click();
      expect($(iframe, '#notice-root').hidden).to.be.true;
    });

    it('SHR16: a rejected link does not stop the boot-time puzzle from arriving', async () => {
      await open('/index.html?p=nope');
      await waitForLinkHandled(iframe);
      await waitForPuzzle(iframe);
      expect(gsOf(iframe).getState().puzzle.source).to.equal('generated');
    });
  });

  // ── Unrated ──────────────────────────────────────────────────────────────

  describe('unrated puzzles', () => {
    async function openUnrated() {
      await open(`/index.html?p=${UNRATED}`);
      await waitForLinkHandled(iframe);
      await appFrame(iframe);
    }

    it('SHR17: an unrateable puzzle loads as Unrated with coach and hints visibly unavailable', async () => {
      await openUnrated();
      const message = 'Puzzle loaded as Unrated. The solver can\'t rate it, so hints and coach are unavailable.';
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('unrated');
      expect(noticeText(iframe)).to.equal(message);
      expect($(iframe, '#sr-live').textContent).to.equal(message);

      const select = $(iframe, '#difficulty-select');
      expect(select.value).to.equal('unrated');
      expect(select.selectedOptions[0].textContent).to.equal('Unrated');

      expect($(iframe, '#btn-hint').disabled).to.be.true;
      expect($(iframe, '#btn-hint').getAttribute('aria-label')).to.equal('Hint — unavailable for unrated puzzles');
      expect($(iframe, '#hint-count').textContent).to.equal('–');
      expect($(iframe, '#btn-coach').disabled).to.be.true;
      expect($(iframe, '#btn-coach').getAttribute('aria-label')).to.equal('Coach — unavailable for unrated puzzles');
      expect($(iframe, '#btn-coach').classList.contains('coaching')).to.be.false;
      expect($(iframe, '#stats-tbody .active-diff')).to.be.null;
    });

    it('SHR18: the coach shortcut announces that coach is unavailable and starts nothing', async () => {
      await openUnrated();
      const Kbd = iframe.contentWindow.KeyboardEvent;
      iframe.contentDocument.dispatchEvent(new Kbd('keydown', { key: 'c', bubbles: true, cancelable: true }));
      await appFrame(iframe);
      expect($(iframe, '#sr-live').textContent).to.equal('Coach is unavailable for unrated puzzles.');
      expect(gsOf(iframe).getState().coachSession).to.be.null;
    });

    it('SHR19: every other play feature works, and a win records no statistics', async () => {
      await openUnrated();
      const gs = gsOf(iframe);
      const cell = UNRATED.indexOf('0');
      const right = gs.getState().puzzle.solution[cell];
      const wrong = (right % 9) + 1;

      gs.dispatch({ type: 'SELECT_CELL', index: cell });
      gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 5 });
      expect(gs.getState().pencil[cell]).to.equal(0b10000);
      gs.dispatch({ type: 'UNDO' });
      expect(gs.getState().pencil[cell]).to.equal(0);

      gs.dispatch({ type: 'PEN_ENTER', digit: wrong });
      expect($(iframe, '#btn-check').style.display).to.equal('');
      $(iframe, '#btn-check').click();
      expect([...gs.getState().incorrect]).to.deep.equal([cell]);
      gs.dispatch({ type: 'ERASE' });
      expect(gs.getState().pen[cell]).to.equal(0);

      solveAll(iframe);
      expect(gs.getState().won).to.be.true;
      for (const row of Object.values(readStats(iframe))) expect(row).to.deep.equal({ attempted: 0, won: 0 });
    });

    it('SHR20: an Unrated puzzle persists and restores with its status and restrictions', async () => {
      await openUnrated();
      const cell = UNRATED.indexOf('0');
      enter(iframe, cell, 1);
      await waitFor(() => JSON.parse(localStorage.getItem(STATE_KEY))?.pen[cell] === 1, 5000, 'state save');
      expect(JSON.parse(localStorage.getItem(STATE_KEY)).difficulty).to.equal('unrated');

      await open('/index.html');
      await waitForPuzzle(iframe);
      const s = gsOf(iframe).getState();
      expect(boardString(iframe)).to.equal(UNRATED);
      expect(s.puzzle.difficulty).to.equal('unrated');
      expect(s.puzzle.source).to.equal('link');
      expect(s.pen[cell]).to.equal(1);
      expect(s.hintsRemaining).to.equal(0);
      expect($(iframe, '#difficulty-select').value).to.equal('unrated');
      expect($(iframe, '#btn-coach').disabled).to.be.true;
      expect($(iframe, '#btn-hint').disabled).to.be.true;
    });

    it('SHR21: New Puzzle after an Unrated puzzle returns to normal generation at the player\'s tier', async () => {
      localStorage.setItem(DIFF_KEY, JSON.stringify('kiddie'));
      await openUnrated();
      $(iframe, '#btn-new').click();
      await waitFor(() => gsOf(iframe).getState().puzzle.source === 'generated', 20000, 'generated puzzle');
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('kiddie');
      expect($(iframe, '#difficulty-select').value).to.equal('kiddie');
      expect($(iframe, '#difficulty-select option[value="unrated"]')).to.be.null;
      expect($(iframe, '#btn-coach').disabled).to.be.false;
      expect($(iframe, '#notice-root').hidden).to.be.true;
    });

    it('SHR22: changing difficulty on an Unrated puzzle generates a puzzle at the chosen tier', async () => {
      await openUnrated();
      const select = $(iframe, '#difficulty-select');
      select.value = 'kiddie';
      select.dispatchEvent(new iframe.contentWindow.Event('change'));
      await waitFor(() => gsOf(iframe).getState().puzzle.source === 'generated', 20000, 'generated puzzle');
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('kiddie');
      expect(select.value).to.equal('kiddie');
      expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('kiddie');
    });

    it('SHR23: with progress, changing difficulty on an Unrated puzzle asks first; declining keeps it', async () => {
      await openUnrated();
      enter(iframe, UNRATED.indexOf('0'), 1);
      const select = $(iframe, '#difficulty-select');
      select.value = 'kiddie';
      select.dispatchEvent(new iframe.contentWindow.Event('change'));
      expect($(iframe, '#modal-title').textContent).to.equal('Start a new Kiddie puzzle?');
      expect(select.value).to.equal('unrated');
      $(iframe, '#modal-cancel').click();
      await sleep(200);
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('unrated');
      expect(boardString(iframe)).to.equal(UNRATED);
    });
  });

  // ── Statistics and persistence of rated loaded puzzles ───────────────────

  describe('rated loaded puzzles', () => {
    it('SHR24: a rated shared puzzle records its attempt and win under its tier', async () => {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      enter(iframe, EMPTY, 4);
      expect(readStats(iframe).Kiddie).to.deep.equal({ attempted: 1, won: 0 });
      solveAll(iframe);
      expect(gsOf(iframe).getState().won).to.be.true;
      const stats = readStats(iframe);
      expect(stats.Kiddie).to.deep.equal({ attempted: 1, won: 1 });
      expect(stats.Easy).to.deep.equal({ attempted: 0, won: 0 });
    });

    it('SHR25: a rated shared puzzle has its tier\'s hints and a working coach', async () => {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      expect(gsOf(iframe).getState().hintsRemaining).to.equal(Infinity);
      expect($(iframe, '#btn-coach').disabled).to.be.false;
      $(iframe, '#btn-coach').click();
      expect(gsOf(iframe).getState().coachSession.step.technique).to.equal('Naked Single');
    });

    it('SHR26: a rated shared puzzle persists and restores like a generated one', async () => {
      await open(`/index.html?p=${HARD}`);
      await waitForLinkHandled(iframe);
      const cell = HARD.indexOf('0');
      enter(iframe, cell, 9);
      await waitFor(() => JSON.parse(localStorage.getItem(STATE_KEY))?.pen[cell] === 9, 5000, 'state save');

      await open('/index.html');
      await waitForPuzzle(iframe);
      const s = gsOf(iframe).getState();
      expect(boardString(iframe)).to.equal(HARD);
      expect(s.puzzle.difficulty).to.equal('hard');
      expect(s.pen[cell]).to.equal(9);
      expect($(iframe, '#difficulty-select').value).to.equal('hard');
    });

    it('SHR27: loading a puzzle does not change the saved difficulty preference', async () => {
      localStorage.setItem(DIFF_KEY, JSON.stringify('medium'));
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('medium');
    });

    it('SHR28: New Puzzle after a rated shared puzzle generates at that puzzle\'s tier', async () => {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      $(iframe, '#btn-new').click();
      await waitFor(() => gsOf(iframe).getState().puzzle.source === 'generated', 20000, 'generated puzzle');
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('kiddie');
    });
  });

  // ── Generation tier bookkeeping in main.js ───────────────────────────────

  describe('generation tier', () => {
    it('SHR38: a saved game without a recorded difficulty restores at the player\'s tier with that tier\'s hints', async () => {
      localStorage.setItem(DIFF_KEY, JSON.stringify('medium'));
      localStorage.setItem(STATE_KEY, JSON.stringify({
        version: 1,
        puzzle: { id: 'legacy', givens: digits(KIDDIE), solution: digits(KIDDIE_SOLUTION) },
      }));
      await open('/index.html');
      await waitForPuzzle(iframe);
      const s = gsOf(iframe).getState();
      expect(s.puzzle.id).to.equal('legacy');
      expect(s.puzzle.difficulty).to.equal('medium');
      expect(s.hintsRemaining).to.equal(1);
    });

    it('SHR39: an unrecognized saved preference falls back to Easy', async () => {
      localStorage.setItem(DIFF_KEY, JSON.stringify('unrated'));
      await open('/index.html');
      await waitForPuzzle(iframe);
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('easy');
    });

    it('SHR40: changing difficulty while a generation is pending replaces it with one at the new tier', async () => {
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'diabolical' });
      await open('/index.html');
      await waitForPuzzle(iframe);
      const gs = gsOf(iframe);

      $(iframe, '#btn-new').click();
      expect(gs.getState().generatingDifficulty).to.equal('diabolical');
      gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'kiddie' });
      expect(gs.getState().generating).to.be.true;
      expect(gs.getState().generatingDifficulty).to.equal('kiddie');
      expect(JSON.parse(localStorage.getItem(DIFF_KEY))).to.equal('kiddie');

      await waitFor(() => gs.getState().puzzle.source === 'generated', 20000, 'generated puzzle');
      expect(gs.getState().puzzle.difficulty).to.equal('kiddie');
      expect($(iframe, '#difficulty-select').value).to.equal('kiddie');
    });

    it('SHR41: cancelling the generation a difficulty change started keeps the puzzle and restores its label', async () => {
      await open(`/index.html?p=${UNRATED}`);
      await waitForLinkHandled(iframe);
      const gs = gsOf(iframe);
      const select = $(iframe, '#difficulty-select');
      const choose = tier => { select.value = tier; select.dispatchEvent(new iframe.contentWindow.Event('change')); };

      choose('diabolical');
      expect(gs.getState().generating).to.be.true;
      expect(select.value).to.equal('diabolical');

      // New Puzzle while that search is pending asks for the same tier, not the board's.
      $(iframe, '#btn-new').click();
      expect(gs.getState().generatingDifficulty).to.equal('diabolical');

      $(iframe, '#busy-root button').click();
      expect(gs.getState().generating).to.be.false;
      expect(boardString(iframe)).to.equal(UNRATED);
      expect(select.value).to.equal('unrated');
      await sleep(300);
      expect(boardString(iframe)).to.equal(UNRATED);
    });

    it('SHR42: a rated puzzle is never relabelled — choosing a tier generates a new puzzle there', async () => {
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
      await open('/index.html');
      await waitForPuzzle(iframe);
      const gs = gsOf(iframe);
      const select = $(iframe, '#difficulty-select');

      select.value = 'easy';
      select.dispatchEvent(new iframe.contentWindow.Event('change'));
      // Until the new puzzle arrives the old one is still Kiddie.
      expect(gs.getState().puzzle.difficulty).to.equal('kiddie');
      await waitFor(() => gs.getState().puzzle.id !== 'seeded', 20000, 'generated puzzle');
      expect(gs.getState().puzzle.difficulty).to.equal('easy');
      expect(boardString(iframe)).to.not.equal(KIDDIE);
      expect(select.value).to.equal('easy');
    });

    it('SHR43: with progress, confirming starts the new puzzle and cancelling keeps the board and its label', async () => {
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
      await open('/index.html');
      await waitForPuzzle(iframe);
      const gs = gsOf(iframe);
      const select = $(iframe, '#difficulty-select');
      const empty = KIDDIE.indexOf('0');
      enter(iframe, empty, Number(KIDDIE_SOLUTION[empty]));
      const choose = tier => { select.value = tier; select.dispatchEvent(new iframe.contentWindow.Event('change')); };

      choose('easy');
      expect($(iframe, '#modal-title').textContent).to.equal('Start a new Easy puzzle?');
      $(iframe, '#modal-cancel').click();
      expect(select.value).to.equal('kiddie');
      expect(gs.getState().generating).to.be.false;
      expect(gs.getState().puzzle.id).to.equal('seeded');
      expect(gs.getState().pen[empty]).to.equal(Number(KIDDIE_SOLUTION[empty]));

      choose('easy');
      $(iframe, '#modal-confirm').click();
      await waitFor(() => gs.getState().puzzle.id !== 'seeded', 20000, 'generated puzzle');
      expect(gs.getState().puzzle.difficulty).to.equal('easy');
      expect(iframe.contentDocument.activeElement).to.equal(select);
    });

    it('SHR44: on a won board a difficulty change starts a new puzzle without asking', async () => {
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
      await open('/index.html');
      await waitForPuzzle(iframe);
      const gs = gsOf(iframe);
      solveAll(iframe);
      expect(gs.getState().won).to.be.true;

      const select = $(iframe, '#difficulty-select');
      select.value = 'easy';
      select.dispatchEvent(new iframe.contentWindow.Event('change'));
      expect($(iframe, '#modal-backdrop').classList.contains('open')).to.be.false;
      await waitFor(() => gs.getState().puzzle.id !== 'seeded', 20000, 'generated puzzle');
      expect(gs.getState().puzzle.difficulty).to.equal('easy');
      expect(gs.getState().won).to.be.false;
    });
  });

  // ── Sharing ──────────────────────────────────────────────────────────────

  describe('the Share action', () => {
    function stubClipboard(behaviour) {
      const copied = [];
      Object.defineProperty(iframe.contentWindow.navigator, 'clipboard', {
        configurable: true,
        value: behaviour === 'missing' ? undefined : {
          writeText: async text => {
            if (behaviour === 'denied') throw new Error('denied');
            copied.push(text);
          },
        },
      });
      return copied;
    }

    async function openShared() {
      await open(`/index.html?p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
    }

    it('SHR29: Share copies a link holding only the givens and confirms visibly and audibly', async () => {
      await openShared();
      enter(iframe, EMPTY, 4);
      gsOf(iframe).dispatch({ type: 'SELECT_CELL', index: EMPTY + 1 });
      gsOf(iframe).dispatch({ type: 'PENCIL_TOGGLE', digit: 6 });
      const copied = stubClipboard('ok');

      clickMenuItem(iframe, 'mi-share');
      await waitFor(() => copied.length === 1, 5000, 'clipboard write');
      await appFrame(iframe);

      expect(copied[0]).to.equal(`${location.origin}/index.html?p=${KIDDIE}`);
      expect(noticeText(iframe)).to.equal('Link copied to clipboard.');
      expect($(iframe, '#sr-live').textContent).to.equal('Link copied to clipboard.');
      expect($(iframe, '#notice-root input')).to.be.null;
    });

    it('SHR30: the copied link opens the same puzzle with none of the sharer\'s progress', async () => {
      await openShared();
      enter(iframe, EMPTY, 4);
      const copied = stubClipboard('ok');
      clickMenuItem(iframe, 'mi-share');
      await waitFor(() => copied.length === 1, 5000, 'clipboard write');
      const link = new URL(copied[0]);
      localStorage.clear();   // the recipient is someone else

      await open(link.pathname + link.search);
      await waitForLinkHandled(iframe);
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(0);
    });

    for (const behaviour of ['denied', 'missing']) {
      it(`SHR31: with the clipboard ${behaviour}, the link is shown in a focused, selected, read-only field`, async () => {
        await openShared();
        stubClipboard(behaviour);
        clickMenuItem(iframe, 'mi-share');
        const field = await waitFor(() => $(iframe, '#share-link-field'), 5000, 'fallback field');
        await appFrame(iframe);

        expect(field.value).to.equal(`${location.origin}/index.html?p=${KIDDIE}`);
        expect(field.readOnly).to.be.true;
        expect(field.getAttribute('aria-label')).to.equal('Shareable puzzle link');
        expect(iframe.contentDocument.activeElement).to.equal(field);
        expect(field.selectionEnd - field.selectionStart).to.equal(field.value.length);
        expect(noticeText(iframe)).to.equal('Copy this link to share the puzzle:');
        expect($(iframe, '#sr-live').textContent)
          .to.equal('Couldn\'t copy automatically. The link is shown for you to copy.');
      });
    }

    it('SHR32: typing in the fallback field never reaches the board, and Dismiss returns focus to the menu button', async () => {
      await openShared();
      gsOf(iframe).dispatch({ type: 'SELECT_CELL', index: EMPTY });
      stubClipboard('denied');
      clickMenuItem(iframe, 'mi-share');
      const field = await waitFor(() => $(iframe, '#share-link-field'), 5000, 'fallback field');
      gsOf(iframe).dispatch({ type: 'SELECT_CELL', index: EMPTY });   // as if a cell were still selected

      const Kbd = iframe.contentWindow.KeyboardEvent;
      for (const key of ['7', 'Backspace', 'ArrowLeft']) {
        field.dispatchEvent(new Kbd('keydown', { key, bubbles: true, cancelable: true }));
      }
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(0);
      expect(gsOf(iframe).getState().selected).to.equal(EMPTY);

      $(iframe, '#notice-root .notice-dismiss').click();
      expect(iframe.contentDocument.activeElement.id).to.equal('menu-button');
    });

    it('SHR33: Share is available for an Unrated puzzle and for a won board', async () => {
      await open(`/index.html?p=${UNRATED}`);
      await waitForLinkHandled(iframe);
      expect($(iframe, '#mi-share').hasAttribute('aria-disabled')).to.be.false;
      const copied = stubClipboard('ok');
      solveAll(iframe);
      expect(gsOf(iframe).getState().won).to.be.true;
      clickMenuItem(iframe, 'mi-share');
      await waitFor(() => copied.length === 1, 5000, 'clipboard write');
      expect(new URL(copied[0]).searchParams.get('p')).to.equal(UNRATED);
    });

    it('SHR34: Share is a menu item with an accessible name, focusable in the open menu', async () => {
      await openShared();
      openMenu(iframe);
      const share = $(iframe, '#mi-share');
      expect(share.getAttribute('role')).to.equal('menuitem');
      expect(share.getAttribute('aria-label')).to.equal('Share puzzle link');
      expect(share.querySelector('.mi-label').textContent).to.equal('Share puzzle');
      share.focus();
      expect(iframe.contentDocument.activeElement).to.equal(share);
    });

    it('SHR35: Share is reachable in the open menu and inside the viewport at every width', async () => {
      await openShared();
      const win = iframe.contentWindow;
      openMenu(iframe);
      for (const width of [1100, 721, 720, 414, 375, 320]) {
        iframe.style.width = `${width}px`;
        await appFrame(iframe);
        const share = $(iframe, '#mi-share');
        const rect = share.getBoundingClientRect();
        const style = win.getComputedStyle(share);
        expect(style.display, `display at ${width}`).to.not.equal('none');
        expect(style.visibility, `visibility at ${width}`).to.equal('visible');
        expect(rect.width, `width at ${width}`).to.be.above(40);
        expect(rect.left, `left at ${width}`).to.be.at.least(0);
        expect(rect.right, `right at ${width}`).to.be.at.most(width);
        const menu = $(iframe, '#app-menu').getBoundingClientRect();
        expect(menu.left, `menu left at ${width}`).to.be.at.least(0);
        expect(menu.right, `menu right at ${width}`).to.be.at.most(width);
        const handHidden = win.getComputedStyle($(iframe, '.mi-hand-section')).display === 'none';
        expect(handHidden, `Left-handed hidden at ${width}`).to.equal(width <= 720);
      }
    });

    it('SHR36: the notice never overflows the viewport on a narrow screen', async () => {
      await open(`/index.html?p=${KIDDIE}`, { width: 320, height: 800 });
      await waitForLinkHandled(iframe);
      stubClipboard('denied');
      clickMenuItem(iframe, 'mi-share');
      await waitFor(() => $(iframe, '#share-link-field'), 5000, 'fallback field');
      const rect = $(iframe, '#notice-root .notice').getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(320);
      expect(iframe.contentDocument.documentElement.scrollWidth).to.be.at.most(320);
    });

    it('SHR37: the Share item and the notice are legible in every theme, and the notice follows the board in left-hand mode', async () => {
      await openShared();
      const win = iframe.contentWindow;
      const css = el => win.getComputedStyle(el);
      stubClipboard('denied');
      clickMenuItem(iframe, 'mi-share');
      await waitFor(() => $(iframe, '#share-link-field'), 5000, 'fallback field');

      for (const theme of ['minimalist', 'coffee', 'school', 'terminal', 'mountain']) {
        clickMenuItem(iframe, `mi-theme-${theme}`);
        await sleep(350);   // theme colours transition over 0.2 s
        const card = $(iframe, '#notice-root .notice');
        const shareLabel = $(iframe, '#mi-share .mi-label');
        const field = $(iframe, '#share-link-field');
        expect(contrast(css($(iframe, '.notice-message')).color, css(card).backgroundColor), `notice text, ${theme}`).to.be.above(4.5);
        expect(contrast(css(field).color, css(field).backgroundColor), `link field, ${theme}`).to.be.above(4.5);
        expect(contrast(css(shareLabel).color, css($(iframe, '#app-menu')).backgroundColor), `share item, ${theme}`).to.be.above(4.5);
      }

      const left = el => el.getBoundingClientRect().left;
      expect(Math.abs(left($(iframe, '#notice-root')) - left($(iframe, '.sudoku-grid')))).to.be.below(2);
      const gridLeft = left($(iframe, '.sudoku-grid'));
      clickMenuItem(iframe, 'mi-hand');
      await appFrame(iframe);
      // Left-hand mode puts the board column on the right.
      expect(left($(iframe, '.sudoku-grid'))).to.be.above(gridLeft);
      // The notice belongs to the board column and moves with the board.
      expect(Math.abs(left($(iframe, '#notice-root')) - left($(iframe, '.sudoku-grid')))).to.be.below(2);
    });
  });
});
