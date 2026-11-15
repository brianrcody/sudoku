/**
 * @fileoverview App bootstrap. Instantiates all modules, wires providers to the
 * game layer, mounts UI, and wires persistence.
 *
 * Steps follow aspec §4.1.1 exactly.
 */

import { initTheme, bindThemeSelect } from './ui/themes.js';
import { initHandedness, bindHandToggle } from './ui/handedness.js';
import { mount as mountSrLive, announce } from './ui/srLive.js';
import { mount as mountDialog, open as openDialog, close as closeDialog } from './ui/dialog.js';
import { mount as mountGrid } from './ui/grid.js';
import { mount as mountNumpad } from './ui/numpad.js';
import { mount as mountControls } from './ui/controls.js';
import { mount as mountStats } from './ui/stats.js';
import { mount as mountWinBanner } from './ui/winBanner.js';
import { mount as mountKeyboard } from './ui/keyboard.js';
import { mount as mountCoach } from './ui/coach.js';
import { mount as mountCoachOverlay } from './ui/coachOverlay.js';
import { mount as mountBusy } from './ui/busy.js';
import * as notice from './ui/notice.js';
import { mount as mountShare } from './ui/share.js';

import { cookieStatsStore } from './providers/cookieStatsStore.js';
import { migrateTierIds } from './persist/migrate.js';
import { createStatsProvider } from './providers/statsProvider.js';
import { createStatistics } from './game/statistics.js';
import { requestPuzzle, peekReady, primeNext } from './providers/puzzleProvider.js';
import { nextHint } from './providers/hintProvider.js';
import { createGameState } from './game/state.js';
import { createPuzzleLoader } from './game/puzzleLoader.js';
import { createLoadProvider } from './providers/loadProvider.js';
import { getItem, setItem, removeItem } from './persist/storage.js';
import { initDevMode, isDevMode } from './dev/devMode.js';
import { HINT_LIMITS, TIER_LABELS, SHARE_PARAM, isRatedTier } from './config.js';

// ── Step 1.5: developer-mode flag (?dev=1 / ?dev=0, persisted) ─────────────
const devMode = initDevMode(location.search);

// ── Step 2: reconcile cookies with the document ────────────────────────────
// The inline head <script> already applied the theme class to <body> and the
// data-hand attribute to <html>. These read the cookies and re-apply, handling
// any drift between the two.
initTheme();
initHandedness();

// ── Step 2.5: one-time V3 tier-ID migration (death-march → expert) ─────────
// Must run before any module reads persisted difficulty/state. The stats
// cookie migrates inside cookieStatsStore.load().
migrateTierIds();

// ── Step 3: stats stack ───────────────────────────────────────────────────
const statsProvider = createStatsProvider(cookieStatsStore);
const stats = createStatistics(statsProvider);
await stats.init();

// ── Step 4: puzzle provider ───────────────────────────────────────────────
const puzzleProvider = { requestPuzzle, peekReady, primeNext };

// ── Step 5: hint provider ─────────────────────────────────────────────────
const hintProvider = { nextHint };

// ── Step 6: game state ────────────────────────────────────────────────────
const gameState = createGameState({ stats, hintProvider, statsSuppressed: isDevMode });
if (typeof window !== 'undefined') window.gameState = gameState;

// ── Step 7: restore or request puzzle ─────────────────────────────────────
const STATE_KEY = 'sudoku.state.v1';
const DIFF_KEY = 'sudoku.currentDifficulty.v1';

/** Tiers whose budget-exhaustion fallback prompts the user (fspec-003 §5.4). */
const HONEST_FALLBACK_TIERS = new Set(['diabolical', 'nightmare']);

/** @type {AbortController|null} Controller for the in-flight foreground request. */
let _genAbort = null;

// The tier the player last chose. Distinct from the current puzzle's
// difficulty, which a loaded puzzle can set to another tier or to Unrated.
const savedDiffPref = getItem(DIFF_KEY);
let preferredTier = isRatedTier(savedDiffPref) ? savedDiffPref : 'easy';

/**
 * The tier New Puzzle and pre-generation use: the tier being generated if a
 * generation is pending, else the current puzzle's tier when it has one, else
 * the player's last choice.
 *
 * @param {object} state - GameState
 * @returns {string}
 */
function _generationTier(state) {
  if (state.generatingDifficulty) return state.generatingDifficulty;
  const difficulty = state.puzzle?.difficulty;
  return isRatedTier(difficulty) ? difficulty : preferredTier;
}

const savedBlob = getItem(STATE_KEY);

