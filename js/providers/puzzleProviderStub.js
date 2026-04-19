/**
 * @fileoverview Stub PuzzleProvider for independent development and testing of
 * the App Brain. Returns canned puzzle data matching the real PuzzleProvider
 * interface exactly.
 *
 * Do NOT use in production; replaced by the real clientGenProvider-backed
 * puzzleProvider.js when the Puzzle Brain implementation is available.
 */

// A simple valid puzzle (from the classic SudokuWiki example).
const GIVENS = new Uint8Array([
  5,3,0, 0,7,0, 0,0,0,
  6,0,0, 1,9,5, 0,0,0,
  0,9,8, 0,0,0, 0,6,0,

  8,0,0, 0,6,0, 0,0,3,
  4,0,0, 8,0,3, 0,0,1,
  7,0,0, 0,2,0, 0,0,6,

  0,6,0, 0,0,0, 2,8,0,
  0,0,0, 4,1,9, 0,0,5,
  0,0,0, 0,8,0, 0,7,9,
]);

const SOLUTION = new Uint8Array([
  5,3,4, 6,7,8, 9,1,2,
  6,7,2, 1,9,5, 3,4,8,
  1,9,8, 3,4,2, 5,6,7,

  8,5,9, 7,6,1, 4,2,3,
  4,2,6, 8,5,3, 7,9,1,
  7,1,3, 9,2,4, 8,5,6,

  9,6,1, 5,3,7, 2,8,4,
  2,8,7, 4,1,9, 6,3,5,
  3,4,5, 2,8,6, 1,7,9,
]);

/**
 * @param {string} difficulty
 * @returns {object} Puzzle matching the Puzzle shape.
 */
function makePuzzle(difficulty) {
  return {
    id: 'stub-' + difficulty,
    difficulty,
    givens: GIVENS.slice(),
    solution: SOLUTION.slice(),
    solveTrace: [],
  };
}

// In-memory cache keyed by difficulty.
const cache = new Map();

/**
 * Returns a promise that resolves to a canned puzzle for the given difficulty.
 *
 * @param {{ difficulty: string, signal?: AbortSignal }} opts
 * @returns {Promise<object>}
 */
export function requestPuzzle({ difficulty, signal } = {}) {
  const cached = cache.get(difficulty);
  if (cached) {
    cache.delete(difficulty);
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    // Simulate a brief async delay.
    const id = setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      resolve(makePuzzle(difficulty));
    }, 50);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

/**
 * Returns a cached puzzle without consuming it, or null if none is ready.
 *
 * @param {string} difficulty
 * @returns {object|null}
 */
export function peekReady(difficulty) {
  return cache.get(difficulty) ?? null;
}

/**
 * Pre-generates and caches a puzzle for the given difficulty.
 *
 * @param {string} difficulty
 */
export function primeNext(difficulty) {
  if (!cache.has(difficulty)) {
    // Simulate background generation.
    setTimeout(() => {
      cache.set(difficulty, makePuzzle(difficulty));
    }, 10);
  }
}
