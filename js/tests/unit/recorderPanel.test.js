/**
 * @fileoverview The Session recorder tool (tspec-debug-instrumentation
 * RPN1–RPN15, the unit side of §8 A23–A36; fspec-007 §3.4–3.6, §4.2, §5,
 * §6.1, §6.8, §6.10, §6.11, §8.2, §10.1, §11; aspec §12.1): its markup and
 * accessibility contract, the counts and storage lines, Copy session and its
 * fallback field, Clear history, the logging switches, and every replay state
 * the status line and report area can show.
 *
 * Rendering is driven by fake collaborators where the panel's own logic is
 * the subject (counts, storage, report rendering); flows that pass through
 * the controller run over the real one (helpers/devSessionRig.js), so the
 * wording and the single announcement per outcome are the controller's real
 * output. Announcements are read from a mounted live region.
 */

import { mount } from '../../dev/recorderPanel.js';
import { createRecorder } from '../../dev/recorder.js';
import { createDevLog } from '../../dev/devLog.js';
import { createGameState } from '../../game/state.js';
import { mount as mountDialog, open as openDialog } from '../../ui/dialog.js';
import { placementStep, manualTimers } from '../helpers/codecFixtures.js';
import {
  devSessionRig, withProgress, liveRegion, frames, settle, deferred, fakeConfirm, sessionDoc, twoActionDoc,
  TWO_ACTIONS_REPLAYED, checkAll, sel, pen, LOAD, api, at,
} from '../helpers/devSessionRig.js';

const CHECKING = 'Checking session…';
const COMPARING = 'Comparing with current code…';
const DECLINED = 'Session not replayed. Your game and recorded history are unchanged.';
const REJECTED = 'This session can\'t be replayed.';
const NOT_JSON = `${REJECTED} The text is not valid JSON.`;
const NOT_SAVED = 'History is not being saved — it will be lost on reload.';
const STORAGE_MESSAGES = {
  discarded: 'The saved history couldn\'t be read and was discarded.',
  failing: NOT_SAVED,
  unavailable: NOT_SAVED,
  lost: 'Another tab has taken over the saved history. This tab\'s history is kept until it is closed or reloaded.',
};
const COPY_FAILED = 'Couldn\'t copy automatically. The session document is shown for you to copy.';

const $ = id => document.getElementById(id);
const isError = el => el.classList.contains('dev-error');
const coachDoc = (result = placementStep(2)) => sessionDoc({ actions: [{ type: 'COACH_START', result }] });

/** Independent of the code under test: local `HH:MM:SS.mmm` of an ISO time. */
function localTime(iso) {
  const d = new Date(iso);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** A minimal event source, as the recorder, the log and the controller expose. */
function emitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event).delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload);
    },
  };
}

function fakeRecorder({ actions = 0, errors = 0, capacity = 5000, atCapacity = false, status = 'ok' } = {}) {
  const events = emitter();
  const recorder = {
    current: { actions, errors, capacity, atCapacity },
    status,
    counts: () => ({ ...recorder.current }),
    storageStatus: () => recorder.status,
    on: events.on,
    emit: events.emit,
  };
  return recorder;
}

function fakeLog(switches = { generation: true, swallowed: true, actions: false }) {
  const events = emitter();
  return { get: () => ({ ...switches }), on: events.on, emit: events.emit };
}

/** A controller that records the panel's calls and changes nothing. */
function fakeSession() {
  const events = emitter();
  const calls = [];
  return {
    calls,
    on: events.on,
    emit: events.emit,
    copySession: async () => { calls.push(['copySession']); return { ok: true, message: 'Session copied.' }; },
    clearHistory: async intent => { calls.push(['clearHistory', intent]); return { ok: true, message: 'History cleared.' }; },
    replay: (...args) => { calls.push(['replay', ...args]); return Promise.resolve({ ok: true }); },
    setLogging: (category, on) => { calls.push(['setLogging', category, on]); return { ok: true }; },
  };
}

/** A confirmation over the real dialog, as main.js wires it. */
const dialogConfirm = opts => new Promise(resolve => {
  openDialog({ ...opts, onConfirm: () => resolve(true), onCancel: () => resolve(false) });
});

