/**
 * @fileoverview The Session recorder tool (fspec-007 §10.1;
 * aspec-debug-instrumentation §12.1): history counts and storage line, Copy
 * session, Clear history, the logging switches, and Replay with its report.
 *
 * Every operation goes through the shared controller, which announces each
 * outcome; the panel only renders. Replay status and report arrive as
 * controller events, so a replay or a clear made through `window.sudokuDev`
 * fills the same elements.
 */

import { announce } from '../ui/srLive.js';
import { count, formatReportLines } from './replay.js';

const NOT_SAVED = 'History is not being saved — it will be lost on reload.';

/** Storage-line text for each store status (fspec §3.4, §3.5). */
const STORAGE_MESSAGES = {
  ok: '',
  discarded: 'The saved history couldn\'t be read and was discarded.',
  failing: NOT_SAVED,
  unavailable: NOT_SAVED,
  lost: 'Another tab has taken over the saved history. This tab\'s history is kept until it is closed or reloaded.',
};

/** Logging switch element ids, keyed by category. */
const SWITCHES = {
  generation: 'dev-log-generation',
  swallowed: 'dev-log-swallowed',
  actions: 'dev-log-actions',
};

// The whole developer panel carries data-keep-selection (fspec D-35 e): the
// grid's outside-click DESELECT would otherwise be recorded as the panel is
// used, so a cleared history would not stay empty and a replay right after a
// clear would always ask (fspec §3.3, §12).

/** The divergence line's trailing clause, shown in a muted span (vspec §4.4). */
const ALSO_DIFFERS = ' Also differs: ';

const switchMarkup = (id, label, tag) => `
          <button type="button" class="dev-switch" id="${id}" role="switch" aria-checked="false">
            <span class="dev-switch-track" aria-hidden="true"><span class="dev-switch-thumb"></span></span>
            <span>${label}</span>
            <span class="dev-switch-tag" aria-hidden="true">${tag}</span>
          </button>`;

const MARKUP = `
    <details class="dev-tool" id="dev-rec">
      <summary>Session recorder</summary>
      <div class="dev-tool-body">

        <section class="dev-group" aria-labelledby="dev-rec-history-title">
          <h3 class="dev-group-title" id="dev-rec-history-title">History</h3>
          <p class="dev-counts" id="dev-rec-counts"></p>
          <p class="dev-callout" id="dev-rec-storage" role="status"></p>
          <div class="dev-buttons">
            <button type="button" class="btn" id="dev-rec-copy"
                    aria-label="Copy session document">Copy session</button>
            <button type="button" class="btn dev-btn-danger dev-btn-end"
                    id="dev-rec-clear" data-keep-selection>Clear history</button>
          </div>
          <p class="dev-status" id="dev-rec-history-status" role="status"></p>
          <div class="dev-field" id="dev-rec-fallback" hidden>
            <label for="dev-rec-fallback-text">Session document</label>
            <textarea class="dev-textarea" id="dev-rec-fallback-text" rows="6" readonly
                      spellcheck="false" autocomplete="off"></textarea>
          </div>
        </section>

        <section class="dev-group" aria-labelledby="dev-rec-log-title">
          <h3 class="dev-group-title" id="dev-rec-log-title">Console logging</h3>
          <div class="dev-switches">${
            switchMarkup(SWITCHES.generation, 'Log generation worker', '[dev:gen]')}${
            switchMarkup(SWITCHES.swallowed, 'Log swallowed exceptions', '[dev:swallowed]')}${
            switchMarkup(SWITCHES.actions, 'Log action trace', '[dev:action]')}
          </div>
        </section>

        <section class="dev-group" aria-labelledby="dev-rec-replay-title">
          <h3 class="dev-group-title" id="dev-rec-replay-title">Replay</h3>
          <div class="dev-field">
            <label for="dev-rec-doc">Session document to replay</label>
            <textarea class="dev-textarea" id="dev-rec-doc" rows="4" spellcheck="false"
                      autocomplete="off" placeholder="Paste a session document (JSON)"></textarea>
          </div>
          <div class="dev-inline">
            <div class="dev-field">
              <label for="dev-rec-stop">Stop after action</label>
              <input class="dev-input" id="dev-rec-stop" type="text" inputmode="numeric"
                     pattern="[0-9]*" spellcheck="false" autocomplete="off"
                     aria-describedby="dev-rec-stop-hint">
            </div>
            <button type="button" class="btn" id="dev-rec-replay" data-keep-selection>Replay</button>
          </div>
          <p class="dev-field-hint" id="dev-rec-stop-hint">Optional. Leave empty to replay every action.</p>
          <p class="dev-status" id="dev-rec-replay-status" role="status"></p>
          <div class="dev-report" id="dev-rec-report" role="region"
               aria-label="Replay report" tabindex="0"></div>
        </section>

      </div>
    </details>
  `;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function setStatus(el, text, error = false) {
  el.classList.toggle('dev-error', error);
  el.textContent = text;
}

/**
 * Append the Session recorder tool to the panel and wire it.
 *
 * @param {HTMLElement} panel - The developer panel; the tool goes after Generation diagnostics.
 * @param {Object} deps
 * @param {import('./devSession.js').DevSession} deps.session
 * @param {import('./recorder.js').Recorder} deps.recorder
 * @param {import('./devLog.js').DevLog} deps.log
 */
