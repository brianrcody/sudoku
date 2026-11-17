/**
 * @fileoverview Canonical traces of a game-state store, for comparing two
 * reducers (or two configurations of one) emit by emit.
 *
 * A trace is an ordered list of records:
 * - `{ e: 'dispatch', type }` — a dispatch issued by the driving script;
 * - `{ e: 'emit', action, changed, state }` — one `changed` emit: the action
 *   that produced it, the changed keys sorted, and a snapshot of the whole state;
 * - `{ e: 'stats', method, difficulty }` — a statistics call;
 * - `{ e: 'hint', puzzle, pen, conflicts, targetCell }` — a hint-provider call.
 *
 * Canonical form: typed arrays become comma-joined strings, sets sorted arrays,
 * maps sorted entry lists, the puzzle its id, a coach step its technique, and
 * `incorrectShownUntil` the boolean `incorrectShownUntil > 0` (the deadline is
 * wall-clock time). `Infinity` is kept as the string `'Infinity'` so it
 * survives JSON.
 */

/**
 * @param {*} value
 * @returns {*} A JSON-safe canonical form of `value`.
 */
export function canonical(value) {
  if (value === Infinity) return 'Infinity';
  if (value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value).join(',');
  if (value instanceof Set) return [...value].sort((a, b) => a - b);
  if (value instanceof Map) {
    return [...value.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, canonical(v)]);
  }
  if (Array.isArray(value)) return value.map(canonical);
  if ('givens' in value && 'solution' in value) return `puzzle:${value.id}`;
  if ('technique' in value && 'roles' in value) return `step:${value.technique}`;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}

/**
 * @param {object} state - A live GameState.
 * @returns {object} Its canonical snapshot.
 */
export function snapshotState(state) {
  const snap = canonical(state);
  snap.incorrectShownUntil = state.incorrectShownUntil > 0;
  return snap;
}

/**
 * Builds a store whose emits, statistics calls, and hint-provider calls are
 * appended to one ordered trace.
 *
 * @param {function} createGameState - The reducer factory under test.
 * @param {{
 *   hint?: function(object, object, object): (object|null),
 *   extraDeps?: object,
 * }} [opts] `hint` computes the provider's answer; `extraDeps` are passed to
 *   `createGameState` alongside `stats` and `hintProvider` (e.g. `tap`, `timers`).
 * @returns {{ store: object, trace: object[] }}
 */
export function createTracedStore(createGameState, { hint = () => null, extraDeps = {} } = {}) {
  const trace = [];
  const stats = {
    recordAttemptOnce: difficulty => { trace.push({ e: 'stats', method: 'recordAttemptOnce', difficulty }); },
    recordWin: difficulty => { trace.push({ e: 'stats', method: 'recordWin', difficulty }); },
  };
  const hintProvider = {
    nextHint(puzzle, playerState, opts) {
      trace.push({
        e: 'hint',
        puzzle: puzzle.id,
        pen: canonical(playerState.pen),
        conflicts: canonical(playerState.conflicts),
        targetCell: opts.targetCell,
      });
      return hint(puzzle, playerState, opts);
    },
  };
  const store = createGameState({ stats, hintProvider, ...extraDeps });
  store.on('changed', ({ action, changed }) => {
    trace.push({
      e: 'emit',
      action: canonical(action),
      changed: [...changed].sort(),
      state: snapshotState(store.getState()),
    });
  });
  return { store, trace };
}

/**
 * @param {object[]} actual
 * @param {object[]} expected
 * @returns {string|null} A description of the first differing record, or null
 *   when the traces are identical.
 */
export function firstDivergence(actual, expected) {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = JSON.stringify(actual[i]);
    const b = JSON.stringify(expected[i]);
    if (a !== b) {
      const lastDispatch = expected.slice(0, i + 1).reverse().find(r => r.e === 'dispatch');
      return `record ${i} (after dispatch ${lastDispatch?.type ?? 'none'}${lastDispatch ? ` #${lastDispatch.n}` : ''})\n` +
        `  expected: ${b}\n  actual:   ${a}`;
    }
  }
  return null;
}
