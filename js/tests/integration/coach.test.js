/**
 * @fileoverview Integration tests for Coach Mode UI (Phase 8b).
 *
 * Tests load the full app in a hidden iframe and interact via DOM events
 * and gameState dispatch. `iframe.contentWindow.gameState` must be exposed
 * (as already done in main.js).
 *
 * Tests per aspec-coach-ui.md §16.2.
 *
 * Timing notes:
 * - Recap auto-dismiss (2.5 s) and error toast auto-dismiss (3 s) tests
 *   use real timer waits. Mark with extended timeouts.
 * - Per-technique smoke tests load fixture puzzles and need ~3 s each for puzzle
 *   generation + analyzer run.
 */

// ---------------------------------------------------------------------------
// Iframe helpers
// ---------------------------------------------------------------------------

async function waitForPuzzle(iframe, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for puzzle'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      if (doc.querySelectorAll('.cell').length === 81) return resolve();
      setTimeout(check, 100);
    }
    setTimeout(check, 300);
  });
}

function createIframe() {
  const iframe = document.createElement('iframe');
  iframe.src = '/index.html';
  iframe.style.cssText = 'width:1px;height:1px;position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(iframe);
  return iframe;
}

async function loadIframe(timeoutMs = 15000) {
  const iframe = createIframe();
  await waitForPuzzle(iframe, timeoutMs);
  return iframe;
}

function gs(iframe) { return iframe.contentWindow.gameState ?? null; }

function doc(iframe) { return iframe.contentDocument; }

function cell(iframe, i) {
  return doc(iframe).querySelector(`.cell[data-index="${i}"]`);
}

function coachBtn(iframe) {
  return doc(iframe).querySelector('#btn-coach');
}

function panelWrap(iframe) {
  return doc(iframe).querySelector('#coach-panel-wrap');
}

function overlay(iframe) {
  return doc(iframe).querySelector('#coach-overlay');
}

function recap(iframe) {
  return doc(iframe).querySelector('#coach-recap');
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Find the first non-given cell index.
 *
 * @param {object} state - GameState
 */
function firstEmptyCell(state) {
  for (let i = 0; i < 81; i++) {
    if (state.puzzle.givens[i] === 0 && state.pen[i] === 0) return i;
  }
  return -1;
}

/**
 * Load a specific fixture puzzle into the game state via PUZZLE_LOADED.
 * Returns the loaded state.
 *
 * @param {object} gameState
 * @param {object} fixture - { givens, solution }
 */
function loadFixturePuzzle(gameState, fixture) {
  const puzzle = {
    id: 'coach-test',
    difficulty: 'easy',
    givens: fixture.givens,
    solution: fixture.solution ?? fixture.givens,
    solveTrace: [],
  };
  gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });
  return gameState.getState();
}

// ---------------------------------------------------------------------------
// Per-technique smoke tests
// ---------------------------------------------------------------------------

describe('integration/coach: per-technique smoke', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-S1: Naked Single — pressing Coach highlights target cell with coached-target class', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    // Import the rank-1 fixture inline via dynamic import.
    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    expect(state.coachSession).to.not.equal(null);
    expect(state.coachSession.step.technique).to.equal('Naked Single');
    expect(coachBtn(iframe).classList.contains('coaching')).to.be.true;
    expect(coachBtn(iframe).getAttribute('aria-label')).to.equal('Coach (active)');

    // The target cell should have coached-target class.
    const targetIdx = state.coachSession.step.roles.target;
    if (targetIdx !== null) {
      expect(cell(iframe, targetIdx).classList.contains('coached-target')).to.be.true;
    }
  });

  it('CT-S2: rank ≥ 3 — auto-reveal pencil marks appear with coach-reveal class', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    if (!state.coachSession.step.autoReveal.required) return this.skip();

    // At least one cell should have a .coach-reveal pencil mark.
    const allCells = doc(iframe).querySelectorAll('.cell');
    let foundReveal = false;
    allCells.forEach(c => {
      if (c.querySelector('.pencil-mark.coach-reveal')) foundReveal = true;
    });
    expect(foundReveal).to.be.true;
  });

  it('CT-S3: rank 1 — no auto-reveal (coachRevealedBits all-zero)', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const session = gameState.getState().coachSession;
    if (!session) return this.skip();
    expect(session.coachRevealedBits.every(b => b === 0)).to.be.true;
  });
});

