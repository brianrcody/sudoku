/**
 * Tests for js/util/grid.js — §2.2
 */

import { rowOf, colOf, boxOf, cellIndex, PEERS, UNITS, UNITS_OF } from '/js/util/grid.js';

describe('grid.js', function () {

  // Precomputed reference table for spot-checks
  const expected = [
    { i: 0,  row: 0, col: 0, box: 0 },
    { i: 8,  row: 0, col: 8, box: 2 },
    { i: 9,  row: 1, col: 0, box: 0 },
    { i: 20, row: 2, col: 2, box: 0 },
    { i: 40, row: 4, col: 4, box: 4 },
    { i: 72, row: 8, col: 0, box: 6 },
    { i: 80, row: 8, col: 8, box: 8 },
  ];

  // G1: rowOf/colOf/boxOf for a representative set of all 81 indices
  it('G1: rowOf/colOf/boxOf correct for all 81 indices', function () {
    for (let i = 0; i < 81; i++) {
      expect(rowOf(i)).to.equal((i / 9) | 0, `rowOf(${i})`);
      expect(colOf(i)).to.equal(i % 9, `colOf(${i})`);
      const br = ((i / 9 | 0) / 3 | 0);
      const bc = ((i % 9) / 3 | 0);
      expect(boxOf(i)).to.equal(br * 3 + bc, `boxOf(${i})`);
    }
  });

  // Spot-check with reference values
  it('G1b: spot-check corner and center indices', function () {
    for (const { i, row, col, box } of expected) {
      expect(rowOf(i)).to.equal(row, `rowOf(${i})`);
      expect(colOf(i)).to.equal(col, `colOf(${i})`);
      expect(boxOf(i)).to.equal(box, `boxOf(${i})`);
    }
  });

  // G2: cellIndex is the inverse of rowOf/colOf
  it('G2: cellIndex is inverse of rowOf/colOf for all cells', function () {
    for (let i = 0; i < 81; i++) {
      expect(cellIndex(rowOf(i), colOf(i))).to.equal(i);
    }
  });

  // G3: PEERS[i] length 20, no duplicates, excludes i
  it('G3: PEERS[i] has length 20, no duplicates, excludes i', function () {
    for (let i = 0; i < 81; i++) {
      const peers = PEERS[i];
      expect(peers.length).to.equal(20, `PEERS[${i}].length`);
      expect(new Set(peers).size).to.equal(20, `PEERS[${i}] has duplicates`);
      expect(peers.includes(i)).to.be.false;
    }
  });

  // G4: UNITS has 27 length-9 arrays
  it('G4: UNITS has 27 length-9 arrays (9 rows + 9 cols + 9 boxes)', function () {
    expect(UNITS.length).to.equal(27);
    for (const unit of UNITS) {
      expect(unit.length).to.equal(9);
      expect(new Set(unit).size).to.equal(9); // no duplicates within a unit
    }
    // First 9 are rows
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        expect(UNITS[r][c]).to.equal(r * 9 + c);
      }
    }
    // Next 9 are columns
    for (let c = 0; c < 9; c++) {
      for (let r = 0; r < 9; r++) {
        expect(UNITS[9 + c][r]).to.equal(r * 9 + c);
      }
    }
    // Last 9 are boxes
    for (let b = 0; b < 9; b++) {
      const br = (b / 3) | 0;
      const bc = b % 3;
      for (let k = 0; k < 9; k++) {
        const kr = (k / 3) | 0;
        const kc = k % 3;
        expect(UNITS[18 + b][k]).to.equal((br * 3 + kr) * 9 + (bc * 3 + kc));
      }
    }
  });

  // G5: UNITS_OF[i] returns the 3 units each cell belongs to
  it('G5: UNITS_OF[i] returns 3 units for representative cells', function () {
    for (const idx of [0, 40, 80]) {
      const units = UNITS_OF[idx];
      expect(units.length).to.equal(3);
      // Each unit must contain idx
      for (const unit of units) {
        expect(unit.includes(idx)).to.be.true;
      }
      // Union of all 3 units minus idx should cover all 20 peers
      const unionSet = new Set();
      for (const unit of units) {
        for (const j of unit) {
          if (j !== idx) unionSet.add(j);
        }
      }
      // Must equal the set of peers
      const peerSet = new Set(PEERS[idx]);
      expect(unionSet.size).to.equal(peerSet.size);
      for (const j of peerSet) {
        expect(unionSet.has(j)).to.be.true;
      }
    }
  });

  // G6: Boundary indices
  it('G6: boundary indices 0, 8, 72, 80 have correct row/col/box', function () {
    expect(rowOf(0)).to.equal(0);  expect(colOf(0)).to.equal(0);  expect(boxOf(0)).to.equal(0);
    expect(rowOf(8)).to.equal(0);  expect(colOf(8)).to.equal(8);  expect(boxOf(8)).to.equal(2);
    expect(rowOf(72)).to.equal(8); expect(colOf(72)).to.equal(0); expect(boxOf(72)).to.equal(6);
    expect(rowOf(80)).to.equal(8); expect(colOf(80)).to.equal(8); expect(boxOf(80)).to.equal(8);
  });
});