describe('dev/recorderPanel.js', function () {
  this.timeout(20000);

  let host;
  let live;
  let rigs;
  let cleanups;

  beforeEach(() => {
    live = liveRegion();
    rigs = [];
    cleanups = [];
    host = document.createElement('section');
    host.id = 'dev-root';
    host.className = 'dev-panel';
    document.body.appendChild(host);
  });

  afterEach(async () => {
    await live.dispose();
    for (const fn of cleanups) fn();
    for (const r of rigs) r.dispose();
    host.remove();
  });

  function mountFakes({ recorder = fakeRecorder(), log = fakeLog(), session = fakeSession() } = {}) {
    mount(host, { session, recorder, log });
    return { recorder, log, session };
  }

  async function mountReal(opts) {
    const r = await devSessionRig(opts);
    rigs.push(r);
    mount(host, { session: r.session, recorder: r.recorder, log: r.log });
    $('dev-rec').open = true;
    return r;
  }

  /** The real dialog in its own root, removed after the test. */
  function realDialog() {
    const root = document.createElement('div');
    root.id = 'dialog-root';
    document.body.appendChild(root);
    mountDialog(root);
    cleanups.push(() => root.remove());
    return { isOpen: () => $('modal-backdrop').classList.contains('open') };
  }

  /** Announcements made by `fn` and everything it sets off, after their frames. */
  async function announcedBy(fn) {
    await frames(2);
    live.texts.length = 0;
    const result = await fn();
    await settle();
    await frames(2);
    return { result, announced: [...live.texts] };
  }

  async function clickAndSettle(id) {
    $(id).click();
    await settle();
    await frames(2);
  }

  function replay(docText, stop = '') {
    $('dev-rec-doc').value = typeof docText === 'string' ? docText : JSON.stringify(docText);
    $('dev-rec-stop').value = stop;
    $('dev-rec-replay').click();
  }

  /** Text updates written to an element, counted by a MutationObserver. */
  function mutationsOf(el) {
    const records = [];
    const observer = new MutationObserver(list => records.push(...list));
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    cleanups.push(() => observer.disconnect());
    return { count: () => { records.push(...observer.takeRecords()); return records.length; } };
  }

  // ── Markup ───────────────────────────────────────────────────────────────

  describe('markup', () => {
    it('RPN1: the tool is a collapsed native disclosure named "Session recorder", after the existing tools', () => {
      host.innerHTML = '<details class="dev-tool" id="dev-gen"><summary>Generation diagnostics</summary></details>';
      mountFakes();

      const tool = $('dev-rec');
      expect(tool.tagName).to.equal('DETAILS');
      expect(tool.classList.contains('dev-tool')).to.equal(true);
      expect(tool.open).to.equal(false);
      expect(tool.querySelector('summary').textContent).to.equal('Session recorder');
      expect(tool.previousElementSibling.id).to.equal('dev-gen');
      expect(host.lastElementChild).to.equal(tool);
    });

    it('RPN1: the tool holds three groups labelled History, Console logging and Replay, in that order', () => {
      mountFakes();

      const groups = [...$('dev-rec').querySelectorAll('section.dev-group')];
      const names = groups.map(g => $(g.getAttribute('aria-labelledby')));
      expect(names.map(h => h.textContent)).to.deep.equal(['History', 'Console logging', 'Replay']);
      expect(names.map(h => [h.tagName, h.className])).to.deep.equal(Array(3).fill(['H3', 'dev-group-title']));
    });

    it('A24: the counts line is plain text, not a live region', () => {
      mountFakes();

      const counts = $('dev-rec-counts');
      expect(counts.tagName).to.equal('P');
      expect(counts.className).to.equal('dev-counts');
      expect(counts.hasAttribute('role')).to.equal(false);
      expect(counts.hasAttribute('aria-live')).to.equal(false);
    });

    for (const [id, className] of [
      ['dev-rec-storage', 'dev-callout'], ['dev-rec-history-status', 'dev-status'], ['dev-rec-replay-status', 'dev-status'],
    ]) {
      it(`A25/A27/A32: #${id} is a polite status region`, () => {
        mountFakes();

        const line = $(id);
        expect(line.getAttribute('role')).to.equal('status');
        expect(line.getAttribute('aria-live') ?? 'polite').to.equal('polite');
        expect(line.className).to.equal(className);
      });
    }

    it('A26: Copy session is a native button named "Copy session document"', () => {
      mountFakes();

      const button = $('dev-rec-copy');
      expect(button.tagName).to.equal('BUTTON');
      expect(button.type).to.equal('button');
      expect(button.textContent).to.equal('Copy session');
      expect(button.getAttribute('aria-label')).to.equal('Copy session document');
      expect(button.disabled).to.equal(false);
    });

    it('A35: Clear history is a native danger button at the end of the row that keeps the board selection', () => {
      mountFakes();

      const button = $('dev-rec-clear');
      expect(button.tagName).to.equal('BUTTON');
      expect(button.type).to.equal('button');
      expect(button.textContent).to.equal('Clear history');
      expect([...button.classList]).to.deep.equal(['btn', 'dev-btn-danger', 'dev-btn-end']);
      expect(button.hasAttribute('data-keep-selection')).to.equal(true);
      expect(button.parentElement).to.equal($('dev-rec-copy').parentElement);
    });

    it('A28: the copy-fallback field is hidden, read-only, multi-line and labelled "Session document"', () => {
      mountFakes();

      const field = $('dev-rec-fallback-text');
      expect($('dev-rec-fallback').hidden).to.equal(true);
      expect(field.tagName).to.equal('TEXTAREA');
      expect(field.readOnly).to.equal(true);
      expect(field.rows).to.equal(6);
      expect([...field.labels].map(l => l.textContent)).to.deep.equal(['Session document']);
      expect(field.getAttribute('spellcheck')).to.equal('false');
      expect(field.getAttribute('autocomplete')).to.equal('off');
    });

    it('A29: the replay document field is named by its visible label, not by its placeholder', () => {
      mountFakes();

      const field = $('dev-rec-doc');
      expect(field.tagName).to.equal('TEXTAREA');
      expect([...field.labels].map(l => l.textContent)).to.deep.equal(['Session document to replay']);
      expect(field.placeholder).to.equal('Paste a session document (JSON)');
      expect(field.hasAttribute('aria-label')).to.equal(false);
      expect(field.readOnly).to.equal(false);
    });

    it('A30: the stop-after field is a numeric-keyboard text field labelled "Stop after action" and described by its hint', () => {
      mountFakes();

      const field = $('dev-rec-stop');
      expect(field.type).to.equal('text');
      expect(field.inputMode).to.equal('numeric');
      expect(field.getAttribute('pattern')).to.equal('[0-9]*');
      expect([...field.labels].map(l => l.textContent)).to.deep.equal(['Stop after action']);
      const hint = $(field.getAttribute('aria-describedby'));
      expect(hint.textContent).to.equal('Optional. Leave empty to replay every action.');
      expect(hint.className).to.equal('dev-field-hint');
    });

    it('A31: Replay is a native button that keeps the board selection', () => {
      mountFakes();

      const button = $('dev-rec-replay');
      expect(button.tagName).to.equal('BUTTON');
      expect(button.type).to.equal('button');
      expect(button.textContent).to.equal('Replay');
      expect(button.hasAttribute('data-keep-selection')).to.equal(true);
    });

    it('A34: the report area is a focusable region named "Replay report", empty and not live', () => {
      mountFakes();

      const report = $('dev-rec-report');
      expect(report.getAttribute('role')).to.equal('region');
      expect(report.getAttribute('aria-label')).to.equal('Replay report');
      expect(report.tabIndex).to.equal(0);
      expect(report.hasAttribute('aria-live')).to.equal(false);
      expect(report.matches(':empty')).to.equal(true);
    });

    for (const [id, label, tag] of [
      ['dev-log-generation', 'Log generation worker', '[dev:gen]'],
      ['dev-log-swallowed', 'Log swallowed exceptions', '[dev:swallowed]'],
      ['dev-log-actions', 'Log action trace', '[dev:action]'],
    ]) {
      it(`A36: #${id} is a switch with the visible label "${label}" and a hidden ${tag} tag`, () => {
        mountFakes();

        const toggle = $(id);
        expect(toggle.tagName).to.equal('BUTTON');
        expect(toggle.type).to.equal('button');
        expect(toggle.getAttribute('role')).to.equal('switch');
        const visible = [...toggle.querySelectorAll('span')].filter(s => !s.closest('[aria-hidden="true"]'));
        expect(visible.map(s => s.textContent)).to.deep.equal([label]);
        const hiddenTag = toggle.querySelector('.dev-switch-tag');
        expect(hiddenTag.textContent).to.equal(tag);
        expect(hiddenTag.getAttribute('aria-hidden')).to.equal('true');
        expect(toggle.querySelector('.dev-switch-track').getAttribute('aria-hidden')).to.equal('true');
        expect(toggle.closest('.dev-switches')).to.not.equal(null);
      });
    }
  });

  // ── Counts ───────────────────────────────────────────────────────────────

  describe('counts line', () => {
    const cases = [
      ['an empty history', { actions: 0, errors: 0 }, '0 actions, 0 errors recorded.'],
      ['one action and one error', { actions: 1, errors: 1 }, '1 action, 1 error recorded.'],
      ['counts in the thousands', { actions: 1234, errors: 2345 }, '1,234 actions, 2,345 errors recorded.'],
    ];
    for (const [label, counts, text] of cases) {
      it(`RPN2: ${label} reads "${text}"`, () => {
        mountFakes({ recorder: fakeRecorder(counts) });

        expect($('dev-rec-counts').textContent).to.equal(text);
        expect($('dev-rec-counts').querySelector('.dev-capacity')).to.equal(null);
      });
    }

    it('RPN2: at capacity the capacity sentence follows, in a span inside the same line', () => {
      mountFakes({ recorder: fakeRecorder({ actions: 4990, errors: 10, atCapacity: true }) });

      const counts = $('dev-rec-counts');
      const capacity = counts.querySelector('span.dev-capacity');
      expect(capacity.textContent).to.equal('At capacity (5,000): the oldest entries are being discarded.');
      expect(counts.textContent).to.equal(
        '4,990 actions, 10 errors recorded. At capacity (5,000): the oldest entries are being discarded.');
    });

    it('RPN3: a burst of changes in one task is one text update, on the next frame, with the latest counts', async () => {
      const { recorder } = mountFakes();
      const updates = mutationsOf($('dev-rec-counts'));

      for (let n = 1; n <= 10; n++) {
        recorder.current.actions = n;
        recorder.emit('change', recorder.counts());
      }
      const beforeFrame = updates.count();
      await frames(1);

      expect(beforeFrame).to.equal(0);
      expect(updates.count()).to.equal(1);
      expect($('dev-rec-counts').textContent).to.equal('10 actions, 0 errors recorded.');
    });

    it('RPN3: a change after the frame is rendered on the frame after it', async () => {
      const { recorder } = mountFakes();
      recorder.current.actions = 1;
      recorder.emit('change', recorder.counts());
      await frames(1);

      recorder.current.actions = 2;
      recorder.emit('change', recorder.counts());
      await frames(1);

      expect($('dev-rec-counts').textContent).to.equal('2 actions, 0 errors recorded.');
    });

    it('the counts line follows a real recorder as actions are recorded', async () => {
      const r = await mountReal();

      withProgress(r);
      await frames(1);

      expect($('dev-rec-counts').textContent).to.equal('3 actions, 0 errors recorded.');
    });

    it('a real recorder at its capacity shows the capacity sentence (capacity seam)', async () => {
      const log = createDevLog({ out: { log() {}, warn() {} }, storage: { getItem: () => null, setItem() {} } });
      cleanups.push(() => log.dispose());
      const recorder = createRecorder({
        store: { write() {}, replaceAll() {}, status: () => 'ok' },
        log,
        opened: Promise.resolve({ status: 'empty' }),
        capacity: 3,
        now: () => 0,
        clock: () => 0,
      });
      const gs = createGameState({
        stats: { recordAttemptOnce() {}, recordWin() {} },
        hintProvider: { nextHint: () => null },
        statsSuppressed: () => true,
        tap: recorder.tap,
        timers: manualTimers().timers,
      });
      recorder.bootComplete(gs);
      await recorder.ready;
      mount(host, { session: fakeSession(), recorder, log });

      gs.dispatch(LOAD());
      for (const i of [2, 3, 5]) gs.dispatch(sel(i));
      await frames(1);

      expect($('dev-rec-counts').textContent).to.equal(
        '3 actions, 0 errors recorded. At capacity (3): the oldest entries are being discarded.');
    });

    it('A24: changes to the counts are not announced', async () => {
      const { recorder } = mountFakes();

      const { announced } = await announcedBy(() => {
        recorder.current = { actions: 5, errors: 1, capacity: 5000, atCapacity: true };
        recorder.emit('change', recorder.counts());
      });

      expect($('dev-rec-counts').textContent).to.include('5 actions, 1 error recorded.');
      expect(announced).to.deep.equal([]);
    });
  });

  // ── Storage line ─────────────────────────────────────────────────────────

  describe('storage line', () => {
    it('RPN4: with history saved normally the line is empty', async () => {
      mountFakes({ recorder: fakeRecorder({ status: 'ok' }) });

      expect($('dev-rec-storage').textContent).to.equal('');
      expect($('dev-rec-storage').matches(':empty')).to.equal(true);
    });

    for (const [status, message] of Object.entries(STORAGE_MESSAGES)) {
      it(`RPN4: a '${status}' status present at mount is shown and announced once`, async () => {
        const { announced } = await announcedBy(() => mountFakes({ recorder: fakeRecorder({ status }) }));

        expect($('dev-rec-storage').textContent).to.equal(message);
        expect(announced).to.deep.equal([message]);
      });

      it(`RPN4: a change to '${status}' shows its message and announces it once`, async () => {
        const { recorder } = mountFakes();

        const { announced } = await announcedBy(() => recorder.emit('storage', status));

        expect($('dev-rec-storage').textContent).to.equal(message);
        expect(announced).to.deep.equal([message]);
      });
    }

    it('RPN4: the same status reported again is not announced again', async () => {
      const { recorder } = mountFakes();
      recorder.emit('storage', 'lost');

      const { announced } = await announcedBy(() => recorder.emit('storage', 'lost'));

      expect($('dev-rec-storage').textContent).to.equal(STORAGE_MESSAGES.lost);
      expect(announced).to.deep.equal([]);
    });

    it('RPN4: a status with the same message as the one shown is not announced again', async () => {
      const { recorder } = mountFakes();
      recorder.emit('storage', 'failing');

      const { announced } = await announcedBy(() => recorder.emit('storage', 'unavailable'));

      expect($('dev-rec-storage').textContent).to.equal(NOT_SAVED);
      expect(announced).to.deep.equal([]);
    });

    it('RPN4: a status with a different message replaces the one shown and is announced', async () => {
      const { recorder } = mountFakes();
      recorder.emit('storage', 'failing');

      const { announced } = await announcedBy(() => recorder.emit('storage', 'lost'));

      expect($('dev-rec-storage').textContent).to.equal(STORAGE_MESSAGES.lost);
      expect(announced).to.deep.equal([STORAGE_MESSAGES.lost]);
    });

    it('RPN4: returning to ok clears the line without announcing', async () => {
      const { recorder } = mountFakes();
      recorder.emit('storage', 'failing');

      const { announced } = await announcedBy(() => recorder.emit('storage', 'ok'));

      expect($('dev-rec-storage').matches(':empty')).to.equal(true);
      expect(announced).to.deep.equal([]);
    });

    describe('D-35 d: a message already in force when the panel mounts', () => {
      it('is announced exactly once, at mount', async () => {
        const { announced } = await announcedBy(() => mountFakes({ recorder: fakeRecorder({ status: 'discarded' }) }));

        expect(announced).to.deep.equal([STORAGE_MESSAGES.discarded]);
      });

      it('is not announced again when the counts re-render or the same status is reported', async () => {
        const { recorder } = await announcedBy(() => mountFakes({ recorder: fakeRecorder({ status: 'discarded' }) }))
          .then(({ result }) => result);

        const { announced } = await announcedBy(async () => {
          recorder.current.actions = 7;
          recorder.emit('change', recorder.counts());
          await frames(1);
          recorder.emit('storage', 'discarded');
        });

        expect($('dev-rec-counts').textContent).to.equal('7 actions, 0 errors recorded.');
        expect(announced).to.deep.equal([]);
      });

      it('a later, different message is still announced once', async () => {
        const { recorder } = await announcedBy(() => mountFakes({ recorder: fakeRecorder({ status: 'discarded' }) }))
          .then(({ result }) => result);

        const { announced } = await announcedBy(() => recorder.emit('storage', 'lost'));

        expect($('dev-rec-storage').textContent).to.equal(STORAGE_MESSAGES.lost);
        expect(announced).to.deep.equal([STORAGE_MESSAGES.lost]);
      });
    });
  });

  describe('D-35 f: thousands separators on the replay surfaces', () => {
    it('the replay status line and the report scope line separate counts of 1,000 or more', async () => {
      await mountReal();
      const doc = sessionDoc({ actions: Array.from({ length: 1500 }, (_, i) => sel(i % 2 === 0 ? 3 : 5)) });

      await announcedBy(() => replay(doc));

      expect($('dev-rec-replay-status').textContent)
        .to.equal('Session replayed: 1,500 of 1,500 actions. No computed results to compare.');
      expect(host.querySelector('.dev-report-scope').textContent).to.equal('Replayed 1,500 of 1,500 actions.');
    });
  });

  // ── Copy session ─────────────────────────────────────────────────────────

  describe('Copy session', () => {
    /** A controller whose clipboard answers `outcome.copy`. */
    async function mountCopy(opts = {}) {
      const outcome = { copy: true };
      const r = await mountReal({ ...opts, deps: { copy: async () => outcome.copy, ...opts.deps } });
      return { r, outcome };
    }

    it('RPN5: a successful copy shows the counts in the history status, plainly, announced once', async () => {
      await mountCopy();

      const { announced } = await announcedBy(() => $('dev-rec-copy').click());

      expect($('dev-rec-history-status').textContent).to.equal('Session copied: 0 actions, 0 errors.');
      expect(isError($('dev-rec-history-status'))).to.equal(false);
      expect(announced).to.deep.equal(['Session copied: 0 actions, 0 errors.']);
    });

    it('RPN5: after a successful copy focus stays on Copy session and the fallback field stays hidden', async () => {
      await mountCopy();
      $('dev-rec-copy').focus();

      await clickAndSettle('dev-rec-copy');

      expect(document.activeElement).to.equal($('dev-rec-copy'));
      expect($('dev-rec-fallback').hidden).to.equal(true);
    });

    it('RPN6: a failed copy shows the fallback field holding the indented document, focused and wholly selected', async () => {
      const { r, outcome } = await mountCopy();
      withProgress(r);
      outcome.copy = false;

      await clickAndSettle('dev-rec-copy');

      const field = $('dev-rec-fallback-text');
      const text = JSON.stringify(r.recorder.exportDocument(), null, 2);
      expect($('dev-rec-fallback').hidden).to.equal(false);
      expect(field.value).to.equal(text);
      expect(document.activeElement).to.equal(field);
      expect([field.selectionStart, field.selectionEnd]).to.deep.equal([0, text.length]);
      expect(field.scrollTop).to.equal(0);
    });

    it('RPN6: a failed copy is an error-styled history status, announced once', async () => {
      const { outcome } = await mountCopy();
      outcome.copy = false;

      const { announced } = await announcedBy(() => $('dev-rec-copy').click());

      expect($('dev-rec-history-status').textContent).to.equal(COPY_FAILED);
      expect(isError($('dev-rec-history-status'))).to.equal(true);
      expect(announced).to.deep.equal([COPY_FAILED]);
    });

    const lifetimes = [
      ['the next successful Copy session', true, async ({ outcome }) => {
        outcome.copy = true;
        await clickAndSettle('dev-rec-copy');
      }],
      ['Clear history', true, async () => clickAndSettle('dev-rec-clear')],
      ['a replay that replaces the game', true, async () => { replay(twoActionDoc()); await settle(); }],
      ['a rejected replay', false, async () => { replay('{'); await settle(); }],
      ['a declined replay', false, async ({ r }) => {
        withProgress(r);
        replay(twoActionDoc());
        await settle();
      }],
    ];
    for (const [label, hides, act] of lifetimes) {
      it(`RPN7: the fallback field is ${hides ? 'removed' : 'kept'} by ${label}`, async () => {
        const ctx = await mountCopy({ confirm: fakeConfirm(label === 'a declined replay' ? false : true) });
        ctx.outcome.copy = false;
        await clickAndSettle('dev-rec-copy');

        await act(ctx);

        expect($('dev-rec-fallback').hidden).to.equal(hides);
      });
    }

    it('RPN7: a successful copy after a failure plainly replaces the error status', async () => {
      const { outcome } = await mountCopy();
      outcome.copy = false;
      await clickAndSettle('dev-rec-copy');
      outcome.copy = true;

      await clickAndSettle('dev-rec-copy');

      expect($('dev-rec-history-status').textContent).to.equal('Session copied: 0 actions, 0 errors.');
      expect(isError($('dev-rec-history-status'))).to.equal(false);
    });
  });

  // ── Clear history ────────────────────────────────────────────────────────

  describe('Clear history', () => {
    it('RPN11: Clear history asks with the history\'s counts', async () => {
      const confirm = fakeConfirm(false);
      const r = await mountReal({ confirm });
      withProgress(r);

      await clickAndSettle('dev-rec-clear');

      expect(confirm.opened).to.deep.equal([{
        title: 'Clear recorded history?',
        body: 'The recorded history (3 actions, 0 errors) will be discarded. Your game is not affected.',
        confirmLabel: 'Clear History',
      }]);
    });

    it('RPN11: a confirmed clear empties the history, shows "History cleared." plainly and announces it once', async () => {
      const r = await mountReal({ confirm: fakeConfirm(true) });
      withProgress(r);

      const { announced } = await announcedBy(() => $('dev-rec-clear').click());

      expect(r.recorder.counts()).to.include({ actions: 0, errors: 0 });
      expect($('dev-rec-history-status').textContent).to.equal('History cleared.');
      expect(isError($('dev-rec-history-status'))).to.equal(false);
      expect($('dev-rec-counts').textContent).to.equal('0 actions, 0 errors recorded.');
      expect(announced).to.deep.equal(['History cleared.']);
    });

    it('RPN11: a cleared history empties the report area', async () => {
      const r = await mountReal({ confirm: fakeConfirm(true) });
      replay(twoActionDoc());
      await settle();
      expect($('dev-rec-report').matches(':empty')).to.equal(false);
      withProgress(r);

      await clickAndSettle('dev-rec-clear');

      expect($('dev-rec-report').matches(':empty')).to.equal(true);
    });

    it('RPN11: a declined clear shows "History not cleared." once and leaves history, report and fallback', async () => {
      const r = await mountReal({ confirm: fakeConfirm(false), deps: { copy: async () => false } });
      replay(twoActionDoc());
      await settle();
      await clickAndSettle('dev-rec-copy');
      withProgress(r);
      const history = JSON.stringify(r.recorder.exportDocument());
      const report = $('dev-rec-report').innerHTML;

      const { announced } = await announcedBy(() => $('dev-rec-clear').click());

      expect($('dev-rec-history-status').textContent).to.equal('History not cleared.');
      expect(isError($('dev-rec-history-status'))).to.equal(false);
      expect(JSON.stringify(r.recorder.exportDocument())).to.equal(history);
      expect($('dev-rec-report').innerHTML).to.equal(report);
      expect($('dev-rec-fallback').hidden).to.equal(false);
      expect(announced).to.deep.equal(['History not cleared.']);
    });

    it('an empty history is cleared without asking', async () => {
      const confirm = fakeConfirm(false);
      await mountReal({ confirm });

      await clickAndSettle('dev-rec-clear');

      expect(confirm.opened).to.deep.equal([]);
      expect($('dev-rec-history-status').textContent).to.equal('History cleared.');
    });

    for (const [choice, button] of [['confirmed', 'modal-confirm'], ['cancelled', 'modal-cancel']]) {
      it(`A35: with the real dialog ${choice}, focus returns to Clear history`, async () => {
        realDialog();
        const r = await mountReal({ confirm: dialogConfirm });
        withProgress(r);
        $('dev-rec-clear').focus();
        $('dev-rec-clear').click();
        await settle();
        expect(document.activeElement).to.equal($('modal-cancel'));

        await clickAndSettle(button);

        expect(document.activeElement).to.equal($('dev-rec-clear'));
        expect($('dev-rec-history-status').textContent)
          .to.equal(choice === 'confirmed' ? 'History cleared.' : 'History not cleared.');
      });
    }

    it('RPN11: an API clear empties the report and the fallback field, leaves the history status, and is announced once', async () => {
      const r = await mountReal({ deps: { copy: async () => false } });
      replay(twoActionDoc());
      await settle();
      await clickAndSettle('dev-rec-copy');
      const status = $('dev-rec-history-status').textContent;

      const { announced } = await announcedBy(() => r.session.clearHistory(api({ discardHistory: true })));

      expect($('dev-rec-report').matches(':empty')).to.equal(true);
      expect($('dev-rec-fallback').hidden).to.equal(true);
      expect($('dev-rec-history-status').textContent).to.equal(status);
      expect(announced).to.deep.equal(['History cleared.']);
    });

    it('an API clear refused for want of discardHistory changes nothing on the panel', async () => {
      const r = await mountReal({ deps: { copy: async () => false } });
      replay(twoActionDoc());
      await settle();
      await clickAndSettle('dev-rec-copy');
      const before = host.innerHTML;

      const { result, announced } = await announcedBy(() => r.session.clearHistory(api({})));

      expect(result.reason).to.equal('needs-discard-history');
      expect(host.innerHTML).to.equal(before);
      expect(announced).to.deep.equal([]);
    });
  });

  // ── Logging switches ─────────────────────────────────────────────────────

  describe('logging switches', () => {
    const checked = () => ['generation', 'swallowed', 'actions'].map(c => $(`dev-log-${c}`).getAttribute('aria-checked'));

    it('RPN12: each switch starts from the log\'s setting', () => {
      mountFakes({ log: fakeLog({ generation: false, swallowed: true, actions: true }) });

      expect(checked()).to.deep.equal(['false', 'true', 'true']);
    });

    it('RPN12: a click asks the controller for the opposite setting and does not itself change the switch', () => {
      const { session } = mountFakes();

      $('dev-log-generation').click();
      $('dev-log-actions').click();

      expect(session.calls).to.deep.equal([['setLogging', 'generation', false], ['setLogging', 'actions', true]]);
      expect(checked()).to.deep.equal(['true', 'true', 'false']);
    });

    const toggles = [
      ['generation', 'false', 'Generation worker logging off.'],
      ['swallowed', 'false', 'Swallowed exceptions logging off.'],
      ['actions', 'true', 'Action trace logging on.'],
    ];
    for (const [category, after, message] of toggles) {
      it(`A36: clicking the ${category} switch sets aria-checked to ${after} and announces "${message}" once`, async () => {
        const r = await mountReal();

        const { announced } = await announcedBy(() => $(`dev-log-${category}`).click());

        expect($(`dev-log-${category}`).getAttribute('aria-checked')).to.equal(after);
        expect(r.log.get()[category]).to.equal(after === 'true');
        expect(announced).to.deep.equal([message]);
      });
    }

    it('RPN12: a change made through the API shows on the switch, with the section collapsed', async () => {
      const r = await mountReal();
      $('dev-rec').open = false;

      r.session.setLogging('actions', true);
      r.session.setLogging('swallowed', false);

      expect(checked()).to.deep.equal(['true', 'false', 'true']);
    });
  });

  // ── Replay ───────────────────────────────────────────────────────────────

  describe('replay', () => {
    it('RPN8: Replay passes both fields as typed, with the panel intent', () => {
      const { session } = mountFakes();

      replay('{ "doc": 1 }', ' 7 ');

      expect(session.calls).to.deep.equal([['replay', '{ "doc": 1 }', { stopAfter: ' 7 ' }, { ask: true }, 'panel']]);
    });

    const outcomes = [
      ['a rejection', '{', { confirm: fakeConfirm(true) }],
      ['a declined confirmation', twoActionDoc(), { confirm: fakeConfirm(false), progress: true }],
      ['a replay', twoActionDoc(), { confirm: fakeConfirm(true) }],
    ];
    for (const [label, doc, { confirm, progress }] of outcomes) {
      it(`RPN8: both fields keep their content after ${label}`, async () => {
        const r = await mountReal({ confirm });
        if (progress) withProgress(r);
        const text = typeof doc === 'string' ? doc : JSON.stringify(doc);

        replay(text, '5');
        await settle();

        expect($('dev-rec-replay-status').textContent).to.not.equal(CHECKING);
        expect($('dev-rec-doc').value).to.equal(text);
        expect($('dev-rec-stop').value).to.equal('5');
      });
    }

    const rejections = [
      ['an empty field', '', '', `${REJECTED} No session document was supplied.`],
      ['text that is not JSON', '{', '', NOT_JSON],
      ['JSON that is not a session document', '{"a": 1}', '', `${REJECTED} The JSON is not a session document.`],
      ['a newer format version', JSON.stringify({ ...twoActionDoc(), version: 99 }), '',
        `${REJECTED} It is format version 99; this build reads versions 1 to 1.`],
      ['a stop value that is not a whole number', JSON.stringify(twoActionDoc()), '-1',
        `${REJECTED} Stop after must be a whole number, 0 or greater.`],
    ];
    for (const [label, text, stop, message] of rejections) {
      it(`RPN9: ${label} is rejected as an error in the status line, announced once, with an empty report`, async () => {
        const confirm = fakeConfirm(true);
        const r = await mountReal({ confirm });
        withProgress(r);

        const { announced } = await announcedBy(() => replay(text, stop));

        expect($('dev-rec-replay-status').textContent).to.equal(message);
        expect(isError($('dev-rec-replay-status'))).to.equal(true);
        expect($('dev-rec-report').matches(':empty')).to.equal(true);
        expect(confirm.opened).to.deep.equal([]);
        expect(announced).to.deep.equal([message]);
      });
    }

    it('A30: surrounding whitespace in the stop value is trimmed', async () => {
      await mountReal();

      replay(twoActionDoc(), ' 1 ');
      await settle();

      expect($('dev-rec-replay-status').textContent).to.equal('Session replayed: 1 of 2 actions. No computed results to compare.');
    });

    it('A32: "Checking session…" is shown plainly while checking and is not announced', async () => {
      const gate = deferred();
      await mountReal({ deps: { checkPuzzles: async puzzles => { await gate.promise; return checkAll(puzzles); } } });

      const { announced } = await announcedBy(() => replay(twoActionDoc()));

      expect($('dev-rec-replay-status').textContent).to.equal(CHECKING);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      expect(announced).to.deep.equal([]);
      gate.resolve();
      await settle();
    });

    it('a new replay clears the error style of the previous rejection', async () => {
      const gate = deferred();
      let held = false;
      await mountReal({
        deps: { checkPuzzles: async puzzles => { if (held) await gate.promise; return checkAll(puzzles); } },
      });
      replay('{');
      await settle();
      held = true;

      replay(twoActionDoc());
      await settle();

      expect($('dev-rec-replay-status').textContent).to.equal(CHECKING);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      gate.resolve();
      await settle();
    });

    const bodies = [
      ['progress only', r => { withProgress(r); r.recorder.clear(); }, 'Your current progress will be lost.'],
      ['history only', r => { r.gs.dispatch(sel(2)); r.recorder.captureError({ kind: 'uncaught', message: 'x' }); },
        'The recorded history (1 action, 1 error) will be discarded.'],
      ['progress and history', withProgress,
        'Your current progress will be lost, and the recorded history (3 actions, 0 errors) will be discarded.'],
    ];
    for (const [label, arrange, body] of bodies) {
      it(`A33: with ${label} at stake, Replay asks once with the body for it`, async () => {
        const confirm = fakeConfirm(true);
        const r = await mountReal({ confirm });
        arrange(r);

        replay(twoActionDoc());
        await settle();

        expect(confirm.opened).to.deep.equal([{ title: 'Replay this session?', body, confirmLabel: 'Replay' }]);
      });
    }

    it('with neither progress nor history at stake, Replay proceeds without asking', async () => {
      const confirm = fakeConfirm(false);
      await mountReal({ confirm });

      replay(twoActionDoc());
      await settle();

      expect(confirm.opened).to.deep.equal([]);
      expect($('dev-rec-replay-status').textContent).to.equal(TWO_ACTIONS_REPLAYED);
    });

    it('a declined confirmation shows the declined message plainly, announced once, and keeps the previous report', async () => {
      const r = await mountReal({ confirm: fakeConfirm(false) });
      replay(twoActionDoc());
      await settle();
      const report = $('dev-rec-report').innerHTML;
      withProgress(r);

      const { announced } = await announcedBy(() => replay(twoActionDoc()));

      expect($('dev-rec-replay-status').textContent).to.equal(DECLINED);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      expect($('dev-rec-report').innerHTML).to.equal(report);
      expect(announced).to.deep.equal([DECLINED]);
    });

    it('a rejection clears the previous report', async () => {
      await mountReal();
      replay(twoActionDoc());
      await settle();
      expect($('dev-rec-report').matches(':empty')).to.equal(false);

      replay('{');
      await settle();

      expect($('dev-rec-report').matches(':empty')).to.equal(true);
    });

    describe('while comparing', () => {
      /** A controller whose comparison is held at its first pause. */
      async function heldAtComparison() {
        const gates = [];
        const r = await mountReal({
          deps: {
            yieldEvery: 0,
            analyzeStep: () => placementStep(2),
            pause: () => { const g = deferred(); gates.push(g); return g.promise; },
          },
        });
        return { r, release: async () => { gates.forEach(g => g.resolve()); await settle(); } };
      }

      it('A32: "Comparing with current code…" is shown plainly and is not announced', async () => {
        const { release } = await heldAtComparison();

        const { announced } = await announcedBy(() => replay(coachDoc()));

        expect($('dev-rec-replay-status').textContent).to.equal(COMPARING);
        expect(isError($('dev-rec-replay-status'))).to.equal(false);
        expect(announced).to.deep.equal([]);
        await release();
      });

      it('the previous report is cleared once a replay proceeds past confirmation, and refilled with its outcome', async () => {
        const { release } = await heldAtComparison();
        replay(twoActionDoc());
        await settle();
        expect($('dev-rec-report').matches(':empty')).to.equal(false);

        replay(coachDoc());
        await settle();
        const whileComparing = $('dev-rec-report').matches(':empty');
        await release();

        expect(whileComparing).to.equal(true);
        expect($('dev-rec-report').querySelector('.dev-report-scope').textContent).to.equal('Replayed 1 of 1 action.');
      });
    });

    it('a replay with nothing to compare reports so, plainly, announced once', async () => {
      await mountReal();

      const { announced } = await announcedBy(() => replay(twoActionDoc()));

      expect($('dev-rec-replay-status').textContent).to.equal(TWO_ACTIONS_REPLAYED);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      expect([...$('dev-rec-report').children].map(el => [el.className, el.textContent])).to.deep.equal([
        ['dev-report-scope', 'Replayed 2 of 2 actions.'],
        ['dev-report-summary', 'No computed results to compare: the replayed actions contain no coach steps or hints.'],
      ]);
      expect(announced).to.deep.equal([TWO_ACTIONS_REPLAYED]);
    });

    it('a replay whose computed results all match reports no divergences, announced once', async () => {
      await mountReal({ deps: { analyzeStep: () => placementStep(2) } });
      const status = 'Session replayed: 1 of 1 action. No divergences in 1 computed result.';

      const { announced } = await announcedBy(() => replay(coachDoc()));

      expect($('dev-rec-replay-status').textContent).to.equal(status);
      expect($('dev-rec-report').querySelector('.dev-report-summary').textContent)
        .to.equal('No divergences: the 1 computed result matches the current code (1 coach step, 0 hints).');
      expect($('dev-rec-report').querySelector('ul')).to.equal(null);
      expect(announced).to.deep.equal([status]);
    });

    it('a divergence is listed as a collapsed disclosure whose expansion shows labelled Recorded and Current values', async () => {
      const current = placementStep(2, { technique: 'Hidden Single' });
      await mountReal({ deps: { analyzeStep: () => current } });
      const status = 'Session replayed: 1 of 1 action. 1 divergence in 1 computed result.';

      const { announced } = await announcedBy(() => replay(coachDoc()));

      const report = $('dev-rec-report');
      expect(report.querySelector('.dev-report-summary').textContent)
        .to.equal('1 of 1 computed result differs from the current code:');
      const item = report.querySelector('ul > li.dev-diverge');
      const details = item.querySelector('details');
      expect(details.open).to.equal(false);
      expect(details.querySelector('summary').textContent).to.equal(
        `Action 1 — coach step at ${localTime(at(1))}: technique — recorded Naked Single, current Hidden Single.`);
      details.open = true;
      const blocks = [...details.querySelectorAll('.dev-compare > pre.dev-json')];
      expect([...details.querySelectorAll('.dev-compare-label')].map(l => l.textContent)).to.deep.equal(['Recorded', 'Current']);
      expect(blocks.map(b => b.getAttribute('aria-label'))).to.deep.equal(['Recorded values', 'Current values']);
      expect(blocks.map(b => JSON.parse(b.textContent))).to.deep.equal([{ technique: 'Naked Single' }, { technique: 'Hidden Single' }]);
      expect($('dev-rec-replay-status').textContent).to.equal(status);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      expect(announced).to.deep.equal([status]);
    });

    it('computed results that could not be compared are listed under "Not compared"', async () => {
      await mountReal({ deps: { analyzeStep: () => { throw new Error('x'); } } });
      const status = 'Session replayed: 1 of 1 action. No computed results could be compared. 1 not compared.';

      const { announced } = await announcedBy(() => replay(coachDoc()));

      const report = $('dev-rec-report');
      expect(report.querySelector('.dev-report-summary').textContent).to.equal('No computed results could be compared.');
      expect(report.querySelector('h4').textContent).to.equal('Not compared');
      expect([...report.querySelector('h4 + ul').children].map(li => li.textContent)).to.deep.equal([
        'Action 1 — coach step: not compared — the current code raised an error: x.',
      ]);
      expect($('dev-rec-replay-status').textContent).to.equal(status);
      expect(announced).to.deep.equal([status]);
    });

    it('a replay stopped by an error is an error-styled outcome, announced once, with the raised error in the report', async () => {
      let seen = 0;
      const { createMachine } = await import('../../dev/machine.js');
      await mountReal({
        deps: {
          makeMachine: position => {
            const machine = createMachine(position);
            return {
              getState: machine.getState,
              dispatch(action) {
                if (action.type === 'PEN_ENTER' && ++seen === 1) throw new Error('boom');
                machine.dispatch(action);
              },
            };
          },
        },
      });
      const status = 'Replay stopped at action 2 of 2: boom. The board shows the position before that action.';

      const { announced } = await announcedBy(() => replay(twoActionDoc()));

      expect($('dev-rec-replay-status').textContent).to.equal(status);
      expect(isError($('dev-rec-replay-status'))).to.equal(true);
      const report = $('dev-rec-report');
      expect(report.querySelector('.dev-report-errors').textContent)
        .to.equal('Errors: 0 recorded in the replayed range, 1 raised during this replay.');
      expect([...report.querySelectorAll('li.dev-error-item')].map(li => li.textContent))
        .to.deep.equal(['Raised during this replay — uncaught error after action 1: boom']);
      expect(announced).to.deep.equal([status]);
    });

    describe('focus', () => {
      it('A31: focus stays on Replay after a replay', async () => {
        await mountReal();
        $('dev-rec-replay').focus();

        replay(twoActionDoc());
        await settle();
        await frames(2);

        expect(document.activeElement).to.equal($('dev-rec-replay'));
      });

      it('A31: focus stays on Replay after a rejection', async () => {
        await mountReal();
        $('dev-rec-replay').focus();

        replay('{');
        await settle();
        await frames(2);

        expect(document.activeElement).to.equal($('dev-rec-replay'));
      });

      for (const [choice, button, status] of [
        ['confirmed', 'modal-confirm', TWO_ACTIONS_REPLAYED], ['cancelled', 'modal-cancel', DECLINED],
      ]) {
        it(`A33: with the real dialog ${choice}, focus returns to Replay`, async () => {
          realDialog();
          const r = await mountReal({ confirm: dialogConfirm });
          withProgress(r);
          $('dev-rec-replay').focus();
          replay(twoActionDoc());
          await settle();
          expect(document.activeElement).to.equal($('modal-cancel'));

          await clickAndSettle(button);

          expect(document.activeElement).to.equal($('dev-rec-replay'));
          expect($('dev-rec-replay-status').textContent).to.equal(status);
        });
      }
    });

    it('D-26: a replay superseded at its open confirmation has the dialog closed and reports nothing; only the newer one reports', async () => {
      const dialog = realDialog();
      const r = await mountReal({ confirm: dialogConfirm });
      withProgress(r);
      replay(twoActionDoc());
      await settle();
      expect(dialog.isOpen()).to.equal(true);
      const statuses = [];
      r.session.on('replay-status', s => statuses.push(s.text));

      const { announced } = await announcedBy(() => replay('{'));

      expect(dialog.isOpen()).to.equal(false);
      expect(statuses).to.deep.equal([CHECKING, NOT_JSON]);
      expect($('dev-rec-replay-status').textContent).to.equal(NOT_JSON);
      expect(r.calls.dispatched).to.deep.equal([]);
      expect(announced).to.deep.equal([NOT_JSON]);
    });
  });

  // ── Panel and API in step (fspec §6.1, §6.8) ─────────────────────────────

  describe('replays made through the API', () => {
    const flags = api({ replace: true, discardHistory: true });

    it('an API replay fills the status line and the report as a panel replay does, announced once', async () => {
      const r = await mountReal();
      withProgress(r);

      const { result, announced } = await announcedBy(() => r.session.replay(twoActionDoc(), {}, flags, 'api'));

      expect(result.ok).to.equal(true);
      expect($('dev-rec-replay-status').textContent).to.equal(TWO_ACTIONS_REPLAYED);
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
      expect($('dev-rec-report').querySelector('.dev-report-scope').textContent).to.equal('Replayed 2 of 2 actions.');
      expect(announced).to.deep.equal([TWO_ACTIONS_REPLAYED]);
    });

    it('a rejected API replay shows as an error in the replay status line, announced once', async () => {
      const r = await mountReal();

      const { announced } = await announcedBy(() => r.session.replay('{', {}, flags, 'api'));

      expect($('dev-rec-replay-status').textContent).to.equal(NOT_JSON);
      expect(isError($('dev-rec-replay-status'))).to.equal(true);
      expect(announced).to.deep.equal([NOT_JSON]);
    });
  });

  // ── Report rendering (fake controller events) ────────────────────────────

  describe('report rendering', () => {
    /** Midnight-adjacent local time with every field short, so padding shows. */
    const EARLY = new Date(2026, 10, 16, 3, 4, 5, 6).toISOString();

    const coachDivergence = (differences, extra = {}) => ({
      action: 4, kind: 'coach', time: EARLY, technique: 'Naked Single', differences, ...extra,
    });
    const report = (parts = {}) => ({
      applied: 5, total: 5, compared: 3, counts: { coach: 2, hint: 1 },
      divergences: [], notCompared: [], errors: { recorded: [], raised: [] }, notes: [], stopped: null,
      ...parts,
    });
    function render(value) {
      const { session } = mountFakes();
      session.emit('replay-report', value);
      return $('dev-rec-report');
    }

    it('RPN10: a report with every part renders them in order, with the vspec classes', () => {
      const area = render(report({
        divergences: [coachDivergence([{ part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' }])],
        notCompared: [{ action: 2, kind: 'hint', reason: 'the recorded action changed nothing' }],
        errors: { recorded: [{ kind: 'uncaught', afterAction: 1, message: 'a', count: 1 }], raised: [] },
      }));

      expect([...area.children].map(el => `${el.tagName}.${el.className}`)).to.deep.equal([
        'P.dev-report-scope', 'P.dev-report-summary', 'UL.', 'H4.', 'UL.', 'P.dev-report-errors', 'UL.',
      ]);
      expect(area.children[0].textContent).to.equal('Replayed 5 of 5 actions.');
      expect(area.children[1].textContent).to.equal('1 of 3 computed results differs from the current code:');
      expect(area.children[2].firstElementChild.className).to.equal('dev-diverge');
      expect(area.children[3].textContent).to.equal('Not compared');
      expect(area.children[6].firstElementChild.className).to.equal('dev-error-item');
    });

    it('RPN10: parts with no items are omitted', () => {
      const area = render(report({ compared: 3 }));

      expect([...area.children].map(el => el.className)).to.deep.equal(['dev-report-scope', 'dev-report-summary']);
      expect(area.children[1].textContent)
        .to.equal('No divergences: all 3 computed results match the current code (2 coach steps, 1 hint).');
    });

    it('RPN10: the scope line carries the report\'s notes', () => {
      const area = render(report({ notes: ['Replay ended during a puzzle generation; the busy state was cleared.'] }));

      expect(area.querySelector('.dev-report-scope').textContent)
        .to.equal('Replayed 5 of 5 actions. Replay ended during a puzzle generation; the busy state was cleared.');
    });

    it('RPN10: a technique divergence puts the "Also differs" clause in a muted span of the same summary', () => {
      const area = render(report({
        divergences: [coachDivergence([
          { part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' },
          { part: 'roles', recorded: 1, current: 2 },
          { part: 'arrows', recorded: [], current: [1] },
        ])],
      }));

      const summary = area.querySelector('li.dev-diverge > details > summary');
      const also = summary.querySelector('span.dev-report-also');
      expect(also.textContent).to.equal('Also differs: roles, arrows.');
      expect(summary.textContent).to.equal(
        'Action 4 — coach step at 03:04:05.006: technique — recorded Naked Single, current Hidden Single. '
        + 'Also differs: roles, arrows.');
      expect(summary.lastChild).to.equal(also);
    });

    it('RPN10: a divergence with the same technique is one summary line with no muted span', () => {
      const area = render(report({ divergences: [coachDivergence([{ part: 'arrows', recorded: [], current: [1] }])] }));

      const summary = area.querySelector('li.dev-diverge summary');
      expect(summary.textContent).to.equal('Action 4 — coach step (Naked Single) at 03:04:05.006: differs in arrows.');
      expect(summary.querySelector('span')).to.equal(null);
    });

    it('RPN10: a hint divergence names the cell and each differing part', () => {
      const area = render(report({
        divergences: [{
          action: 7, kind: 'hint', time: EARLY, cell: 2,
          differences: [{ part: 'digit', recorded: 4, current: 5 }],
        }],
      }));

      expect(area.querySelector('li.dev-diverge summary').textContent)
        .to.equal('Action 7 — hint on r1c3 at 03:04:05.006: digit — recorded 4, current 5.');
    });

    it('RPN10: each divergence starts collapsed and expands to two labelled JSON regions of the differing parts only', () => {
      const area = render(report({
        divergences: [coachDivergence([
          { part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' },
          { part: 'digits', recorded: [4], current: [5] },
        ])],
      }));

      const details = area.querySelector('li.dev-diverge > details');
      expect(details.open).to.equal(false);
      const compare = details.querySelector('div.dev-compare');
      expect([...compare.children].map(el => `${el.tagName}.${el.className}`)).to.deep.equal(
        ['DIV.dev-compare-label', 'PRE.dev-json', 'DIV.dev-compare-label', 'PRE.dev-json']);
      const [, recorded, , current] = compare.children;
      for (const [pre, name] of [[recorded, 'Recorded values'], [current, 'Current values']]) {
        expect(pre.getAttribute('role')).to.equal('region');
        expect(pre.getAttribute('aria-label')).to.equal(name);
        expect(pre.tabIndex).to.equal(0);
      }
      expect(recorded.textContent).to.equal(JSON.stringify({ technique: 'Naked Single', digits: [4] }, null, 2));
      expect(current.textContent).to.equal(JSON.stringify({ technique: 'Hidden Single', digits: [5] }, null, 2));
    });

    it('RPN10: divergence times are the local time of day, zero-padded HH:MM:SS.mmm', () => {
      const late = new Date(2026, 10, 16, 23, 59, 58, 970).toISOString();
      const area = render(report({ divergences: [coachDivergence([{ part: 'arrows', recorded: [], current: [1] }], { time: late })] }));

      expect(area.querySelector('summary').textContent).to.include(` at ${localTime(late)}: `);
      expect(localTime(late)).to.equal('23:59:58.970');
    });

    it('RPN10: not-compared items, including the starting position, are listed one each', () => {
      const area = render(report({
        notCompared: [
          { action: 0, kind: 'coach', reason: 'the position before it is not in the document' },
          { action: 3, kind: 'hint', reason: 'hints and coach are unavailable on an Unrated puzzle' },
        ],
      }));

      expect([...area.querySelector('h4 + ul').children].map(li => [li.className, li.textContent])).to.deep.equal([
        ['', 'Starting position — coach step: not compared — the position before it is not in the document.'],
        ['', 'Action 3 — hint: not compared — hints and coach are unavailable on an Unrated puzzle.'],
      ]);
    });

    it('RPN10: the errors part counts entries and lists each, with the repeat count only after the item', () => {
      const area = render(report({
        errors: {
          recorded: [{ kind: 'listener', afterAction: 2, message: 'bad listener', count: 3 }],
          raised: [{ kind: 'rejection', afterAction: 0, message: 'nope', count: 1 }],
        },
      }));

      expect(area.querySelector('.dev-report-errors').textContent)
        .to.equal('Errors: 1 recorded in the replayed range, 1 raised during this replay.');
      expect([...area.querySelectorAll('li.dev-error-item')].map(li => li.textContent)).to.deep.equal([
        'Recorded — listener exception after action 2: bad listener (×3)',
        'Raised during this replay — unhandled rejection after action 0: nope',
      ]);
    });

    it('RPN9: an empty report event empties the area', () => {
      const { session } = mountFakes();
      session.emit('replay-report', report());

      session.emit('replay-report', null);

      expect($('dev-rec-report').matches(':empty')).to.equal(true);
    });

    it('RPN9: the status line takes the error style only for an outcome flagged as an error', () => {
      const { session } = mountFakes();

      session.emit('replay-status', { text: 'Stopped.', error: true });
      const stopped = isError($('dev-rec-replay-status'));
      session.emit('replay-status', { text: 'Replayed.', error: false });

      expect(stopped).to.equal(true);
      expect($('dev-rec-replay-status').textContent).to.equal('Replayed.');
      expect(isError($('dev-rec-replay-status'))).to.equal(false);
    });

    it('A34: the report is not announced when it is filled', async () => {
      const { session } = mountFakes();

      const { announced } = await announcedBy(() => session.emit('replay-report', report()));

      expect(announced).to.deep.equal([]);
    });
  });

  // ── Status elements ──────────────────────────────────────────────────────

  it('RPN13: the status lines, report and fallback field are never re-created', async () => {
    const r = await mountReal({ confirm: fakeConfirm(true), deps: { copy: async () => false } });
    const ids = ['dev-rec-counts', 'dev-rec-storage', 'dev-rec-history-status', 'dev-rec-fallback', 'dev-rec-replay-status', 'dev-rec-report'];
    const before = ids.map($);

    await clickAndSettle('dev-rec-copy');
    replay('{');
    await settle();
    replay(twoActionDoc());
    await settle();
    withProgress(r);
    await clickAndSettle('dev-rec-clear');
    r.recorder.storageChanged('lost');
    r.session.setLogging('actions', true);

    expect(ids.map($)).to.deep.equal(before);
  });

  // ── Stylesheet ───────────────────────────────────────────────────────────

  describe('with dev.css', () => {
    async function withStylesheet() {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/dev.css';
      const loaded = new Promise(resolve => { link.onload = resolve; });
      document.head.appendChild(link);
      cleanups.push(() => link.remove());
      // The theme stylesheets that define the colour tokens are not loaded here.
      host.style.setProperty('--accent', 'rgb(0, 0, 255)');
      await loaded;
    }
    const display = id => getComputedStyle($(id)).display;

    it('RPN15: the hidden attribute hides the fallback field despite its flex display', async () => {
      await withStylesheet();
      await mountReal({ deps: { copy: async () => false } });

      const hidden = display('dev-rec-fallback');
      await clickAndSettle('dev-rec-copy');

      expect(hidden).to.equal('none');
      expect(display('dev-rec-fallback')).to.equal('flex');
    });

    it('an empty storage line and an empty report take no space; with content they show', async () => {
      await withStylesheet();
      const r = await mountReal();
      const empty = [display('dev-rec-storage'), display('dev-rec-report')];

      r.recorder.storageChanged('lost');
      replay(twoActionDoc());
      await settle();

      expect(empty).to.deep.equal(['none', 'none']);
      expect(display('dev-rec-storage')).to.not.equal('none');
      expect(display('dev-rec-report')).to.not.equal('none');
    });

    for (const id of ['dev-rec-doc', 'dev-rec-stop', 'dev-rec-fallback-text']) {
      it(`A39: #${id} shows a 2px solid focus ring offset 1px`, async () => {
        await withStylesheet();
        await mountReal();
        $('dev-rec-fallback').hidden = false;

        $(id).focus();

        const style = getComputedStyle($(id));
        expect(document.activeElement).to.equal($(id));
        expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).to.deep.equal(['solid', '2px', '1px']);
      });
    }
  });
});