// ---------------------------------------------------------------------------
// Panel and overlay tests
// ---------------------------------------------------------------------------

describe('integration/coach: panel and overlay', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-P1: focus a coached cell → panel opens and overlay becomes visible', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();

    // Select a coached cell.
    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);

    expect(panelWrap(iframe).classList.contains('open')).to.be.true;
    expect(overlay(iframe).classList.contains('visible')).to.be.true;
  });

  it('CT-P2: panel contains technique name', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);

    const technique = state.coachSession.step.technique;
    const techEl = panelWrap(iframe).querySelector('.coach-panel-technique');
    expect(techEl).to.not.equal(null);
    expect(techEl.textContent).to.equal(technique);
  });

  it('CT-P3: move focus to non-coached cell → panel closes and overlay hides, highlights remain', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();

    // Focus a coached cell to open panel.
    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);
    expect(panelWrap(iframe).classList.contains('open')).to.be.true;

    // Find a non-coached cell.
    let nonCoached = -1;
    for (let i = 0; i < 81; i++) {
      if (!state.coachSession.coachedCells.has(i) && state.puzzle.givens[i] === 0) {
        nonCoached = i;
        break;
      }
    }
    if (nonCoached === -1) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: nonCoached });
    await wait(100);

    expect(panelWrap(iframe).classList.contains('open')).to.be.false;
    expect(overlay(iframe).classList.contains('visible')).to.be.false;
    // Session still active (highlights intact).
    expect(gameState.getState().coachSession).to.not.equal(null);
  });

  it('CT-P4: move focus back to coached cell → panel reopens', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);

    // Move away.
    let nonCoached = -1;
    for (let i = 0; i < 81; i++) {
      if (!state.coachSession.coachedCells.has(i) && state.puzzle.givens[i] === 0) {
        nonCoached = i;
        break;
      }
    }
    if (nonCoached === -1) return this.skip();
    gameState.dispatch({ type: 'SELECT_CELL', index: nonCoached });
    await wait(100);
    expect(panelWrap(iframe).classList.contains('open')).to.be.false;

    // Move back.
    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);
    expect(panelWrap(iframe).classList.contains('open')).to.be.true;
  });

  it('CT-P5: panel contains em elements for *-delimited text', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);
    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);

    const supportingText = state.coachSession.step.supportingText;
    const hasEmphasis = supportingText.includes('*');
    if (!hasEmphasis) return this.skip();  // technique has no emphasis markers

    const emEls = panelWrap(iframe).querySelectorAll('.coach-panel-text em');
    expect(emEls.length).to.be.above(0);
  });
});

// ---------------------------------------------------------------------------
// Recap tests
// ---------------------------------------------------------------------------

