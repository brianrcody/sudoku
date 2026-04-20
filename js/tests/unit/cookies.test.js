/**
 * @fileoverview Unit tests for js/persist/cookies.js (CK1–CK7).
 *
 * Relies on real document.cookie. setup.js clears all cookies in beforeEach.
 */

import * as cookies from '../../persist/cookies.js';

describe('persist/cookies.js', () => {

  // CK1: get returns value when set
  it('CK1: get returns the value of a cookie that was set', () => {
    cookies.set('test-ck1', 'hello');
    expect(cookies.get('test-ck1')).to.equal('hello');
  });

  // CK2: get returns null when absent
  it('CK2: get returns null for a cookie that was never set', () => {
    expect(cookies.get('nonexistent-cookie-xyz')).to.be.null;
  });

  // CK3: get decodes URL-encoded value
  it('CK3: round-trip preserves a value with spaces (URL-encoded)', () => {
    // The cookies module does not encode the value itself — callers pre-encode.
    // Test that raw encoded storage round-trips.
    const raw = encodeURIComponent('hello world');
    cookies.set('test-ck3', raw);
    // get() decodes the retrieved value.
    expect(cookies.get('test-ck3')).to.equal('hello world');
  });

  // CK4: set writes with default options (path=/)
  it('CK4: set makes cookie readable immediately', () => {
    cookies.set('test-ck4', 'value4');
    expect(cookies.get('test-ck4')).to.equal('value4');
  });

  // CK5: set honors maxAge
  it('CK5: set with explicit maxAge still produces a readable cookie', () => {
    cookies.set('test-ck5', 'value5', { maxAge: 3600 });
    expect(cookies.get('test-ck5')).to.equal('value5');
  });

  // CK6: remove deletes the cookie
  it('CK6: remove makes cookie unreadable', () => {
    cookies.set('test-ck6', 'to-be-removed');
    expect(cookies.get('test-ck6')).to.equal('to-be-removed');
    cookies.remove('test-ck6');
    expect(cookies.get('test-ck6')).to.be.null;
  });

  // CK7: Multiple cookies are isolated from each other
  it('CK7: two distinct cookies can coexist and are read independently', () => {
    cookies.set('test-ck7-a', 'alpha');
    cookies.set('test-ck7-b', 'beta');
    expect(cookies.get('test-ck7-a')).to.equal('alpha');
    expect(cookies.get('test-ck7-b')).to.equal('beta');
  });
});
