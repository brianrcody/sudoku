# Performance Report — v1

**Date:** 2026-04-30
**Test run:** 421 passing, 0 failing, 12 pending (includes 10 new PERF tests)
**Budgets (per CLAUDE.md / aspec §17 / tspec §3.13):**
- Non-generation actions: **<1 s**
- Death March cold-start: **<5 s**
**Status:** **All measured actions are within budget.**

---

## 1. Headline numbers

| Action | Measured | Budget | Headroom |
|---|---|---|---|
| New Puzzle — kiddie | 16 ms | 1000 ms | 62× |
| New Puzzle — easy | 39 ms | 1000 ms | 26× |
| New Puzzle — medium | 256 ms | 1000 ms | 4× |
| New Puzzle — hard | **560 ms** | 1000 ms | **1.8×** |
| New Puzzle — death-march | 43 ms | 5000 ms | 116× |
| Reset Puzzle | 0.60 ms | 1000 ms | ≫1000× |
| Pen entry → conflict highlight | 1.30 ms | 1000 ms | ≫700× |
| Hint | 3.90 ms | 1000 ms | ≫250× |
| Check | 0.40 ms | 1000 ms | ≫2000× |
| Difficulty change | 0.80 ms | 1000 ms | ≫1000× |

The bolded row is the closest call by a wide margin. Everything else
clears its budget by at least an order of magnitude.

---

## 2. What the measurements actually mean

The numbers above measure wall-clock time between user-facing trigger
(button click or reducer dispatch) and the user-visible state change
(new puzzle installed, conflict class on the cell, etc.). They are
captured inside `js/tests/integration/perf.test.js` running headless
Chromium under Playwright on the dev machine.

### 2.1 Reducer-only actions are essentially free

**Reset, Pen+conflict, Hint, Check, and Difficulty change** all complete
in under 5 ms. These actions are pure reducer updates plus DOM event
emission; no async work, no worker round-trip. There is no realistic
scenario in which these blow the 1-second budget unless a major
regression lands. They satisfy the budget by 200× to 2500×.

### 2.2 "New Puzzle" for kiddie / easy / medium / death-march is *warm-cache*

These numbers are misleadingly fast because `primeNext` pre-generates
the next puzzle in the background after every puzzle load. By the time
the test clicks "New Puzzle," the next puzzle for that tier is already
sitting in the cache, so the measurement is essentially "click → take
pre-generated puzzle off the shelf → install it."

This **is** the realistic user experience — a user playing through a
puzzle and then clicking New Puzzle has had seconds (or minutes) for
the prime to complete. But it does **not** validate the cold-start case
where the cache is empty.

### 2.3 Cold-start Death March is gated by SYS3

`js/tests/integration/system.test.js` SYS3 explicitly:
1. Pre-writes the difficulty preference to `death-march`.
2. Clears any saved state so a fresh generation must run.
3. Loads the app and times from iframe creation to puzzle delivery.
4. Asserts `<5 s`.

This is the cold-start worst-case for the only tier where cold-start is
expected to take noticeable time. So between PERF-NEW-death-march
(warm-cache) and SYS3 (cold-start), both ends of the death-march
performance spectrum are covered.

### 2.4 The 560 ms Hard result is the only number worth watching

Hard is the closest call on the list, and the only one running with
"only" 1.8× headroom. Two plausible explanations:

- **Cache miss on Hard specifically.** `primeNext` may not have
  completed by the time the test fires; Hard generation is more
  expensive than easy/medium (more removal iterations, more solver
  passes), so the prime is in flight when the click happens.
- **Click → install path actually doing real work.** If the prime
  pipeline is partway through generation, the request joins it rather
  than completes instantly.

Either way, 560 ms still clears the 1-second budget. **It is the metric
to watch on slower hardware** — the dev machine here is reasonably
modern; an older laptop or mobile device could see this number 2–3×
larger and we'd have a problem.

---

## 3. Test infrastructure changes made for this report

To produce the report, three durable changes were made:

1. **Added `js/tests/integration/perf.test.js`** with ten perf
   assertions covering every user-facing action listed in
   `docs/misc/next-session.md`. Each logs
   `[PERF] <action>: <ms> ms (budget <ms> ms)` to the console.
2. **Registered the new file in `js/tests/setup.html`** so it runs
   under `npm test`.
3. **Modified `test-runner/run.js`** to relay `[PERF]`-prefixed
   console output to the terminal (previously, only `error` and `warn`
   types were relayed).

These tests are now part of the standard suite and will fail the build
if any of these durations regresses past budget. They run in ~3 s
combined.

---

## 4. Open questions and follow-ups

These are independent of v1 sign-off — the budgets are met today.

### 4.1 Cold-start parity tests for non-DM tiers?

PERF-NEW-* measures warm-cache, which is what users typically
experience. SYS3 covers cold-start for death-march. There is no
cold-start gate for kiddie / easy / medium / hard. Worth adding if
we expect users to hit cold-start frequently (first visit, after a
cache eviction, after a difficulty change with no prime). Low effort
to add four more SYS-style tests parallel to SYS3.

### 4.2 The Hard-puzzle 560 ms result on slower hardware

The dev machine isn't representative of the slowest target hardware.
Worth a sanity check on:
- A 5+ year old laptop, or
- A mid-range mobile device under throttled CPU.

If Hard generation routinely lands >1 s on those, the budget is at
risk in the wild even though it passes here.

### 4.3 Are these the only user-facing actions worth measuring?

`next-session.md` listed: New Puzzle (each tier), Reset, Pen entry,
Hint, Check, Difficulty change. Other user-facing actions exist but
are either trivial (theme switch, mode toggle, arrow nav, pencil
toggle, erase) or already covered by existing tests. The list above
matches CLAUDE.md's intent. Worth confirming nothing was missed
before signing off on the perf gate.

---

## 5. Reproducing this report

```sh
npm test                              # runs all 421 tests including PERF
                                      # PERF results print to stdout as
                                      # [PERF] <action>: <ms> ms (budget <ms> ms)
```

To run only the perf integration tests, the test runner currently has
no per-suite filter; the most direct option is to comment out other
integration test scripts in `js/tests/setup.html` or open
`http://localhost:3001/js/tests/setup.html` directly in a browser
after starting `node test-runner/serve.js` and use Mocha's UI to
filter to `integration/perf`.

---

## 6. Recommendation for v1 sign-off

**Performance is not a blocker for v1.** The measured envelope is
healthy:
- Reducer actions: 200–2500× under budget.
- Warm-cache New Puzzle for non-Hard tiers: 4–116× under budget.
- Hard New Puzzle: 1.8× under budget — the only number not in
  comfortable territory but still passing.
- Cold-start Death March: covered by SYS3 at <5 s.

The follow-ups in §4 are quality-of-life improvements to the perf
test coverage, not gaps in the v1 product. Recommend treating CLAUDE.md
exit criterion 5 ("performance threshold met") as **satisfied** subject
to the user's own real-device sanity check at milestone review.