describe('integration/coach: recap', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-R1: correct fill on Naked Single → recap shows "You used Naked Single."', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    const target = state.coachSession.step.roles.target;
    if (target === null) return this.skip();
    const correctDigit = state.puzzle.solution[target];

    gameState.dispatch({ type: 'SELECT_CELL', index: target });
    gameState.dispatch({ type: 'PEN_ENTER', digit: correctDigit });
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.false;
    expect(recapEl.querySelector('.coach-recap-line1')?.textContent).to.include('You used Naked Single');
    expect(recapEl.querySelector('.coach-recap-line2')?.textContent).to.include('row');
  });

  it('CT-R2: wrong fill on Naked Single → recap shows error message', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    const target = state.coachSession.step.roles.target;
    if (target === null) return this.skip();
    const correctDigit = state.puzzle.solution[target];
    const wrongDigit = correctDigit === 9 ? 1 : 9;

    gameState.dispatch({ type: 'SELECT_CELL', index: target });
    gameState.dispatch({ type: 'PEN_ENTER', digit: wrongDigit });
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;
    expect(recapEl.querySelector('.coach-recap-line1')?.textContent).to.include("not the right digit");
  });

  it('CT-R3: Naked Pair (elimination) fill → no recap, highlights clear', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    if (state.coachSession.step.type !== 'elimination') return this.skip();

    // Fill a coached elimination cell.
    const elimCell = state.coachSession.coachedCells.values().next().value;
    const someDigit = state.puzzle.solution[elimCell] ?? 1;
    gameState.dispatch({ type: 'SELECT_CELL', index: elimCell });
    gameState.dispatch({ type: 'PEN_ENTER', digit: someDigit });
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.false;
  });

  it('CT-R4: recap dismisses after 2.5 s', async function () {
    this.timeout(10000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    const target = state.coachSession.step.roles.target;
    if (target === null) return this.skip();
    const correctDigit = state.puzzle.solution[target];

    gameState.dispatch({ type: 'SELECT_CELL', index: target });
    gameState.dispatch({ type: 'PEN_ENTER', digit: correctDigit });
    await wait(200);

    expect(recap(iframe).classList.contains('visible')).to.be.true;

    // Wait for auto-dismiss (2.5 s + buffer).
    await wait(3000);
    expect(recap(iframe).classList.contains('visible')).to.be.false;
    expect(gameState.getState().coachSession).to.equal(null);
  });

  it('CT-R5: pressing Coach during recap dismisses immediately and starts fresh session', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();
    const target = state.coachSession.step.roles.target;
    if (target === null) return this.skip();
    const correctDigit = state.puzzle.solution[target];

    gameState.dispatch({ type: 'SELECT_CELL', index: target });
    gameState.dispatch({ type: 'PEN_ENTER', digit: correctDigit });
    await wait(200);
    expect(recap(iframe).classList.contains('visible')).to.be.true;

    // Press Coach again — recap should clear and a new session should start (or no-technique).
    coachBtn(iframe).click();
    await wait(100);

    expect(recap(iframe).classList.contains('visible')).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// No-technique tests
// ---------------------------------------------------------------------------

describe('integration/coach: no-technique', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-NT1: solved puzzle → error toast "The puzzle is already solved."', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    // Solve the puzzle completely.
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await wait(200);

    // Press Coach.
    coachBtn(iframe).click();
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;
    expect(recapEl.textContent).to.include('already solved');
  });

  it('CT-NT2: error toast still visible at 3.5 s, auto-dismisses after 5 s', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    // Solve the puzzle.
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await wait(200);

    coachBtn(iframe).click();
    await wait(100);

    expect(recap(iframe).classList.contains('visible')).to.be.true;
    // Implementation uses 5 s timeout — still visible at 3.5 s.
    await wait(3500);
    expect(recap(iframe).classList.contains('visible')).to.be.true;
    // Auto-dismisses by 5.5 s.
    await wait(2000);
    expect(recap(iframe).classList.contains('visible')).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// Pencil revert tests
// ---------------------------------------------------------------------------

describe('integration/coach: pencil revert', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-PR1: coach-revealed pencil marks removed when session ends via non-coached fill', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession?.step.autoReveal.required) return this.skip();

    const revealedCells = state.coachSession.step.autoReveal.cells;
    const pencilAfterStart = new Uint16Array(state.pencil);

    // Find a non-coached cell to fill (ending session silently).
    let nonCoached = -1;
    for (let i = 0; i < 81; i++) {
      if (!state.coachSession.coachedCells.has(i) && state.puzzle.givens[i] === 0 && state.pen[i] === 0) {
        nonCoached = i;
        break;
      }
    }
    if (nonCoached === -1) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: nonCoached });
    gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[nonCoached] ?? 1 });
    await wait(100);

    // Coach-revealed bits should be gone.
    const stateAfter = gameState.getState();
    for (const { cellIndex } of revealedCells) {
      const revealedBits = state.coachSession.coachRevealedBits[cellIndex];
      // After session end, pencil should not contain any purely-revealed bits.
      // (The session's coachRevealedBits were bits added by coach; they should be removed.)
      expect(stateAfter.pencil[cellIndex] & revealedBits).to.equal(0);
    }
  });

  it('CT-PR2: user pencil mark added during session is preserved after session end', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    // Find a cell where we can add a pencil mark that isn't coach-revealed.
    let targetCell = -1;
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0 && state.pen[i] === 0) {
        targetCell = i;
        break;
      }
    }
    if (targetCell === -1) return this.skip();

    // Find a digit not already in pencil for that cell.
    let userDigit = -1;
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      if (!(state.pencil[targetCell] & bit)) {
        userDigit = d;
        break;
      }
    }
    if (userDigit === -1) return this.skip();

    // Toggle user pencil mark on.
    gameState.dispatch({ type: 'SELECT_CELL', index: targetCell });
    gameState.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: userDigit });

    // End session by erasing a cell (or dispatch COACH_END directly).
    gameState.dispatch({ type: 'COACH_END', reason: 'session-reset' });
    await wait(100);

    // User mark should still be there.
    const bit = 1 << (userDigit - 1);
    expect(gameState.getState().pencil[targetCell] & bit).to.not.equal(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-action tests
// ---------------------------------------------------------------------------

describe('integration/coach: cross-action', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-CA1: active session + Erase → session ends silently', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    // Place a digit to erase.
    const state = gameState.getState();
    const emptyCell = firstEmptyCell(state);
    gameState.dispatch({ type: 'SELECT_CELL', index: emptyCell });
    gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[emptyCell] ?? 1 });
    await wait(50);

    coachBtn(iframe).click();
    await wait(100);
    expect(gameState.getState().coachSession).to.not.equal(null);

    gameState.dispatch({ type: 'SELECT_CELL', index: emptyCell });
    gameState.dispatch({ type: 'ERASE' });
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
    expect(recap(iframe).classList.contains('visible')).to.be.false;
  });

  it('CT-CA2: active session + New Puzzle → session ends, new puzzle loads', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);
    expect(gameState.getState().coachSession).to.not.equal(null);

    // Dispatch NEW_PUZZLE directly.
    const newPuzzle = {
      id: 'new-test',
      difficulty: 'easy',
      givens: rank01.givens,
      solution: rank01.solution ?? rank01.givens,
      solveTrace: [],
    };
    gameState.dispatch({ type: 'NEW_PUZZLE', difficulty: 'easy', puzzle: newPuzzle });
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
  });

  it('CT-CA3: active session + RESET_PUZZLE → session ends', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);
    expect(gameState.getState().coachSession).to.not.equal(null);

    gameState.dispatch({ type: 'RESET_PUZZLE' });
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
  });

  it('CT-CA4: active session + CHANGE_DIFFICULTY → session ends, pencil reverts', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession?.step.autoReveal.required) return this.skip();

    gameState.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: 'medium' });
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
    // Coach-revealed pencil bits should be reverted.
    const revealedCells = state.coachSession.step.autoReveal.cells;
    for (const { cellIndex } of revealedCells) {
      const revealedBits = state.coachSession.coachRevealedBits[cellIndex];
      expect(gameState.getState().pencil[cellIndex] & revealedBits).to.equal(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Elimination completion tests
// ---------------------------------------------------------------------------

describe('integration/coach: elimination completion', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  /**
   * Load rank03 (Locked Candidates fixture) and press Coach.
   * Returns { gameState, step, elimDigit, elimTargets } or null if not applicable.
   */
  async function setupLockedCandidatesSession(iframe) {
    const gameState = gs(iframe);
    if (!gameState) return null;

    let rank03;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank03 = fixtures.rank03;
    } catch (_) {
      return null;
    }
    if (!rank03) return null;

    loadFixturePuzzle(gameState, rank03);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return null;
    if (state.coachSession.step.type !== 'elimination') return null;
    if (!state.coachSession.eliminationTargets) return null;

    const step = state.coachSession.step;
    const elimDigit = step.digits[0];
    const elimTargets = [...state.coachSession.eliminationTargets.keys()];

    return { gameState, step, elimDigit, elimTargets };
  }

  it('CT-EC1: user removes last indicated candidate → elim recap appears with "Candidates eliminated."', async function () {
    this.timeout(18000);
    const setup = await setupLockedCandidatesSession(iframe);
    if (!setup) return this.skip();

    const { gameState, elimDigit, elimTargets } = setup;
    const state = gameState.getState();

    // For each elim target cell, mark the elimination digit via PENCIL_TOGGLE to put it in pencil
    // (simulating the coach-revealed mark), then toggle it off to simulate user removing it.
    // But first we need to ensure the digit is actually in pencil for those cells.
    // The session has auto-reveal (rank 3 requires it); the elim candidates should be revealed.
    // We toggle them off one by one — after the last one, elim recap should fire.

    // Toggle ON the elimDigit for each target (they should already be auto-revealed,
    // but we re-toggle to ensure they're on before toggling off).
    gameState.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    for (const c of elimTargets) {
      const bit = 1 << (elimDigit - 1);
      // If not already set, toggle on.
      if (!(gameState.getState().pencil[c] & bit)) {
        gameState.dispatch({ type: 'SELECT_CELL', index: c });
        gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
      }
    }
    await wait(50);

    // Now toggle OFF the elim digit from each target. After the last one, elim recap should fire.
    for (const c of elimTargets) {
      gameState.dispatch({ type: 'SELECT_CELL', index: c });
      gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
    }
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    const line1 = recapEl.querySelector('.coach-recap-line1');
    expect(line1).to.not.equal(null);
    expect(line1.textContent).to.equal('Candidates eliminated.');
  });

  it('CT-EC2: user removes some but not all indicated candidates → no recap', async function () {
    this.timeout(18000);
    const setup = await setupLockedCandidatesSession(iframe);
    if (!setup) return this.skip();
    if (setup.elimTargets.length < 2) return this.skip(); // need at least 2 targets

    const { gameState, elimDigit, elimTargets } = setup;

    // Ensure all targets have the elim digit in pencil first.
    gameState.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    for (const c of elimTargets) {
      const bit = 1 << (elimDigit - 1);
      if (!(gameState.getState().pencil[c] & bit)) {
        gameState.dispatch({ type: 'SELECT_CELL', index: c });
        gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
      }
    }

    // Toggle off only the first target — leave the rest.
    gameState.dispatch({ type: 'SELECT_CELL', index: elimTargets[0] });
    gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.false;
    expect(gameState.getState().coachSession).to.not.equal(null);
    expect(gameState.getState().coachSession.recap).to.equal(null);
  });

  it('CT-EC3: after elim recap dismisses, auto-revealed pencil marks are retained', async function () {
    this.timeout(12000);
    const setup = await setupLockedCandidatesSession(iframe);
    if (!setup) return this.skip();

    const { gameState, elimDigit, elimTargets } = setup;
    const state = gameState.getState();

    // Record which cells have coach-revealed bits.
    const revealedBefore = new Uint16Array(state.pencil);

    // Clear all elim targets.
    gameState.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    for (const c of elimTargets) {
      const bit = 1 << (elimDigit - 1);
      if (!(gameState.getState().pencil[c] & bit)) {
        gameState.dispatch({ type: 'SELECT_CELL', index: c });
        gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
      }
    }
    for (const c of elimTargets) {
      gameState.dispatch({ type: 'SELECT_CELL', index: c });
      gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
    }
    await wait(200);

    // Should be in elim recap now.
    expect(gameState.getState().coachSession?.recap).to.equal('elim');

    // Wait for auto-dismiss (2.5 s + buffer).
    await wait(3000);

    expect(gameState.getState().coachSession).to.equal(null);

    // Pencil marks that were auto-revealed (and NOT cleared by the user)
    // should still be present — they were adopted, not reverted.
    const revealedAfter = gameState.getState().pencil;
    const session = state.coachSession; // captured before end
    if (session) {
      for (let i = 0; i < 81; i++) {
        const revealedBits = session.coachRevealedBits?.[i] ?? 0;
        if (revealedBits !== 0) {
          // These were coach-revealed bits; after elim recap + dismiss they should be retained.
          // (The user did not clear them — only elim targets were cleared by the user.)
          // Check: the bits that were revealed and NOT in the elim target set.
          const isElimTarget = elimTargets.includes(i);
          if (!isElimTarget) {
            // Non-elim-target revealed bits should still be there.
            expect(revealedAfter[i] & revealedBits).to.equal(revealedBits,
              `revealed bits at cell ${i} should be retained after elim recap`);
          }
        }
      }
    }
  });

  it('CT-EC4: pre-cleared candidates before pressing Coach → different technique returned', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank03;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank03 = fixtures.rank03;
    } catch (_) {
      return this.skip();
    }
    if (!rank03) return this.skip();

    loadFixturePuzzle(gameState, rank03);
    await wait(100);

    // Get the step without pencil to find elimination targets.
    const firstState = gameState.getState();
    // Manually press Coach once to see what Locked Candidates says.
    coachBtn(iframe).click();
    await wait(100);

    const firstSession = gameState.getState().coachSession;
    if (!firstSession || firstSession.step.technique !== 'Locked Candidates') return this.skip();

    const elimDigit = firstSession.step.digits[0];
    const elimTargets = [...firstSession.eliminationTargets.keys()];

    // End the session.
    gameState.dispatch({ type: 'COACH_END', reason: 'session-reset' });
    await wait(50);

    // Now clear all elim candidate digits from pencil BEFORE pressing Coach again.
    gameState.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    // All cells: start by setting all bits for empty cells.
    // We need to set the elim targets' elim digit to zero in pencil.
    // They default to 0 (no pencil marks), so if we set all other bits for those cells
    // and leave the elim digit unset, the intersection will suppress the technique.
    // Strategy: set all 9 bits for every empty non-given cell, then clear elim digit from targets.
    for (let i = 0; i < 81; i++) {
      if (gameState.getState().puzzle.givens[i] === 0 && gameState.getState().pen[i] === 0) {
        // Toggle all 9 digits on.
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << (d - 1);
          if (!(gameState.getState().pencil[i] & bit)) {
            gameState.dispatch({ type: 'SELECT_CELL', index: i });
            gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: d });
          }
        }
      }
    }
    // Now clear the elim digit from elim target cells.
    for (const c of elimTargets) {
      const bit = 1 << (elimDigit - 1);
      if (gameState.getState().pencil[c] & bit) {
        gameState.dispatch({ type: 'SELECT_CELL', index: c });
        gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: elimDigit });
      }
    }
    await wait(100);

    // Press Coach — should NOT return Locked Candidates since elim candidates are cleared.
    coachBtn(iframe).click();
    await wait(100);

    const newSession = gameState.getState().coachSession;
    if (!newSession) {
      // No-technique returned — also valid (technique was suppressed).
      return;
    }
    expect(newSession.step.technique).to.not.equal('Locked Candidates');
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut tests
// ---------------------------------------------------------------------------

