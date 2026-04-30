/**
 * @fileoverview Generator Worker entry point. Receives GEN_REQUEST messages,
 * runs the generation pipeline, and posts GEN_RESULT / GEN_PROGRESS /
 * GEN_ERROR / GEN_ABORT messages back to the main thread.
 *
 * Only one request is processed at a time. A GEN_ABORT message sets an
 * internal abort flag that is checked between generation attempts.
 */

import { generateForTier } from '../generator/pipeline.js';
import { mulberry32 } from '../prng.js';
import { MSG, makeGenProgress, makeGenResult, makeGenError } from './protocol.js';

/**
 * Queue of pending requests. The first entry is the active one; subsequent
 * entries are background requests that wait for the foreground to complete.
 *
 * @type {Array<{type:string, id:string, tier:string, seed:number, background:boolean, budget?:number}>}
 */
let queue = [];

/** Whether the currently-active request has been aborted. */
let aborted = false;

/** Whether processNext is currently running. */
let processing = false;

self.onmessage = function (event) {
  const msg = event.data;

  if (msg.type === MSG.GEN_ABORT) {
    // Mark the active request (if any) as aborted.
    if (queue.length > 0 && queue[0].id === msg.id) {
      aborted = true;
    }
    // Also remove from the queue if it hasn't started yet.
    queue = queue.filter(r => r.id !== msg.id);
    return;
  }

  if (msg.type === MSG.GEN_REQUEST) {
    if (msg.background) {
      // Background requests go to the back of the queue.
      queue.push(msg);
    } else {
      // Foreground: preempt the active request only if it's a background.
      // Concurrent foregrounds queue behind one another in arrival order.
      if (queue.length > 0 && queue[0].background) {
        aborted = true;
      }
      // Insert before any background entries (after any pending foregrounds).
      const firstBgIdx = queue.findIndex(r => r.background);
      if (firstBgIdx === -1) queue.push(msg);
      else queue.splice(firstBgIdx, 0, msg);
    }

    // If this is the only item, kick off processing immediately.
    if (queue.length === 1) {
      processNext();
    }
    return;
  }
};

/**
 * Process the next request in the queue.
 */
async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const req = queue[0];
  aborted = false;

  // Yield to the event loop so any pending GEN_ABORT or GEN_REQUEST messages
  // that arrived between postMessage calls can be processed before we start.
  await new Promise(r => setTimeout(r, 0));

  if (aborted) {
    processing = false;
    processNext();
    return;
  }

  const rng = mulberry32(req.seed);

  // AbortSignal polyfill via the internal `aborted` flag.
  const signal = {
    get aborted() { return aborted; },
    throwIfAborted() {
      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
    },
  };

  let puzzle;
  let fallback = false;

  try {
    puzzle = generateForTier(req.tier, {
      rng,
      seed: req.seed,
      budget: req.budget,
      abortSignal: signal,
      onProgress({ attempts, budget }) {
        self.postMessage(makeGenProgress({ id: req.id, attempts, budget }));
      },
    });

    // Detect fallback: the returned puzzle's difficulty differs from requested.
    if (puzzle.difficulty !== req.tier) {
      fallback = true;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Request was aborted — silently discard, process next in queue.
      queue.shift();
      processing = false;
      processNext();
      return;
    }
    self.postMessage(makeGenError({ id: req.id, message: err.message }));
    queue.shift();
    processing = false;
    processNext();
    return;
  }

  self.postMessage(makeGenResult({ id: req.id, puzzle, fallback }));
  queue.shift();
  processing = false;
  processNext();
}