export function mount(panel, { session, recorder, log }) {
  panel.insertAdjacentHTML('beforeend', MARKUP);
  const el = id => panel.querySelector(`#${id}`);

  const counts = el('dev-rec-counts');
  const storage = el('dev-rec-storage');
  const historyStatus = el('dev-rec-history-status');
  const fallback = el('dev-rec-fallback');
  const fallbackText = el('dev-rec-fallback-text');
  const replayStatus = el('dev-rec-replay-status');
  const report = el('dev-rec-report');

  // ── History ───────────────────────────────────────────────────────────────

  function renderCounts() {
    const { actions, errors, capacity, atCapacity } = recorder.counts();
    counts.textContent = `${count(actions, 'action')}, ${count(errors, 'error')} recorded.`;
    if (atCapacity) {
      counts.append(' ', element('span', 'dev-capacity',
        `At capacity (${count(capacity)}): the oldest entries are being discarded.`));
    }
  }

  // Progress entries can arrive in bursts; one text update per frame.
  let countsPending = false;
  recorder.on('change', () => {
    if (countsPending) return;
    countsPending = true;
    requestAnimationFrame(() => {
      countsPending = false;
      renderCounts();
    });
  });
  renderCounts();

  // A message already in force was set before this subscription; announce it once now (fspec D-35 d).
  storage.textContent = STORAGE_MESSAGES[recorder.storageStatus()];
  if (storage.textContent) announce(storage.textContent);
  recorder.on('storage', status => {
    const message = STORAGE_MESSAGES[status];
    if (message === storage.textContent) return;
    storage.textContent = message;
    if (message) announce(message);
  });

  el('dev-rec-copy').addEventListener('click', async () => {
    const result = await session.copySession();
    setStatus(historyStatus, result.message, !result.ok);
    fallback.hidden = result.ok;
    if (!result.ok) {
      fallbackText.value = result.document;
      fallbackText.focus();
      fallbackText.select();
      fallbackText.scrollTop = 0;
    }
  });

  el('dev-rec-clear').addEventListener('click', async () => {
    const result = await session.clearHistory({ ask: true });
    setStatus(historyStatus, result.message);
  });

  session.on('cleared', () => {
    report.replaceChildren();
    fallback.hidden = true;
  });
  session.on('cleared-fallback', () => {
    fallback.hidden = true;
  });

  // ── Logging switches ──────────────────────────────────────────────────────

  // aria-checked follows the log, so a change made through the API shows too.
  function renderSwitches(switches) {
    for (const [category, id] of Object.entries(SWITCHES)) {
      el(id).setAttribute('aria-checked', String(switches[category]));
    }
  }

  for (const [category, id] of Object.entries(SWITCHES)) {
    const toggle = el(id);
    toggle.addEventListener('click', () => {
      session.setLogging(category, toggle.getAttribute('aria-checked') !== 'true');
    });
  }
  log.on('change', renderSwitches);
  renderSwitches(log.get());

  // ── Replay ────────────────────────────────────────────────────────────────

  el('dev-rec-replay').addEventListener('click', () => {
    session.replay(el('dev-rec-doc').value, { stopAfter: el('dev-rec-stop').value }, { ask: true }, 'panel');
  });

  session.on('replay-status', ({ text, error }) => setStatus(replayStatus, text, error));
  session.on('replay-report', value => {
    if (value === null) report.replaceChildren();
    else report.replaceChildren(...reportParts(formatReportLines(value)));
  });
}

/**
 * The report area's contents, in display order (fspec §5.8; vspec §4.4).
 *
 * @param {import('./replay.js').ReportLines} lines
 * @returns {HTMLElement[]}
 */
function reportParts(lines) {
  const list = items => {
    const ul = element('ul');
    ul.append(...items);
    return ul;
  };
  const parts = [
    element('p', 'dev-report-scope', lines.scope),
    element('p', 'dev-report-summary', lines.summary),
  ];
  if (lines.divergences.length > 0) parts.push(list(lines.divergences.map(divergenceItem)));
  if (lines.notCompared.length > 0) {
    parts.push(element('h4', null, 'Not compared'), list(lines.notCompared.map(text => element('li', null, text))));
  }
  if (lines.errors !== null) {
    parts.push(
      element('p', 'dev-report-errors', lines.errors.summary),
      list(lines.errors.items.map(text => element('li', 'dev-error-item', text))),
    );
  }
  return parts;
}

/** One expandable divergence: its line, then the recorded and current values as JSON. */
function divergenceItem({ text, recorded, current }) {
  const summary = element('summary');
  const also = text.indexOf(ALSO_DIFFERS);
  if (also === -1) {
    summary.textContent = text;
  } else {
    summary.append(`${text.slice(0, also)} `, element('span', 'dev-report-also', text.slice(also + 1)));
  }

  const block = (label, json) => {
    const pre = element('pre', 'dev-json', json);
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', `${label} values`);
    return [element('div', 'dev-compare-label', label), pre];
  };
  const compare = element('div', 'dev-compare');
  compare.append(...block('Recorded', recorded), ...block('Current', current));

  const details = element('details');
  details.append(summary, compare);
  const li = element('li', 'dev-diverge');
  li.append(details);
  return li;
}
