/**
 * @fileoverview Puzzle provider singleton. Constructs a single ClientGenProvider
 * (and therefore a single Worker) at module load time and exports its methods.
 *
 * Per aspec §4.16: the module exports an instance constructed with the single Worker.
 */

import { createClientGenProvider } from './clientGenProvider.js';

const _provider = createClientGenProvider();

/**
 * Request a puzzle. Fulfils from cache if available; otherwise generates via Worker.
 *
 * @param {{ difficulty: string, signal?: AbortSignal }} opts
 * @returns {Promise<import('./clientGenProvider.js').Puzzle>}
 */
export const requestPuzzle = _provider.requestPuzzle.bind(_provider);

/**
 * Check if a pre-generated puzzle for `difficulty` is already cached.
 *
 * @param {string} difficulty
 * @returns {import('./clientGenProvider.js').Puzzle|null}
 */
export const peekReady = _provider.peekReady.bind(_provider);

/**
 * Trigger background pre-generation for `difficulty` if no cache entry exists.
 *
 * @param {string} difficulty
 */
export const primeNext = _provider.primeNext.bind(_provider);
