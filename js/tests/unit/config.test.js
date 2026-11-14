/**
 * @fileoverview Unit tests for the Unrated additions to js/config.js (CF1–CF4).
 */

import {
  DIFFICULTY_ORDER, UNRATED, isRatedTier,
  TIER_LABELS, HINT_LIMITS, CHECK_VISIBLE, CORRECTNESS_MODE,
  GIVEN_COUNT_TARGET, ATTEMPT_BUDGET,
} from '../../config.js';

describe('config.js — Unrated', () => {
  it('CF1: isRatedTier is true for every generatable tier', () => {
    for (const tier of DIFFICULTY_ORDER) expect(isRatedTier(tier), tier).to.be.true;
  });

  it('CF2: isRatedTier is false for Unrated, unknown, and missing values', () => {
    expect(isRatedTier(UNRATED)).to.be.false;
    expect(isRatedTier('beyond-nightmare')).to.be.false;
    expect(isRatedTier(undefined)).to.be.false;
    expect(isRatedTier(null)).to.be.false;
  });

  it('CF3: Unrated has a row in every per-puzzle behavior table', () => {
    expect(TIER_LABELS[UNRATED]).to.equal('Unrated');
    expect(HINT_LIMITS[UNRATED]).to.equal(0);
    expect(CHECK_VISIBLE[UNRATED]).to.be.true;
    expect(CORRECTNESS_MODE[UNRATED]).to.equal('on-demand');
  });

  it('CF4: Unrated is not a generatable tier', () => {
    expect(DIFFICULTY_ORDER).to.not.include(UNRATED);
    expect(GIVEN_COUNT_TARGET).to.not.have.property(UNRATED);
    expect(ATTEMPT_BUDGET).to.not.have.property(UNRATED);
  });
});
