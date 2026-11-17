/**
 * @fileoverview Session documents (aspec-debug-instrumentation §5, §6.3, §8.2):
 * position, puzzle and action encoding and decoding, the state fingerprint,
 * building, reading, upgrading and validating a session document, and
 * `describeState`. Pure: no DOM, storage, clock or randomness.
 *
 * Document form is plain JSON. Cells are indices 0–80, row-major; a board is
 * an 81-character string of `0`–`9`; marks are 81 arrays of digits 1–9, written
 * ascending without repeats and accepted in any order.
 */

import { DIFFICULTY_ORDER, UNRATED } from '../config.js';
import { iterate, fromDigits } from '../util/bitset.js';
import { deriveCoachedCells } from '../game/state.js';
import { computeConflicts } from '../game/conflicts.js';
import { cellRef } from './inspect.js';

/** Format tag of a session document. */
export const FORMAT = 'sudoku-session';

/** The document format version this build writes and reads. */
export const FORMAT_VERSION = 1;

/**
 * Upgraders from version *v* to *v + 1*, keyed by *v*. Empty until version 2.
 * @type {Object<number, function(object): object>}
 */
export const UPGRADERS = Object.freeze({});

/** Rejection reason for a value that is not a session document (fspec §5.3). */
export const NOT_A_DOCUMENT = 'The JSON is not a session document.';

/** Detail for an action of an unknown kind, or an entry with no action. */
export const DETAIL_UNRECOGNISED = 'it is not a recognised action';

/** Detail for a known kind, or a position, whose data fails its schema. */
export const DETAIL_INVALID = 'its data is incomplete or invalid';

/**
 * @param {number|string} version - The document's version, or `'unknown'`.
 * @param {number} current - The newest version this build reads.
 * @returns {string} The version rejection reason of fspec §5.3.
 */
export function versionReason(version, current) {
  return `It is format version ${version}; this build reads versions 1 to ${current}.`;
}

// ── Document-form typedefs ───────────────────────────────────────────────────

/**
 * @typedef {Object} GenDoc
 * @property {string} requestedTier
 * @property {number|null} seed - null when the puzzle predates seed recording.
 * @property {'random'|'developer'|null} seedBy
 * @property {number} budget
 * @property {number} attempts
 * @property {{unsolved: number, wrongTier: number, byTier: Object<string, number>}} rejected
 * @property {boolean} fallback
 */

/**
 * @typedef {Object} PuzzleDoc
 * @property {string} givens - Board string.
 * @property {string} solution - Board string with no zeros.
 * @property {string} tier - Tier ID or `"unrated"`.
 * @property {'generated'|'link'|'string'|'unknown'} origin
 * @property {string} id
 * @property {GenDoc} [gen] - Origin `"generated"` only, and only when recorded.
 */

/**
 * @typedef {Object} PositionDoc
 * @property {PuzzleDoc|null} puzzle
 * @property {string} board - Givens and pen digits.
 * @property {number[][]} pencil
 * @property {number|null} selected
 * @property {'pen'|'pencil'} mode
 * @property {number|'unlimited'} hintsRemaining
 * @property {boolean} attemptRecorded
 * @property {boolean} won
 * @property {number[]} incorrect - Ascending.
 * @property {boolean} highlightPending - A check highlight is waiting to expire.
 * @property {string} completionMessage
 * @property {null|{board: string, pencil: number[][],
 *   hintsRemaining: number|'unlimited', attemptRecorded: boolean}} undo
 * @property {null|{message: string, difficulty: string|null,
 *   progress: null|{attempts: number, budget: number}}} generating
 * @property {null|{step: object, recap: null|'normal'|'error'|'elim',
 *   focused: number|null, pencilSnapshot: number[][], revealed: number[][]}} coach
 */

/**
 * `{ type, …fields }` with the fields of its kind (aspec §8.2).
 * @typedef {Object} ActionDoc
 * @property {string} type
 */

/**
 * @typedef {Object} ActionEntry
 * @property {number} seq
 * @property {number} t - Epoch milliseconds.
 * @property {ActionDoc} a
 * @property {true} [nc] - The action changed nothing.
 * @property {ActionDoc[]} [f] - Follow-ups.
 */

/**
 * @typedef {Object} ErrorEntry
 * @property {number} seq
 * @property {number} t - Epoch milliseconds.
 * @property {number} n - Repeat count.
 * @property {{kind: 'uncaught'|'rejection'|'listener', message: string,
 *   stack: string|null, source: string|null, action: string|null}} e
 */

