/**
 * @fileoverview Session codec (tspec-debug-instrumentation SC1–SC35, PR1):
 * action kinds, puzzle and position encoding, validation, the fingerprint,
 * `describeState`, and reading and building session documents.
 */

import {
  FORMAT, FORMAT_VERSION, UPGRADERS, NOT_A_DOCUMENT, DETAIL_UNRECOGNISED, DETAIL_INVALID,
  versionReason, encodePuzzle, decodePuzzle, encodePosition, decodePosition, validatePosition,
  KINDS, encodeAction, decodeAction, validateAction, validateActionItem, isInformational,
  fingerprint, buildDocument, readDocument, describeState,
} from '../../dev/sessionCodec.js';
import { createMachine } from '../../dev/machine.js';
import { deriveCoachedCells } from '../../game/state.js';
import { nextHint } from '../../providers/hintProvider.js';
import { loadFromGivens } from '../../generator/loadPuzzle.js';
import { MEDIUM, HARD, toGivens } from '../fixtures/puzzles/loadable.js';
import { GOLDEN_PUZZLES } from '../helpers/goldenScript.js';
import { createSessionDriver } from '../helpers/sessionDriver.js';
import {
  KIDDIE, KIDDIE_SOLUTION, SOLUTION, NEARLY_SOLVED, wrong, bit, makeGen, makePuzzle,
  placementStep, eliminationStep, emptyMarks, marksWith, puzzleDoc, plainPositionDoc,
  richPositionDoc, manualTimers, devModeStore, viaJson,
} from '../helpers/codecFixtures.js';

const INVALID = 'its data is incomplete or invalid';
const UNRECOGNISED = 'it is not a recognised action';
const NOT_DOC = 'The JSON is not a session document.';
const AT = '2026-11-15T14:01:07.412Z';
const COUNTS = { actions: 3, errors: 1, capacity: 500 };

const sel = index => ({ type: 'SELECT_CELL', index });
const pen = digit => ({ type: 'PEN_ENTER', digit });
const mark = digit => ({ type: 'PENCIL_TOGGLE', digit });
const load = puzzle => ({ type: 'PUZZLE_LOADED', puzzle });
const coachStart = result => ({ type: 'COACH_START', result });

/** Dispatches `actions` on a fresh developer-mode store and returns its state. */
function play(actions) {
  const store = devModeStore();
  for (const a of actions) store.dispatch(a);
  return store.getState();
}

/** Applies `patch` to a deep copy of `value`. */
function patched(value, patch) {
  const copy = viaJson(value);
  patch(copy);
  return copy;
}

// ── Action kinds ─────────────────────────────────────────────────────────────

/**
 * One representative live action per kind, applied after `setup` to a
 * machine started from plainPositionDoc with cell 2 selected. `twin` is what
 * the live game dispatches when it differs from `action`.
 */
function representatives() {
  const fullWrong = Uint8Array.from(SOLUTION);
  fullWrong[2] = wrong(2);
  const restored = decodePosition(richPositionDoc());
  return {
    PUZZLE_LOADED: { action: load(makePuzzle({ id: 'p-link', difficulty: 'kiddie', source: 'link' })) },
    NEW_PUZZLE: {
      action: {
        type: 'NEW_PUZZLE', difficulty: 'medium',
        puzzle: makePuzzle({ id: 'p-new', source: 'generated', gen: makeGen() }),
      },
    },
    SELECT_CELL: { action: sel(40) },
    DESELECT: { action: { type: 'DESELECT' } },
    SELECT_FIRST_CELL: { action: { type: 'SELECT_FIRST_CELL' } },
    TOGGLE_MODE: { action: { type: 'TOGGLE_MODE' } },
    ERASE: { setup: [pen(4)], action: { type: 'ERASE' } },
    ERASE_ALL_PENCIL: { setup: [mark(3)], action: { type: 'ERASE_ALL_PENCIL' } },
    UNDO: { setup: [pen(4)], action: { type: 'UNDO' } },
    CHECK: { setup: [pen(wrong(2))], action: { type: 'CHECK' } },
    ON_COMPLETION_EVALUATE: {
      setup: [
        load(makePuzzle({ id: 'p-hard', difficulty: 'hard', givens: NEARLY_SOLVED })),
        { type: 'DEV_SET_BOARD', pen: fullWrong },
      ],
      action: { type: 'ON_COMPLETION_EVALUATE' },
    },
    CLEAR_INCORRECT: { setup: [pen(wrong(2)), { type: 'CHECK' }], action: { type: 'CLEAR_INCORRECT' } },
    RESET_PUZZLE: { setup: [pen(4)], action: { type: 'RESET_PUZZLE' } },
    COACH_FOCUS_OFF: { setup: [coachStart(placementStep(2))], action: { type: 'COACH_FOCUS_OFF' } },
    ARROW_NAV: { action: { type: 'ARROW_NAV', direction: 'right' } },
    SET_MODE: { action: { type: 'SET_MODE', mode: 'pencil' } },
    PEN_ENTER: { action: { type: 'PEN_ENTER', digit: 4, fromHint: false } },
    PENCIL_TOGGLE: { action: mark(5) },
    HINT: { action: { type: 'HINT', hint: { cellIndex: 2, digit: 4, technique: 'Naked Single' } } },
    CHANGE_DIFFICULTY: {
      setup: [coachStart(placementStep(2))], action: { type: 'CHANGE_DIFFICULTY', difficulty: 'hard' },
    },
    RESTORE_SESSION: { action: { type: 'RESTORE_SESSION', attemptRecorded: true, hintsRemaining: 1 } },
    DEV_SET_BOARD: {
      action: {
        type: 'DEV_SET_BOARD', pen: fullWrong,
        pencil: Uint16Array.from({ length: 81 }, (_, i) => (i === 7 ? bit(1) | bit(5) : 0)),
      },
    },
    DEV_SET_PENCIL: { action: { type: 'DEV_SET_PENCIL', index: 2, mask: 0b101 } },
    DEV_FILL_PENCIL: { action: { type: 'DEV_FILL_PENCIL', pencil: new Uint16Array(81).fill(bit(1) | bit(2)) } },
    SET_GENERATING: { action: { type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'hard' } },
    GEN_PROGRESS: {
      setup: [{ type: 'SET_GENERATING', flag: true }], action: { type: 'GEN_PROGRESS', attempts: 3, budget: 50 },
    },
    COACH_START: { action: coachStart(eliminationStep()) },
    COACH_NO_TECHNIQUE: { action: { type: 'COACH_NO_TECHNIQUE', reason: 'No technique applies.' } },
    COACH_END: { setup: [coachStart(eliminationStep())], action: { type: 'COACH_END', reason: 'erase' } },
    COACH_FILL_RECAP: {
      setup: [coachStart(placementStep(2))], action: { type: 'COACH_FILL_RECAP', variant: 'normal' },
    },
    COACH_FOCUS_COACHED_CELL: {
      setup: [{ type: 'DESELECT' }, coachStart(eliminationStep())],
      action: { type: 'COACH_FOCUS_COACHED_CELL', index: 3 },
    },
    PAGE_RELOADED: {
      action: { type: 'PAGE_RELOADED', position: restored },
      twin: { type: 'DEV_RESTORE_POSITION', position: restored },
    },
    DEV_RESTORE_POSITION: { action: { type: 'DEV_RESTORE_POSITION', position: restored } },
  };
}

/** The document form of a kind's representative, through JSON. */
function representativeDoc(kind) {
  const { action } = representatives()[kind];
  return viaJson(kind === 'PAGE_RELOADED' ? KINDS.PAGE_RELOADED.encode(action) : encodeAction(action));
}

