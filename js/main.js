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

import { cookieStatsStore } from './providers/cookieStatsStore.js';
import { createStatsProvider } from './providers/statsProvider.js';
import { createStatistics } from './game/statistics.js';
import { requestPuzzle, peekReady, primeNext } from './providers/puzzleProvider.js';
import { nextHint } from './providers/hintProvider.js';
import { createGameState } from './game/state.js';
import { getItem, setItem, removeItem } from './persist/storage.js';
import { DIFFICULTY_ORDER, HINT_LIMITS } from './config.js';

// ── Step 2: reconcile cookie with classList ────────────────────────────────
// The inline head <script> already applied the theme class to <body>. initTheme()
// reads the cookie and re-applies, handling any drift between the two.
initTheme();

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

// ── Step 7: restore or request puzzle ─────────────────────────────────────
const STATE_KEY = 'sudoku.state.v1';
const DIFF_KEY = 'sudoku.currentDifficulty.v1';

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
  gameState.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…' });
  puzzleProvider.requestPuzzle({ difficulty: currentDifficulty }).then(puzzle => {
    gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });
  }).catch(err => {
    console.error('[main] Failed to generate puzzle:', err);
    gameState.dispatch({ type: 'SET_GENERATING', flag: false });
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
  gameState.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…' });
  puzzleProvider.requestPuzzle({ difficulty }).then(puzzle => {
    gameState.dispatch({ type: 'NEW_PUZZLE', difficulty, puzzle });
    removeItem(STATE_KEY);
    announce('New puzzle started.');
    document.getElementById('btn-new')?.focus();
  }).catch(err => {
    console.error('[main] Failed to generate new puzzle:', err);
    gameState.dispatch({ type: 'SET_GENERATING', flag: false });
  });
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
    removeItem(STATE_KEY);
  }

  const s = gameState.getState();
  if (s.won && s.winHandled) {
    removeItem(STATE_KEY);
    return;
  }

  // Persist current difficulty immediately on any puzzle change.
  if (changed.has('puzzle') && s.puzzle?.difficulty) {
    setItem(DIFF_KEY, s.puzzle.difficulty);
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
