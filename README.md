# AgentEconomics

`AgentEconomics` is a TypeScript/Bun benchmark for token-to-outcome attribution in AI
agents. It measures how retrieval, retries, context, and model choice change the cost of
correct agent outcomes.

The first two backends are intentionally simple:

- `filesystem`: materializes sessions as Markdown and gives the agent `list_files`,
  `grep_files`, and `read_file` tools.
- `mongodb`: talks to direct MongoDB via `MONGODB_URI` by default, or to a
  memongo-compatible HTTP API when `MEMONGO_BASE_URL` is set.

The benchmark does not import, build, edit, or mutate any memongo source checkout.

## Final Run Snapshot

The checked-in public artifact `public-artifacts/latest` is the frozen `gpt-5.5`
LongMemEval-S run: 20 tasks, 3 repetitions, 5 corpus sizes, 2 backends, 600 total
agent runs.

At the largest measured corpus (`N=500`), filesystem cost averaged `$0.800434` per
task versus `$0.030144` for MongoDB indexed retrieval, a `26.55x` mean cost ratio.
Filesystem accuracy was higher in this first indexed-retrieval baseline (`65.0%` vs.
`30.0%`), so published claims should frame this as an economic/scaling result with an
accuracy trade-off, not a blanket quality win.

## Quickstart

Prerequisite: Bun 1.3 or newer.

```bash
bun install
bun test
bun run demo
```

The demo uses `tests/fixtures/synthetic-longmemeval.json`, the filesystem backend, and
a deterministic mock model so it runs without API keys or network access.

## Live Benchmark

Create an environment file or export variables:

```bash
GROVE_API_KEY=...
GROVE_BASE_URL=https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1
GROVE_AUTH_HEADER=api-key
GROVE_API_MODE=responses
MONGODB_URI=mongodb://127.0.0.1:27017/agent-economics
```

Run both backends over a LongMemEval-S file:

```bash
bun run benchmark -- \
  --backend filesystem,mongodb \
  --sizes 10,50,100,300,500 \
  --tasks 20 \
  --repetitions 3 \
  --model gpt-5.5 \
  --judge-model gpt-5.5 \
  --grove-api-mode responses \
  --loop-budget 10 \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --mongodb-uri mongodb://127.0.0.1:27017/agent-economics \
  --max-cost-usd 250 \
  --out ./artifacts
```

Estimate spend before making live calls:

```bash
bun run benchmark -- \
  --backend filesystem,mongodb \
  --sizes 10,50,100,300,500 \
  --tasks 20 \
  --repetitions 3 \
  --model gpt-5.5 \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --dry-run-estimate
```

LongMemEval-S is not redistributed here. Place your licensed copy wherever you prefer
and pass the path with `--dataset`.

Update `pricing.json` with your current provider contract rates before publishing
claims. The checked-in file is an example in USD with an `asOf` date for
reproducibility.

## Output Artifacts

Each run writes a shareable bundle under `artifacts/<runId>/`:

```text
config.json
run-manifest.json
taskset.json
dry-run-estimate.json
results.json
traces.jsonl
statistics.json
report.md
outcome-attribution.md
fairness.md
scaling-cliff.svg
cost-waterfall.svg
trace-comparison.svg
```

The headline metric is not raw token spend. It is `costPerCorrectAnswer`, supported by
paired deltas, bootstrap confidence intervals, retry-tail, context-inflation, latency,
and accuracy measurements from the trace.

Local artifacts intentionally include answers, tool arguments, and retrieved context
summaries for audit. Public exports under `public-artifacts/<runId>/` redact trace text
into hashes and lengths, include task IDs/checksums, and exclude raw dataset contents.
`config.json` records whether endpoints and keys were configured, but it does not write
raw API keys or base URLs.

## Fairness Controls

The benchmark keeps the prompt skeleton, model, temperature, loop budget, task set,
judge, and underlying knowledge fixed. Only retrieval tools differ. Filesystem reads
return whole files after grep, which is realistic and disclosed. MongoDB ingestion cost
is reported separately and amortized, not hidden inside per-task inference cost.
For Grove Responses models such as `gpt-5.5`, temperature is not sent because the
endpoint rejects it; reproducibility comes from fixed prompts, fixed corpus seed, fixed
model, recorded traces, and checked-in pricing metadata.

The direct MongoDB backend creates a temporary per-run collection and drops it during
teardown. The memongo-compatible backend writes benchmark sessions to the configured
service. Use a disposable agent/service for sensitive memongo runs unless your backend
provides a deletion policy you trust.

## Commands

```bash
bun run demo
bun run benchmark -- --help
bun test
```

No command writes outside this repository unless you explicitly pass an output path.