describe('sessionCodec — action kinds', () => {
  it('SC1: KINDS has every reducer case plus PAGE_RELOADED, 33 in all', async () => {
    const source = await (await fetch('/js/game/state.js')).text();
    const cases = [...source.matchAll(/case '([A-Z_]+)'/g)].map(m => m[1]);

    const kinds = Object.keys(KINDS);

    expect(kinds).to.have.members([...cases, 'PAGE_RELOADED']);
    expect(kinds).to.have.length(33);
  });

  it('every kind has a representative action in this file', () => {
    expect(Object.keys(representatives())).to.have.members(Object.keys(KINDS));
  });

  for (const kind of Object.keys(KINDS)) {
    it(`SC2: ${kind} encodes to a valid document that replays like the live action`, () => {
      const { setup = [], action, twin = action } = representatives()[kind];
      const base = plainPositionDoc({ selected: 2 });
      const live = createMachine(base);
      const replayed = createMachine(base);
      for (const a of setup) { live.dispatch(a); replayed.dispatch(a); }
      const doc = representativeDoc(kind);

      const validation = validateAction(doc);
      live.dispatch(twin);
      replayed.dispatch(decodeAction(doc));

      expect(validation).to.deep.equal({ ok: true });
      expect(fingerprint(replayed.getState())).to.deep.equal(fingerprint(live.getState()));
    });
  }

  it('SC2: PAGE_RELOADED decodes to DEV_RESTORE_POSITION', () => {
    expect(decodeAction(representativeDoc('PAGE_RELOADED')).type).to.equal('DEV_RESTORE_POSITION');
  });

  describe('SC3: fields the kind does not list are dropped', () => {
    it('PUZZLE_LOADED drops the solve trace', () => {
      const doc = encodeAction(load(makePuzzle()));

      expect(doc.puzzle).to.have.all.keys('givens', 'solution', 'tier', 'origin', 'id');
    });

    it('an extra property on an action is not recorded', () => {
      expect(encodeAction({ type: 'SELECT_CELL', index: 4, source: 'keyboard' }))
        .to.deep.equal({ type: 'SELECT_CELL', index: 4 });
    });

    it('PEN_ENTER without fromHint records no fromHint', () => {
      expect(encodeAction(pen(4))).to.deep.equal({ type: 'PEN_ENTER', digit: 4 });
    });

    it('COACH_END without a reason records no reason', () => {
      expect(encodeAction({ type: 'COACH_END' })).to.deep.equal({ type: 'COACH_END' });
    });
  });

  describe('optional fields, present and absent, encode and decode', () => {
    const pencil = Uint16Array.from({ length: 81 }, (_, i) => (i === 7 ? bit(1) | bit(5) : 0));
    const board = Uint8Array.from(toGivens(KIDDIE));
    const ROWS = [
      ['PEN_ENTER with fromHint', { type: 'PEN_ENTER', digit: 4, fromHint: true },
        { type: 'PEN_ENTER', digit: 4, fromHint: true }, { type: 'PEN_ENTER', digit: 4, fromHint: true }],
      ['PEN_ENTER with fromHint null', { type: 'PEN_ENTER', digit: 4, fromHint: null },
        { type: 'PEN_ENTER', digit: 4 }, { type: 'PEN_ENTER', digit: 4 }],
      ['HINT without a hint', { type: 'HINT' }, { type: 'HINT' }, { type: 'HINT' }],
      ['HINT with a null hint', { type: 'HINT', hint: null },
        { type: 'HINT', hint: null }, { type: 'HINT', hint: null }],
      ['HINT with a hint carrying extra fields',
        { type: 'HINT', hint: { cellIndex: 2, digit: 4, technique: 'Hidden Single', rank: 2 } },
        { type: 'HINT', hint: { cellIndex: 2, digit: 4, technique: 'Hidden Single' } },
        { type: 'HINT', hint: { cellIndex: 2, digit: 4, technique: 'Hidden Single' } }],
      ['RESTORE_SESSION with neither field', { type: 'RESTORE_SESSION' },
        { type: 'RESTORE_SESSION' }, { type: 'RESTORE_SESSION' }],
      ['RESTORE_SESSION with null fields', { type: 'RESTORE_SESSION', attemptRecorded: null, hintsRemaining: null },
        { type: 'RESTORE_SESSION' }, { type: 'RESTORE_SESSION' }],
      ['RESTORE_SESSION with attemptRecorded only', { type: 'RESTORE_SESSION', attemptRecorded: false },
        { type: 'RESTORE_SESSION', attemptRecorded: false }, { type: 'RESTORE_SESSION', attemptRecorded: false }],
      ['RESTORE_SESSION with unlimited hints', { type: 'RESTORE_SESSION', hintsRemaining: Infinity },
        { type: 'RESTORE_SESSION', hintsRemaining: 'unlimited' }, { type: 'RESTORE_SESSION', hintsRemaining: Infinity }],
      ['RESTORE_SESSION with a hint count', { type: 'RESTORE_SESSION', hintsRemaining: 2 },
        { type: 'RESTORE_SESSION', hintsRemaining: 2 }, { type: 'RESTORE_SESSION', hintsRemaining: 2 }],
      ['DEV_SET_BOARD without pencil', { type: 'DEV_SET_BOARD', pen: board },
        { type: 'DEV_SET_BOARD', pen: KIDDIE }, { type: 'DEV_SET_BOARD', pen: board }],
      ['DEV_SET_BOARD with pencil', { type: 'DEV_SET_BOARD', pen: board, pencil },
        { type: 'DEV_SET_BOARD', pen: KIDDIE, pencil: marksWith({ 7: [1, 5] }) },
        { type: 'DEV_SET_BOARD', pen: board, pencil }],
      ['SET_GENERATING with the flag only', { type: 'SET_GENERATING', flag: false },
        { type: 'SET_GENERATING', flag: false }, { type: 'SET_GENERATING', flag: false }],
      ['SET_GENERATING with a message and a null difficulty',
        { type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: null },
        { type: 'SET_GENERATING', flag: true, message: 'Generating…' },
        { type: 'SET_GENERATING', flag: true, message: 'Generating…' }],
      ['SET_GENERATING with a difficulty', { type: 'SET_GENERATING', flag: true, difficulty: 'easy' },
        { type: 'SET_GENERATING', flag: true, difficulty: 'easy' },
        { type: 'SET_GENERATING', flag: true, difficulty: 'easy' }],
      ['COACH_END with a reason', { type: 'COACH_END', reason: 'erase' },
        { type: 'COACH_END', reason: 'erase' }, { type: 'COACH_END', reason: 'erase' }],
    ];

    for (const [label, live, expectedDoc, expectedAction] of ROWS) {
      it(`${label}: encodes, validates and decodes as listed`, () => {
        const doc = encodeAction(live);

        const json = viaJson(doc);

        expect(doc).to.deep.equal(expectedDoc);
        expect(validateAction(json)).to.deep.equal({ ok: true });
        expect(decodeAction(json)).to.deep.equal(expectedAction);
      });
    }
  });

  describe('SC4: a kind whose data does not fit is rejected', () => {
    const REJECTIONS = [
      ['PUZZLE_LOADED', 'no puzzle', d => { delete d.puzzle; }],
      ['PUZZLE_LOADED', 'givens of 80 characters', d => { d.puzzle.givens = d.puzzle.givens.slice(1); }],
      ['PUZZLE_LOADED', 'givens containing a letter', d => { d.puzzle.givens = `x${d.puzzle.givens.slice(1)}`; }],
      ['PUZZLE_LOADED', 'a solution containing 0', d => { d.puzzle.solution = `0${d.puzzle.solution.slice(1)}`; }],
      ['PUZZLE_LOADED', 'a tier that is not a tier ID', d => { d.puzzle.tier = 'impossible'; }],
      ['PUZZLE_LOADED', 'an unknown origin', d => { d.puzzle.origin = 'web'; }],
      ['PUZZLE_LOADED', 'a numeric id', d => { d.puzzle.id = 7; }],
      ['PUZZLE_LOADED', 'a puzzle that is an array', d => { d.puzzle = []; }],
      ['NEW_PUZZLE', 'gen on an origin other than generated', d => { d.puzzle.origin = 'link'; }],
      ['NEW_PUZZLE', 'gen that is not an object', d => { d.puzzle.gen = 'seeded'; }],
      ['NEW_PUZZLE', 'gen without a requested tier', d => { delete d.puzzle.gen.requestedTier; }],
      ['NEW_PUZZLE', 'gen with a string seed', d => { d.puzzle.gen.seed = '1'; }],
      ['NEW_PUZZLE', 'gen with an unknown seedBy', d => { d.puzzle.gen.seedBy = 'someone'; }],
      ['NEW_PUZZLE', 'gen without a budget', d => { delete d.puzzle.gen.budget; }],
      ['NEW_PUZZLE', 'gen with string attempts', d => { d.puzzle.gen.attempts = '12'; }],
      ['NEW_PUZZLE', 'gen without rejection counts', d => { delete d.puzzle.gen.rejected; }],
      ['NEW_PUZZLE', 'gen with a non-numeric unsolved count', d => { d.puzzle.gen.rejected.unsolved = null; }],
      ['NEW_PUZZLE', 'gen with a non-numeric wrong-tier count', d => { d.puzzle.gen.rejected.wrongTier = '0'; }],
      ['NEW_PUZZLE', 'gen without byTier', d => { delete d.puzzle.gen.rejected.byTier; }],
      ['NEW_PUZZLE', 'gen with a non-numeric byTier count', d => { d.puzzle.gen.rejected.byTier.medium = '11'; }],
      ['NEW_PUZZLE', 'gen with a non-boolean fallback', d => { d.puzzle.gen.fallback = 0; }],
      ['NEW_PUZZLE', 'a difficulty that is not a tier ID', d => { d.difficulty = 'impossible'; }],
      ['NEW_PUZZLE', 'no difficulty', d => { delete d.difficulty; }],
      ['NEW_PUZZLE', 'no puzzle', d => { delete d.puzzle; }],
      ['SELECT_CELL', 'index -1', d => { d.index = -1; }],
      ['SELECT_CELL', 'index 81', d => { d.index = 81; }],
      ['SELECT_CELL', 'index 1.5', d => { d.index = 1.5; }],
      ['SELECT_CELL', 'a string index', d => { d.index = '3'; }],
      ['SELECT_CELL', 'no index', d => { delete d.index; }],
      ['ARROW_NAV', 'no direction', d => { delete d.direction; }],
      ['ARROW_NAV', 'a numeric direction', d => { d.direction = 3; }],
      ["SET_MODE", "mode 'ink'", d => { d.mode = 'ink'; }],
      ['PEN_ENTER', 'digit 0', d => { d.digit = 0; }],
      ['PEN_ENTER', 'digit 10', d => { d.digit = 10; }],
      ['PEN_ENTER', 'no digit', d => { delete d.digit; }],
      ['PEN_ENTER', 'a string fromHint', d => { d.fromHint = 'yes'; }],
      ['PENCIL_TOGGLE', 'digit 0', d => { d.digit = 0; }],
      ['PENCIL_TOGGLE', 'digit 10', d => { d.digit = 10; }],
      ['HINT', 'hint.cellIndex 81', d => { d.hint.cellIndex = 81; }],
      ['HINT', 'hint.digit 0', d => { d.hint.digit = 0; }],
      ['HINT', 'a non-string hint.technique', d => { d.hint.technique = 5; }],
      ['HINT', 'a hint that is a string', d => { d.hint = 'r1c3'; }],
      ['CHANGE_DIFFICULTY', 'no difficulty', d => { delete d.difficulty; }],
      ['CHANGE_DIFFICULTY', 'a numeric difficulty', d => { d.difficulty = 3; }],
      ['RESTORE_SESSION', "hintsRemaining 'lots'", d => { d.hintsRemaining = 'lots'; }],
      ['RESTORE_SESSION', 'a string attemptRecorded', d => { d.attemptRecorded = 'yes'; }],
      ['DEV_SET_BOARD', 'a board of 80 characters', d => { d.pen = d.pen.slice(1); }],
      ['DEV_SET_BOARD', 'a board containing a letter', d => { d.pen = `x${d.pen.slice(1)}`; }],
      ['DEV_SET_BOARD', 'a numeric board', d => { d.pen = 5; }],
      ['DEV_SET_BOARD', 'marks of 80 lists', d => { d.pencil = d.pencil.slice(1); }],
      ['DEV_SET_BOARD', 'marks containing 0', d => { d.pencil[4] = [0]; }],
      ['DEV_SET_BOARD', 'marks containing 10', d => { d.pencil[4] = [10]; }],
      ['DEV_SET_BOARD', 'marks with a cell that is not a list', d => { d.pencil[4] = 3; }],
      ['DEV_SET_PENCIL', 'digits [0]', d => { d.digits = [0]; }],
      ['DEV_SET_PENCIL', 'digits [10]', d => { d.digits = [10]; }],
      ['DEV_SET_PENCIL', 'no digits', d => { delete d.digits; }],
      ['DEV_SET_PENCIL', 'index 81', d => { d.index = 81; }],
      ['DEV_FILL_PENCIL', 'marks of 80 lists', d => { d.pencil.pop(); }],
      ['DEV_FILL_PENCIL', 'marks containing 10', d => { d.pencil[2] = [1, 10]; }],
      ['DEV_FILL_PENCIL', 'no marks', d => { delete d.pencil; }],
      ['SET_GENERATING', 'flag 1', d => { d.flag = 1; }],
      ['SET_GENERATING', 'a numeric message', d => { d.message = 3; }],
      ['SET_GENERATING', 'a numeric difficulty', d => { d.difficulty = 3; }],
      ['GEN_PROGRESS', "attempts '3'", d => { d.attempts = '3'; }],
      ['GEN_PROGRESS', 'no budget', d => { delete d.budget; }],
      ['COACH_START', 'no result', d => { delete d.result; }],
      ['COACH_START', 'a result that is not an object', d => { d.result = 'Naked Pair'; }],
      ['COACH_NO_TECHNIQUE', 'no reason', d => { delete d.reason; }],
      ['COACH_END', 'a numeric reason', d => { d.reason = 3; }],
      ['COACH_FILL_RECAP', "variant 'x'", d => { d.variant = 'x'; }],
      ['COACH_FOCUS_COACHED_CELL', 'index 81', d => { d.index = 81; }],
      ['PAGE_RELOADED', 'a nested position with an 80-character board', d => { d.position.board = d.position.board.slice(1); }],
      ['PAGE_RELOADED', 'no position', d => { delete d.position; }],
      ['DEV_RESTORE_POSITION', "a nested position in mode 'ink'", d => { d.position.mode = 'ink'; }],
    ];

    it('the detail wording is the fspec §5.3 text', () => {
      expect(DETAIL_INVALID).to.equal(INVALID);
      expect(DETAIL_UNRECOGNISED).to.equal(UNRECOGNISED);
    });

    for (const [kind, label, patch] of REJECTIONS) {
      it(`${kind} with ${label}`, () => {
        const doc = patched(representativeDoc(kind), patch);

        expect(validateAction(doc)).to.deep.equal({ ok: false, detail: INVALID });
      });
    }
  });

  describe('SC5: CoachStep validation', () => {
    const validate = result => validateAction({ type: 'COACH_START', result });
    const ROWS = [
      ['no technique', s => { delete s.technique; }],
      ['no type', s => { delete s.type; }],
      ["type 'other'", s => { s.type = 'other'; }],
      ['no digits', s => { delete s.digits; }],
      ['digits containing 0', s => { s.digits = [0]; }],
      ['no roles', s => { delete s.roles; }],
      ['no roles.target', s => { delete s.roles.target; }],
      ['roles.target 81', s => { s.roles.target = 81; }],
      ...['cause', 'elimTarget', 'unitMember', 'scA', 'scB', 'fin']
        .map(role => [`no roles.${role}`, s => { delete s.roles[role]; }]),
      ['no eliminations', s => { delete s.eliminations; }],
      ['an elimination without a digit', s => { s.eliminations = [{ cellIndex: 2 }]; }],
      ['an elimination in cell 81', s => { s.eliminations = [{ cellIndex: 81, digit: 9 }]; }],
      ['no autoReveal', s => { delete s.autoReveal; }],
      ['no autoReveal.required', s => { delete s.autoReveal.required; }],
      ['an autoReveal cell without candidates', s => { s.autoReveal.cells = [{ cellIndex: 2 }]; }],
      ['an autoReveal cell with a 10-bit mask', s => { s.autoReveal.cells = [{ cellIndex: 2, candidates: 1024 }]; }],
      ['no supportingText', s => { delete s.supportingText; }],
      ['no complexity', s => { delete s.complexity; }],
    ];

    it('a complete elimination step is valid', () => {
      expect(validate(eliminationStep())).to.deep.equal({ ok: true });
    });

    it('a complete placement step is valid', () => {
      expect(validate(placementStep(2))).to.deep.equal({ ok: true });
    });

    for (const [label, patch] of ROWS) {
      it(`a step with ${label} is invalid`, () => {
        expect(validate(patched(eliminationStep(), patch))).to.deep.equal({ ok: false, detail: INVALID });
      });
    }

    it('a no-technique result with a reason is valid', () => {
      expect(validate({ type: 'no-technique', reason: 'Nothing applies.' })).to.deep.equal({ ok: true });
    });

    it('a no-technique result without a reason is invalid', () => {
      expect(validate({ type: 'no-technique' })).to.deep.equal({ ok: false, detail: INVALID });
    });
  });

  describe('SC6: HINT with a null or absent hint', () => {
    it('a null hint is valid', () => {
      expect(validateAction({ type: 'HINT', hint: null })).to.deep.equal({ ok: true });
    });

    it('an absent hint is valid', () => {
      expect(validateAction({ type: 'HINT' })).to.deep.equal({ ok: true });
    });
  });

  describe('SC7: an action that is not of a known kind', () => {
    for (const [label, doc] of [
      ["type 'NOPE'", { type: 'NOPE' }],
      ['an inherited property name as the type', { type: 'toString' }],
      ['no type', { index: 3 }],
      ['null', null],
      ['an array', [{ type: 'UNDO' }]],
      ['a string', 'UNDO'],
    ]) {
      it(`${label} fails as unrecognised`, () => {
        expect(validateAction(doc)).to.deep.equal({ ok: false, detail: UNRECOGNISED });
      });
    }

    it("decodeAction throws on type 'NOPE'", () => {
      expect(() => decodeAction({ type: 'NOPE' })).to.throw(TypeError);
    });
  });

  describe('encodeAction refuses what a document cannot hold', () => {
    const shortBoard = new Uint8Array(80);
    const badDigit = new Uint8Array(81).fill(10);
    for (const [label, action] of [
      ["type 'NOPE'", { type: 'NOPE' }],
      ['an inherited property name as the type', { type: 'toString' }],
      ['null', null],
      ['a string', 'UNDO'],
      ['a live PAGE_RELOADED', { type: 'PAGE_RELOADED', position: decodePosition(plainPositionDoc()) }],
      ['DEV_SET_PENCIL with mask 512', { type: 'DEV_SET_PENCIL', index: 2, mask: 512 }],
      ['DEV_SET_PENCIL with mask -1', { type: 'DEV_SET_PENCIL', index: 2, mask: -1 }],
      ['DEV_SET_PENCIL with index 81', { type: 'DEV_SET_PENCIL', index: 81, mask: 1 }],
      ['DEV_SET_BOARD with an 80-cell board', { type: 'DEV_SET_BOARD', pen: shortBoard }],
      ['DEV_SET_BOARD with a cell holding 10', { type: 'DEV_SET_BOARD', pen: badDigit }],
      ['DEV_FILL_PENCIL with an 80-cell array', { type: 'DEV_FILL_PENCIL', pencil: new Uint16Array(80) }],
      ['DEV_FILL_PENCIL with mask 512', { type: 'DEV_FILL_PENCIL', pencil: new Uint16Array(81).fill(512) }],
      ['PUZZLE_LOADED without a puzzle', { type: 'PUZZLE_LOADED' }],
      ['PUZZLE_LOADED with 80 givens', { type: 'PUZZLE_LOADED', puzzle: { ...makePuzzle(), givens: shortBoard } }],
      ['PEN_ENTER with a non-digit', { type: 'PEN_ENTER', digit: 'x' }],
      ['NEW_PUZZLE with a difficulty that is not a tier ID',
        { type: 'NEW_PUZZLE', difficulty: 'impossible', puzzle: makePuzzle() }],
    ]) {
      it(`${label} is unrecordable`, () => {
        expect(encodeAction(action)).to.equal(null);
      });
    }

    it('NEW_PUZZLE accepts the Unrated tier', () => {
      const doc = encodeAction({ type: 'NEW_PUZZLE', difficulty: 'unrated', puzzle: makePuzzle({ difficulty: 'unrated' }) });

      expect(validateAction(doc)).to.deep.equal({ ok: true });
    });
  });

  it('SC8: extra properties are ignored at every level, and a coach step keeps its own', () => {
    const step = { ...eliminationStep(), analyzerNote: 'kept' };
    const start = { ...plainPositionDoc(), note: 'start extra' };
    start.puzzle = { ...start.puzzle, note: 'puzzle extra', gen: { ...start.puzzle.gen, note: 'gen extra' } };
    const doc = buildDocument({
      start,
      entries: [
        { seq: 1, t: 0, a: { type: 'SELECT_CELL', index: 2, note: 'action extra' } },
        { seq: 2, t: 0, a: { type: 'COACH_START', result: step } },
      ],
      exportedAt: 0,
    });
    doc.note = 'document extra';

    const read = readDocument(viaJson(doc));
    const decodedStep = decodeAction(read.doc.actions[1].action).result;

    expect(read.ok).to.equal(true);
    expect(validatePosition(read.doc.start)).to.deep.equal({ ok: true });
    expect(read.doc.actions.map(validateActionItem)).to.deep.equal([{ ok: true }, { ok: true }]);
    expect(decodedStep).to.deep.equal(step);
  });

  it('SC9: COACH_START records a deep copy of the step', () => {
    const step = eliminationStep();
    const doc = encodeAction(coachStart(step));
    const recorded = viaJson(doc);

    step.technique = 'Changed';
    step.roles.cause.push(40);
    step.autoReveal.cells[0].candidates = 1;

    expect(doc).to.deep.equal(recorded);
  });

  describe('SC10: masks and digit lists', () => {
    it('DEV_SET_PENCIL mask 0b100000101 is digits [1, 3, 9] and decodes back', () => {
      const doc = encodeAction({ type: 'DEV_SET_PENCIL', index: 2, mask: 0b100000101 });

      expect(doc).to.deep.equal({ type: 'DEV_SET_PENCIL', index: 2, digits: [1, 3, 9] });
      expect(decodeAction(doc)).to.deep.equal({ type: 'DEV_SET_PENCIL', index: 2, mask: 0b100000101 });
    });

    it('an empty mask is an empty list and decodes back', () => {
      const doc = encodeAction({ type: 'DEV_SET_PENCIL', index: 2, mask: 0 });

      expect(doc.digits).to.deep.equal([]);
      expect(decodeAction(doc).mask).to.equal(0);
    });

    it('DEV_FILL_PENCIL marks are ascending lists and decode to the same Uint16Array', () => {
      const pencil = new Uint16Array(81);
      pencil[2] = bit(9) | bit(4);
      pencil[3] = 0b111111111;
      const doc = encodeAction({ type: 'DEV_FILL_PENCIL', pencil });

      const decoded = decodeAction(viaJson(doc));

      expect(doc.pencil).to.deep.equal(marksWith({ 2: [4, 9], 3: [1, 2, 3, 4, 5, 6, 7, 8, 9] }));
      expect(decoded.pencil).to.be.instanceOf(Uint16Array);
      expect(decoded.pencil).to.deep.equal(pencil);
    });

    it('digit lists in any order and with repeats are accepted and folded', () => {
      const doc = { type: 'DEV_SET_PENCIL', index: 2, digits: [9, 1, 1] };

      expect(validateAction(doc)).to.deep.equal({ ok: true });
      expect(decodeAction(doc).mask).to.equal(bit(1) | bit(9));
    });

    it('position marks and incorrect cells in any order and with repeats are accepted and folded', () => {
      const doc = plainPositionDoc({ pencil: marksWith({ 2: [9, 4, 9] }), incorrect: [6, 5, 6] });

      const position = decodePosition(doc);

      expect(validatePosition(doc)).to.deep.equal({ ok: true });
      expect(position.pencil[2]).to.equal(bit(4) | bit(9));
      expect([...position.incorrect]).to.have.members([5, 6]).and.have.length(2);
      expect(encodePosition(position).incorrect).to.deep.equal([5, 6]);
      expect(encodePosition(position).pencil[2]).to.deep.equal([4, 9]);
    });
  });

  describe('isInformational', () => {
    it('COACH_NO_TECHNIQUE is informational', () => {
      expect(isInformational({ type: 'COACH_NO_TECHNIQUE', reason: 'x' })).to.equal(true);
    });

    it('a COACH_START with no technique is informational', () => {
      expect(isInformational({ type: 'COACH_START', result: { type: 'no-technique', reason: 'x' } })).to.equal(true);
    });

    it('a COACH_START with a step is not', () => {
      expect(isInformational({ type: 'COACH_START', result: placementStep(2) })).to.equal(false);
    });

    it('another kind is not', () => {
      expect(isInformational({ type: 'UNDO' })).to.equal(false);
    });
  });

  describe('validateActionItem', () => {
    const item = (overrides = {}) => ({ at: AT, action: { type: 'SELECT_CELL', index: 2 }, ...overrides });
    const ROWS = [
      ['a valid item', item(), { ok: true }],
      ['a valid item with noChange and follow-ups',
        item({ noChange: true, then: [{ type: 'COACH_FOCUS_COACHED_CELL', index: 2 }] }), { ok: true }],
      ['a valid item with no follow-ups', item({ then: [] }), { ok: true }],
      ['a value that is not an object', 'SELECT_CELL', { ok: false, detail: UNRECOGNISED }],
      ['no action', { at: AT }, { ok: false, detail: UNRECOGNISED }],
      ['an action of unknown kind, before a bad time', item({ action: { type: 'NOPE' }, at: 'now' }),
        { ok: false, detail: UNRECOGNISED }],
      ['an action with bad data', item({ action: { type: 'SELECT_CELL', index: 81 } }), { ok: false, detail: INVALID }],
      ['no time', item({ at: undefined }), { ok: false, detail: INVALID }],
      ['a time that is not ISO-8601 UTC', item({ at: '2026-11-15 14:01' }), { ok: false, detail: INVALID }],
      ['a time that does not parse', item({ at: '2026-13-45T00:00:00Z' }), { ok: false, detail: INVALID }],
      ['noChange false', item({ noChange: false }), { ok: false, detail: INVALID }],
      ['follow-ups that are not an array', item({ then: { type: 'UNDO' } }), { ok: false, detail: INVALID }],
      ['a bad time before an unknown follow-up', item({ at: 'now', then: [{ type: 'NOPE' }] }),
        { ok: false, detail: INVALID }],
      ['an unknown follow-up', item({ then: [{ type: 'NOPE' }] }), { ok: false, detail: UNRECOGNISED }],
      ['a follow-up with bad data', item({ then: [{ type: 'COACH_FOCUS_COACHED_CELL' }] }),
        { ok: false, detail: INVALID }],
    ];

    for (const [label, value, expected] of ROWS) {
      it(`${label}: ${expected.ok ? 'passes' : `fails as "${expected.detail}"`}`, () => {
        expect(validateActionItem(value)).to.deep.equal(expected);
      });
    }
  });
});