if (savedBlob && savedBlob.version === 1 && savedBlob.puzzle) {
  // Restore in-progress game from localStorage.
  const puzzle = {
    id: savedBlob.puzzle.id,
    difficulty: savedBlob.difficulty ?? preferredTier,
    givens: new Uint8Array(savedBlob.puzzle.givens),
    solution: new Uint8Array(savedBlob.puzzle.solution),
    solveTrace: [],
    source: savedBlob.puzzle.source,
    gen: savedBlob.puzzle.gen,
  };

  // Load the puzzle (copies givens into pen[]).
  gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });

  // Restore player pen entries using fromHint=true to skip stats side-effects.
  const pen = savedBlob.pen ? new Uint8Array(savedBlob.pen) : null;
  const pencil = savedBlob.pencil ? new Uint16Array(savedBlob.pencil) : null;

  if (pen) {
    for (let i = 0; i < 81; i++) {
      if (puzzle.givens[i] === 0 && pen[i] !== 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: pen[i], fromHint: true });
      }
    }
  }

  if (pencil) {
    for (let i = 0; i < 81; i++) {
      if (puzzle.givens[i] === 0 && pencil[i] !== 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        for (let d = 1; d <= 9; d++) {
          if (pencil[i] & (1 << (d - 1))) {
            gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: d });
          }
        }
      }
    }
  }

  gameState.dispatch({ type: 'DESELECT' });

  // Restore session flags that PUZZLE_LOADED resets to defaults.
  gameState.dispatch({
    type: 'RESTORE_SESSION',
    attemptRecorded: savedBlob.attemptRecorded ?? false,
    hintsRemaining: savedBlob.hintsRemaining ?? HINT_LIMITS[puzzle.difficulty],
  });

} else {
  // No saved state — request a new puzzle.
  _requestForeground(preferredTier, puzzle => {
    gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });
  });
}

// ── Step 8: mount UI modules ───────────────────────────────────────────────
mountSrLive(document.body);
mountDialog(document.getElementById('dialog-root'));

const themeSelect = document.getElementById('theme-select');
if (themeSelect) bindThemeSelect(themeSelect);
bindHandToggle(document.getElementById('hand-toggle'));

mountControls(
  document.getElementById('controls-root'),
  gameState
);

mountGrid(
  document.getElementById('grid-root'),
  gameState
);

mountNumpad(
  document.getElementById('numpad-root'),
  gameState
);

mountCoach(document.body, gameState);
mountCoachOverlay(document.body, gameState);

mountBusy(
  document.getElementById('busy-root'),
  gameState,
  { onCancel: _cancelForeground }
);

mountStats(
  document.getElementById('stats-root'),
  gameState,
  stats
);

mountWinBanner(
  document.getElementById('win-banner-root'),
  gameState
);

mountKeyboard(document.body, gameState);

notice.mount(document.getElementById('notice-root'));
mountShare(document.getElementById('btn-share'), gameState);

// ── Wire action buttons (New Puzzle + Reset) ───────────────────────────────

document.getElementById('btn-new')?.addEventListener('click', () => {
  const state = gameState.getState();
  const inProgress = _isInProgress(state);

  if (inProgress) {
    openDialog({
      title: 'Start a new puzzle?',
      body: 'Your current progress will be lost.',
      confirmLabel: 'New Puzzle',
      onConfirm: () => _startNewPuzzle(_generationTier(state)),
    });
  } else {
    _startNewPuzzle(_generationTier(state));
  }
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  openDialog({
    title: 'Reset puzzle?',
    body: 'Your entries will be cleared.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      gameState.dispatch({ type: 'RESET_PUZZLE' });
      announce('Puzzle reset.');
      document.getElementById('btn-reset')?.focus();
    },
  });
});

/**
 * @param {string} difficulty
 * @param {string} [focusId] - Control that takes focus once the puzzle loads:
 *   the one the player started it from.
 */
function _startNewPuzzle(difficulty, focusId = 'btn-new') {
  _requestForeground(difficulty, puzzle => {
    gameState.dispatch({ type: 'NEW_PUZZLE', difficulty: puzzle.difficulty, puzzle });
    removeItem(STATE_KEY);
    announce('New puzzle started.');
    document.getElementById(focusId)?.focus();
  });
}

// ── Foreground generation with progress, cancel, and honest fallback ───────

/**
 * Request a puzzle in the foreground with the busy-card lifecycle: progress
 * dispatches, cancel support, and the honest-fallback dialog for the top
 * tiers. `onLoaded(puzzle)` runs only when a puzzle should actually load.
 *
 * @param {string} difficulty
 * @param {function(object): void} onLoaded
 */
function _requestForeground(difficulty, onLoaded) {
  _genAbort?.abort();
  const controller = new AbortController();
  _genAbort = controller;

  gameState.dispatch({
    type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…', difficulty,
  });

  puzzleProvider.requestPuzzle({
    difficulty,
    signal: controller.signal,
    onProgress({ attempts, budget }) {
      if (_genAbort === controller) {
        gameState.dispatch({ type: 'GEN_PROGRESS', attempts, budget });
      }
    },
  }).then(({ puzzle, fallback }) => {
    if (_genAbort !== controller) return; // superseded by a newer request
    _genAbort = null;

    if (fallback && HONEST_FALLBACK_TIERS.has(difficulty)) {
      gameState.dispatch({ type: 'SET_GENERATING', flag: false });
      const requested = TIER_LABELS[difficulty];
      const actual = TIER_LABELS[puzzle.difficulty] ?? puzzle.difficulty;
      openDialog({
        title: `No ${requested} puzzle found`,
        body: `The generator couldn't find a ${requested} puzzle this time. ` +
              `The best it found is rated ${actual}. Play it?`,
        confirmLabel: `Play ${actual}`,
        onConfirm: () => {
          setItem(DIFF_KEY, puzzle.difficulty);
          preferredTier = puzzle.difficulty;
          onLoaded(puzzle);
        },
      });
      return;
    }

    onLoaded(puzzle);
  }).catch(err => {
    if (err && err.name === 'AbortError') return; // cancelled — state already reset
    console.error('[main] Failed to generate puzzle:', err);
    if (_genAbort === controller) {
      _genAbort = null;
      gameState.dispatch({ type: 'SET_GENERATING', flag: false });
    }
  });
}