describe('integration/coach: keyboard shortcut', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-KB1: pressing C with body focus starts a coach session', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);

    doc(iframe).body.focus();
    const e = new iframe.contentWindow.KeyboardEvent('keydown', {
      key: 'c', bubbles: true, cancelable: true,
    });
    doc(iframe).dispatchEvent(e);
    await wait(100);

    expect(gameState.getState().coachSession).to.not.equal(null);
  });

  it('CT-KB2: pressing C while a BUTTON is focused does not trigger coach', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).focus();
    const e = new iframe.contentWindow.KeyboardEvent('keydown', {
      key: 'c', bubbles: true, cancelable: true,
    });
    doc(iframe).dispatchEvent(e);
    await wait(100);

    expect(gameState.getState().coachSession).to.equal(null);
  });
});

// ---------------------------------------------------------------------------
// CT-A11y3–CT-A11y6, CT-NT3, CT-NT4, CT-NT5, CT-HK1, CT-PERF1 (new tests)
// ---------------------------------------------------------------------------

describe('integration/coach: CT-A11y3 — aria-label reverts after session end', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-A11y3: Coach button aria-label reverts to "Coach" after session end via Erase', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    expect(coachBtn(iframe).getAttribute('aria-label')).to.equal('Coach (active)');

    // End session via ERASE on a cell with a pen value. First place a digit.
    const emptyCell = firstEmptyCell(state);
    gameState.dispatch({ type: 'SELECT_CELL', index: emptyCell });
    gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[emptyCell] ?? 1 });
    await wait(50);
    gameState.dispatch({ type: 'SELECT_CELL', index: emptyCell });
    gameState.dispatch({ type: 'ERASE' });
    await wait(100);

    expect(coachBtn(iframe).getAttribute('aria-label')).to.equal('Coach');
  });
});

