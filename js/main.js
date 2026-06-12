/**
 * @fileoverview App bootstrap. Instantiates all modules, wires providers to the
 * game layer, mounts UI, and wires persistence.
 *
 * Steps follow aspec §4.1.1 exactly.
 */

import { initTheme, bindThemeSelect } from './ui/themes.js';
import { mount as mountSrLive, announce } from './ui/srLive.js';
import { mount as mountDialog, open as openDialog } from './ui/dialog.js';
import { mount as mountGrid } from './ui/grid.js';
import { mount as mountNumpad } from './ui/numpad.js';
import { mount as mountControls } from './ui/controls.js';
import { mount as mountStats } from './ui/stats.js';
import { mount as mountWinBanner } from './ui/winBanner.js';
import { mount as mountKeyboard } from './ui/keyboard.js';
import { mount as mountCoach } from './ui/coach.js';
import { mount as mountCoachOverlay } from './ui/coachOverlay.js';
import { mount as mountBusy } from './ui/busy.js';

import { cookieStatsStore } from './providers/cookieStatsStore.js';
import { migrateTierIds } from './persist/migrate.js';
import { createStatsProvider } from './providers/statsProvider.js';
import { createStatistics } from './game/statistics.js';
import { requestPuzzle, peekReady, primeNext } from './providers/puzzleProvider.js';
import { nextHint } from './providers/hintProvider.js';
import { createGameState } from './game/state.js';
import { getItem, setItem, removeItem } from './persist/storage.js';
import { DIFFICULTY_ORDER, HINT_LIMITS, TIER_LABELS } from './config.js';

// ── Step 2: reconcile cookie with classList ────────────────────────────────
// The inline head <script> already applied the theme class to <body>. initTheme()
// reads the cookie and re-applies, handling any drift between the two.
initTheme();

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
const gameState = createGameState({ stats, hintProvider });
if (typeof window !== 'undefined') window.gameState = gameState;

// ── Step 7: restore or request puzzle ─────────────────────────────────────
const STATE_KEY = 'sudoku.state.v1';
const DIFF_KEY = 'sudoku.currentDifficulty.v1';

/** Tiers whose budget-exhaustion fallback prompts the user (fspec-003 §5.4). */
const HONEST_FALLBACK_TIERS = new Set(['diabolical', 'nightmare']);

/** @type {AbortController|null} Controller for the in-flight foreground request. */
let _genAbort = null;

const savedDiffPref = getItem(DIFF_KEY);
let currentDifficulty = (savedDiffPref && DIFFICULTY_ORDER.includes(savedDiffPref))
  ? savedDiffPref
  : 'easy';

const savedBlob = getItem(STATE_KEY);

if (savedBlob && savedBlob.version === 1 && savedBlob.puzzle) {
  // Restore in-progress game from localStorage.
  currentDifficulty = savedBlob.difficulty ?? currentDifficulty;
  const puzzle = {
    id: savedBlob.puzzle.id,
    difficulty: currentDifficulty,
    givens: new Uint8Array(savedBlob.puzzle.givens),
    solution: new Uint8Array(savedBlob.puzzle.solution),
    solveTrace: [],
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
    hintsRemaining: savedBlob.hintsRemaining ?? HINT_LIMITS[currentDifficulty],
  });

} else {
  // No saved state — request a new puzzle.
  _requestForeground(currentDifficulty, puzzle => {
    gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });
  });
}

// ── Step 8: mount UI modules ───────────────────────────────────────────────
mountSrLive(document.body);
mountDialog(document.getElementById('dialog-root'));

const themeSelect = document.getElementById('theme-select');
if (themeSelect) bindThemeSelect(themeSelect);

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

// ── Wire action buttons (New Puzzle + Reset) ───────────────────────────────

document.getElementById('btn-new')?.addEventListener('click', () => {
  const state = gameState.getState();
  const inProgress = _isInProgress(state);

  if (inProgress) {
    openDialog({
      title: 'Start a new puzzle?',
      body: 'Your current progress will be lost.',
      confirmLabel: 'New Puzzle',
      onConfirm: () => _startNewPuzzle(state.puzzle?.difficulty ?? currentDifficulty),
    });
  } else {
    _startNewPuzzle(state.puzzle?.difficulty ?? currentDifficulty);
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

function _startNewPuzzle(difficulty) {
  _requestForeground(difficulty, puzzle => {
    gameState.dispatch({ type: 'NEW_PUZZLE', difficulty: puzzle.difficulty, puzzle });
    removeItem(STATE_KEY);
    announce('New puzzle started.');
    document.getElementById('btn-new')?.focus();
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

  // Persist difficulty only on explicit user change. Async PUZZLE_LOADED for a
  // stale request must not overwrite the user's most recent CHANGE_DIFFICULTY.
  if (action.type === 'CHANGE_DIFFICULTY') {
    setItem(DIFF_KEY, action.difficulty);
    // A difficulty change while a foreground generation is pending acts as
    // Cancel (fspec-003 §10.1); the user starts the next puzzle explicitly.
    if (_genAbort !== null) _cancelForeground();
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
    },
    pen: Array.from(s.pen),
    pencil: Array.from(s.pencil),
    hintsRemaining: s.hintsRemaining,
    attemptRecorded: s.attemptRecorded,
    savedAt: new Date().toISOString(),
  });
}

// ── Step 10: prime next puzzle ─────────────────────────────────────────────
puzzleProvider.primeNext(currentDifficulty);
