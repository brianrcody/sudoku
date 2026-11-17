/**
 * @fileoverview Logging switches and console writers
 * (tspec-debug-instrumentation DL1–DL9).
 */

import { createDevLog, CATEGORIES, LOGGING_KEY } from '../../dev/devLog.js';
import { diagnostics } from '../../util/events.js';

const DEFAULTS = { generation: true, swallowed: true, actions: false };

/** Console stand-in: every call as `[method, ...args]`. */
function fakeOut() {
  const lines = [];
  return { lines, log: (...args) => lines.push(['log', ...args]), warn: (...args) => lines.push(['warn', ...args]) };
}

/** Storage stand-in holding `saved` under the logging key. */
function fakeStorage(saved = null) {
  const writes = [];
  return {
    writes,
    getItem: key => (key === LOGGING_KEY ? saved : null),
    setItem: (key, value) => writes.push([key, value]),
  };
}

describe('dev/devLog.js', () => {
  let logs;
  const make = deps => {
    const log = createDevLog(deps);
    logs.push(log);
    return log;
  };

  beforeEach(() => { logs = []; });
  afterEach(() => { for (const log of logs) log.dispose(); });

  it('exports the three categories with their tags, labels and defaults', () => {
    expect(CATEGORIES).to.deep.equal({
      generation: { tag: '[dev:gen]', label: 'Generation worker', def: true },
      swallowed: { tag: '[dev:swallowed]', label: 'Swallowed exceptions', def: true },
      actions: { tag: '[dev:action]', label: 'Action trace', def: false },
    });
    expect(LOGGING_KEY).to.equal('sudoku.dev.logging.v1');
  });

  it('DL1: with nothing stored the switches take their defaults', () => {
    expect(make({ out: fakeOut(), storage: fakeStorage() }).get()).to.deep.equal(DEFAULTS);
  });

  describe('DL2: per-key defaults', () => {
    const cases = [
      ['a valid stored key is kept', { actions: true }, { ...DEFAULTS, actions: true }],
      ['a non-boolean value takes the default', { generation: 'yes', swallowed: false }, { ...DEFAULTS, swallowed: false }],
      ['a stored non-object takes every default', 'on', DEFAULTS],
    ];
    for (const [label, saved, expected] of cases) {
      it(label, () => {
        expect(make({ out: fakeOut(), storage: fakeStorage(saved) }).get()).to.deep.equal(expected);
      });
    }

    it('unreadable storage takes every default', () => {
      localStorage.setItem(LOGGING_KEY, '{not json');

      expect(make({ out: fakeOut() }).get()).to.deep.equal(DEFAULTS);
    });
  });

  describe('DL3: set', () => {
    it('a change returns true, is stored and emits change', () => {
      const storage = fakeStorage();
      const log = make({ out: fakeOut(), storage });
      const changes = [];
      log.on('change', s => changes.push(s));

      const changed = log.set('actions', true);

      expect(changed).to.equal(true);
      expect(log.get()).to.deep.equal({ ...DEFAULTS, actions: true });
      expect(storage.writes).to.deep.equal([[LOGGING_KEY, { ...DEFAULTS, actions: true }]]);
      expect(changes).to.deep.equal([{ ...DEFAULTS, actions: true }]);
    });

    it('setting the current value returns false, writes nothing and emits nothing', () => {
      const storage = fakeStorage();
      const log = make({ out: fakeOut(), storage });
      const changes = [];
      log.on('change', s => changes.push(s));

      expect(log.set('generation', true)).to.equal(false);
      expect(storage.writes).to.deep.equal([]);
      expect(changes).to.deep.equal([]);
    });

    it('the stored switches are read back by the next log', () => {
      make({ out: fakeOut() }).set('swallowed', false);

      expect(make({ out: fakeOut() }).get()).to.deep.equal({ ...DEFAULTS, swallowed: false });
    });

    it('a throwing change listener is logged and contained, not reported', () => {
      const log = make({ out: fakeOut(), storage: fakeStorage() });
      log.on('change', () => { throw new Error('panel bug'); });
      const reported = [];
      const off = diagnostics.on('listener-error', e => reported.push(e));
      const logged = [];
      const original = console.error;
      console.error = (...args) => logged.push(args);

      let changed;
      try {
        changed = log.set('actions', true);
      } finally {
        console.error = original;
        off();
      }

      expect(changed).to.equal(true);
      expect(logged.map(([err]) => err.message)).to.deep.equal(['panel bug']);
      expect(reported).to.deep.equal([]);
    });

    it('get returns a copy', () => {
      const log = make({ out: fakeOut(), storage: fakeStorage() });

      log.get().actions = true;

      expect(log.get().actions).to.equal(false);
    });
  });

  it('DL4: with storage unavailable a change still takes effect for this page', () => {
    const log = make({ out: fakeOut() });
    const target = Object.prototype.hasOwnProperty.call(localStorage, 'setItem') ? localStorage : Storage.prototype;
    const original = target.setItem;
    target.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };

    let changed;
    try {
      changed = log.set('actions', true);
    } finally {
      target.setItem = original;
    }

    expect(changed).to.equal(true);
    expect(log.get().actions).to.equal(true);
    expect(localStorage.getItem(LOGGING_KEY)).to.equal(null);
  });

  describe('DL5: generation output', () => {
    it('on: each generation event is logged with its tag', () => {
      const out = fakeOut();
      make({ out, storage: fakeStorage() });
      const data = { event: 'request', tier: 'easy', seed: 7, kind: 'foreground' };

      diagnostics.emit('generation', data);

      expect(out.lines).to.deep.equal([['log', '[dev:gen]', 'request', data]]);
    });

    it('off: nothing is logged', () => {
      const out = fakeOut();
      make({ out, storage: fakeStorage({ generation: false }) });

      diagnostics.emit('generation', { event: 'request' });

      expect(out.lines).to.deep.equal([]);
    });
  });

  describe('DL6: swallowed output', () => {
    it('on: each swallowed exception is warned with its tag and place', () => {
      const out = fakeOut();
      make({ out, storage: fakeStorage() });
      const error = new Error('quota');

      diagnostics.emit('swallowed', { where: 'storage.setItem', error });

      expect(out.lines).to.deep.equal([['warn', '[dev:swallowed]', 'storage.setItem', error]]);
    });

    it('off: nothing is logged', () => {
      const out = fakeOut();
      make({ out, storage: fakeStorage({ swallowed: false }) });

      diagnostics.emit('swallowed', { where: 'storage.setItem', error: new Error('quota') });

      expect(out.lines).to.deep.equal([]);
    });
  });

  describe('DL7: action trace', () => {
    const entry = { a: { type: 'SELECT_CELL', index: 4 } };

    it('on, with changed parts: kind, data, parts and duration', () => {
      const out = fakeOut();
      const log = make({ out, storage: fakeStorage({ actions: true }) });

      log.action(entry, ['selected'], 1.23);

      expect(out.lines).to.deep.equal([['log', '[dev:action]', 'SELECT_CELL', entry.a, ['selected'], '1.2 ms']]);
    });

    it('on, with nothing changed: "no change", and follow-ups shown as then', () => {
      const out = fakeOut();
      const log = make({ out, storage: fakeStorage({ actions: true }) });
      const withFollowUps = { ...entry, f: [{ type: 'COACH_FOCUS_OFF' }] };

      log.action(withFollowUps, [], 0.04);

      expect(out.lines).to.deep.equal([['log', '[dev:action]', 'SELECT_CELL',
        { type: 'SELECT_CELL', index: 4, then: [{ type: 'COACH_FOCUS_OFF' }] }, 'no change', '0.0 ms']]);
    });

    it('off: nothing is logged', () => {
      const out = fakeOut();
      const log = make({ out, storage: fakeStorage() });

      log.action(entry, ['selected'], 1);

      expect(out.lines).to.deep.equal([]);
    });
  });

  it('DL8: a switch takes effect from the next message', () => {
    const out = fakeOut();
    const log = make({ out, storage: fakeStorage() });
    diagnostics.emit('generation', { event: 'request' });

    log.set('generation', false);
    diagnostics.emit('generation', { event: 'result' });

    expect(out.lines.map(l => l[2])).to.deep.equal(['request']);
  });

  it('DL9: after dispose nothing is logged and change listeners are gone', () => {
    const out = fakeOut();
    const log = make({ out, storage: fakeStorage() });
    const changes = [];
    log.on('change', s => changes.push(s));

    log.dispose();
    diagnostics.emit('generation', { event: 'request' });
    diagnostics.emit('swallowed', { where: 'x', error: new Error('y') });
    log.set('actions', true);

    expect(out.lines).to.deep.equal([]);
    expect(changes).to.deep.equal([]);
  });
});
