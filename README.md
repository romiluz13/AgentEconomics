# AgentEconomics

`AgentEconomics` is a TypeScript/Bun benchmark for token-to-outcome attribution in AI
agents. It measures how retrieval, retries, context, and model choice change the cost of
correct agent outcomes.

The primary benchmark compares filesystem context management with memongo:

- `filesystem`: materializes sessions as Markdown and gives the agent `list_files`,
  `grep_files`, and `read_file` tools.
- `memongo-context`: talks to an external pinned memongo sidecar via
  `MEMONGO_BASE_URL` and uses `/v1/context-bundle` as the prompt-ready context
  surface.
- `memongo-search`: diagnostic memongo `/v1/search-detailed` lane.
- `mongodb-text`: diagnostic naive direct MongoDB classic text-index baseline.

The benchmark does not import, build, edit, or mutate any memongo source checkout.

## Final Run Snapshot

The previous `longmem-final-gpt55` result compared filesystem against `mongodb-text`,
not memongo. It remains useful as a cautionary baseline: naive text indexing is cheap,
but it is not a state-of-the-art memory system.

The next publishable headline run should compare `filesystem` against
`memongo-context`, with memongo pinned as an external sidecar. Do not present
`mongodb-text` as “MongoDB memory” or as a memongo result.

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
MEMONGO_BASE_URL=http://127.0.0.1:3847
MEMONGO_LLM_ENRICHMENT_MODE=enabled
MEMONGO_QUERY_DECOMPOSITION_MODE=enabled
MEMONGO_ENRICHMENT_MODEL=DeepSeek-V4-Pro
MEMONGO_REPO=https://github.com/romiluz13/Memongo
MEMONGO_COMMIT=<pinned-commit>
```

Run memongo as an external pinned sidecar first:

```bash
git clone https://github.com/romiluz13/Memongo.git
cd Memongo
git checkout <pinned-commit>
bun install
export VOYAGE_API_KEY=al-your-atlas-model-key
docker compose -f docker/mongodb/docker-compose.preview.yml up -d
export MEMONGO_MONGODB_URI="mongodb://127.0.0.1:27017/?directConnection=true"
cd apps/api && bun run dev
```

Then run both backends over a LongMemEval-S file:

```bash
bun run benchmark -- \
  --backend filesystem,memongo-context \
  --sizes 10,50,100,300,500 \
  --tasks 20 \
  --repetitions 3 \
  --model gpt-5.5 \
  --judge-model gpt-5.5 \
  --grove-api-mode responses \
  --loop-budget 10 \
  --dataset /path/to/longmemeval_s_cleaned.json \
  --memongo-base-url http://127.0.0.1:3847 \
  --memongo-enrichment-mode enabled \
  --memongo-query-decomposition-mode enabled \
  --memongo-enrichment-model DeepSeek-V4-Pro \
  --memongo-repo https://github.com/romiluz13/Memongo \
  --memongo-commit <pinned-commit> \
  --max-cost-usd 250 \
  --out ./artifacts
```

Estimate spend before making live calls:

```bash
bun run benchmark -- \
  --backend filesystem,memongo-context \
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
into hashes and lengths, include task IDs/checksums, memongo provenance, and exclude raw
dataset contents. `config.json` records whether endpoints and keys were configured, but
it does not write raw API keys or base URLs.

## Fairness Controls

The benchmark keeps the prompt skeleton, model, temperature, loop budget, task set,
judge, and underlying knowledge fixed. Only retrieval tools differ. Filesystem reads
return whole files after grep, which is realistic and disclosed. Memongo ingestion cost
is estimated separately and amortized, not hidden inside per-task inference cost.
For Grove Responses models such as `gpt-5.5`, temperature is not sent because the
endpoint rejects it; reproducibility comes from fixed prompts, fixed corpus seed, fixed
model, recorded traces, and checked-in pricing metadata.

The `memongo-context` backend writes benchmark sessions to the configured memongo
service. Use a disposable sidecar/service for sensitive memongo runs unless your backend
provides a deletion policy you trust. The `mongodb-text` backend creates a temporary
per-run local MongoDB collection and drops it during teardown.

## Commands

```bash
bun run demo
bun run benchmark -- --help
bun test
```

No command writes outside this repository unless you explicitly pass an output path.
