/**
 * @fileoverview Integration tests for developer mode (DVI1–DVI22): the real
 * app in an iframe with `?dev=1`, `?dev=0`, and no parameter.
 * tspec-dev-mode §2.4.
 */

import {
  createApp, waitFor, waitForPuzzle, waitForLinkHandled, waitForDevPanel, appFrame, gsOf,
  seedSavedGame, readStats, enter, solveAll, boardString,
} from './_app.js';
import { contrast } from './sharing.test.js';
import {
  KIDDIE, KIDDIE_SOLUTION, MEDIUM, HARD, UNRATED,
} from '../fixtures/puzzles/loadable.js';

const DEV_KEY = 'sudoku.dev.v1';
const EMPTY = KIDDIE.indexOf('0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (iframe, sel) => iframe.contentDocument.querySelector(sel);
const $$ = (iframe, sel) => [...iframe.contentDocument.querySelectorAll(sel)];

const devResources = iframe => iframe.contentWindow.performance
  .getEntriesByType('resource')
  .map(e => new URL(e.name).pathname)
  .filter(p => /\/js\/dev\/|\/css\/dev\.css/.test(p));

describe('integration: developer mode', function () {
  this.timeout(40000);

  let iframe;
  const open = async (src, size) => { iframe?.remove(); iframe = createApp(src, size); return iframe; };

  /** Boot with dev mode on, over a seeded Kiddie game so the board is known. */
  async function openDev({ seed = true, query = '?dev=1', size } = {}) {
    if (seed) seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
    await open(`/index.html${query}`, size);
    await waitForPuzzle(iframe);
    await waitForDevPanel(iframe);
  }

  async function loadString(text) {
    $(iframe, '#dev-load-input').value = text;
    $(iframe, '#dev-load-btn').click();
  }

  afterEach(() => { iframe?.remove(); iframe = null; });

  // ── Activation ───────────────────────────────────────────────────────────

  describe('activation', () => {
    it('DVI1: by default there is no developer UI and the tooling is never requested', async () => {
      await open('/index.html');
      await waitForPuzzle(iframe);
      await sleep(400);   // long enough for a lazy import to have shown up
      expect($(iframe, '#dev-root')).to.be.null;
      expect($(iframe, '#dev-badge')).to.be.null;
      expect($(iframe, '#dev-stylesheet')).to.be.null;
      expect($$(iframe, '[id^="dev-"], [class*="dev-"]')).to.have.length(0);
      // Only the flag module is part of the always-loaded graph.
      expect(devResources(iframe)).to.deep.equal(['/js/dev/devMode.js']);
    });

    it('DVI2: ?dev=1 turns developer mode on: badge, panel, and lazily loaded tooling', async () => {
      await openDev({ seed: false });
      expect($(iframe, '#dev-badge').textContent).to.equal('DEV');
      expect($(iframe, '#dev-title').textContent).to.equal('Developer tools');
      expect(devResources(iframe)).to.include.members(
        ['/js/dev/devMode.js', '/js/dev/devPanel.js', '/js/dev/inspect.js', '/css/dev.css']);
      expect(JSON.parse(localStorage.getItem(DEV_KEY))).to.equal(true);
    });

    it('DVI3: the setting persists across loads without the parameter', async () => {
      await openDev({ seed: false });
      await open('/index.html');
      await waitForPuzzle(iframe);
      await waitForDevPanel(iframe);
      expect($(iframe, '#dev-badge')).to.not.be.null;
    });

    it('DVI4: ?dev=0 turns it off and the next plain load stays off', async () => {
      await openDev({ seed: false });
      await open('/index.html?dev=0');
      await waitForPuzzle(iframe);
      await sleep(400);
      expect($(iframe, '#dev-root')).to.be.null;
      expect(localStorage.getItem(DEV_KEY)).to.be.null;

      await open('/index.html');
      await waitForPuzzle(iframe);
      await sleep(400);
      expect($(iframe, '#dev-root')).to.be.null;
      expect($(iframe, '#dev-badge')).to.be.null;
    });

    it('DVI5: the badge is fixed in the viewport corner and stays visible when the page scrolls', async () => {
      await openDev({ size: { width: 1100, height: 500 } });
      const win = iframe.contentWindow;
      await waitFor(() => win.getComputedStyle($(iframe, '#dev-badge')).position === 'fixed', 5000, 'dev.css');
      win.scrollTo(0, 5000);
      await appFrame(iframe);
      const rect = $(iframe, '#dev-badge').getBoundingClientRect();
      expect(rect.left).to.be.within(0, 20);
      expect(rect.bottom).to.be.within(480, 500);
      expect(rect.width).to.be.above(10);
    });

    it('DVI6: activating the badge moves focus to the developer panel', async () => {
      await openDev();
      $(iframe, '#dev-badge').click();
      expect(iframe.contentDocument.activeElement.id).to.equal('dev-root');
    });
  });

  // ── Statistics ───────────────────────────────────────────────────────────

  describe('statistics', () => {
    it('DVI7: with developer mode on, a rated puzzle records neither attempt nor win', async () => {
      await openDev();
      enter(iframe, EMPTY, 4);
      expect(gsOf(iframe).getState().attemptRecorded).to.be.false;
      solveAll(iframe);
      expect(gsOf(iframe).getState().won).to.be.true;
      for (const row of Object.values(readStats(iframe))) expect(row).to.deep.equal({ attempted: 0, won: 0 });
    });

    it('DVI8: a shared link opened with developer mode on records nothing', async () => {
      await open(`/index.html?dev=1&p=${KIDDIE}`);
      await waitForLinkHandled(iframe);
      expect(boardString(iframe)).to.equal(KIDDIE);
      // The dev parameter is left in the address bar; only p is spent.
      expect(iframe.contentWindow.location.search).to.equal('?dev=1');
      solveAll(iframe);
      for (const row of Object.values(readStats(iframe))) expect(row).to.deep.equal({ attempted: 0, won: 0 });
    });

    it('DVI9: after ?dev=0 the restored game records its attempt on the next digit', async () => {
      await openDev();
      enter(iframe, EMPTY, 4);
      await waitFor(() => JSON.parse(localStorage.getItem('sudoku.state.v1'))?.pen[EMPTY] === 4, 5000, 'state save');

      await open('/index.html?dev=0');
      await waitForPuzzle(iframe);
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(4);
      expect(readStats(iframe).Kiddie).to.deep.equal({ attempted: 0, won: 0 });
      const next = KIDDIE.indexOf('0', EMPTY + 1);
      enter(iframe, next, Number(KIDDIE_SOLUTION[next]));
      expect(readStats(iframe).Kiddie).to.deep.equal({ attempted: 1, won: 0 });
    });
  });

  // ── Load from string ─────────────────────────────────────────────────────

  describe('load puzzle from string', () => {
    it('DVI10: a valid string replaces the puzzle, bypassing the generator', async () => {
      await openDev();
      await loadString(MEDIUM.match(/.{9}/g).join('\n').replace(/0/g, '.'));
      await waitFor(() => boardString(iframe) === MEDIUM, 10000, 'loaded puzzle');
      await appFrame(iframe);
      const s = gsOf(iframe).getState();
      expect(s.puzzle.difficulty).to.equal('medium');
      expect(s.puzzle.source).to.equal('string');
      expect($(iframe, '#dev-load-status').textContent).to.equal('Puzzle loaded. Difficulty: Medium.');
      expect($(iframe, '#sr-live').textContent).to.equal('Puzzle loaded. Difficulty: Medium.');
      // The global notice is for share links; the dev tool reports inline.
      expect($(iframe, '#notice-root').hidden).to.be.true;
    });

    it('DVI11: malformed input shows an inline error and leaves the game untouched', async () => {
      await openDev();
      enter(iframe, EMPTY, 4);
      await loadString('12345');
      await waitFor(() => $(iframe, '#dev-load-status').classList.contains('dev-error'), 5000, 'inline error');
      expect($(iframe, '#dev-load-status').textContent)
        .to.equal('This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 5.');
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(4);
      expect($(iframe, '#modal-backdrop.open')).to.be.null;
    });

    it('DVI12: a puzzle without a unique solution is rejected inline', async () => {
      await openDev();
      await loadString('0'.repeat(81));
      await waitFor(() => $(iframe, '#dev-load-status').classList.contains('dev-error'), 10000, 'inline error');
      expect($(iframe, '#dev-load-status').textContent)
        .to.equal('This puzzle can\'t be loaded. The puzzle has more than one solution.');
      expect(boardString(iframe)).to.equal(KIDDIE);
    });

    it('DVI13: with progress it asks first; declining keeps the game', async () => {
      await openDev();
      enter(iframe, EMPTY, 4);
      await loadString(MEDIUM);
      await waitFor(() => $(iframe, '#modal-backdrop.open'), 10000, 'confirmation');
      expect($(iframe, '#modal-title').textContent).to.equal('Load this puzzle?');
      $(iframe, '#modal-cancel').click();
      await waitFor(() => $(iframe, '#dev-load-status').textContent === 'Puzzle not loaded. Your game continues.', 5000, 'declined status');
      expect(boardString(iframe)).to.equal(KIDDIE);
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(4);
    });

    it('DVI14: an unrateable string loads as Unrated with coach and hints off', async () => {
      await openDev();
      await loadString(UNRATED);
      await waitFor(() => boardString(iframe) === UNRATED, 10000, 'loaded puzzle');
      expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('unrated');
      expect($(iframe, '#btn-coach').disabled).to.be.true;
      expect($(iframe, '#btn-hint').disabled).to.be.true;
      expect($(iframe, '#dev-load-status').textContent).to.include('Unrated');
    });

    it('DVI15: digits typed into the load field are not entered on the board', async () => {
      await openDev();
      gsOf(iframe).dispatch({ type: 'SELECT_CELL', index: EMPTY });
      const field = $(iframe, '#dev-load-input');
      $(iframe, '#dev-load').open = true;
      field.focus();
      const Kbd = iframe.contentWindow.KeyboardEvent;
      const e = new Kbd('keydown', { key: '5', bubbles: true, cancelable: true });
      field.dispatchEvent(e);
      expect(e.defaultPrevented).to.be.false;
      expect(gsOf(iframe).getState().pen[EMPTY]).to.equal(0);
    });

    it('DVI16: [perf] load-from-string completes in under 1 s for rateable and unrateable puzzles', async () => {
      await openDev();
      // First load pays the one-time loader-worker startup.
      for (const [label, puzzle] of [['cold, Hard', HARD], ['warm, Medium', MEDIUM], ['warm, Unrated', UNRATED], ['warm, Hard', HARD]]) {
        const t0 = performance.now();
        await loadString(puzzle);
        await waitFor(() => boardString(iframe) === puzzle, 10000, 'loaded puzzle');
        const elapsed = performance.now() - t0;
        console.log(`[PERF] Load puzzle from string (${label}): ${elapsed.toFixed(0)} ms (budget 1000 ms)`);
        expect(elapsed, label).to.be.below(1000);
      }
    });
  });

  // ── Read-only tools on the live app ──────────────────────────────────────

  describe('inspector, overlay, coach data, diagnostics', () => {
    it('DVI17: the inspector lists the solve, highlights a selected step, and never changes the board', async () => {
      await openDev();
      const before = Array.from(gsOf(iframe).getState().pen).join('');
      $(iframe, '#dev-inspect-run').click();
      expect($$(iframe, '#dev-inspect-list button')).to.have.length(51);
      expect($(iframe, '#dev-inspect-summary').textContent).to.equal('Solved in 51 steps. Hardest rank 1 (Kiddie).');

      $(iframe, '#dev-inspect-list button').click();
      expect($$(iframe, '.cell.dev-hl-place')).to.have.length(1);
      expect(Array.from(gsOf(iframe).getState().pen).join('')).to.equal(before);

      // A player digit makes the listing stale.
      enter(iframe, EMPTY, 4);
      expect($$(iframe, '#dev-inspect-list button')).to.have.length(0);
      expect($(iframe, '#dev-inspect-summary').textContent).to.equal('Board changed — run the solver again.');
      expect($$(iframe, '.cell.dev-hl-place')).to.have.length(0);
    });

    it('DVI18: the inspector says so explicitly when the solver stalls', async () => {
      await openDev();
      await loadString(UNRATED);
      await waitFor(() => boardString(iframe) === UNRATED, 10000, 'loaded puzzle');
      const t0 = performance.now();
      $(iframe, '#dev-inspect-run').click();
      console.log(`[PERF] Solver step inspector on an unrateable board: ${(performance.now() - t0).toFixed(0)} ms (budget 1000 ms)`);
      expect($(iframe, '#dev-inspect-summary').textContent).to.equal('Stalled after 0 steps with 60 cells unsolved.');
      expect(performance.now() - t0).to.be.below(1000);
    });

    it('DVI19: the overlay shows computed candidates, marks divergence, and leaves the player\'s marks alone', async () => {
      seedSavedGame({
        givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie',
        pencil: { [EMPTY]: 0b0011 | 0b100000000 },   // 1, 2, 9 — computed is 1, 2, 4
      });
      await openDev({ seed: false });
      const cell = () => $(iframe, `.cell[data-index="${EMPTY}"]`);
      const classes = () => [...cell().querySelectorAll('.pencil-mark')].map(s => s.className.replace('pencil-mark ', ''));

      $(iframe, '#dev-overlay-toggle').click();
      expect(classes()).to.deep.equal(
        ['dev-cand-agree', 'dev-cand-agree', 'empty', 'dev-cand-missing', 'empty', 'empty', 'empty', 'empty', 'dev-cand-extra']);
      expect(cell().getAttribute('aria-label'))
        .to.equal('Row 1, column 3: candidates 1, 2, 4. Missing from your marks: 4. Extra marks: 9');

      // The two divergence kinds are distinguishable without colour.
      const win = iframe.contentWindow;
      await waitFor(() => win.getComputedStyle(cell().querySelector('.dev-cand-extra')).textDecorationLine === 'line-through', 5000, 'dev.css');
      expect(win.getComputedStyle(cell().querySelector('.dev-cand-missing')).textDecorationLine).to.equal('underline');
      expect(win.getComputedStyle(cell().querySelector('.dev-cand-agree')).textDecorationLine).to.equal('none');

      $(iframe, '#dev-overlay-toggle').click();
      expect(gsOf(iframe).getState().pencil[EMPTY]).to.equal(0b0011 | 0b100000000);
      expect(cell().getAttribute('aria-label')).to.equal('Row 1, column 3: pencil marks 1, 2, 9');
    });

    it('DVI20: the coach viewer shows the live CoachStep and follows the session', async () => {
      await openDev();
      expect($(iframe, '#dev-coach-json').textContent).to.equal('No active coach session.');
      $(iframe, '#btn-coach').click();
      const session = gsOf(iframe).getState().coachSession;
      const shown = JSON.parse($(iframe, '#dev-coach-json').textContent);
      expect(shown).to.deep.equal(JSON.parse(JSON.stringify(session.step)));
      expect(shown.technique).to.equal('Naked Single');
      expect(shown.eliminations).to.be.an('array');

      gsOf(iframe).dispatch({ type: 'COACH_END', reason: 'test' });
      expect($(iframe, '#dev-coach-json').textContent).to.equal('No active coach session.');
    });

    it('DVI21: diagnostics describe a generated puzzle, survive a reload, and say so for a loaded one', async () => {
      await openDev({ seed: false });
      const rows = () => Object.fromEntries($$(iframe, '#dev-gen-body tr').map(tr => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));
      const tier = gsOf(iframe).getState().puzzle.difficulty;
      const label = tier[0].toUpperCase() + tier.slice(1);
      const first = rows();
      expect(first['Requested tier']).to.equal(label);
      expect(first['Achieved tier']).to.equal(label);
      expect(first['Fallback used']).to.equal('No');
      expect(first['Attempts']).to.match(/^\d+ of \d+$/);
      expect(first['Rejected — unsolvable by solver']).to.match(/^\d+$/);
      expect(first['Rejected — wrong tier']).to.match(/^\d+/);
      expect(first['Technique profile']).to.match(/ × \d+/);

      await waitFor(() => localStorage.getItem('sudoku.state.v1') !== null, 5000, 'state save');
      await open('/index.html');
      await waitForPuzzle(iframe);
      await waitForDevPanel(iframe);
      expect(rows()).to.deep.equal(first);

      await loadString(MEDIUM);
      await waitFor(() => boardString(iframe) === MEDIUM, 10000, 'loaded puzzle');
      expect($(iframe, '#dev-gen-body').textContent).to.equal('This puzzle was loaded, not generated.');
    });
  });

  // ── Accessibility and presentation ───────────────────────────────────────

  describe('accessibility and presentation', () => {
    it('DVI22: every developer control is keyboard-focusable and has an accessible name', async () => {
      await openDev();
      for (const d of $$(iframe, '#dev-root details')) d.open = true;
      $(iframe, '#dev-inspect-run').click();
      const controls = $$(iframe, '#dev-root button, #dev-root summary, #dev-root textarea, #dev-root pre, #dev-badge');
      expect(controls.length).to.be.above(60);
      for (const el of controls) {
        const name = (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent).trim();
        expect(name, el.id || el.tagName).to.not.equal('');
        if (el.disabled) continue;
        el.focus();
        expect(iframe.contentDocument.activeElement, el.id || el.tagName).to.equal(el);
      }
      expect($(iframe, '#dev-root').getAttribute('aria-labelledby')).to.equal('dev-title');
    });

    it('DVI23: the panel fits narrow screens without horizontal page scroll', async () => {
      await openDev({ size: { width: 320, height: 800 } });
      for (const d of $$(iframe, '#dev-root details')) d.open = true;
      $(iframe, '#dev-inspect-run').click();
      $(iframe, '#btn-coach').click();
      await waitFor(() => iframe.contentWindow.getComputedStyle($(iframe, '#dev-badge')).position === 'fixed', 5000, 'dev.css');
      const rect = $(iframe, '#dev-root').getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(320);
      expect(iframe.contentDocument.documentElement.scrollWidth).to.be.at.most(320);
    });

    it('DVI24: developer UI is legible in every theme and unaffected by left-hand mode', async () => {
      await openDev();
      const win = iframe.contentWindow;
      const css = el => win.getComputedStyle(el);
      await waitFor(() => css($(iframe, '#dev-badge')).position === 'fixed', 5000, 'dev.css');
      for (const d of $$(iframe, '#dev-root details')) d.open = true;
      $(iframe, '#dev-inspect-run').click();
      $(iframe, '#dev-inspect-list button').click();
      $(iframe, '#dev-overlay-toggle').click();

      const themeSelect = $(iframe, '#theme-select');
      for (const theme of ['minimalist', 'coffee', 'school', 'terminal', 'mountain']) {
        themeSelect.value = theme;
        themeSelect.dispatchEvent(new win.Event('change'));
        await sleep(350);
        const panel = $(iframe, '#dev-root');
        const badge = $(iframe, '#dev-badge');
        const pressed = $(iframe, '#dev-inspect-list button[aria-pressed="true"]');
        const idle = $(iframe, '#dev-inspect-list button[aria-pressed="false"]');
        const input = $(iframe, '#dev-load-input');
        const bg = css(panel).backgroundColor;
        expect(contrast(css($(iframe, '#dev-title')).color, bg), `heading, ${theme}`).to.be.above(4.5);
        expect(contrast(css(badge).color, css(badge).backgroundColor), `badge, ${theme}`).to.be.above(4.5);
        expect(contrast(css(pressed).color, css(pressed).backgroundColor), `selected step, ${theme}`).to.be.above(4.5);
        expect(contrast(css(idle).color, bg), `step, ${theme}`).to.be.above(4.5);
        expect(contrast(css(input).color, css(input).backgroundColor), `load field, ${theme}`).to.be.above(4.5);
        const agree = $(iframe, '.cell .dev-cand-agree');
        expect(contrast(css(agree).color, css(agree.closest('.cell')).backgroundColor), `overlay mark, ${theme}`).to.be.above(3);
      }

      const panelLeft = $(iframe, '#dev-root').getBoundingClientRect().left;
      const badgeLeft = $(iframe, '#dev-badge').getBoundingClientRect().left;
      $(iframe, '#hand-toggle').click();
      await appFrame(iframe);
      expect($(iframe, '#dev-root').getBoundingClientRect().left).to.equal(panelLeft);
      expect($(iframe, '#dev-badge').getBoundingClientRect().left).to.equal(badgeLeft);
    });
  });
});
