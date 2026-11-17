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
import { createForegroundGenerator } from './game/foreground.js';
import { createPuzzleLoader } from './game/puzzleLoader.js';
import { createLoadProvider } from './providers/loadProvider.js';
import { getItem, setItem, removeItem } from './persist/storage.js';
import { initDevMode, isDevMode } from './dev/devMode.js';
import { HINT_LIMITS, SHARE_PARAM } from './config.js';
import { diagnostics } from './util/events.js';

// ── Step 1.5: developer-mode flag (?dev=1 / ?dev=0, persisted) ─────────────
// With the mode on, the recorder exists before the game state, so no dispatch
// can precede it.
const devMode = initDevMode(location.search);
const devBoot = devMode ? (await import('./dev/devBoot.js')).boot() : null;

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
const hintProvider = devBoot ? devBoot.wrapHintProvider({ nextHint }) : { nextHint };

// ── Step 6: game state ────────────────────────────────────────────────────
const gameState = createGameState({
  stats, hintProvider, statsSuppressed: isDevMode, tap: devBoot?.tap ?? null,
});
if (typeof window !== 'undefined') window.gameState = gameState;

// ── Step 7: restore or request puzzle ─────────────────────────────────────
const STATE_KEY = 'sudoku.state.v1';
const DIFF_KEY = 'sudoku.currentDifficulty.v1';

const foreground = createForegroundGenerator({
  gameState,
  requestPuzzle: puzzleProvider.requestPuzzle,
  openDialog, announce, diagnostics,
  preference: { read: () => getItem(DIFF_KEY), write: tier => setItem(DIFF_KEY, tier) },
});

const savedBlob = getItem(STATE_KEY);
const restorable = savedBlob && savedBlob.version === 1 && savedBlob.puzzle;

if (restorable) {
  // Restore in-progress game from localStorage.
  const puzzle = {
    id: savedBlob.puzzle.id,
    difficulty: savedBlob.difficulty ?? foreground.preferredTier(),
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
}

// Recording starts here: the restore burst above is one "page reloaded" entry,
// and the boot request below is recorded.
devBoot?.bootComplete(gameState);

if (!restorable) {
  // No saved state — request a new puzzle.
  foreground.request(foreground.preferredTier(), puzzle => {
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
  { onCancel: foreground.cancel }
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
      onConfirm: () => foreground.startNew(foreground.generationTier(state), _afterNewPuzzle('btn-new')),
    });
  } else {
    foreground.startNew(foreground.generationTier(state), _afterNewPuzzle('btn-new'));
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
 * @param {string} focusId - Control that takes focus once the puzzle loads:
 *   the one the player started it from.
 * @returns {function(): void} The `afterLoad` callback for `foreground.startNew`.
 */
function _afterNewPuzzle(focusId) {
  return () => {
    removeItem(STATE_KEY);
    document.getElementById(focusId)?.focus();
  };
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
    foreground.chooseTier(action.difficulty);
    foreground.startNew(action.difficulty, _afterNewPuzzle('difficulty-select'));
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
puzzleProvider.primeNext(foreground.generationTier(gameState.getState()));

// ── Step 11: loaded puzzles — share links and developer load-from-string ───
// One load worker, shared with the developer tools.
const loadProvider = createLoadProvider();
const confirm = opts => new Promise(resolve => {
  openDialog({
    ...opts,
    onConfirm: () => resolve(true),
    onCancel: () => resolve(false),
  });
});

const loader = createPuzzleLoader({
  gameState,
  rateGivens: loadProvider.rateGivens,
  confirm,
  // The loaded puzzle wins over anything still on its way: drop the in-flight
  // foreground generation (its late result fails the staleness check in
  // foreground.request) and any dialog offering a different puzzle.
  beforeReplace() {
    foreground.abort('replaced');
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
    loadPuzzle: (text, opts) => loader.load(text, { source: 'string', ...opts }),
    dev: devBoot,
    confirm,
    generateSeeded: foreground.generateSeeded,
    getGenerationTier: () => foreground.generationTier(gameState.getState()),
    beforeReplace: () => { foreground.abort('replaced'); closeDialog(); },
    checkPuzzles: loadProvider.checkPuzzles,
  }));
}