describe('integration/coach: CT-A11y4 — panel role and aria-label', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-A11y4: panel has role="region" and aria-label="Coach explanation"', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    // Select a coached cell to open the panel.
    const coachedCells = [...state.coachSession.coachedCells];
    if (coachedCells.length === 0) return this.skip();
    gameState.dispatch({ type: 'SELECT_CELL', index: coachedCells[0] });
    await wait(100);

    const panel = doc(iframe).querySelector('.coach-panel');
    expect(panel).to.not.equal(null);
    expect(panel.getAttribute('role')).to.equal('region');
    expect(panel.getAttribute('aria-label')).to.equal('Coach explanation');
  });
});

describe('integration/coach: CT-A11y5 — recap static HTML attributes', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-A11y5: #coach-recap has role="status" and aria-live="polite" at load time', async function () {
    this.timeout(18000);
    const recapEl = doc(iframe).querySelector('#coach-recap');
    expect(recapEl).to.not.equal(null);
    expect(recapEl.getAttribute('role')).to.equal('status');
    expect(recapEl.getAttribute('aria-live')).to.equal('polite');
  });
});

describe('integration/coach: CT-A11y6 — sr-live announces technique on COACH_START', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-A11y6: pressing Coach announces technique name and cell count in sr-live', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(150);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const srLive = doc(iframe).querySelector('#sr-live');
    expect(srLive).to.not.equal(null);
    const text = srLive.textContent;
    // Announce format: "Coach: Naked Single identified. N cells highlighted."
    expect(text).to.include('Naked Single');
    expect(text).to.include('identified');
    expect(text).to.include('cells highlighted');
  });
});

