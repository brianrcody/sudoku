/**
 * @fileoverview Pseudo-random number generation utilities.
 */

/**
 * Mulberry32 PRNG. Returns a closure over the given seed; each call advances
 * state and returns the next float in [0, 1).
 *
 * @param {number} seed - Unsigned 32-bit integer seed.
 * @returns {function(): number}
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Generates a random unsigned 32-bit seed via the Web Crypto API.
 *
 * @returns {number} Unsigned 32-bit integer.
 */
export function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * Fisher-Yates in-place shuffle.
 *
 * @template T
 * @param {T[]} arr - Array to shuffle.
 * @param {function(): number} rng - RNG returning floats in [0, 1).
 * @returns {T[]} The same array, shuffled.
 */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