// ── Puzzle ───────────────────────────────────────────────────────────────────

describe('sessionCodec — puzzles', () => {
  describe('SC11: origin mapping', () => {
    for (const [source, origin] of [
      ['generated', 'generated'], ['link', 'link'], ['string', 'string'],
      ['loaded', 'unknown'], [undefined, 'unknown'],
    ]) {
      it(`source ${source} is origin "${origin}"`, () => {
        expect(encodePuzzle(makePuzzle({ source })).origin).to.equal(origin);
      });
    }

    it('origin "unknown" decodes with no source and encodes back to "unknown"', () => {
      const puzzle = decodePuzzle(puzzleDoc({ origin: 'unknown', gen: undefined }));

      expect(puzzle).to.not.have.property('source');
      expect(encodePuzzle(puzzle).origin).to.equal('unknown');
    });

    it('a recorded origin decodes to that source', () => {
      expect(decodePuzzle(puzzleDoc({ origin: 'link', gen: undefined })).source).to.equal('link');
    });
  });

  describe('SC12: gen mapping', () => {
    it('gen with a seed is copied', () => {
      const gen = makeGen();

      expect(encodePuzzle(makePuzzle({ source: 'generated', gen })).gen).to.deep.equal(gen);
    });

    it('gen without seed and seedBy (old data) records both as null', () => {
      const { seed, seedBy, ...old } = makeGen();

      const doc = encodePuzzle(makePuzzle({ source: 'generated', gen: old }));

      expect(doc.gen).to.deep.equal({ ...old, seed: null, seedBy: null });
    });

    it('a generated puzzle without gen records no gen', () => {
      expect(encodePuzzle(makePuzzle({ source: 'generated' }))).to.not.have.property('gen');
    });

    it('gen on a puzzle that was not generated is not recorded', () => {
      expect(encodePuzzle(makePuzzle({ source: 'link', gen: makeGen() }))).to.not.have.property('gen');
    });

    it('decoding copies gen without sharing it', () => {
      const doc = puzzleDoc();

      const puzzle = decodePuzzle(doc);
      puzzle.gen.rejected.byTier.medium = 0;

      expect(doc.gen).to.deep.equal(makeGen());
    });

    it('decoding a puzzle without gen leaves gen unset', () => {
      expect(decodePuzzle(puzzleDoc({ origin: 'string', gen: undefined }))).to.not.have.property('gen');
    });
  });

  it('decoding a puzzle restores typed givens and solution and an empty solve trace', () => {
    const puzzle = decodePuzzle(puzzleDoc());

    expect(puzzle).to.deep.include({ id: 'p-gen', difficulty: 'easy', solveTrace: [], source: 'generated' });
    expect(puzzle.givens).to.deep.equal(toGivens(KIDDIE));
    expect(puzzle.solution).to.deep.equal(SOLUTION);
  });
});