/** Cancel the in-flight foreground generation and restore the prior state. */
function _cancelForeground() {
  if (_genAbort === null) return;
  _genAbort.abort();
  _genAbort = null;
  gameState.dispatch({ type: 'SET_GENERATING', flag: false });
  announce('Puzzle search cancelled.');
}

function _isInProgress(state) {
  if (!state.puzzle) return false;
  if (state.won) return false;
  for (let i = 0; i < 81; i++) {
    if (state.puzzle.givens[i] === 0 && state.pen[i] !== 0) return true;
  }
  return false;
}

// ── Step 9: persistence writer ─────────────────────────────────────────────
const PERSIST_KEYS = new Set(['puzzle', 'pen', 'pencil', 'hintsRemaining', 'attemptRecorded']);
let _persistTimer = null;

gameState.on('changed', ({ action, changed }) => {
  // Choosing a tier starts a new puzzle there (fspec-001 §9.3), superseding
  // any generation already pending. The preference is persisted only on this
  // explicit choice, so a stale async load can never overwrite it. Handled
  // before the won-board exit below: a finished game can change tier too.
  if (action.type === 'CHANGE_DIFFICULTY') {
    setItem(DIFF_KEY, action.difficulty);
    preferredTier = action.difficulty;
    _startNewPuzzle(action.difficulty, 'difficulty-select');
    return;
  }

  // Clear persisted state on explicit new puzzle or completed game.
  if (action.type === 'NEW_PUZZLE') {
    if (_persistTimer !== null) clearTimeout(_persistTimer);
    _persistTimer = null;
    removeItem(STATE_KEY);
    return;
  }

  const s = gameState.getState();
  if (s.won && s.winHandled) {
    if (_persistTimer !== null) clearTimeout(_persistTimer);
    _persistTimer = null;
    removeItem(STATE_KEY);
    return;
  }

  // Debounced state write for in-progress saves.
  if ([...changed].some(k => PERSIST_KEYS.has(k))) {
    if (_persistTimer !== null) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(_saveState, 100);
  }
});

function _saveState() {
  _persistTimer = null;
  const s = gameState.getState();
  if (!s.puzzle) return;
  if (s.won && s.winHandled) return;

  setItem(STATE_KEY, {
    version: 1,
    difficulty: s.puzzle.difficulty,
    puzzle: {
      id: s.puzzle.id,
      givens: Array.from(s.puzzle.givens),
      solution: Array.from(s.puzzle.solution),
      source: s.puzzle.source,
      gen: s.puzzle.gen,
    },
    pen: Array.from(s.pen),
    pencil: Array.from(s.pencil),
    hintsRemaining: s.hintsRemaining,
    attemptRecorded: s.attemptRecorded,
    savedAt: new Date().toISOString(),
  });
}

// ── Step 10: prime next puzzle ─────────────────────────────────────────────
puzzleProvider.primeNext(_generationTier(gameState.getState()));

// ── Step 11: loaded puzzles — share links and developer load-from-string ───
const loader = createPuzzleLoader({
  gameState,
  rateGivens: createLoadProvider().rateGivens,
  confirm: opts => new Promise(resolve => {
    openDialog({
      ...opts,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  }),
  // The loaded puzzle wins over anything still on its way: drop the in-flight
  // foreground generation (its late result fails the staleness check in
  // _requestForeground) and any dialog offering a different puzzle.
  beforeReplace() {
    _genAbort?.abort();
    _genAbort = null;
    closeDialog();
  },
});

const sharedPuzzle = new URLSearchParams(location.search).get(SHARE_PARAM);
if (sharedPuzzle !== null) {
  loader.load(sharedPuzzle, {
    source: 'link',
    onChecking: () => notice.show('Checking puzzle…', { variant: 'progress' }),
  }).then(outcome => {
    notice.show(outcome.message, outcome.status === 'rejected'
      ? { variant: 'error' }
      : { timeoutMs: 4000 });
    announce(outcome.message);

    // The link is spent whatever the outcome; a refresh must not replay it.
    const url = new URL(location.href);
    url.searchParams.delete(SHARE_PARAM);
    history.replaceState(history.state, '', url);
  });
}

// ── Step 12: developer tools (lazy — never fetched when the mode is off) ───
if (devMode) {
  import('./dev/devPanel.js').then(dev => dev.mount({
    gameState,
    loadPuzzle: text => loader.load(text, { source: 'string' }),
  }));
}
