/**
 * @fileoverview Global test helpers loaded before all test files.
 *
 * Provides:
 * - beforeEach hook that resets shared DOM/storage state
 * - makeFakeGameState factory for UI unit tests
 * - defaultState fixture matching GameState shape
 */

// ---------------------------------------------------------------------------
// Global beforeEach: clean shared state between every test
// ---------------------------------------------------------------------------

beforeEach(function () {
  // Clear localStorage.
  try { localStorage.clear(); } catch { /* disabled in some contexts */ }

  // Clear all cookies.
  try {
    document.cookie.split(';').forEach(function (c) {
      const name = c.trim().split('=')[0];
      if (name) {
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      }
    });
  } catch { /* ignore */ }

  // Reset body class to default theme.
  document.body.className = 'theme-minimalist';
});

// ---------------------------------------------------------------------------
// defaultState: matches GameState shape from js/game/state.js
// ---------------------------------------------------------------------------

export const defaultState = {
  puzzle: {
    id: 'test-id',
    difficulty: 'easy',
    givens: new Uint8Array(81),
    solution: new Uint8Array(81).fill(1), // placeholder
    solveTrace: [],
  },
  pen: new Uint8Array(81),
  pencil: new Uint16Array(81),
  selected: null,
  activeMode: 'pen',
  conflicts: new Set(),
  incorrect: new Set(),
  incorrectShownUntil: 0,
  hintsRemaining: 3,
  attemptRecorded: false,
  won: false,
  winHandled: false,
  generating: false,
  generatingMessage: '',
};

// ---------------------------------------------------------------------------
// makeFakeGameState: factory for UI unit tests
// ---------------------------------------------------------------------------

/**
 * Creates a minimal fake GameState for unit testing UI modules.
 *
 * @param {Partial<typeof defaultState>} [overrides]
 * @returns {{ dispatch: function, getState: function, on: function, _listeners: Map }}
 */
export function makeFakeGameState(overrides = {}) {
  const state = { ...defaultState, ...overrides };
  const _listeners = new Map();

  const calls = [];

  function dispatch(action) {
    calls.push(action);
  }

  function getState() {
    return state;
  }

  function on(type, fn) {
    if (!_listeners.has(type)) _listeners.set(type, []);
    _listeners.get(type).push(fn);
    return function unsubscribe() {
      const ls = _listeners.get(type);
      if (ls) {
        const idx = ls.indexOf(fn);
        if (idx !== -1) ls.splice(idx, 1);
      }
    };
  }

  /** Trigger a 'changed' event with the given payload. */
  function _emit(type, payload) {
    const ls = _listeners.get(type);
    if (ls) ls.slice().forEach(fn => fn(payload));
  }

  dispatch.calls = calls;

  return { dispatch, getState, on, _listeners, _emit };
}

// Expose helpers globally for convenience in test files.
window.makeFakeGameState = makeFakeGameState;
window.defaultState = defaultState;