// ── Position ─────────────────────────────────────────────────────────────────

describe('sessionCodec — positions', () => {
  describe('SC13: hints', () => {
    it('Infinity is written "unlimited" and read back as Infinity, in the position and its undo', () => {
      const doc = plainPositionDoc({
        hintsRemaining: 'unlimited',
        undo: { board: KIDDIE, pencil: emptyMarks(), hintsRemaining: 'unlimited', attemptRecorded: false },
      });

      const position = decodePosition(doc);
      const encoded = encodePosition(position);

      expect(position.hintsRemaining).to.equal(Infinity);
      expect(position.undoSnapshot.hintsRemaining).to.equal(Infinity);
      expect(encoded.hintsRemaining).to.equal('unlimited');
      expect(encoded.undo.hintsRemaining).to.equal('unlimited');
    });

    it('a number is unchanged both ways', () => {
      const position = decodePosition(plainPositionDoc({ hintsRemaining: 2 }));

      expect(position.hintsRemaining).to.equal(2);
      expect(encodePosition(position).hintsRemaining).to.equal(2);
    });
  });

  describe('SC14: highlightPending', () => {
    it('is true after CHECK', () => {
      const state = play([load(makePuzzle()), sel(2), pen(wrong(2)), { type: 'CHECK' }]);

      expect(encodePosition(state).highlightPending).to.equal(true);
    });

    it('is false after CLEAR_INCORRECT', () => {
      const state = play([load(makePuzzle()), sel(2), pen(wrong(2)), { type: 'CHECK' }, { type: 'CLEAR_INCORRECT' }]);

      expect(encodePosition(state).highlightPending).to.equal(false);
    });
  });

  describe('SC15: coach decode', () => {
    const coachDoc = (step, recap) => plainPositionDoc({
      coach: { step, recap, focused: null, pencilSnapshot: emptyMarks(), revealed: emptyMarks() },
    });

    it('recap null derives the coached cells from the step', () => {
      const step = eliminationStep();

      const { coachSession } = decodePosition(coachDoc(step, null));

      expect(coachSession.coachedCells).to.deep.equal(deriveCoachedCells(step));
      expect(coachSession.coachedCells.size).to.equal(4);
    });

    it("recap 'normal' has no coached cells", () => {
      const { coachSession } = decodePosition(coachDoc(placementStep(2), 'normal'));

      expect(coachSession.coachedCells).to.deep.equal(new Set());
      expect(coachSession.recap).to.equal('normal');
    });

    it('an elimination step rebuilds the per-cell elimination masks', () => {
      const step = eliminationStep();
      step.eliminations.push({ cellIndex: 2, digit: 1 });

      const { coachSession } = decodePosition(coachDoc(step, null));

      expect(coachSession.eliminationTargets).to.deep.equal(new Map([[2, bit(9) | bit(1)], [3, bit(2)]]));
    });

    it('a placement step has no elimination targets', () => {
      expect(decodePosition(coachDoc(placementStep(2), null)).coachSession.eliminationTargets).to.equal(null);
    });
  });

  describe('SC16: undo and generating round-trip exactly', () => {
    const undo = { board: KIDDIE, pencil: marksWith({ 7: [1] }), hintsRemaining: 3, attemptRecorded: true };
    const ROWS = [
      ['no undo', plainPositionDoc(), p => expect(p.undoSnapshot).to.equal(null)],
      ['an undo step', plainPositionDoc({ undo }), p => expect(p.undoSnapshot).to.deep.equal({
        pen: Uint8Array.from(toGivens(KIDDIE)), pencil: Uint16Array.from({ length: 81 }, (_, i) => (i === 7 ? 1 : 0)),
        hintsRemaining: 3, attemptRecorded: true,
      })],
      ['no generation', plainPositionDoc(), p => expect(p).to.deep.include({
        generating: false, generatingMessage: '', generatingDifficulty: null, genProgress: null,
      })],
      ['a generation without progress',
        plainPositionDoc({ generating: { message: 'Generating…', difficulty: null, progress: null } }),
        p => expect(p).to.deep.include({
          generating: true, generatingMessage: 'Generating…', generatingDifficulty: null, genProgress: null,
        })],
      ['a generation with progress',
        plainPositionDoc({ generating: { message: 'Generating…', difficulty: 'hard', progress: { attempts: 4, budget: 50 } } }),
        p => expect(p).to.deep.include({
          generating: true, generatingMessage: 'Generating…', generatingDifficulty: 'hard',
          genProgress: { attempts: 4, budget: 50 },
        })],
    ];

    for (const [label, doc, check] of ROWS) {
      it(label, () => {
        const position = decodePosition(doc);

        check(position);
        expect(encodePosition(position)).to.deep.equal(doc);
      });
    }
  });

  it('SC17: two decodes of one document share nothing with each other or the document', () => {
    const doc = richPositionDoc();
    const original = viaJson(doc);
    const first = decodePosition(doc);

    first.pen[6] = 9;
    first.pencil[7] = 0;
    first.incorrect.add(40);
    first.genProgress.attempts = 99;
    first.undoSnapshot.pen[6] = 9;
    first.undoSnapshot.pencil[7] = 0;
    first.coachSession.step.roles.cause.push(40);
    first.coachSession.pencilSnapshot[7] = 0;
    first.coachSession.coachRevealedBits[2] = 0;
    first.coachSession.coachedCells.add(40);
    first.coachSession.eliminationTargets.set(40, 1);
    first.puzzle.gen.seed = 1;
    first.puzzle.givens[0] = 0;
    const second = decodePosition(doc);

    expect(doc).to.deep.equal(original);
    expect(encodePosition(second)).to.deep.equal(original);
    expect(second.coachSession.coachedCells.has(40)).to.equal(false);
    expect(second.coachSession.eliminationTargets.has(40)).to.equal(false);
  });

  describe('SC18: position validation', () => {
    const ROWS = [
      ['a board of 80 characters', d => { d.board = d.board.slice(1); }],
      ['a board containing a letter', d => { d.board = `x${d.board.slice(1)}`; }],
      ['marks of 80 lists', d => { d.pencil.pop(); }],
      ['marks containing 0', d => { d.pencil[2] = [0]; }],
      ['marks that are not lists', d => { d.pencil = 'none'; }],
      ['selected 81', d => { d.selected = 81; }],
      ['selected -1', d => { d.selected = -1; }],
      ["mode 'ink'", d => { d.mode = 'ink'; }],
      ["hintsRemaining 'lots'", d => { d.hintsRemaining = 'lots'; }],
      ['no attemptRecorded', d => { delete d.attemptRecorded; }],
      ['a string won', d => { d.won = 'no'; }],
      ['incorrect containing 81', d => { d.incorrect = [81]; }],
      ['incorrect that is not a list', d => { d.incorrect = 5; }],
      ['no highlightPending', d => { delete d.highlightPending; }],
      ['a null completionMessage', d => { d.completionMessage = null; }],
      ['an undo with a short board', d => { d.undo.board = d.undo.board.slice(1); }],
      ['an undo with bad marks', d => { d.undo.pencil = [[]]; }],
      ["an undo with hintsRemaining 'lots'", d => { d.undo.hintsRemaining = 'lots'; }],
      ['an undo without attemptRecorded', d => { delete d.undo.attemptRecorded; }],
      ['an undo that is not an object', d => { d.undo = []; }],
      ['a generation without a message', d => { delete d.generating.message; }],
      ['a generation with a numeric difficulty', d => { d.generating.difficulty = 3; }],
      ['a generation with string progress attempts', d => { d.generating.progress.attempts = '4'; }],
      ['a generation with progress that is not an object', d => { d.generating.progress = 4; }],
      ['a coach with an invalid step', d => { delete d.coach.step.roles; }],
      ["a coach with recap 'x'", d => { d.coach.recap = 'x'; }],
      ['a coach focused on cell 81', d => { d.coach.focused = 81; }],
      ['a coach with a bad pencil snapshot', d => { d.coach.pencilSnapshot = []; }],
      ['a coach with bad revealed marks', d => { d.coach.revealed[2] = [10]; }],
      ['a puzzle whose solution contains 0', d => { d.puzzle.solution = `0${d.puzzle.solution.slice(1)}`; }],
      ['a puzzle that is not an object', d => { d.puzzle = 'KIDDIE'; }],
    ];

    it('a position with every part present is valid', () => {
      expect(validatePosition(richPositionDoc())).to.deep.equal({ ok: true });
    });

    it('a position with no puzzle is valid', () => {
      expect(validatePosition(plainPositionDoc({ puzzle: null }))).to.deep.equal({ ok: true });
    });

    for (const [label, patch] of ROWS) {
      it(`${label} is invalid`, () => {
        expect(validatePosition(patched(richPositionDoc(), patch))).to.deep.equal({ ok: false, detail: INVALID });
      });
    }

    for (const [label, value] of [['null', null], ['an array', []]]) {
      it(`${label} is invalid`, () => {
        expect(validatePosition(value)).to.deep.equal({ ok: false, detail: INVALID });
      });
    }
  });

  describe('encodePosition refuses a board or marks a document cannot hold', () => {
    const ROWS = [
      ['an 80-cell board', s => { s.pen = new Uint8Array(80); }],
      ['a cell holding 10', s => { s.pen = Uint8Array.from(s.pen); s.pen[6] = 10; }],
      ['80 cells of marks', s => { s.pencil = new Uint16Array(80); }],
      ['a 10-bit pencil mask', s => { s.pencil[2] = 1024; }],
      ['an undo board with a cell holding 10', s => { s.undoSnapshot.pen[6] = 10; }],
      ['a coach snapshot with a 10-bit mask', s => { s.coachSession.pencilSnapshot[7] = 1024; }],
    ];

    for (const [label, corrupt] of ROWS) {
      it(`a position with ${label} throws`, () => {
        const state = decodePosition(richPositionDoc());
        corrupt(state);

        expect(() => encodePosition(state)).to.throw(Error);
      });
    }
  });
});

