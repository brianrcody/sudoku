/**
 * @fileoverview Unit tests for js/game/foreground.js (aspec-debug-instrumentation
 * §9.4, Phase 1B rows FG1–FG31; Phase 2 rows FG32–FG41).
 *
 * Every collaborator is a fake: the provider hands back a deferred promise per
 * request so each test decides when and how it settles, and the dialog captures
 * its options so a test can press Play or Cancel. `diagnostics` is a real emitter.
 */

import { createForegroundGenerator } from '../../game/foreground.js';
import { createEmitter, diagnostics as globalDiagnostics } from '../../util/events.js';
import { createClientGenProvider } from '../../providers/clientGenProvider.js';
import { MSG } from '../../worker/protocol.js';

/** Lets every pending promise reaction run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function puzzleOf(difficulty) {
  return { id: `p-${difficulty}`, difficulty };
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Builds a generator over recording fakes.
 *
 * @param {{ saved?: *, throwOn?: string, writeError?: Error, dialogThrows?: boolean, dialogError?: * }} [opts]
 *   What the saved tier preference reads as; an action type whose dispatch throws
 *   (after it is recorded); an error the preference write throws; whether the
 *   dialog throws, and what.
 */
function makeForeground({
  saved = null, throwOn = null, writeError = null, dialogThrows = false, dialogError,
} = {}) {
  const log = {
    requests: [], dispatched: [], dialogs: [], announced: [], logged: [],
    written: [], events: [], order: [],
  };
  const diagnostics = createEmitter();
  for (const type of ['swallowed', 'generation']) {
    diagnostics.on(type, payload => log.events.push({ type, payload }));
  }
  const fg = createForegroundGenerator({
    gameState: {
      dispatch: action => {
        log.dispatched.push(action);
        log.order.push(action.type);
        if (action.type === throwOn) throw new Error(`${throwOn} failed`);
      },
    },
    requestPuzzle: args => {
      const d = deferred();
      log.requests.push({ args, resolve: d.resolve, reject: d.reject });
      return d.promise;
    },
    openDialog: opts => {
      log.dialogs.push(opts);
      if (dialogThrows) throw dialogError;
    },
    announce: message => { log.announced.push(message); log.order.push('announce'); },
    preference: {
      read: () => saved,
      write: tier => {
        log.written.push(tier);
        if (writeError) throw writeError;
      },
    },
    diagnostics,
    logError: (...args) => { log.logged.push(args); },
  });
  return { fg, log };
}

/** A request whose loads and outcomes are recorded. */
function track(fg, difficulty) {
  const loaded = [];
  const outcomes = [];
  fg.request(difficulty, puzzle => loaded.push(puzzle), { onOutcome: o => outcomes.push(o) });
  return { loaded, outcomes };
}