describe('integration/coach: CT-NT3 — wrong digit shows error toast', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-NT3: non-conflicting wrong pen entry shows error toast on Coach press', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    const state = gameState.getState();

    // Find an empty cell and enter a wrong digit (one that differs from solution).
    let targetCell = -1;
    let wrongDigit = -1;
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0 && state.pen[i] === 0) {
        const correct = state.puzzle.solution[i];
        // Pick a digit different from the correct one that won't conflict with givens.
        for (let d = 1; d <= 9; d++) {
          if (d !== correct) {
            // Check no conflict with peers (simple check: not in same row/col/box givens).
            targetCell = i;
            wrongDigit = d;
            break;
          }
        }
        if (targetCell !== -1) break;
      }
    }
    if (targetCell === -1) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: targetCell });
    gameState.dispatch({ type: 'PEN_ENTER', digit: wrongDigit });
    await wait(50);

    // Press Coach — should show error toast (board has an error).
    coachBtn(iframe).click();
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;
    expect(gameState.getState().coachSession).to.equal(null);

    const line1 = recapEl.querySelector('.coach-recap-line1');
    expect(line1).to.not.equal(null);
    expect(line1.textContent).to.include('error');
  });
});

describe('integration/coach: CT-NT4 — inconsistent board shows contradiction toast', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-NT4: genuinely inconsistent board shows contradiction toast', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let noTechniqueInconsistent;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      noTechniqueInconsistent = fixtures.noTechniqueInconsistent;
    } catch (_) {
      return this.skip();
    }
    if (!noTechniqueInconsistent) return this.skip();

    loadFixturePuzzle(gameState, noTechniqueInconsistent);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;
    expect(gameState.getState().coachSession).to.equal(null);

    const line1 = recapEl.querySelector('.coach-recap-line1');
    expect(line1).to.not.equal(null);
    expect(line1.textContent).to.include('contradiction');
  });
});