// ── Fingerprint ──────────────────────────────────────────────────────────────

describe('sessionCodec — fingerprint', () => {
  /** The fingerprint parts that differ between two position documents. */
  function differingParts(a, b) {
    const fa = fingerprint(decodePosition(a));
    const fb = fingerprint(decodePosition(b));
    return Object.keys(fa).filter(k => fa[k] !== fb[k]);
  }

  it('SC19: has exactly the 11 parts of aspec §6.3', () => {
    expect(Object.keys(fingerprint(decodePosition(richPositionDoc())))).to.have.members([
      'puzzle', 'board', 'pencil', 'selected', 'mode', 'hints', 'won', 'highlight', 'undo', 'generating', 'coach',
    ]).and.have.length(11);
  });

  describe('SC20: each part isolates its fields', () => {
    const ROWS = [
      ['puzzle', 'the puzzle id', d => { d.puzzle.id = 'other'; }],
      ['board', 'a pen digit', d => { d.board = `${d.board.slice(0, 6)}9${d.board.slice(7)}`; }],
      ['pencil', 'a mark', d => { d.pencil[7] = [1, 2]; }],
      ['selected', 'the selection', d => { d.selected = 3; }],
      ['mode', 'the mode', d => { d.mode = 'pen'; }],
      ['hints', 'hints remaining', d => { d.hintsRemaining = 1; }],
      ['won', 'won', d => { d.won = true; }],
      ['highlight', 'the incorrect set', d => { d.incorrect = [5, 6]; }],
      ['undo', 'the undo step', d => { d.undo = null; }],
      ['generating', 'the generation progress', d => { d.generating.progress = null; }],
      ['coach', 'the coach focus', d => { d.coach.focused = null; }],
    ];

    for (const [part, label, patch] of ROWS) {
      it(`changing ${label} changes only "${part}"`, () => {
        const base = richPositionDoc();

        expect(differingParts(base, patched(base, patch))).to.deep.equal([part]);
      });
    }
  });

  describe('SC21: sub-fields of composite parts', () => {
    const ROWS = [
      ['hints', 'attemptRecorded', d => { d.attemptRecorded = false; }],
      ['highlight', 'the pending flag', d => { d.highlightPending = false; }],
      ['highlight', 'the completion message', d => { d.completionMessage = 'Not quite. Keep going!'; }],
      ['coach', 'the recap', d => { d.coach.recap = 'elim'; }],
      ['coach', 'the pencil snapshot', d => { d.coach.pencilSnapshot[7] = []; }],
      ['coach', 'the revealed marks', d => { d.coach.revealed[3] = [6]; }],
      ['coach', 'the step target, technique unchanged', d => { d.coach.step.roles.target = 4; }],
      ['puzzle', 'the puzzle tier', d => { d.puzzle.tier = 'medium'; }],
      ['puzzle', 'the givens', d => { d.puzzle.givens = `${d.puzzle.givens.slice(0, 80)}0`; }],
      ['undo', 'the undo hints', d => { d.undo.hintsRemaining = 0; }],
      ['generating', 'the generation message', d => { d.generating.message = 'Still generating…'; }],
      ['generating', 'the generation difficulty', d => { d.generating.difficulty = 'easy'; }],
    ];

    for (const [part, label, patch] of ROWS) {
      it(`changing ${label} changes "${part}"`, () => {
        const base = richPositionDoc();

        expect(differingParts(base, patched(base, patch))).to.deep.equal([part]);
      });
    }
  });

  it("generating is 'none' whenever no generation is in progress, whatever message is left", () => {
    const clean = decodePosition(plainPositionDoc());
    const stale = { ...clean, generatingMessage: 'Generating…', generatingDifficulty: 'hard', genProgress: { attempts: 1, budget: 2 } };

    expect(fingerprint(stale).generating).to.equal('none');
    expect(fingerprint(clean).generating).to.equal('none');
  });

  it("a position with no puzzle, undo, generation or coach has 'none' for each", () => {
    const fp = fingerprint(decodePosition(plainPositionDoc({ puzzle: null })));

    expect([fp.puzzle, fp.undo, fp.generating, fp.coach]).to.deep.equal(['none', 'none', 'none', 'none']);
  });

  it('a live GameState and its InternalPosition have the same fingerprint', () => {
    const state = play([load(makePuzzle()), sel(2), pen(wrong(2)), { type: 'CHECK' }]);

    expect(fingerprint(decodePosition(encodePosition(state)))).to.deep.equal(fingerprint(state));
  });
});

