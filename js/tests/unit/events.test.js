/**
 * Tests for js/util/events.js — §2.4 (EV1–EV10)
 */

import { createEmitter, diagnostics } from '/js/util/events.js';

describe('events.js', function () {

  // EV1: on/emit basic delivery
  it('EV1: on/emit delivers payload to listener', function () {
    const emitter = createEmitter();
    let received;
    emitter.on('test', payload => { received = payload; });
    emitter.emit('test', 42);
    expect(received).to.equal(42);
  });

  // EV2: Listener added during emit not fired for current emit
  it('EV2: listener added during emit does not fire for current emit', function () {
    const emitter = createEmitter();
    let lateCount = 0;
    emitter.on('x', () => {
      emitter.on('x', () => { lateCount++; });
    });
    emitter.emit('x');
    expect(lateCount).to.equal(0);
    emitter.emit('x');
    expect(lateCount).to.equal(1);
  });

  // EV3: Listener removed during emit does not fire if not yet called
  it('EV3: listener removed during emit does not fire if it has not been called yet', function () {
    const emitter = createEmitter();
    let secondCalled = false;
    const second = () => { secondCalled = true; };
    emitter.on('x', () => { emitter.off('x', second); });
    emitter.on('x', second);
    emitter.emit('x');
    expect(secondCalled).to.be.false;
  });

  // EV4: Re-entrant emit runs to completion
  it('EV4: re-entrant emit completes inner before outer resumes', function () {
    const emitter = createEmitter();
    const log = [];
    emitter.on('outer', () => {
      log.push('outer-before');
      emitter.emit('inner');
      log.push('outer-after');
    });
    emitter.on('inner', () => { log.push('inner'); });
    emitter.emit('outer');
    expect(log).to.deep.equal(['outer-before', 'inner', 'outer-after']);
  });

  // EV5: Listener throw logged; remaining listeners still fire
  it('EV5: throwing listener logs error but does not stop remaining listeners', function () {
    const emitter = createEmitter();
    const errors = [];
    const originalError = console.error.bind(console);
    console.error = (...args) => { errors.push(args); };

    let secondCalled = false;
    emitter.on('x', () => { throw new Error('boom'); });
    emitter.on('x', () => { secondCalled = true; });

    try {
      emitter.emit('x');
    } finally {
      console.error = originalError;
    }

    expect(secondCalled).to.be.true;
    expect(errors.length).to.equal(1);
  });

  // EV6: Emit to unknown type is no-op
  it('EV6: emit to unknown type does not throw', function () {
    const emitter = createEmitter();
    expect(() => emitter.emit('no-such-type', 123)).to.not.throw();
  });

  // EV7: unsubscribe is idempotent
  it('EV7: calling unsubscribe twice is a no-op the second time', function () {
    const emitter = createEmitter();
    let count = 0;
    const unsub = emitter.on('x', () => { count++; });
    unsub();
    unsub(); // second call — must not throw
    emitter.emit('x');
    expect(count).to.equal(0);
  });

  // EV8: off by reference
  it('EV8: off removes listener by reference', function () {
    const emitter = createEmitter();
    let called = false;
    const fn = () => { called = true; };
    emitter.on('x', fn);
    emitter.off('x', fn);
    emitter.emit('x');
    expect(called).to.be.false;
  });

  // EV9: clear() clears all types
  it('EV9: clear() removes all listeners for all types', function () {
    const emitter = createEmitter();
    let aCount = 0;
    let bCount = 0;
    emitter.on('a', () => { aCount++; });
    emitter.on('b', () => { bCount++; });
    emitter.clear();
    emitter.emit('a');
    emitter.emit('b');
    expect(aCount).to.equal(0);
    expect(bCount).to.equal(0);
  });

  // EV10: clear(type) clears one type only
  it('EV10: clear(type) clears only the specified type', function () {
    const emitter = createEmitter();
    let aCount = 0;
    let bCount = 0;
    emitter.on('a', () => { aCount++; });
    emitter.on('b', () => { bCount++; });
    emitter.clear('a');
    emitter.emit('a');
    emitter.emit('b');
    expect(aCount).to.equal(0);
    expect(bCount).to.equal(1);
  });

  describe('listener errors on the diagnostics channel', function () {
    /**
     * Runs `act` with console.error and the diagnostics `listener-error` event
     * both recorded, in order, into one log.
     */
    function withErrorLog(act) {
      const log = [];
      const originalError = console.error;
      console.error = (...args) => { log.push({ via: 'console', args }); };
      const off = diagnostics.on('listener-error', payload => { log.push({ via: 'diagnostics', payload }); });
      try {
        act();
      } finally {
        console.error = originalError;
        off();
      }
      return log;
    }

    function emitterReport(emitter) {
      const boom = new Error('boom');
      let laterCalled = false;
      emitter.on('x', () => { throw boom; });
      emitter.on('x', () => { laterCalled = true; });
      const log = withErrorLog(() => emitter.emit('x', 42));
      return { boom, laterCalled, log };
    }

    it('EV11: by default a throwing listener is logged and reported as listener-error', function () {
      const { boom, laterCalled, log } = emitterReport(createEmitter());

      expect(log.filter(e => e.via === 'console')).to.have.length(1);
      expect(log.filter(e => e.via === 'diagnostics').map(e => e.payload))
        .to.deep.equal([{ error: boom, type: 'x', payload: 42 }]);
      expect(laterCalled).to.be.true;
    });

    it('EV12: createEmitter({}) reports listener errors like the default', function () {
      const { boom, laterCalled, log } = emitterReport(createEmitter({}));

      expect(log.filter(e => e.via === 'console')).to.have.length(1);
      expect(log.filter(e => e.via === 'diagnostics').map(e => e.payload))
        .to.deep.equal([{ error: boom, type: 'x', payload: 42 }]);
      expect(laterCalled).to.be.true;
    });

    it('EV13: with reportErrors false a throwing listener is only logged', function () {
      const { laterCalled, log } = emitterReport(createEmitter({ reportErrors: false }));

      expect(log.map(e => e.via)).to.deep.equal(['console']);
      expect(laterCalled).to.be.true;
    });

    it('EV14: the console log precedes the diagnostics report', function () {
      const { log } = emitterReport(createEmitter());

      expect(log.map(e => e.via)).to.deep.equal(['console', 'diagnostics']);
    });

    it('EV15: a throwing diagnostics listener is logged and not reported again', function () {
      const offThrowing = diagnostics.on('swallowed', () => { throw new Error('listener failed'); });

      let log;
      try {
        log = withErrorLog(() => diagnostics.emit('swallowed', { where: 'test', error: new Error('x') }));
      } finally {
        offThrowing();
      }

      expect(log.map(e => e.via)).to.deep.equal(['console']);
    });
  });
});