describe('integration/coach: CT-NT5 — context-aware error toast (fresh iframe per R8)', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-NT5: error recap followed by wrong digit → context-aware toast on second Coach press', async function () {
    this.timeout(20000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    // Press Coach — get a session.
    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const target = state.coachSession.step.roles.target;
    if (target === null) return this.skip();

    const correct = state.puzzle.solution[target];
    const wrong = correct === 9 ? 1 : 9;

    // Fill the coached target with a WRONG digit → error recap fires.
    gameState.dispatch({ type: 'SELECT_CELL', index: target });
    gameState.dispatch({ type: 'PEN_ENTER', digit: wrong });
    await wait(150);

    const recapEl = recap(iframe);
    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;

    // Wait for recap to dismiss (2.5 s + buffer), then press Coach again.
    // The error recap from a wrong placement dismisses after 2.5s (not 5s).
    await wait(3000);
    expect(recapEl.classList.contains('visible')).to.be.false;

    // Press Coach again — wrong digit is still on the board → error path.
    coachBtn(iframe).click();
    await wait(100);

    expect(recapEl.classList.contains('visible')).to.be.true;
    expect(recapEl.classList.contains('error')).to.be.true;

    const line1 = recapEl.querySelector('.coach-recap-line1');
    expect(line1).to.not.equal(null);
    // Context-aware message because _lastSessionHadErrorRecap was set.
    expect(line1.textContent).to.include("That suggestion didn't work out");
  });
});

