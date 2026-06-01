# Results

Same task. Same model. Different memory architecture.

At N=500, the paired mean filesystem minus memongo-context cost delta was $0.640844 per run.
The observed mean cost ratio was 14.29x, with a linear avoided-cost extrapolation of $640844 per 1M successful tasks.
Accuracy at the largest measured N was 65.0% for filesystem and 48.3% for memongo-context.

## Visuals

![Scaling cliff](../public-artifacts/latest/scaling-cliff.svg)

![Cost waterfall](../public-artifacts/latest/cost-waterfall.svg)

![Trace comparison](../public-artifacts/latest/trace-comparison.svg)

## Published Artifacts

Public artifacts include aggregate metrics, redacted traces, task IDs, checksums, and exact commands. Raw LongMemEval-S text and private traces are excluded.

## Current Limitation

The checked-in public artifact is the final memongo enriched run. Claims should reference the exact run ID and matrix in `public-artifacts/latest/run-manifest.json`, including the observed accuracy tradeoff and recorded timeout/loop-budget/provider failures.