// ── describeState ────────────────────────────────────────────────────────────

describe('sessionCodec — describeState', () => {
  const DOTS = '. . . | . . . | . . .';
  const RULE = '------+-------+------';
  const describeDoc = (doc, counts = COUNTS) => describeState(createMachine(doc).getState(), counts);

  it('SC22: an empty game describes no puzzle, false booleans and an all-dot grid', () => {
    const state = devModeStore().getState();

    expect(describeState(state, COUNTS)).to.deep.equal({
      puzzle: null,
      board: '0'.repeat(81),
      pencilMarks: emptyMarks(),
      selected: null,
      mode: 'pen',
      hintsRemaining: 0,
      won: false,
      generating: false,
      undoAvailable: false,
      coachActive: false,
      conflicts: [],
      flaggedIncorrect: [],
      recorder: { actions: 3, errors: 1, capacity: 500 },
      text: [DOTS, DOTS, DOTS, RULE, DOTS, DOTS, DOTS, RULE, DOTS, DOTS, DOTS].join('\n'),
    });
  });

  describe('SC23: puzzle fields', () => {
    it('a generated puzzle with a seed adds requestedTier, seed and fallback', () => {
      expect(describeDoc(plainPositionDoc()).puzzle).to.deep.equal({
        givens: KIDDIE, solution: KIDDIE_SOLUTION, tier: 'easy', origin: 'generated',
        requestedTier: 'hard', seed: 3141592653, fallback: false,
      });
    });

    it('a generated puzzle with no recorded seed has seed null', () => {
      const doc = plainPositionDoc({ puzzle: puzzleDoc({ gen: makeGen({ seed: null, seedBy: null, fallback: true }) }) });

      expect(describeDoc(doc).puzzle).to.deep.include({ requestedTier: 'hard', seed: null, fallback: true });
    });

    it('a loaded puzzle has no generation fields', () => {
      const doc = plainPositionDoc({ puzzle: puzzleDoc({ origin: 'unknown', gen: undefined }) });

      expect(describeDoc(doc).puzzle).to.deep.equal({
        givens: KIDDIE, solution: KIDDIE_SOLUTION, tier: 'easy', origin: 'unknown',
      });
    });
  });

  describe('SC24: hintsRemaining', () => {
    it('3 is 3', () => {
      expect(describeDoc(plainPositionDoc({ hintsRemaining: 3 })).hintsRemaining).to.equal(3);
    });

    it('Infinity is "unlimited"', () => {
      expect(describeDoc(plainPositionDoc({ hintsRemaining: 'unlimited' })).hintsRemaining).to.equal('unlimited');
    });

    it('an Unrated puzzle is null', () => {
      const doc = plainPositionDoc({ puzzle: puzzleDoc({ tier: 'unrated' }), hintsRemaining: 0 });

      expect(describeDoc(doc).hintsRemaining).to.equal(null);
    });
  });

  describe('SC25: cell references', () => {
    for (const [selected, ref] of [[0, 'r1c1'], [80, 'r9c9'], [null, null]]) {
      it(`selected ${selected} is ${ref}`, () => {
        expect(describeDoc(plainPositionDoc({ selected })).selected).to.equal(ref);
      });
    }

    it('conflicts are ascending cell references', () => {
      // A 5 in cell 2 repeats the given 5 in cell 0.
      const doc = plainPositionDoc({ board: `535${KIDDIE.slice(3)}` });

      expect(describeDoc(doc).conflicts).to.deep.equal(['r1c1', 'r1c3']);
    });

    it('flagged incorrect cells are ascending cell references', () => {
      const doc = plainPositionDoc({ incorrect: [40, 3], highlightPending: true });

      expect(describeDoc(doc).flaggedIncorrect).to.deep.equal(['r1c4', 'r5c5']);
    });

    it('an InternalPosition describes the same as the game it restores', () => {
      const doc = richPositionDoc();

      expect(describeState(decodePosition(doc), COUNTS)).to.deep.equal(describeDoc(doc));
    });
  });

  describe('SC26: booleans', () => {
    const undo = { board: KIDDIE, pencil: emptyMarks(), hintsRemaining: 3, attemptRecorded: false };
    const generating = { message: 'Generating…', difficulty: 'easy', progress: null };
    const coach = { step: placementStep(2), recap: null, focused: null, pencilSnapshot: emptyMarks(), revealed: emptyMarks() };
    const ROWS = [
      ['won', true, plainPositionDoc({ won: true })],
      ['won', false, plainPositionDoc()],
      ['generating', true, plainPositionDoc({ generating })],
      ['generating', false, plainPositionDoc()],
      ['undoAvailable', true, plainPositionDoc({ undo })],
      ['undoAvailable', false, plainPositionDoc()],
      ['undoAvailable', false, plainPositionDoc({ undo, won: true })],
      ['undoAvailable', false, plainPositionDoc({ undo, generating })],
      ['coachActive', true, plainPositionDoc({ coach })],
      ['coachActive', false, plainPositionDoc()],
    ];

    for (const [field, value, doc] of ROWS) {
      const when = doc.undo && (doc.won || doc.generating) ? ` (undo step held, ${doc.won ? 'won' : 'generating'})` : '';
      it(`${field} is ${value}${when}`, () => {
        expect(describeDoc(doc)[field]).to.equal(value);
      });
    }
  });

  it('SC27: text is the grid in 11 lines, ruled into boxes, givens and pen digits alike', () => {
    const doc = plainPositionDoc({ board: `534${KIDDIE.slice(3)}` });

    expect(describeDoc(doc).text.split('\n')).to.deep.equal([
      '5 3 4 | . 7 . | . . .',
      '6 . . | 1 9 5 | . . .',
      '. 9 8 | . . . | . 6 .',
      RULE,
      '8 . . | . 6 . | . . 3',
      '4 . . | 8 . 3 | . . 1',
      '7 . . | . 2 . | . . 6',
      RULE,
      '. 6 . | . . . | 2 8 .',
      '. . . | 4 1 9 | . . 5',
      '. . . | . 8 . | . 7 9',
    ]);
  });

  it('SC28: pencilMarks are 81 ascending lists', () => {
    const doc = plainPositionDoc({ pencil: marksWith({ 2: [9, 4], 3: [6], 80: [3, 1, 2] }) });

    expect(describeDoc(doc).pencilMarks).to.deep.equal(marksWith({ 2: [4, 9], 3: [6], 80: [1, 2, 3] }));
  });
});