/**
 * @typedef {Object} SessionDocument
 * @property {'sudoku-session'} format
 * @property {number} version
 * @property {string} exportedAt - ISO-8601 UTC.
 * @property {number} [seed] - With `tier`, exactly when the start puzzle's seed is known.
 * @property {string} [tier] - The start puzzle's requested tier.
 * @property {PositionDoc} start
 * @property {Array<{at: string, action: ActionDoc, noChange?: true, then?: ActionDoc[]}>} actions
 * @property {Array<{at: string, afterAction: number, kind: string, message: string,
 *   stack: string|null, source: string|null, action: string|null, count: number}>} errors
 */

// ── Field checks ─────────────────────────────────────────────────────────────

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const BOARD = /^[0-9]{81}$/;
const SOLUTION = /^[1-9]{81}$/;
const ORIGINS = ['generated', 'link', 'string', 'unknown'];
const RECAPS = ['normal', 'error', 'elim'];
const ERROR_KINDS = ['uncaught', 'rejection', 'listener'];

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = v => typeof v === 'string';
const isBoolean = v => typeof v === 'boolean';
const isNumber = v => Number.isFinite(v);
const isCell = v => Number.isInteger(v) && v >= 0 && v <= 80;
const isDigit = v => Number.isInteger(v) && v >= 1 && v <= 9;
const isMask = v => Number.isInteger(v) && v >= 0 && v <= 0b111111111;
const isTier = v => DIFFICULTY_ORDER.includes(v) || v === UNRATED;
const isBoard = v => isString(v) && BOARD.test(v);
const isMarks = v => Array.isArray(v) && v.length === 81
  && v.every(digits => Array.isArray(digits) && digits.every(isDigit));
const isHints = v => v === 'unlimited' || isNumber(v);
const isIso = v => isString(v) && ISO_UTC.test(v) && !Number.isNaN(Date.parse(v));
const isNullOr = check => v => v === null || check(v);
const isOptional = (v, check) => v === undefined || check(v);
const isArrayOf = (v, check) => Array.isArray(v) && v.every(check);

// ── Conversions ──────────────────────────────────────────────────────────────

/**
 * @param {ArrayLike<number>} cells - 81 digits 0–9.
 * @returns {string} Board string.
 * @throws {Error} When `cells` is not 81 digits; only reachable from a
 *   malformed console action or a state such an action corrupted.
 */
function boardString(cells) {
  if (cells.length !== 81) throw new Error('A board has 81 cells.');
  let out = '';
  for (let i = 0; i < 81; i++) {
    const d = cells[i];
    if (!(Number.isInteger(d) && d >= 0 && d <= 9)) throw new Error(`Cell ${i} is not a digit.`);
    out += d;
  }
  return out;
}

/** @param {string} board @returns {Uint8Array} */
function boardCells(board) {
  return Uint8Array.from(board, Number);
}

/**
 * @param {ArrayLike<number>} masks - 81 candidate bitmasks.
 * @returns {number[][]} Marks.
 * @throws {Error} When `masks` is not 81 bitmasks of digits 1–9 (as `boardString`).
 */
function marksOf(masks) {
  if (masks.length !== 81) throw new Error('Pencil marks cover 81 cells.');
  return Array.from(masks, (mask, i) => {
    if (!isMask(mask)) throw new Error(`Cell ${i} has an invalid pencil mask.`);
    return iterate(mask);
  });
}

/** @param {number[][]} marks @returns {Uint16Array} */
function masksOf(marks) {
  return Uint16Array.from(marks, fromDigits);
}

const hintsDoc = n => (n === Infinity ? 'unlimited' : n);
const hintsValue = v => (v === 'unlimited' ? Infinity : v);

/** JSON deep copy: a coach step or document part is plain JSON by contract. */
const copyJson = v => JSON.parse(JSON.stringify(v));

/**
 * Whether a check highlight is pending. A GameState holds the deadline; an
 * InternalPosition holds the flag (aspec §5.2).
 *
 * @param {object} state - A GameState or an InternalPosition.
 * @returns {boolean}
 */
function highlightPendingOf(state) {
  return isBoolean(state.highlightPending) ? state.highlightPending : state.incorrectShownUntil > 0;
}

// ── Puzzle ───────────────────────────────────────────────────────────────────

/**
 * @param {object} puzzle - A game puzzle object.
 * @returns {PuzzleDoc} Its document form. `solveTrace` is dropped.
 * @throws {Error} When givens or solution are not 81 digits.
 */