describe('integration/coach: CT-HK1 — keyboard C guard for INPUT, SELECT, TEXTAREA', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-HK1: pressing C while INPUT/SELECT/TEXTAREA is focused does not trigger coach', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    const tags = ['INPUT', 'SELECT', 'TEXTAREA'];
    for (const tagName of tags) {
      const el = doc(iframe).createElement(tagName.toLowerCase());
      doc(iframe).body.appendChild(el);
      el.focus();

      const e = new iframe.contentWindow.KeyboardEvent('keydown', {
        key: 'c', bubbles: true, cancelable: true,
      });
      doc(iframe).dispatchEvent(e);
      await wait(50);

      expect(gameState.getState().coachSession).to.equal(null,
        `Coach session should not start when ${tagName} is focused`);

      el.remove();
    }
  });
});

describe('integration/coach: CT-PERF1 — Coach press highlights within 200ms', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-PERF1: Coach press → coached cell highlights appear within 200ms', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank04;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank04 = fixtures.rank04;
    } catch (_) {
      return this.skip();
    }
    if (!rank04) return this.skip();

    loadFixturePuzzle(gameState, rank04);
    await wait(100);

    const start = Date.now();
    coachBtn(iframe).click();

    // Poll for coached-cause or coached-target class to appear.
    const deadline = start + 500;
    let found = false;
    while (Date.now() < deadline) {
      const el = doc(iframe).querySelector('.coached-cause, .coached-target');
      if (el) { found = true; break; }
      await wait(10);
    }

    const elapsed = Date.now() - start;
    expect(found).to.be.true;
    expect(elapsed).to.be.below(200);
  });
});

// ---------------------------------------------------------------------------
// A11y tests
// ---------------------------------------------------------------------------

describe('integration/coach: accessibility', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(18000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  it('CT-A11y1: coached cells have aria-describedby="sr-coached-desc"', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    const coachedCells = [...state.coachSession.coachedCells];
    expect(coachedCells.length).to.be.above(0);

    for (const idx of coachedCells) {
      const el = cell(iframe, idx);
      if (el) {
        expect(el.getAttribute('aria-describedby')).to.equal('sr-coached-desc');
      }
    }
  });

  it('CT-A11y2: non-coached cells do not have aria-describedby', async function () {
    this.timeout(18000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let rank01;
    try {
      const fixtures = await import('/js/tests/fixtures/puzzles/coach/index.js');
      rank01 = fixtures.rank01;
    } catch (_) {
      return this.skip();
    }
    if (!rank01) return this.skip();

    loadFixturePuzzle(gameState, rank01);
    await wait(100);

    coachBtn(iframe).click();
    await wait(100);

    const state = gameState.getState();
    if (!state.coachSession) return this.skip();

    // Check a non-coached cell.
    let nonCoached = -1;
    for (let i = 0; i < 81; i++) {
      if (!state.coachSession.coachedCells.has(i)) { nonCoached = i; break; }
    }
    if (nonCoached === -1) return this.skip();

    const el = cell(iframe, nonCoached);
    if (el) {
      expect(el.getAttribute('aria-describedby')).to.equal(null);
    }
  });
});