// ── Documents ────────────────────────────────────────────────────────────────

describe('sessionCodec — session documents', () => {
  const T0 = Date.parse(AT);
  const validDoc = (overrides = {}) => ({
    ...buildDocument({
      start: plainPositionDoc(),
      entries: [{ seq: 1, t: T0, a: { type: 'SELECT_CELL', index: 2 } }],
      exportedAt: T0 + 1000,
    }),
    ...overrides,
  });

  it('a built document reads back unchanged at the current version', () => {
    const doc = validDoc();

    const result = readDocument(doc);

    expect(result).to.deep.equal({ ok: true, doc, readAs: 1, writtenAs: 1 });
    expect(result.doc).to.not.equal(doc);
  });

  it('the format constants are those of aspec §5.4–5.5', () => {
    expect([FORMAT, FORMAT_VERSION, UPGRADERS, NOT_A_DOCUMENT])
      .to.deep.equal(['sudoku-session', 1, {}, NOT_DOC]);
  });

  describe('SC29: a value that is not a session document', () => {
    for (const [label, input] of [
      ['null', null], ['an array', []], ['a number', 3], ["format 'other'", { ...validDoc(), format: 'other' }],
    ]) {
      it(`${label} is rejected as not a session document`, () => {
        expect(readDocument(input)).to.deep.equal({ ok: false, reason: NOT_DOC });
      });
    }
  });

  describe('SC30: format version', () => {
    for (const [label, version, shown] of [
      ['missing', undefined, 'unknown'], ['"1"', '1', 'unknown'], ['0', 0, 'unknown'],
      ['1.5', 1.5, 'unknown'], ['-1', -1, 'unknown'], ['2', 2, '2'],
    ]) {
      it(`version ${label} is rejected naming version ${shown} and "1 to 1"`, () => {
        const doc = validDoc({ version });

        expect(readDocument(doc)).to.deep.equal({
          ok: false, reason: `It is format version ${shown}; this build reads versions 1 to 1.`,
        });
      });
    }

    it('versionReason builds the fspec §5.3 sentence', () => {
      expect(versionReason(3, 2)).to.equal('It is format version 3; this build reads versions 1 to 2.');
    });

    it('a newer version is rejected by its version even when its shape has changed', () => {
      expect(readDocument({ format: FORMAT, version: 2 }).reason)
        .to.equal('It is format version 2; this build reads versions 1 to 1.');
    });
  });

  describe('SC31–SC33: upgrading an older document', () => {
    function upgrade() {
      const calls = [];
      const fake = doc => {
        calls.push(viaJson(doc));
        doc.version = 2;
        doc.upgraded = true;
        return doc;
      };
      return { calls, fake };
    }

    it('SC31: the upgrader runs once on the v1 document and its result is returned', () => {
      const v1 = validDoc();
      const before = viaJson(v1);
      const { calls, fake } = upgrade();

      const result = readDocument(v1, { current: 2, upgraders: { 1: fake } });

      expect(calls).to.deep.equal([before]);
      expect(result).to.deep.include({ ok: true, readAs: 2, writtenAs: 1 });
      expect(result.doc).to.deep.equal({ ...before, version: 2, upgraded: true });
    });

    it('SC32: a document already at the current version is not upgraded', () => {
      const { calls, fake } = upgrade();

      const result = readDocument(validDoc({ version: 2 }), { current: 2, upgraders: { 1: fake } });

      expect(calls).to.deep.equal([]);
      expect(result).to.deep.include({ ok: true, readAs: 2, writtenAs: 2 });
    });

    it("SC33: the caller's document is not mutated by reading or upgrading", () => {
      const v1 = validDoc();
      const before = viaJson(v1);

      readDocument(v1, { current: 2, upgraders: { 1: upgrade().fake } });

      expect(v1).to.deep.equal(before);
    });
  });

  describe('SC34: top-level shape', () => {
    const error = { at: AT, afterAction: 0, kind: 'listener', message: 'x', stack: null, source: null, action: 'UNDO', count: 1 };
    const ROWS = [
      ['no exportedAt', d => { delete d.exportedAt; }],
      ['an exportedAt that does not parse', d => { d.exportedAt = '2026-13-45T00:00:00Z'; }],
      ['actions that are not an array', d => { d.actions = {}; }],
      ['an errors item with afterAction -1', d => { d.errors = [{ ...error, afterAction: -1 }]; }],
      ['an errors item of unknown kind', d => { d.errors = [{ ...error, kind: 'warning' }]; }],
      ['an errors item with count 0', d => { d.errors = [{ ...error, count: 0 }]; }],
      ['an errors item with a numeric stack', d => { d.errors = [{ ...error, stack: 1 }]; }],
      ['errors that are not an array', d => { d.errors = null; }],
      // validDoc's start puzzle has a seed, so it carries both.
      ['a seed without a tier', d => { delete d.tier; }],
      ['a tier without a seed', d => { delete d.seed; }],
      ['a string seed', d => { d.seed = '7'; d.tier = 'easy'; }],
      ['a numeric tier', d => { d.seed = 7; d.tier = 1; }],
      ['a start that is not an object', d => { d.start = 'start'; }],
    ];

    for (const [label, patch] of ROWS) {
      it(`${label} is not a session document`, () => {
        expect(readDocument(patched(validDoc(), patch))).to.deep.equal({ ok: false, reason: NOT_DOC });
      });
    }

    it('a well-formed errors item is accepted', () => {
      expect(readDocument(validDoc({ errors: [error] })).ok).to.equal(true);
    });
  });

  describe('SC35: seed and tier', () => {
    const build = start => buildDocument({ start, entries: [], exportedAt: T0 });

    it('a start puzzle with a numeric seed writes seed and tier from gen', () => {
      expect(build(plainPositionDoc())).to.deep.include({ seed: 3141592653, tier: 'hard' });
    });

    it('a start puzzle with seed null writes neither', () => {
      const doc = build(plainPositionDoc({ puzzle: puzzleDoc({ gen: makeGen({ seed: null }) }) }));

      expect(doc).to.not.have.any.keys('seed', 'tier');
    });

    it('no start puzzle writes neither', () => {
      expect(build(plainPositionDoc({ puzzle: null }))).to.not.have.any.keys('seed', 'tier');
    });

    it('a start puzzle without gen writes neither', () => {
      const doc = build(plainPositionDoc({ puzzle: puzzleDoc({ origin: 'link', gen: undefined }) }));

      expect(doc).to.not.have.any.keys('seed', 'tier');
    });
  });

  describe('buildDocument entries', () => {
    const error = { kind: 'listener', message: 'x is undefined', stack: 'at f', source: null, action: 'PEN_ENTER' };
    const entries = [
      { seq: 1, t: T0, a: { type: 'SELECT_CELL', index: 2 } },
      { seq: 2, t: T0 + 1, n: 2, e: error },
      { seq: 3, t: T0 + 2, a: { type: 'UNDO' }, nc: true },
      { seq: 4, t: T0 + 3, a: { type: 'SELECT_CELL', index: 3 }, f: [{ type: 'COACH_FOCUS_COACHED_CELL', index: 3 }] },
    ];

    it('writes actions with their time, noChange and follow-ups, and errors after the actions they follow', () => {
      const doc = buildDocument({ start: plainPositionDoc({ puzzle: null }), entries, exportedAt: T0 + 10 });

      expect(doc).to.deep.equal({
        format: 'sudoku-session',
        version: 1,
        exportedAt: '2026-11-15T14:01:07.422Z',
        start: plainPositionDoc({ puzzle: null }),
        actions: [
          { at: '2026-11-15T14:01:07.412Z', action: { type: 'SELECT_CELL', index: 2 } },
          { at: '2026-11-15T14:01:07.414Z', action: { type: 'UNDO' }, noChange: true },
          {
            at: '2026-11-15T14:01:07.415Z', action: { type: 'SELECT_CELL', index: 3 },
            then: [{ type: 'COACH_FOCUS_COACHED_CELL', index: 3 }],
          },
        ],
        errors: [{ at: '2026-11-15T14:01:07.413Z', afterAction: 1, ...error, count: 2 }],
      });
    });

    it('shares nothing with its arguments', () => {
      const start = plainPositionDoc();
      const doc = buildDocument({ start, entries, exportedAt: T0 });

      doc.start.pencil[2].push(4);
      doc.actions[2].then[0].index = 9;

      expect(start.pencil[2]).to.deep.equal([]);
      expect(entries[3].f[0].index).to.equal(3);
    });

    it('a built document with actions, follow-ups and errors validates in every part', () => {
      const doc = viaJson(buildDocument({ start: plainPositionDoc(), entries, exportedAt: T0 }));

      const read = readDocument(doc);

      expect(read.ok).to.equal(true);
      expect(validatePosition(read.doc.start)).to.deep.equal({ ok: true });
      expect(read.doc.actions.map(validateActionItem).every(r => r.ok)).to.equal(true);
    });
  });
});

