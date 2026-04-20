/**
 * Tests for js/util/bitset.js — §2.3 (B1–B12)
 */

import { ALL, has, add, remove, count, iterate, fromDigits } from '/js/util/bitset.js';

describe('bitset.js', function () {

  // B1: ALL is 0b111111111 (511)
  it('B1: ALL is 511', function () {
    expect(ALL).to.equal(511);
  });

  // B2: has returns true/false correctly
  it('B2: has returns true for set digit, false for unset', function () {
    const set = 0b00101; // digits 1 and 3
    expect(has(set, 1)).to.be.true;
    expect(has(set, 3)).to.be.true;
    expect(has(set, 2)).to.be.false;
    expect(has(set, 4)).to.be.false;
  });

  // B3: add is idempotent
  it('B3: add is idempotent — adding already-set digit returns same set', function () {
    expect(add(ALL, 5)).to.equal(ALL);
    expect(add(ALL, 1)).to.equal(ALL);
    expect(add(ALL, 9)).to.equal(ALL);
  });

  // B4: add on empty sets single bit
  it('B4: add on empty set places exactly one bit', function () {
    expect(add(0, 5)).to.equal(0b000010000);
    expect(add(0, 1)).to.equal(0b000000001);
    expect(add(0, 9)).to.equal(0b100000000);
  });

  // B5: remove on present bit clears it
  it('B5: remove clears the bit for a present digit', function () {
    expect(remove(0b11, 1)).to.equal(0b10);
    expect(remove(ALL, 5)).to.equal(ALL ^ (1 << 4));
  });

  // B6: remove on absent bit is no-op
  it('B6: remove on absent digit is a no-op', function () {
    expect(remove(0b10, 1)).to.equal(0b10);
    expect(remove(0, 9)).to.equal(0);
  });

  // B7: count for 0, ALL, and random sets
  it('B7: count returns correct population count', function () {
    expect(count(0)).to.equal(0);
    expect(count(ALL)).to.equal(9);
    expect(count(0b10101)).to.equal(3);
    expect(count(0b1)).to.equal(1);
    expect(count(0b111000111)).to.equal(6);
  });

  // B8: iterate yields digits ascending
  it('B8: iterate yields digits in ascending order', function () {
    expect(iterate(0b010100001)).to.deep.equal([1, 3, 5]);
    expect(iterate(ALL)).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(iterate(0b100000001)).to.deep.equal([1, 9]);
  });

  // B9: iterate on 0 yields nothing
  it('B9: iterate on empty set yields []', function () {
    expect(iterate(0)).to.deep.equal([]);
  });

  // B10: fromDigits([]) → 0
  it('B10: fromDigits with empty array returns 0', function () {
    expect(fromDigits([])).to.equal(0);
  });

  // B11: fromDigits([1,2,3]) → 0b000000111
  it('B11: fromDigits constructs correct bitmask', function () {
    expect(fromDigits([1, 2, 3])).to.equal(0b000000111);
    expect(fromDigits([9])).to.equal(0b100000000);
    expect(fromDigits([1, 5, 9])).to.equal(0b100010001);
  });

  // B12: fromDigits with duplicates deduplicates
  it('B12: fromDigits with duplicate digits deduplicates', function () {
    expect(fromDigits([1, 1, 2])).to.equal(0b11);
    expect(fromDigits([5, 5, 5])).to.equal(1 << 4);
  });
});