export function encodePuzzle(puzzle) {
  const origin = ['generated', 'link', 'string'].includes(puzzle.source) ? puzzle.source : 'unknown';
  const doc = {
    givens: boardString(puzzle.givens),
    solution: boardString(puzzle.solution),
    tier: puzzle.difficulty,
    origin,
    id: puzzle.id,
  };
  if (origin === 'generated' && puzzle.gen !== undefined) {
    const { gen } = puzzle;
    doc.gen = {
      requestedTier: gen.requestedTier,
      seed: gen.seed ?? null,
      seedBy: gen.seedBy ?? null,
      budget: gen.budget,
      attempts: gen.attempts,
      rejected: {
        unsolved: gen.rejected.unsolved,
        wrongTier: gen.rejected.wrongTier,
        byTier: { ...gen.rejected.byTier },
      },
      fallback: gen.fallback,
    };
  }
  return doc;
}

/**
 * @param {PuzzleDoc} doc - A valid puzzle document.
 * @returns {object} A game puzzle object with `solveTrace: []`. Origin
 *   `"unknown"` leaves `source` unset.
 */
export function decodePuzzle(doc) {
  const puzzle = {
    id: doc.id,
    difficulty: doc.tier,
    givens: boardCells(doc.givens),
    solution: boardCells(doc.solution),
    solveTrace: [],
  };
  if (doc.origin !== 'unknown') puzzle.source = doc.origin;
  if (doc.gen !== undefined) puzzle.gen = copyJson(doc.gen);
  return puzzle;
}

function isGen(g) {
  return isObject(g)
    && isString(g.requestedTier)
    && isNullOr(isNumber)(g.seed)
    && (g.seedBy === null || g.seedBy === 'random' || g.seedBy === 'developer')
    && isNumber(g.budget)
    && isNumber(g.attempts)
    && isObject(g.rejected)
    && isNumber(g.rejected.unsolved)
    && isNumber(g.rejected.wrongTier)
    && isObject(g.rejected.byTier)
    && Object.values(g.rejected.byTier).every(isNumber)
    && isBoolean(g.fallback);
}

function isPuzzleDoc(p) {
  return isObject(p)
    && isBoard(p.givens)
    && isString(p.solution) && SOLUTION.test(p.solution)
    && isTier(p.tier)
    && ORIGINS.includes(p.origin)
    && isString(p.id)
    && (p.gen === undefined || (p.origin === 'generated' && isGen(p.gen)));
}

// ── Coach step ───────────────────────────────────────────────────────────────

/**
 * The fields of a CoachStep the reducer and `coach.js` read (aspec §8.2);
 * other fields pass through untouched. `roles.fin` is required as well:
 * `grid.js` reads it on every coached render.
 */
function isCoachStep(s) {
  return isObject(s)
    && isString(s.technique)
    && (s.type === 'placement' || s.type === 'elimination')
    && isArrayOf(s.digits, isDigit)
    && isObject(s.roles)
    && isNullOr(isCell)(s.roles.target)
    && ['cause', 'elimTarget', 'unitMember', 'scA', 'scB', 'fin'].every(k => isArrayOf(s.roles[k], isCell))
    && isArrayOf(s.eliminations, e => isObject(e) && isCell(e.cellIndex) && isDigit(e.digit))
    && isObject(s.autoReveal)
    && isBoolean(s.autoReveal.required)
    && isArrayOf(s.autoReveal.cells, c => isObject(c) && isCell(c.cellIndex) && isMask(c.candidates))
    && isString(s.supportingText)
    && isObject(s.complexity);
}

function isCoachResult(r) {
  return isObject(r) && r.type === 'no-technique' ? isString(r.reason) : isCoachStep(r);
}

// ── Position ─────────────────────────────────────────────────────────────────

/**
 * Encode a position. Accepts a live GameState or an InternalPosition (they
 * share field names; only the check-highlight field differs).
 *
 * @param {object} state - A GameState or an InternalPosition.
 * @returns {PositionDoc}
 * @throws {Error} When the board or marks hold values a document cannot
 *   represent; reachable only after a malformed console action.
 */