// ── PR1 — position round trip ────────────────────────────────────────────────

describe('sessionCodec — PR1 position round trip', function () {
  this.timeout(30000);

  /**
   * The law of tspec §6.1: a machine built from the JSON of `encodePosition(S)`
   * has S's fingerprint, and encoding is idempotent through decode.
   */
  function roundTripFailure(state) {
    const doc = encodePosition(state);
    const text = JSON.stringify(doc);
    const machine = createMachine(JSON.parse(text));
    const expected = JSON.stringify(fingerprint(state));
    const actual = JSON.stringify(fingerprint(machine.getState()));
    if (actual !== expected) return `fingerprint\n  expected: ${expected}\n  actual:   ${actual}`;
    const again = JSON.stringify(encodePosition(decodePosition(JSON.parse(text))));
    if (again !== text) return `re-encoding\n  expected: ${text}\n  actual:   ${again}`;
    return null;
  }

  const easy = () => makePuzzle();
  const EDGE_STATES = [
    ['no puzzle', []],
    ['an Unrated puzzle', [load(makePuzzle({ difficulty: 'unrated' }))]],
    ['unlimited hints', [load(makePuzzle({ difficulty: 'kiddie' }))]],
    ['a won game', [load(makePuzzle({ givens: NEARLY_SOLVED })), sel(2), pen(4), sel(3), pen(6), sel(5), pen(8)]],
    ['a coach session focused on its target', [load(easy()), sel(2), coachStart(placementStep(2))]],
    ['a coach session with no focus', [load(easy()), coachStart(eliminationStep())]],
    ["a coach recap 'normal'", [load(easy()), sel(2), coachStart(placementStep(2)), pen(4)]],
    ["a coach recap 'error'", [load(easy()), sel(2), coachStart(placementStep(2)), pen(wrong(2))]],
    ["a coach recap 'elim'", [load(easy()), coachStart(eliminationStep()), sel(2), mark(9), sel(3), mark(2)]],
    ['an undo step', [load(easy()), sel(2), pen(4)]],
    ['a generation without progress', [load(easy()), { type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'hard' }]],
    ['a generation with progress', [load(easy()), { type: 'SET_GENERATING', flag: true, message: 'Generating…' },
      { type: 'GEN_PROGRESS', attempts: 4, budget: 50 }]],
    ['a pending check highlight with incorrect cells', [load(easy()), sel(2), pen(wrong(2)), { type: 'CHECK' }]],
    ['a cell with all nine marks', [load(easy()), sel(2), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(mark)]],
  ];

  for (const [label, actions] of EDGE_STATES) {
    it(`PR1: ${label} round-trips`, () => {
      const state = play(actions);

      expect(roundTripFailure(state)).to.equal(null);
    });
  }

  it('PR1: the recap edge states are what they claim', () => {
    const recaps = EDGE_STATES.filter(([label]) => label.startsWith('a coach recap'))
      .map(([, actions]) => play(actions).coachSession?.recap);

    expect(recaps).to.deep.equal(['normal', 'error', 'elim']);
  });

  for (const seed of [0x5eed01, 0x5eed02, 0x5eed03]) {
    it(`PR1: every state of a 600-action session (seed ${seed.toString(16)}) round-trips`, () => {
      const puzzles = [
        GOLDEN_PUZZLES.kiddie, GOLDEN_PUZZLES.easy, GOLDEN_PUZZLES.hard,
        GOLDEN_PUZZLES.expert, GOLDEN_PUZZLES.unrated,
        { ...loadFromGivens(toGivens(MEDIUM)).puzzle, id: 'medium' },
        { ...loadFromGivens(toGivens(HARD)).puzzle, id: 'hard' },
      ];
      const clock = manualTimers();
      const store = devModeStore({ hint: nextHint, timers: clock.timers });
      const driver = createSessionDriver(seed, { puzzles });

      for (let i = 0; i < 600; i++) {
        if (driver.rng() < 0.03) clock.fireAll();
        store.dispatch(driver.next(store.getState()));
        const failure = roundTripFailure(store.getState());
        if (failure !== null) {
          expect.fail(`seed ${seed.toString(16)}, action ${i}: ${failure}\n` +
            `position: ${JSON.stringify(encodePosition(store.getState()))}`);
        }
      }
    });
  }
});
