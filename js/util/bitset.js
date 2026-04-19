/**
 * @fileoverview 9-bit candidate set helpers. Candidates are digits 1–9;
 * digit d maps to bit (1 << (d - 1)).
 */

/** @type {number} Bitmask with all 9 digits present. */
export const ALL = 0b111111111;

/**
 * @param {number} set
 * @param {number} digit - 1–9
 * @returns {boolean}
 */
export function has(set, digit) {
  return (set & (1 << (digit - 1))) !== 0;
}

/**
 * @param {number} set
 * @param {number} digit - 1–9
 * @returns {number}
 */
export function add(set, digit) {
  return set | (1 << (digit - 1));
}

/**
 * @param {number} set
 * @param {number} digit - 1–9
 * @returns {number}
 */
export function remove(set, digit) {
  return set & ~(1 << (digit - 1));
}

/**
 * Population count for a 9-bit set.
 *
 * @param {number} set
 * @returns {number}
 */
export function count(set) {
  // Kernighan's method is fine for 9 bits.
  let n = 0;
  let s = set & ALL;
  while (s) {
    s &= s - 1;
    n++;
  }
  return n;
}

/**
 * Returns an array of digits present in the set, in ascending order.
 *
 * @param {number} set
 * @returns {number[]}
 */
export function iterate(set) {
  const digits = [];
  let s = set & ALL;
  while (s) {
    // Isolate lowest set bit; count trailing zeros to get the 0-based position.
    const bit = s & -s;
    // 31 - Math.clz32(bit) gives the bit index for values up to 2^31-1.
    digits.push((31 - Math.clz32(bit)) + 1);
    s &= s - 1;
  }
  return digits;
}

/**
 * Builds a bitset from an array of digits.
 *
 * @param {number[]} arr - Array of digits 1–9.
 * @returns {number}
 */
export function fromDigits(arr) {
  let set = 0;
  for (const d of arr) {
    set |= 1 << (d - 1);
  }
  return set;
}