export function encodePosition(state) {
  const { undoSnapshot: undo, coachSession: coach } = state;
  return {
    puzzle: state.puzzle === null ? null : encodePuzzle(state.puzzle),
    board: boardString(state.pen),
    pencil: marksOf(state.pencil),
    selected: state.selected,
    mode: state.activeMode,
    hintsRemaining: hintsDoc(state.hintsRemaining),
    attemptRecorded: state.attemptRecorded,
    won: state.won,
    incorrect: [...state.incorrect].sort((a, b) => a - b),
    highlightPending: highlightPendingOf(state),
    completionMessage: state.completionMessage,
    undo: undo === null ? null : {
      board: boardString(undo.pen),
      pencil: marksOf(undo.pencil),
      hintsRemaining: hintsDoc(undo.hintsRemaining),
      attemptRecorded: undo.attemptRecorded,
    },
    generating: state.generating ? {
      message: state.generatingMessage,
      difficulty: state.generatingDifficulty,
      progress: state.genProgress === null
        ? null
        : { attempts: state.genProgress.attempts, budget: state.genProgress.budget },
    } : null,
    coach: coach === null ? null : {
      step: copyJson(coach.step),
      recap: coach.recap,
      focused: coach.focusedCoachedCell,
      pencilSnapshot: marksOf(coach.pencilSnapshot),
      revealed: marksOf(coach.coachRevealedBits),
    },
  };
}

/**
 * Elimination bitmask per target cell, built from the eliminations as the
 * reducer builds it at COACH_START.
 */
function eliminationTargetsOf(step) {
  if (step.type !== 'elimination') return null;
  const targets = new Map();
  for (const { cellIndex, digit } of step.eliminations) {
    targets.set(cellIndex, (targets.get(cellIndex) ?? 0) | (1 << (digit - 1)));
  }
  return targets;
}

function decodeCoach(doc) {
  const step = copyJson(doc.step);
  return {
    step,
    coachedCells: doc.recap === null ? deriveCoachedCells(step) : new Set(),
    focusedCoachedCell: doc.focused,
    pencilSnapshot: masksOf(doc.pencilSnapshot),
    coachRevealedBits: masksOf(doc.revealed),
    eliminationTargets: eliminationTargetsOf(step),
    recap: doc.recap,
  };
}

/**
 * @param {PositionDoc} doc - A valid position document.
 * @returns {import('../game/state.js').InternalPosition} Shares nothing with `doc`.
 */
export function decodePosition(doc) {
  const { undo, generating, coach } = doc;
  return {
    puzzle: doc.puzzle === null ? null : decodePuzzle(doc.puzzle),
    pen: boardCells(doc.board),
    pencil: masksOf(doc.pencil),
    selected: doc.selected,
    activeMode: doc.mode,
    incorrect: new Set(doc.incorrect),
    highlightPending: doc.highlightPending,
    hintsRemaining: hintsValue(doc.hintsRemaining),
    attemptRecorded: doc.attemptRecorded,
    won: doc.won,
    generating: generating !== null,
    generatingMessage: generating === null ? '' : generating.message,
    generatingDifficulty: generating === null ? null : generating.difficulty,
    genProgress: generating === null || generating.progress === null
      ? null
      : { attempts: generating.progress.attempts, budget: generating.progress.budget },
    completionMessage: doc.completionMessage,
    coachSession: coach === null ? null : decodeCoach(coach),
    undoSnapshot: undo === null ? null : {
      pen: boardCells(undo.board),
      pencil: masksOf(undo.pencil),
      hintsRemaining: hintsValue(undo.hintsRemaining),
      attemptRecorded: undo.attemptRecorded,
    },
  };
}

function isUndoDoc(u) {
  return isObject(u) && isBoard(u.board) && isMarks(u.pencil)
    && isHints(u.hintsRemaining) && isBoolean(u.attemptRecorded);
}

function isGeneratingDoc(g) {
  return isObject(g) && isString(g.message) && isNullOr(isString)(g.difficulty)
    && isNullOr(p => isObject(p) && isNumber(p.attempts) && isNumber(p.budget))(g.progress);
}

function isCoachDoc(c) {
  return isObject(c) && isCoachStep(c.step)
    && (c.recap === null || RECAPS.includes(c.recap))
    && isNullOr(isCell)(c.focused)
    && isMarks(c.pencilSnapshot) && isMarks(c.revealed);
}

function isPositionDoc(p) {
  return isObject(p)
    && isNullOr(isPuzzleDoc)(p.puzzle)
    && isBoard(p.board)
    && isMarks(p.pencil)
    && isNullOr(isCell)(p.selected)
    && (p.mode === 'pen' || p.mode === 'pencil')
    && isHints(p.hintsRemaining)
    && isBoolean(p.attemptRecorded)
    && isBoolean(p.won)
    && isArrayOf(p.incorrect, isCell)
    && isBoolean(p.highlightPending)
    && isString(p.completionMessage)
    && isNullOr(isUndoDoc)(p.undo)
    && isNullOr(isGeneratingDoc)(p.generating)
    && isNullOr(isCoachDoc)(p.coach);
}

