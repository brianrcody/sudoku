/**
 * @fileoverview Unit tests for js/providers/loadProvider.js (LV1–LV7).
 *
 * LV1–LV6 inject a fake worker to drive every branch deterministically; LV7
 * runs one request through the real worker script.
 */

import { createLoadProvider } from '../../providers/loadProvider.js';
import { MSG } from '../../worker/protocol.js';
import { KIDDIE, toGivens } from '../fixtures/puzzles/loadable.js';

function makeFakeWorkerFactory() {
  const workers = [];
  function createWorker() {
    const worker = {
      posted: [],
      onmessage: null,
      onerror: null,
      postMessage(msg) { this.posted.push(msg); },
      reply(id, result) { this.onmessage({ data: { type: MSG.LOAD_RESULT, id, result } }); },
    };
    workers.push(worker);
    return worker;
  }
  return { createWorker, workers };
}

describe('providers/loadProvider.js', () => {
  it('LV1: no worker is created until the first request', () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    createLoadProvider({ createWorker });
    expect(workers).to.have.length(0);
  });

  it('LV2: rateGivens posts a LOAD_REQUEST carrying the givens', () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    const givens = toGivens(KIDDIE);
    createLoadProvider({ createWorker }).rateGivens(givens);
    expect(workers).to.have.length(1);
    expect(workers[0].posted).to.have.length(1);
    expect(workers[0].posted[0].type).to.equal(MSG.LOAD_REQUEST);
    expect(workers[0].posted[0].givens).to.equal(givens);
  });

  it('LV3: rateGivens resolves with the matching LOAD_RESULT, and reuses the worker', async () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    const provider = createLoadProvider({ createWorker });
    const first = provider.rateGivens(toGivens(KIDDIE));
    const second = provider.rateGivens(toGivens(KIDDIE));
    expect(workers).to.have.length(1);

    const [reqA, reqB] = workers[0].posted;
    expect(reqA.id).to.not.equal(reqB.id);
    workers[0].reply(reqB.id, { ok: false, reason: 'multiple' });
    workers[0].reply(reqA.id, { ok: false, reason: 'complete' });

    expect(await first).to.deep.equal({ ok: false, reason: 'complete' });
    expect(await second).to.deep.equal({ ok: false, reason: 'multiple' });
  });

  it('LV4: a worker error rejects every pending request with its message', async () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    const provider = createLoadProvider({ createWorker });
    const a = provider.rateGivens(toGivens(KIDDIE)).catch(e => e.message);
    const b = provider.rateGivens(toGivens(KIDDIE)).catch(e => e.message);
    workers[0].onerror({ message: 'boom' });
    expect(await a).to.equal('boom');
    expect(await b).to.equal('boom');
  });

  it('LV5: a worker error without a message rejects with a generic one, and the next request gets a fresh worker', async () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    const provider = createLoadProvider({ createWorker });
    const failed = provider.rateGivens(toGivens(KIDDIE)).catch(e => e.message);
    workers[0].onerror({});
    expect(await failed).to.equal('Worker error');

    const next = provider.rateGivens(toGivens(KIDDIE));
    expect(workers).to.have.length(2);
    workers[1].reply(workers[1].posted[0].id, { ok: false, reason: 'multiple' });
    expect(await next).to.deep.equal({ ok: false, reason: 'multiple' });
  });

  it('LV6: a late result for a request already failed by an error is ignored', async () => {
    const { createWorker, workers } = makeFakeWorkerFactory();
    const provider = createLoadProvider({ createWorker });
    const failed = provider.rateGivens(toGivens(KIDDIE)).catch(e => e.message);
    const { id } = workers[0].posted[0];
    workers[0].onerror({ message: 'boom' });
    expect(() => workers[0].reply(id, { ok: false, reason: 'multiple' })).to.not.throw();
    expect(await failed).to.equal('boom');
  });

  it('LV7: the default factory round-trips through the real worker script', async function () {
    this.timeout(15000);
    const result = await createLoadProvider().rateGivens(toGivens(KIDDIE));
    expect(result.ok).to.be.true;
    expect(result.puzzle.difficulty).to.equal('kiddie');
    expect(result.puzzle.givens).to.be.instanceof(Uint8Array);
    expect(result.puzzle.solution).to.be.instanceof(Uint8Array);
  });
});
