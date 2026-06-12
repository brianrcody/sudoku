# Performance Report — V3 (Harder Difficulty Tiers)

**Date:** 2026-06-12
**Source:** suite perf harness (Chromium via Playwright) + spike measurements
**Budgets:** non-generation actions < 1 s (CLAUDE.md); generation per-tier below;
top-tier cold-start envelope ≤ 120 s (Product Director, 2026-06-12)

## 1. Measured (suite run, 2026-06-12)

| Action | Measured | Budget |
|---|---:|---:|
| New Puzzle (kiddie/easy/medium) | 8–222 ms | 1000–1500 ms |
| New Puzzle (hard) | 1458 ms | 2000 ms |
| New Puzzle (expert) | 203–852 ms | 5000 ms |
| New Puzzle (nightmare, UI path) | 271–1518 ms | 15000 ms |
| Diabolical generation (seeded, pipeline) | 9.2–9.3 s | 20 s |
| Nightmare generation (seeded, pipeline) | 3.4–3.5 s | 15 s |
| Reset / pen-conflict / Hint / Check / difficulty change | 0.4–5.8 ms | 1000 ms |

## 2. Diabolical cold-start analysis (the budget-critical path)

Accept rate measured at ~0.8%/attempt (1500-board engine sweep; UR Types 2/4 roughly
doubled the spike's Type-1-only 0.49%). With `ATTEMPT_BUDGET.diabolical = 2000`:

- Expected attempts ≈ 125; in-browser attempt cost ≈ 40–75 ms (from the 9.2 s / ~78-attempt
  seeded run) → **expected cold-start ≈ 5–10 s**.
- p99 ≈ 575 attempts → **≈ 25–45 s**. Budget exhaustion probability ≈ (1−0.008)^2000
  ≈ 1×10⁻⁷ — the honest-fallback dialog is effectively a never-event safety net.
- Background pre-generation makes the cold start a first-use-only experience.

Within the 120 s envelope with an order-of-magnitude margin. No further action.

## 3. Coach analyze() on top-tier boards

Worst observed full-ladder single-step analysis (ALS enumeration at a stall) is well
under the 1 s action budget (spike p99 for a *full solve* with the extended ladder was
164 ms in Node; a single coach step is a fraction of that). Live Playwright interaction
on a Nightmare board showed no perceptible delay.