/**
 * Structural validation of a position document. Whether its puzzle is a valid
 * puzzle with that solution is checked separately (aspec §8.3 step 4).
 *
 * @param {*} doc
 * @returns {{ok: true} | {ok: false, detail: string}}
 */
export function validatePosition(doc) {
  return isPositionDoc(doc) ? { ok: true } : { ok: false, detail: DETAIL_INVALID };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** A kind with no fields beyond its type. */
const BARE = {
  encode: a => ({ type: a.type }),
  validate: () => true,
  decode: d => ({ type: d.type }),
};

/** A kind whose listed fields are copied verbatim in both directions. */
function verbatim(fields) {
  const copy = src => {
    const out = { type: src.type };
    for (const [name, , optional] of fields) {
      if (optional && src[name] == null) continue;
      out[name] = src[name];
    }
    return out;
  };
  return {
    encode: copy,
    validate: d => fields.every(([name, check, optional]) =>
      (optional ? isOptional(d[name], check) : check(d[name]))),
    decode: copy,
  };
}

const POSITION_KIND = {
  encode: a => ({ type: a.type, position: encodePosition(a.position) }),
  validate: d => isPositionDoc(d.position),
  decode: d => ({ type: 'DEV_RESTORE_POSITION', position: decodePosition(d.position) }),
};

const PUZZLE_LOADED_KIND = {
  encode: a => ({ type: a.type, puzzle: encodePuzzle(a.puzzle) }),
  validate: d => isPuzzleDoc(d.puzzle),
  decode: d => ({ type: d.type, puzzle: decodePuzzle(d.puzzle) }),
};

/**
 * Every recordable action kind (aspec §8.2): the encoder's schema, the
 * validator's schema and the decoder. Keys are exactly the reducer's action
 * types plus `PAGE_RELOADED`. `validate` takes a document with a known `type`
 * and reports whether its fields fit the kind.
 *
 * Optional fields are omitted when absent or null, which the reducer treats
 * alike (`??`); `HINT.hint` is the exception, where null is a recorded answer.
 *
 * @type {Readonly<Object<string, {encode: function(object): ActionDoc,
 *   validate: function(ActionDoc): boolean, decode: function(ActionDoc): object}>>}
 */
export const KINDS = Object.freeze({
  PUZZLE_LOADED: PUZZLE_LOADED_KIND,
  NEW_PUZZLE: {
    encode: a => ({ type: a.type, difficulty: a.difficulty, puzzle: encodePuzzle(a.puzzle) }),
    validate: d => isTier(d.difficulty) && isPuzzleDoc(d.puzzle),
    decode: d => ({ type: d.type, difficulty: d.difficulty, puzzle: decodePuzzle(d.puzzle) }),
  },
  SELECT_CELL: verbatim([['index', isCell]]),
  DESELECT: BARE,
  SELECT_FIRST_CELL: BARE,
  TOGGLE_MODE: BARE,
  ERASE: BARE,
  ERASE_ALL_PENCIL: BARE,
  UNDO: BARE,
  CHECK: BARE,
  ON_COMPLETION_EVALUATE: BARE,
  CLEAR_INCORRECT: BARE,
  RESET_PUZZLE: BARE,
  COACH_FOCUS_OFF: BARE,
  ARROW_NAV: verbatim([['direction', isString]]),
  SET_MODE: verbatim([['mode', v => v === 'pen' || v === 'pencil']]),
  PEN_ENTER: verbatim([['digit', isDigit], ['fromHint', isBoolean, true]]),
  PENCIL_TOGGLE: verbatim([['digit', isDigit]]),
  HINT: {
    encode: a => (a.hint === undefined ? { type: a.type } : {
      type: a.type,
      hint: a.hint === null
        ? null
        : { cellIndex: a.hint.cellIndex, digit: a.hint.digit, technique: a.hint.technique },
    }),
    validate: d => isOptional(d.hint, isNullOr(h =>
      isObject(h) && isCell(h.cellIndex) && isDigit(h.digit) && isString(h.technique))),
    decode: d => (d.hint === undefined ? { type: d.type } : {
      type: d.type,
      hint: d.hint === null
        ? null
        : { cellIndex: d.hint.cellIndex, digit: d.hint.digit, technique: d.hint.technique },
    }),
  },
  CHANGE_DIFFICULTY: verbatim([['difficulty', isString]]),
  RESTORE_SESSION: {
    encode: a => {
      const d = { type: a.type };
      if (a.attemptRecorded != null) d.attemptRecorded = a.attemptRecorded;
      if (a.hintsRemaining != null) d.hintsRemaining = hintsDoc(a.hintsRemaining);
      return d;
    },
    validate: d => isOptional(d.attemptRecorded, isBoolean) && isOptional(d.hintsRemaining, isHints),
    decode: d => {
      const a = { type: d.type };
      if (d.attemptRecorded !== undefined) a.attemptRecorded = d.attemptRecorded;
      if (d.hintsRemaining !== undefined) a.hintsRemaining = hintsValue(d.hintsRemaining);
      return a;
    },
  },
  DEV_SET_BOARD: {
    encode: a => {
      const d = { type: a.type, pen: boardString(a.pen) };
      if (a.pencil) d.pencil = marksOf(a.pencil);
      return d;
    },
    validate: d => isBoard(d.pen) && isOptional(d.pencil, isMarks),
    decode: d => {
      const a = { type: d.type, pen: boardCells(d.pen) };
      if (d.pencil !== undefined) a.pencil = masksOf(d.pencil);
      return a;
    },
  },
  DEV_SET_PENCIL: {
    encode: a => {
      if (!isMask(a.mask)) throw new Error('DEV_SET_PENCIL mask is not a bitmask of digits 1–9.');
      return { type: a.type, index: a.index, digits: iterate(a.mask) };
    },
    validate: d => isCell(d.index) && isArrayOf(d.digits, isDigit),
    decode: d => ({ type: d.type, index: d.index, mask: fromDigits(d.digits) }),
  },
  DEV_FILL_PENCIL: {
    encode: a => ({ type: a.type, pencil: marksOf(a.pencil) }),
    validate: d => isMarks(d.pencil),
    decode: d => ({ type: d.type, pencil: masksOf(d.pencil) }),
  },
  SET_GENERATING: verbatim([
    ['flag', isBoolean], ['message', isString, true], ['difficulty', isString, true],
  ]),
  GEN_PROGRESS: verbatim([['attempts', isNumber], ['budget', isNumber]]),
  COACH_START: {
    encode: a => ({ type: a.type, result: copyJson(a.result) }),
    validate: d => isCoachResult(d.result),
    decode: d => ({ type: d.type, result: copyJson(d.result) }),
  },
  COACH_NO_TECHNIQUE: verbatim([['reason', isString]]),
  COACH_END: verbatim([['reason', isString, true]]),
  COACH_FILL_RECAP: verbatim([['variant', v => RECAPS.includes(v)]]),
  COACH_FOCUS_COACHED_CELL: verbatim([['index', isCell]]),
  PAGE_RELOADED: POSITION_KIND,
  DEV_RESTORE_POSITION: POSITION_KIND,
});

/**
 * Encode a live action for the history (aspec §6.2).
 *
 * `PAGE_RELOADED` is synthesised by the recorder, never dispatched; a live
 * action of that type has no reducer case, so it is unrecordable here. The
 * recorder builds the boot entry with `KINDS.PAGE_RELOADED.encode`.
 *
 * @param {object} action - As dispatched.
 * @returns {ActionDoc|null} null when the action is unrecordable: an unknown
 *   type, or data that does not fit its kind.
 */
export function encodeAction(action) {
  if (!isObject(action) || action.type === 'PAGE_RELOADED' || !Object.hasOwn(KINDS, action.type)) {
    return null;
  }
  const kind = KINDS[action.type];
  let doc;
  try {
    doc = kind.encode(action);
  } catch {
    // Data a document cannot represent (a missing puzzle, a stray mask).
    return null;
  }
  return kind.validate(doc) ? doc : null;
}

/**
 * @param {ActionDoc} doc - A valid action document.
 * @returns {object} The action to dispatch; shares nothing with `doc`.
 * @throws {TypeError} When `doc.type` is not a kind.
 */
export function decodeAction(doc) {
  return KINDS[doc.type].decode(doc);
}

/**
 * @param {*} doc
 * @returns {{ok: true} | {ok: false, detail: string}}
 */
export function validateAction(doc) {
  if (!isObject(doc) || !Object.hasOwn(KINDS, doc.type)) {
    return { ok: false, detail: DETAIL_UNRECOGNISED };
  }
  return KINDS[doc.type].validate(doc) ? { ok: true } : { ok: false, detail: DETAIL_INVALID };
}

/**
 * Validate one item of a document's `actions`: `{ at, action, noChange?, then? }`.
 * Checked in order: the action, `at`, `noChange`, `then`, each follow-up.
 *
 * @param {*} item
 * @returns {{ok: true} | {ok: false, detail: string}}
 */
export function validateActionItem(item) {
  if (!isObject(item)) return { ok: false, detail: DETAIL_UNRECOGNISED };
  const action = validateAction(item.action);
  if (!action.ok) return action;
  if (!isIso(item.at)
      || !isOptional(item.noChange, v => v === true)
      || !isOptional(item.then, Array.isArray)) {
    return { ok: false, detail: DETAIL_INVALID };
  }
  for (const followUp of item.then ?? []) {
    const result = validateAction(followUp);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * Informational actions are the coach's answer: they change no state by
 * design and are never marked "changed nothing" (aspec §6.3).
 *
 * @param {ActionDoc} doc
 * @returns {boolean}
 */
export function isInformational(doc) {
  return doc.type === 'COACH_NO_TECHNIQUE'
    || (doc.type === 'COACH_START' && doc.result.type === 'no-technique');
}

// ── Fingerprint ──────────────────────────────────────────────────────────────

const joined = cells => Array.from(cells).join(',');

/**
 * State fingerprint (aspec §6.3): one string per part. Equal fingerprints mean
 * equal positions for every purpose of the recorder and replay.
 *
 * @param {object} state - A GameState or an InternalPosition.
 * @returns {{puzzle: string, board: string, pencil: string, selected: string,
 *   mode: string, hints: string, won: string, highlight: string, undo: string,
 *   generating: string, coach: string}}
 */
export function fingerprint(state) {
  const { puzzle, undoSnapshot: undo, coachSession: coach } = state;
  return {
    puzzle: puzzle === null ? 'none' : JSON.stringify([puzzle.id, puzzle.difficulty, joined(puzzle.givens)]),
    board: joined(state.pen),
    pencil: joined(state.pencil),
    selected: String(state.selected),
    mode: state.activeMode,
    hints: JSON.stringify([String(state.hintsRemaining), state.attemptRecorded]),
    won: String(state.won),
    highlight: JSON.stringify([
      [...state.incorrect].sort((a, b) => a - b), highlightPendingOf(state), state.completionMessage,
    ]),
    undo: undo === null ? 'none' : JSON.stringify([
      joined(undo.pen), joined(undo.pencil), String(undo.hintsRemaining), undo.attemptRecorded,
    ]),
    generating: !state.generating ? 'none' : JSON.stringify([
      state.generatingMessage,
      state.generatingDifficulty,
      state.genProgress === null ? null : [state.genProgress.attempts, state.genProgress.budget],
    ]),
    coach: coach === null ? 'none' : JSON.stringify([
      coach.step.technique, coach.step.roles.target, coach.recap, coach.focusedCoachedCell,
      joined(coach.pencilSnapshot), joined(coach.coachRevealedBits),
    ]),
  };
}

// ── Document ─────────────────────────────────────────────────────────────────

/**
 * Build a session document from a history (aspec §5.4, §6.6). The result
 * shares nothing with its arguments.
 *
 * @param {{start: PositionDoc, entries: Array<ActionEntry|ErrorEntry>, exportedAt: number}} history
 *   `exportedAt` is epoch milliseconds.
 * @returns {SessionDocument}
 */
export function buildDocument({ start, entries, exportedAt }) {
  const doc = { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date(exportedAt).toISOString() };
  const gen = start.puzzle === null ? undefined : start.puzzle.gen;
  if (gen !== undefined && typeof gen.seed === 'number') {
    doc.seed = gen.seed;
    doc.tier = gen.requestedTier;
  }
  doc.start = start;
  doc.actions = [];
  doc.errors = [];
  for (const entry of entries) {
    const at = new Date(entry.t).toISOString();
    if ('a' in entry) {
      const item = { at, action: entry.a };
      if (entry.nc === true) item.noChange = true;
      if (entry.f !== undefined) item.then = entry.f;
      doc.actions.push(item);
    } else {
      const { kind, message, stack, source, action } = entry.e;
      doc.errors.push({
        at, afterAction: doc.actions.length, kind, message, stack, source, action, count: entry.n,
      });
    }
  }
  return copyJson(doc);
}

function isErrorItem(e) {
  return isObject(e)
    && isIso(e.at)
    && Number.isInteger(e.afterAction) && e.afterAction >= 0
    && ERROR_KINDS.includes(e.kind)
    && isString(e.message)
    && isNullOr(isString)(e.stack)
    && isNullOr(isString)(e.source)
    && isNullOr(isString)(e.action)
    && Number.isInteger(e.count) && e.count >= 1;
}

/**
 * Read a session document (aspec §5.4, §5.5): check the format, then the
 * version, upgrade an older document to the current layout, then check the
 * top-level shape. `start` and `actions` are validated separately
 * (`validatePosition`, `validateActionItem`), so that a replay can report the
 * first failure in fspec §5.3 order.
 *
 * @param {*} input - A parsed JSON value. Not mutated.
 * @param {{current?: number, upgraders?: Object<number, function(object): object>}} [opts]
 * @returns {{ok: true, doc: SessionDocument, readAs: number, writtenAs: number}
 *   | {ok: false, reason: string}}
 */
export function readDocument(input, { current = FORMAT_VERSION, upgraders = UPGRADERS } = {}) {
  if (!isObject(input) || input.format !== FORMAT) return { ok: false, reason: NOT_A_DOCUMENT };
  const writtenAs = input.version;
  if (!Number.isInteger(writtenAs) || writtenAs < 1) {
    return { ok: false, reason: versionReason('unknown', current) };
  }
  if (writtenAs > current) return { ok: false, reason: versionReason(writtenAs, current) };

  let doc = copyJson(input);
  while (doc.version < current) doc = upgraders[doc.version](doc);

  const shapeOk = isIso(doc.exportedAt)
    && (doc.seed === undefined) === (doc.tier === undefined)
    && isOptional(doc.seed, isNumber)
    && isOptional(doc.tier, isString)
    && isObject(doc.start)
    && Array.isArray(doc.actions)
    && isArrayOf(doc.errors, isErrorItem);
  if (!shapeOk) return { ok: false, reason: NOT_A_DOCUMENT };
  return { ok: true, doc, readAs: doc.version, writtenAs };
}

// ── describeState ────────────────────────────────────────────────────────────

const refs = cells => [...cells].sort((a, b) => a - b).map(cellRef);

function boardText(pen) {
  const lines = [];
  for (let r = 0; r < 9; r++) {
    const row = Array.from(pen.subarray(r * 9, r * 9 + 9), d => (d === 0 ? '.' : String(d)));
    lines.push(`${row.slice(0, 3).join(' ')} | ${row.slice(3, 6).join(' ')} | ${row.slice(6).join(' ')}`);
    if (r === 2 || r === 5) lines.push('------+-------+------');
  }
  return lines.join('\n');
}

function describePuzzle(puzzle) {
  const doc = encodePuzzle(puzzle);
  const out = { givens: doc.givens, solution: doc.solution, tier: doc.tier, origin: doc.origin };
  if (doc.gen !== undefined) {
    out.requestedTier = doc.gen.requestedTier;
    out.seed = doc.gen.seed;
    out.fallback = doc.gen.fallback;
  }
  return out;
}

function describeHints(state) {
  if (state.puzzle !== null && state.puzzle.difficulty === UNRATED) return null;
  return hintsDoc(state.hintsRemaining);
}

/**
 * The developer API's `state()` (fspec §6.2). Conflicts are computed from the
 * board, so this accepts an InternalPosition as well as a GameState.
 *
 * @param {object} state - A GameState or an InternalPosition.
 * @param {{actions: number, errors: number, capacity: number}} counts - Recorder counts.
 * @returns {object} Plain JSON.
 */
export function describeState(state, { actions, errors, capacity }) {
  return {
    puzzle: state.puzzle === null ? null : describePuzzle(state.puzzle),
    board: boardString(state.pen),
    pencilMarks: marksOf(state.pencil),
    selected: state.selected === null ? null : cellRef(state.selected),
    mode: state.activeMode,
    hintsRemaining: describeHints(state),
    won: state.won,
    generating: state.generating,
    // As the Undo button: a snapshot exists and the reducer would apply it.
    undoAvailable: state.undoSnapshot !== null && !state.won && !state.generating,
    coachActive: state.coachSession !== null,
    conflicts: refs(computeConflicts(state.pen)),
    flaggedIncorrect: refs(state.incorrect),
    recorder: { actions, errors, capacity },
    text: boardText(state.pen),
  };
}