describe('game/foreground.js', () => {

  describe('request: plain load and progress', () => {
    it('FG1: request marks the game as generating the requested tier', () => {
      const { fg, log } = makeForeground();

      track(fg, 'hard');

      expect(log.dispatched).to.deep.equal([
        { type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…', difficulty: 'hard' },
      ]);
    });

    it('FG2: request asks the provider for the tier with an unaborted signal', () => {
      const { fg, log } = makeForeground();

      track(fg, 'hard');

      expect(log.requests).to.have.length(1);
      expect(log.requests[0].args.difficulty).to.equal('hard');
      expect(log.requests[0].args.signal).to.be.instanceOf(AbortSignal);
      expect(log.requests[0].args.signal.aborted).to.be.false;
    });

    it('FG3: a plain result loads the puzzle and reports a loaded outcome without fallback', async () => {
      const { fg, log } = makeForeground();
      const t = track(fg, 'hard');
      const puzzle = puzzleOf('hard');

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(t.loaded).to.deep.equal([puzzle]);
      expect(t.outcomes).to.deep.equal([{ status: 'loaded', puzzle, fallback: false }]);
      expect(log.dialogs).to.be.empty;
      expect(log.written).to.be.empty;
    });

    it('FG4: progress from the current request dispatches GEN_PROGRESS', () => {
      const { fg, log } = makeForeground();
      track(fg, 'hard');

      log.requests[0].args.onProgress({ attempts: 3, budget: 50 });

      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'GEN_PROGRESS', attempts: 3, budget: 50 });
    });

    it('FG5: progress from a superseded request is ignored', () => {
      const { fg, log } = makeForeground();
      track(fg, 'hard');
      track(fg, 'expert');
      const before = log.dispatched.length;

      log.requests[0].args.onProgress({ attempts: 3, budget: 50 });

      expect(log.dispatched).to.have.length(before);
    });
  });

  describe('request: supersession', () => {
    it('FG6: a second request reports the first as replaced and aborts its signal', () => {
      const { fg, log } = makeForeground();
      const first = track(fg, 'hard');

      track(fg, 'expert');

      expect(first.outcomes).to.deep.equal([{ status: 'replaced' }]);
      expect(log.requests[0].args.signal.aborted).to.be.true;
    });

    it('FG7: the late result of a superseded request is ignored', async () => {
      const { fg, log } = makeForeground();
      const first = track(fg, 'hard');
      track(fg, 'expert');
      const before = log.dispatched.length;

      log.requests[0].resolve({ puzzle: puzzleOf('hard'), fallback: false });
      await settle();

      expect(first.loaded).to.be.empty;
      expect(first.outcomes).to.deep.equal([{ status: 'replaced' }]);
      expect(log.dispatched).to.have.length(before);
    });

    it('FG8: the late failure of a superseded request is logged and nothing else', async () => {
      const { fg, log } = makeForeground();
      const first = track(fg, 'hard');
      const second = track(fg, 'expert');
      const before = log.dispatched.length;
      const failure = new Error('worker died');

      log.requests[0].reject(failure);
      await settle();

      expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', failure]]);
      expect(log.dispatched).to.have.length(before);
      expect(log.events).to.be.empty;
      expect(first.outcomes).to.deep.equal([{ status: 'replaced' }]);
      expect(second.outcomes).to.be.empty;
    });
  });

  describe('cancel and abort', () => {
    it('FG9: cancel while pending aborts the signal, clears generating, announces, and reports cancelled', () => {
      const { fg, log } = makeForeground();
      const t = track(fg, 'hard');

      fg.cancel();

      expect(log.requests[0].args.signal.aborted).to.be.true;
      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
      expect(log.announced).to.deep.equal(['Puzzle search cancelled.']);
      expect(t.outcomes).to.deep.equal([{ status: 'cancelled' }]);
    });

    it('FG10: cancel when idle does nothing', () => {
      const { fg, log } = makeForeground();

      fg.cancel();

      expect(log.dispatched).to.be.empty;
      expect(log.announced).to.be.empty;
    });

    it('FG11: abort when idle does nothing', () => {
      const { fg, log } = makeForeground();

      fg.abort('replaced');

      expect(log.dispatched).to.be.empty;
      expect(log.announced).to.be.empty;
      expect(log.events).to.be.empty;
    });

    it('FG12: an AbortError rejection emits swallowed foreground.request and nothing else', async () => {
      const { fg, log } = makeForeground();
      const t = track(fg, 'hard');
      fg.cancel();
      const before = log.dispatched.length;
      const error = abortError();

      log.requests[0].reject(error);
      await settle();

      expect(log.events).to.deep.equal([
        { type: 'swallowed', payload: { where: 'foreground.request', error } },
      ]);
      expect(log.events[0].payload.error).to.equal(error);
      expect(log.dispatched).to.have.length(before);
      expect(log.logged).to.be.empty;
      expect(log.announced).to.deep.equal(['Puzzle search cancelled.']);
      expect(t.outcomes).to.deep.equal([{ status: 'cancelled' }]);
    });
  });

  describe('request: budget-exhaustion fallback', () => {
    for (const tier of ['kiddie', 'easy', 'medium', 'hard', 'expert']) {
      it(`FG13: a fallback for ${tier} loads silently with no dialog and no preference write`, async () => {
        const { fg, log } = makeForeground();
        const t = track(fg, tier);
        const puzzle = puzzleOf('easy');

        log.requests[0].resolve({ puzzle, fallback: true });
        await settle();

        expect(log.dialogs).to.be.empty;
        expect(log.written).to.be.empty;
        expect(t.loaded).to.deep.equal([puzzle]);
        expect(t.outcomes).to.deep.equal([{ status: 'loaded', puzzle, fallback: true }]);
      });
    }

    for (const [tier, label] of [['diabolical', 'Diabolical'], ['nightmare', 'Nightmare']]) {
      it(`FG14: a ${tier} fallback opens the honest-fallback dialog naming both tiers`, async () => {
        const { fg, log } = makeForeground();
        track(fg, tier);

        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();

        expect(log.dialogs).to.have.length(1);
        expect(log.dialogs[0].title).to.equal(`No ${label} puzzle found`);
        expect(log.dialogs[0].body).to.equal(
          `The generator couldn't find a ${label} puzzle this time. ` +
          'The best it found is rated Expert. Play it?');
        expect(log.dialogs[0].confirmLabel).to.equal('Play Expert');
      });

      it(`FG15: a ${tier} fallback clears generating and loads nothing until the player answers`, async () => {
        const { fg, log } = makeForeground();
        const t = track(fg, tier);

        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();

        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
        expect(t.loaded).to.be.empty;
        expect(t.outcomes).to.be.empty;
      });

      it(`FG16: Play on the ${tier} dialog saves the actual tier, loads the puzzle, and reports loaded`, async () => {
        const { fg, log } = makeForeground();
        const t = track(fg, tier);
        const puzzle = puzzleOf('expert');
        log.requests[0].resolve({ puzzle, fallback: true });
        await settle();

        log.dialogs[0].onConfirm();

        expect(log.written).to.deep.equal(['expert']);
        expect(fg.preferredTier()).to.equal('expert');
        expect(t.loaded).to.deep.equal([puzzle]);
        expect(t.outcomes).to.deep.equal([{ status: 'loaded', puzzle, fallback: true }]);
      });

      it(`FG17: Cancel on the ${tier} dialog loads nothing, keeps the preference, and reports fallback-declined`, async () => {
        const { fg, log } = makeForeground({ saved: tier });
        const t = track(fg, tier);
        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();

        log.dialogs[0].onCancel();

        expect(t.loaded).to.be.empty;
        expect(log.written).to.be.empty;
        expect(fg.preferredTier()).to.equal(tier);
        expect(t.outcomes).to.deep.equal([{ status: 'fallback-declined' }]);
      });
    }

    it('FG18: a not-a-fallback result for an honest-fallback tier loads without a dialog', async () => {
      const { fg, log } = makeForeground();
      const t = track(fg, 'nightmare');
      const puzzle = puzzleOf('nightmare');

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(log.dialogs).to.be.empty;
      expect(t.loaded).to.deep.equal([puzzle]);
    });

    it('FG31: the honest-fallback dialog names a tier with no display label by its id', async () => {
      const { fg, log } = makeForeground();
      track(fg, 'nightmare');

      log.requests[0].resolve({ puzzle: puzzleOf('mystery'), fallback: true });
      await settle();

      expect(log.dialogs[0].body).to.equal(
        "The generator couldn't find a Nightmare puzzle this time. " +
        'The best it found is rated mystery. Play it?');
      expect(log.dialogs[0].confirmLabel).to.equal('Play mystery');
    });
  });

  describe('request: generator failure', () => {
    for (const [name, failure] of [['an Error', new Error('worker died')], ['undefined', undefined]]) {
      it(`FG19: a rejection with ${name} while current is logged with the unchanged text`, async () => {
        const { fg, log } = makeForeground();
        track(fg, 'hard');

        log.requests[0].reject(failure);
        await settle();

        expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', failure]]);
      });

      it(`FG20: a rejection with ${name} while current clears generating`, async () => {
        const { fg, log } = makeForeground();
        track(fg, 'hard');

        log.requests[0].reject(failure);
        await settle();

        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
      });

      it(`FG21: a rejection with ${name} while current emits no generation event (the provider reports it)`, async () => {
        const { fg, log } = makeForeground();
        track(fg, 'hard');

        log.requests[0].reject(failure);
        await settle();

        expect(log.events).to.deep.equal([]);
      });

      it(`FG22: a rejection with ${name} while current reports failed and leaves the generator idle`, async () => {
        const { fg, log } = makeForeground();
        const t = track(fg, 'hard');

        log.requests[0].reject(failure);
        await settle();
        fg.cancel();

        expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
        expect(log.announced).to.be.empty;
      });
    }
  });

  describe('startNew', () => {
    it('FG23: startNew starts the puzzle, announces it, then runs afterLoad, in that order', async () => {
      const { fg, log } = makeForeground();
      const after = [];
      fg.startNew('hard', puzzle => { after.push(puzzle); log.order.push('afterLoad'); });
      const puzzle = puzzleOf('hard');

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'hard', puzzle });
      expect(log.announced).to.deep.equal(['New puzzle started.']);
      expect(after).to.deep.equal([puzzle]);
      expect(log.order).to.deep.equal(['SET_GENERATING', 'NEW_PUZZLE', 'announce', 'afterLoad']);
    });

    it('FG24: startNew without afterLoad still starts and announces the puzzle', async () => {
      const { fg, log } = makeForeground();
      fg.startNew('hard');
      const puzzle = puzzleOf('hard');

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'hard', puzzle });
      expect(log.announced).to.deep.equal(['New puzzle started.']);
    });
  });

  describe('tier preference', () => {
    for (const [name, saved, expected] of [
      ['a rated tier', 'hard', 'hard'],
      ['Unrated', 'unrated', 'easy'],
      ['nothing', null, 'easy'],
    ]) {
      it(`FG25: preferredTier is ${expected} when the saved preference is ${name}`, () => {
        const { fg } = makeForeground({ saved });

        expect(fg.preferredTier()).to.equal(expected);
      });
    }

    it('FG26: chooseTier writes the preference and becomes the preferred tier', () => {
      const { fg, log } = makeForeground();

      fg.chooseTier('expert');

      expect(log.written).to.deep.equal(['expert']);
      expect(fg.preferredTier()).to.equal('expert');
    });

    it('FG27: generationTier is the generating tier while a generation is pending', () => {
      const { fg } = makeForeground({ saved: 'medium' });

      const tier = fg.generationTier({ generatingDifficulty: 'nightmare', puzzle: puzzleOf('hard') });

      expect(tier).to.equal('nightmare');
    });

    it('FG28: generationTier is the current puzzle\'s tier when it is rated', () => {
      const { fg } = makeForeground({ saved: 'medium' });

      const tier = fg.generationTier({ generatingDifficulty: null, puzzle: puzzleOf('hard') });

      expect(tier).to.equal('hard');
    });

    it('FG29: generationTier is the preferred tier when the current puzzle is Unrated', () => {
      const { fg } = makeForeground({ saved: 'medium' });

      const tier = fg.generationTier({ generatingDifficulty: null, puzzle: puzzleOf('unrated') });

      expect(tier).to.equal('medium');
    });

    it('FG30: generationTier is the preferred tier when there is no puzzle', () => {
      const { fg } = makeForeground({ saved: 'medium' });

      const tier = fg.generationTier({ generatingDifficulty: null, puzzle: null });

      expect(tier).to.equal('medium');
    });
  });

  // Phase 2 rows of aspec §9.4: the Unrated fallback (fspec-007 §7.5), the
  // 'accept' and 'refuse' policies, generateSeeded, seed and budget forwarding.

  describe('request: Unrated fallback', () => {
    for (const [tier, label] of [['diabolical', 'Diabolical'], ['nightmare', 'Nightmare']]) {
      it(`FG32: an Unrated ${tier} fallback opens the dialog with the Unrated body and "Play Unrated"`, async () => {
        const { fg, log } = makeForeground();
        track(fg, tier);

        log.requests[0].resolve({ puzzle: puzzleOf('unrated'), fallback: true });
        await settle();

        expect(log.dialogs).to.have.length(1);
        expect(log.dialogs[0].title).to.equal(`No ${label} puzzle found`);
        expect(log.dialogs[0].body).to.equal(
          `The generator couldn't find a ${label} puzzle this time. ` +
          "The best it found can't be rated, so hints and coach are unavailable. Play it?");
        expect(log.dialogs[0].confirmLabel).to.equal('Play Unrated');
      });

      it(`FG33: Play Unrated on the ${tier} dialog loads the puzzle and leaves the preference unchanged`, async () => {
        const { fg, log } = makeForeground({ saved: tier });
        const t = track(fg, tier);
        const puzzle = puzzleOf('unrated');
        log.requests[0].resolve({ puzzle, fallback: true });
        await settle();

        log.dialogs[0].onConfirm();

        expect(log.written).to.be.empty;
        expect(fg.preferredTier()).to.equal(tier);
        expect(t.loaded).to.deep.equal([puzzle]);
        expect(t.outcomes).to.deep.equal([{ status: 'loaded', puzzle, fallback: true }]);
      });
    }

    it('FG34: startNew announces an Unrated fallback puzzle as unrated', async () => {
      const { fg, log } = makeForeground();
      fg.startNew('expert');
      const puzzle = puzzleOf('unrated');

      log.requests[0].resolve({ puzzle, fallback: true });
      await settle();

      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'unrated', puzzle });
      expect(log.announced).to.deep.equal([
        'New puzzle started. It could not be rated, so hints and coach are unavailable.',
      ]);
      expect(log.dialogs).to.be.empty;
    });
  });

  describe('generateSeeded and the fallback policies', () => {
    it('FG35: generateSeeded starts a plain result as a new puzzle without announcing it', async () => {
      const { fg, log } = makeForeground();
      const outcome = fg.generateSeeded({ tier: 'hard', seed: 2024, fallback: 'refuse' });
      const puzzle = puzzleOf('hard');

      log.requests[0].resolve({ puzzle, fallback: false });

      expect(await outcome).to.deep.equal({ status: 'loaded', puzzle, fallback: false });
      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'hard', puzzle });
      expect(log.announced).to.be.empty;
    });

    it("FG36: 'accept' loads a rated honest fallback with no dialog and saves its tier", async () => {
      const { fg, log } = makeForeground({ saved: 'nightmare' });
      const outcome = fg.generateSeeded({ tier: 'nightmare', seed: 1, fallback: 'accept', budget: 3 });
      const puzzle = puzzleOf('easy');

      log.requests[0].resolve({ puzzle, fallback: true });

      expect(await outcome).to.deep.equal({ status: 'loaded', puzzle, fallback: true });
      expect(log.dialogs).to.be.empty;
      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'easy', puzzle });
      expect(log.written).to.deep.equal(['easy']);
      expect(log.announced).to.be.empty;
    });

    it("FG37: 'accept' loads an Unrated honest fallback with no dialog and leaves the preference", async () => {
      const { fg, log } = makeForeground({ saved: 'nightmare' });
      const outcome = fg.generateSeeded({ tier: 'nightmare', seed: 223, fallback: 'accept', budget: 1 });
      const puzzle = puzzleOf('unrated');

      log.requests[0].resolve({ puzzle, fallback: true });

      expect(await outcome).to.deep.equal({ status: 'loaded', puzzle, fallback: true });
      expect(log.dialogs).to.be.empty;
      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'unrated', puzzle });
      expect(log.written).to.be.empty;
      expect(fg.preferredTier()).to.equal('nightmare');
    });

    for (const difficulty of ['easy', 'unrated']) {
      it(`FG38: 'refuse' reports a ${difficulty} honest fallback as needs-accept-fallback and loads nothing`, async () => {
        const { fg, log } = makeForeground({ saved: 'nightmare' });
        const outcome = fg.generateSeeded({ tier: 'nightmare', seed: 1, fallback: 'refuse', budget: 3 });
        const puzzle = puzzleOf(difficulty);

        log.requests[0].resolve({ puzzle, fallback: true });

        expect(await outcome).to.deep.equal({ status: 'needs-accept-fallback', puzzle });
        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
        expect(log.dispatched.map(a => a.type)).to.not.include('NEW_PUZZLE');
        expect(log.dialogs).to.be.empty;
        expect(log.written).to.be.empty;
      });
    }

    it("FG39: 'refuse' does not apply below Diabolical: an Unrated Expert fallback loads silently", async () => {
      const { fg, log } = makeForeground({ saved: 'medium' });
      const outcome = fg.generateSeeded({ tier: 'expert', seed: 223, fallback: 'refuse', budget: 1 });
      const puzzle = puzzleOf('unrated');

      log.requests[0].resolve({ puzzle, fallback: true });

      expect(await outcome).to.deep.equal({ status: 'loaded', puzzle, fallback: true });
      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'unrated', puzzle });
      expect(log.dialogs).to.be.empty;
      expect(log.written).to.be.empty;
    });
  });

  describe('seed and budget forwarding', () => {
    it('FG40: generateSeeded asks the provider for its tier with its seed and budget', () => {
      const { fg, log } = makeForeground();

      fg.generateSeeded({ tier: 'nightmare', seed: 223, fallback: 'refuse', budget: 1 });

      expect(log.requests[0].args).to.include({ difficulty: 'nightmare', seed: 223, budget: 1 });
    });

    it('FG41: an ordinary request passes no seed and no budget', () => {
      const { fg, log } = makeForeground();

      track(fg, 'hard');

      expect(log.requests[0].args.seed).to.equal(undefined);
      expect(log.requests[0].args.budget).to.equal(undefined);
    });
  });

  // ── A delivered puzzle that fails to load (post-review fix) ──────────────

  describe('request: loading the delivered puzzle throws', () => {
    const LOAD_ERROR = new Error('load failed');
    const throwing = () => { throw LOAD_ERROR; };
    const failedEvents = log => log.events.filter(e => e.type === 'generation' && e.payload.event === 'failed');
    const generatingOff = log => log.dispatched.filter(a => a.type === 'SET_GENERATING' && a.flag === false);

    /** A request whose onLoaded throws; its outcomes are recorded. */
    function trackThrowing(fg, difficulty, opts = {}) {
      const outcomes = [];
      fg.request(difficulty, throwing, { ...opts, onOutcome: o => outcomes.push(o) });
      return { outcomes };
    }

    describe('the direct path', () => {
      async function failDirect() {
        const { fg, log } = makeForeground();
        const t = trackThrowing(fg, 'hard');
        log.requests[0].resolve({ puzzle: puzzleOf('hard'), fallback: false });
        await settle();
        return { fg, log, t };
      }

      it('logs the failure once with the unchanged text', async () => {
        const { log } = await failDirect();

        expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', LOAD_ERROR]]);
      });

      it('emits exactly one generation failed event with the error message', async () => {
        const { log } = await failDirect();

        expect(failedEvents(log)).to.deep.equal([{ type: 'generation', payload: { event: 'failed', message: 'load failed' } }]);
      });

      it('clears the busy state', async () => {
        const { log } = await failDirect();

        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
      });

      it('reports failed exactly once and never loaded, and nothing follows', async () => {
        const { fg, log, t } = await failDirect();
        const dispatched = log.dispatched.length;

        fg.cancel();
        await settle();

        expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
        expect(log.dispatched).to.have.length(dispatched);
        expect(log.announced).to.deep.equal([]);
        expect(log.logged).to.have.length(1);
      });
    });

    for (const tier of ['diabolical', 'nightmare']) {
      for (const [kind, delivered] of [['a rated', 'expert'], ['an Unrated', 'unrated']]) {
        describe(`the ${tier} dialog's confirm, with ${kind} fallback`, () => {
          async function confirmFailing() {
            const { fg, log } = makeForeground({ saved: 'medium' });
            const t = trackThrowing(fg, tier);
            log.requests[0].resolve({ puzzle: puzzleOf(delivered), fallback: true });
            await settle();
            const dispatched = log.dispatched.length;
            let thrown = null;
            try {
              log.dialogs[0].onConfirm();
            } catch (err) {
              thrown = err;
            }
            return { log, t, thrown, dispatched };
          }

          it('does not throw from the button handler', async () => {
            const { thrown } = await confirmFailing();

            expect(thrown).to.equal(null);
          });

          it('reports exactly failed', async () => {
            const { t } = await confirmFailing();

            expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
          });

          it('dispatches no further SET_GENERATING: the dialog had already cleared it', async () => {
            const { log, dispatched } = await confirmFailing();

            expect(log.dispatched).to.have.length(dispatched);
            expect(generatingOff(log)).to.have.length(1);
          });

          it('logs once and emits one failed event', async () => {
            const { log } = await confirmFailing();

            expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', LOAD_ERROR]]);
            expect(failedEvents(log)).to.have.length(1);
          });

          it(delivered === 'unrated'
            ? 'leaves the tier preference unwritten'
            : 'writes the tier preference before the load', async () => {
            const { log } = await confirmFailing();

            expect(log.written).to.deep.equal(delivered === 'unrated' ? [] : ['expert']);
          });
        });
      }
    }

    describe("the 'accept' policy", () => {
      async function acceptFailing(delivered) {
        const { fg, log } = makeForeground({ saved: 'medium' });
        const t = trackThrowing(fg, 'nightmare', { fallback: 'accept' });
        log.requests[0].resolve({ puzzle: puzzleOf(delivered), fallback: true });
        await settle();
        return { log, t };
      }

      it('reports failed once, clears the busy state, logs and emits once', async () => {
        const { log, t } = await acceptFailing('expert');

        expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
        expect(log.logged).to.have.length(1);
        expect(failedEvents(log)).to.have.length(1);
      });

      it('still writes the preference for a rated fallback', async () => {
        const { log } = await acceptFailing('expert');

        expect(log.written).to.deep.equal(['expert']);
      });

      it('writes no preference for an Unrated fallback', async () => {
        const { log } = await acceptFailing('unrated');

        expect(log.written).to.deep.equal([]);
      });
    });

    describe('the preference write throws (open item §1.2)', () => {
      const WRITE_ERROR = new Error('write refused');
      const swallowed = log => log.events.filter(e => e.type === 'swallowed').map(e => e.payload);

      async function deliver(policy) {
        const { fg, log } = makeForeground({ saved: 'medium', writeError: WRITE_ERROR });
        const t = { loaded: [], outcomes: [] };
        fg.request('nightmare', p => t.loaded.push(p), { fallback: policy, onOutcome: o => t.outcomes.push(o) });
        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();
        if (policy === 'ask') log.dialogs[0].onConfirm();
        return { fg, log, t, outcomes: t.outcomes };
      }

      for (const policy of ['ask', 'accept']) {
        describe(`with the '${policy}' policy`, () => {
          it('still loads the puzzle and reports loaded', async () => {
            const { t, outcomes } = await deliver(policy);

            expect(t.loaded).to.deep.equal([puzzleOf('expert')]);
            expect(outcomes).to.deep.equal([{ status: 'loaded', puzzle: puzzleOf('expert'), fallback: true }]);
          });

          it('reports the write as swallowed at foreground.chooseTier, and nothing as failed', async () => {
            const { log } = await deliver(policy);

            expect(swallowed(log)).to.deep.equal([{ where: 'foreground.chooseTier', error: WRITE_ERROR }]);
            expect(failedEvents(log)).to.be.empty;
            expect(log.logged).to.be.empty;
          });

          it('keeps the chosen tier as the preferred tier for the session', async () => {
            const { fg } = await deliver(policy);

            expect(fg.preferredTier()).to.equal('expert');
          });
        });
      }
    });

    describe('the fallback dialog throws (open item §1.2)', () => {
      const DIALOG_ERROR = new Error('dialog broke');

      async function dialogFailing() {
        const { fg, log } = makeForeground({ saved: 'medium', dialogThrows: true, dialogError: DIALOG_ERROR });
        const t = track(fg, 'diabolical');
        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();
        return { fg, log, t };
      }

      it('reports failed exactly once and loads nothing', async () => {
        const { t } = await dialogFailing();

        expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
        expect(t.loaded).to.be.empty;
      });

      it('leaves the busy state cleared', async () => {
        const { log } = await dialogFailing();

        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
        expect(generatingOff(log)).to.have.length(1);
      });

      it('logs once, emits one failed event, and writes no preference', async () => {
        const { log } = await dialogFailing();

        expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', DIALOG_ERROR]]);
        expect(failedEvents(log)).to.deep.equal([{ type: 'generation', payload: { event: 'failed', message: 'dialog broke' } }]);
        expect(log.written).to.be.empty;
      });

      it('reports a failed event with no message when the thrown value is not an Error', async () => {
        const { fg, log } = makeForeground({ dialogThrows: true, dialogError: undefined });
        const t = track(fg, 'nightmare');
        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();

        expect(failedEvents(log)).to.deep.equal([{ type: 'generation', payload: { event: 'failed', message: undefined } }]);
        expect(t.outcomes).to.deep.equal([{ status: 'failed' }]);
      });

      it('lets a later request run normally', async () => {
        const { fg, log } = await dialogFailing();
        const next = track(fg, 'hard');

        log.requests[1].resolve({ puzzle: puzzleOf('hard'), fallback: false });
        await settle();

        expect(next.outcomes).to.deep.equal([{ status: 'loaded', puzzle: puzzleOf('hard'), fallback: false }]);
      });
    });

    describe('an onOutcome that throws after delivery', () => {
      it('is logged and reported as a failed generation, with no second outcome', async () => {
        const { fg, log } = makeForeground();
        const failure = new Error('outcome handler broke');
        const outcomes = [];
        fg.request('nightmare', () => {}, {
          fallback: 'refuse',
          onOutcome: o => { outcomes.push(o); throw failure; },
        });

        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();

        expect(outcomes.map(o => o.status)).to.deep.equal(['needs-accept-fallback']);
        expect(log.logged).to.deep.equal([['[main] Failed to generate puzzle:', failure]]);
        expect(failedEvents(log)).to.deep.equal([{ type: 'generation', payload: { event: 'failed', message: 'outcome handler broke' } }]);
      });
    });

    describe('startNew whose NEW_PUZZLE dispatch throws', () => {
      async function startFailing() {
        const { fg, log } = makeForeground({ throwOn: 'NEW_PUZZLE' });
        const after = [];
        fg.startNew('hard', puzzle => after.push(puzzle));
        log.requests[0].resolve({ puzzle: puzzleOf('hard'), fallback: false });
        await settle();
        return { log, after };
      }

      it('announces no new puzzle', async () => {
        const { log } = await startFailing();

        expect(log.announced).to.deep.equal([]);
      });

      it('does not run afterLoad', async () => {
        const { after } = await startFailing();

        expect(after).to.deep.equal([]);
      });

      it('clears the busy state', async () => {
        const { log } = await startFailing();

        expect(log.dispatched.at(-1)).to.deep.equal({ type: 'SET_GENERATING', flag: false });
      });
    });

    it('generateSeeded resolves with failed rather than staying pending', async () => {
      const { fg, log } = makeForeground({ throwOn: 'NEW_PUZZLE' });
      const outcome = fg.generateSeeded({ tier: 'hard', seed: 1, fallback: 'refuse' });

      log.requests[0].resolve({ puzzle: puzzleOf('hard'), fallback: false });

      expect(await outcome).to.deep.equal({ status: 'failed' });
    });

    describe('a newer request started before the failure', () => {
      it('started inside onLoaded: the failing request reports failed once and leaves the newer one busy', async () => {
        const { fg, log } = makeForeground();
        const first = [];
        const second = { loaded: [], outcomes: [] };
        fg.request('hard', () => {
          fg.request('easy', p => second.loaded.push(p), { onOutcome: o => second.outcomes.push(o) });
          throw LOAD_ERROR;
        }, { onOutcome: o => first.push(o) });

        log.requests[0].resolve({ puzzle: puzzleOf('hard'), fallback: false });
        await settle();

        expect(first).to.deep.equal([{ status: 'failed' }]);
        expect(generatingOff(log)).to.deep.equal([]);
        const newer = puzzleOf('easy');
        log.requests[1].resolve({ puzzle: newer, fallback: false });
        await settle();
        expect(second.loaded).to.deep.equal([newer]);
        expect(second.outcomes).to.deep.equal([{ status: 'loaded', puzzle: newer, fallback: false }]);
      });

      it('started while the old request\'s dialog is open: confirming it fails once and the newer one still loads', async () => {
        const { fg, log } = makeForeground();
        const first = trackThrowing(fg, 'nightmare');
        log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
        await settle();
        const second = track(fg, 'easy');
        const offBefore = generatingOff(log).length;

        log.dialogs[0].onConfirm();
        const newer = puzzleOf('easy');
        log.requests[1].resolve({ puzzle: newer, fallback: false });
        await settle();

        expect(first.outcomes).to.deep.equal([{ status: 'failed' }]);
        expect(generatingOff(log)).to.have.length(offBefore);
        expect(second.loaded).to.deep.equal([newer]);
        expect(second.outcomes).to.deep.equal([{ status: 'loaded', puzzle: newer, fallback: false }]);
      });
    });
  });

  // ── One failed event per failure, provider and foreground together (review M4) ──

  describe('M4: a generation failure is reported exactly once on the diagnostics channel', () => {
    let failed;
    let worker;
    let warn;

    beforeEach(() => {
      failed = [];
      globalDiagnostics.on('generation', e => { if (e.event === 'failed') failed.push(e); });
      warn = console.warn;
      console.warn = () => {};
    });

    afterEach(() => {
      console.warn = warn;
    });

    function realChain(onLoaded = () => {}) {
      const provider = createClientGenProvider({
        createWorker: () => {
          worker = { posted: [], onmessage: null, onerror: null, postMessage(msg) { this.posted.push(msg); } };
          return worker;
        },
      });
      const outcomes = [];
      const fg = createForegroundGenerator({
        gameState: { dispatch() {} },
        requestPuzzle: args => provider.requestPuzzle(args),
        openDialog() {},
        announce() {},
        preference: { read: () => null, write() {} },
        diagnostics: globalDiagnostics,
        logError() {},
      });
      fg.request('hard', onLoaded, { onOutcome: o => outcomes.push(o) });
      return { outcomes };
    }

    const generated = () => ({
      id: 'p-hard', difficulty: 'hard', source: 'generated', solveTrace: [],
      givens: Array.from({ length: 81 }, (_, i) => i % 10), solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
    });

    it('when the worker reports GEN_ERROR', async () => {
      const { outcomes } = realChain();

      worker.onmessage({ data: { type: MSG.GEN_ERROR, id: worker.posted[0].id, message: 'generator broke' } });
      await settle();

      expect(failed).to.deep.equal([{ event: 'failed', message: 'generator broke' }]);
      expect(outcomes).to.deep.equal([{ status: 'failed' }]);
    });

    it('when the worker itself errors', async () => {
      const { outcomes } = realChain();

      worker.onerror({ message: 'worker died' });
      await settle();

      expect(failed).to.deep.equal([{ event: 'failed', message: 'worker died' }]);
      expect(outcomes).to.deep.equal([{ status: 'failed' }]);
    });

    it('when loading the delivered puzzle throws', async () => {
      const { outcomes } = realChain(() => { throw new Error('load failed'); });

      worker.onmessage({ data: { type: MSG.GEN_RESULT, id: worker.posted[0].id, puzzle: generated(), fallback: false } });
      await settle();

      expect(failed).to.deep.equal([{ event: 'failed', message: 'load failed' }]);
      expect(outcomes).to.deep.equal([{ status: 'failed' }]);
    });
  });

  // tspec-hamburger-menu §2.8: startNew forwards how the request ended.
  describe('startNew onOutcome', () => {
    it('FG42: startNew reports loaded to onOutcome after afterLoad', async () => {
      const { fg, log } = makeForeground();
      const puzzle = puzzleOf('hard');
      const outcomes = [];
      fg.startNew('hard', () => log.order.push('afterLoad'),
        o => { outcomes.push(o); log.order.push('onOutcome'); });

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(outcomes).to.deep.equal([{ status: 'loaded', puzzle, fallback: false }]);
      expect(log.order).to.deep.equal(['SET_GENERATING', 'NEW_PUZZLE', 'announce', 'afterLoad', 'onOutcome']);
    });

    it('FG43: startNew reports cancelled on cancel()', () => {
      const { fg } = makeForeground();
      const outcomes = [];
      fg.startNew('hard', undefined, o => outcomes.push(o));

      fg.cancel();

      expect(outcomes).to.deep.equal([{ status: 'cancelled' }]);
    });

    it('FG44: startNew reports replaced when superseded', () => {
      const { fg } = makeForeground();
      const outcomes = [];
      fg.startNew('hard', undefined, o => outcomes.push(o));

      fg.startNew('expert');

      expect(outcomes).to.deep.equal([{ status: 'replaced' }]);
    });

    it("FG45: startNew reports fallback-declined from the fallback dialog's Cancel", async () => {
      const { fg, log } = makeForeground();
      const outcomes = [];
      fg.startNew('nightmare', undefined, o => outcomes.push(o));
      log.requests[0].resolve({ puzzle: puzzleOf('expert'), fallback: true });
      await settle();

      log.dialogs[0].onCancel();

      expect(outcomes).to.deep.equal([{ status: 'fallback-declined' }]);
    });

    it('FG46: startNew reports failed on a provider error', async () => {
      const { fg, log } = makeForeground();
      const outcomes = [];
      fg.startNew('hard', undefined, o => outcomes.push(o));

      log.requests[0].reject(new Error('worker died'));
      await settle();

      expect(outcomes).to.deep.equal([{ status: 'failed' }]);
    });

    it('FG47: startNew with no onOutcome still loads', async () => {
      const { fg, log } = makeForeground();
      const puzzle = puzzleOf('hard');
      const after = [];
      fg.startNew('hard', p => after.push(p));

      log.requests[0].resolve({ puzzle, fallback: false });
      await settle();

      expect(log.dispatched.at(-1)).to.deep.equal({ type: 'NEW_PUZZLE', difficulty: 'hard', puzzle });
      expect(after).to.deep.equal([puzzle]);
    });
  });
});
