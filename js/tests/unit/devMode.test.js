/**
 * @fileoverview Unit tests for js/dev/devMode.js (DM1–DM9).
 *
 * The global beforeEach clears localStorage, so every test starts with no
 * saved setting.
 */

import { initDevMode, isDevMode } from '../../dev/devMode.js';

const KEY = 'sudoku.dev.v1';

describe('dev/devMode.js', () => {
  afterEach(() => { initDevMode(''); });

  it('DM1: defaults to off with no parameter and nothing saved', () => {
    expect(initDevMode('')).to.be.false;
    expect(isDevMode()).to.be.false;
  });

  it('DM2: ?dev=1 turns it on and saves the setting', () => {
    expect(initDevMode('?dev=1')).to.be.true;
    expect(isDevMode()).to.be.true;
    expect(localStorage.getItem(KEY)).to.equal('true');
  });

  it('DM3: the saved setting applies when the parameter is absent', () => {
    initDevMode('?dev=1');
    expect(initDevMode('')).to.be.true;
    expect(isDevMode()).to.be.true;
  });

  it('DM4: ?dev=0 turns it off and clears the saved setting', () => {
    initDevMode('?dev=1');
    expect(initDevMode('?dev=0')).to.be.false;
    expect(isDevMode()).to.be.false;
    expect(localStorage.getItem(KEY)).to.be.null;
  });

  it('DM5: once cleared, a later load without the parameter stays off', () => {
    initDevMode('?dev=1');
    initDevMode('?dev=0');
    expect(initDevMode('')).to.be.false;
  });

  it('DM6: an unrecognized value keeps the saved setting (on)', () => {
    initDevMode('?dev=1');
    expect(initDevMode('?dev=yes')).to.be.true;
  });

  it('DM7: an unrecognized value keeps the saved setting (off)', () => {
    expect(initDevMode('?dev=true')).to.be.false;
    expect(localStorage.getItem(KEY)).to.be.null;
  });

  it('DM8: the parameter is found among others', () => {
    expect(initDevMode('?p=123&dev=1&x=y')).to.be.true;
  });

  it('DM9: a saved value other than true does not enable it', () => {
    localStorage.setItem(KEY, '"1"');
    expect(initDevMode('')).to.be.false;
  });
});
