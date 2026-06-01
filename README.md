# AgentEconomics

**Same agent. Same model. Same tasks. Different memory architecture.**

Agent builders feel memory quality first. Finance feels the bill later. `AgentEconomics` connects the two: it measures how context management changes the cost of a correct agent outcome.

The question:

> When an agent's memory grows, does filesystem context stay cheap, or does it become hidden token drag?

## Headline Results

Best balanced point, `N=100`:

| Metric | Filesystem | memongo-context | Result |
|---|---:|---:|---:|
| Accuracy | 68.3% | 63.3% | -5.0 pp |
| Cost per correct answer | $0.313525 | $0.066253 | 4.7x cheaper |
| Mean input tokens / task | 40,804 | 7,099 | 82.6% fewer |
| p50 latency | 9.3s | 6.5s | faster |

Scaling cliff, `N=500`:

| Metric | Filesystem | memongo-context | Result |
|---|---:|---:|---:|
| Mean cost / task | $0.689078 | $0.048234 | 14.29x cheaper |
| Cost per correct answer | $1.060120 | $0.099794 | 10.6x cheaper |
| Mean input tokens / task | 134,705 | 8,074 | 126,631 fewer |
| Accuracy | 65.0% | 48.3% | -16.7 pp |

**A real memory layer can buy back huge amounts of context budget. In this run, memongo reduced input-token load by up to 94% and reduced cost per correct answer by 4.7x at the best balanced point, while exposing where recall quality still needs tuning.**

## Visual Proof

![Scaling cliff](public-artifacts/latest/scaling-cliff.svg)

![Cost waterfall](public-artifacts/latest/cost-waterfall.svg)

![Trace comparison](public-artifacts/latest/trace-comparison.svg)

## Why Agent Builders Should Care

Filesystem memory feels great in the prototype phase:

- grep a few Markdown files
- read a whole session
- let the model sort it out

That works until the corpus grows. Then the agent starts paying for memory by dragging more text through every reasoning loop.

`memongo-context` changes the shape of the system. It gives the agent a purpose-built context surface backed by MongoDB-native memory, instead of a pile of files. The result is not just fewer tokens. It is a different economic profile for the same workflow.

## What This Proves

- Filesystem context has a visible scaling cliff.
- Memory architecture changes cost per correct outcome, not just raw token count.
- At `N=100`, memongo was close on quality and far cheaper per correct answer.
- At `N=500`, memongo made token spend dramatically smaller, but still trailed on accuracy.

## What This Does Not Prove

- It does not prove memongo is always more accurate than files.
- It does not prove every MongoDB retrieval design is good. The diagnostic `mongodb-text` baseline was cheap but weak.
- It does not include the provider cost of memongo's internal enrichment and query decomposition model in the agent+judge spend total. That configuration is recorded in the run manifest and should be priced separately for production ROI.

## Benchmark Design

The primary benchmark compares:

- `filesystem`: materializes sessions as Markdown and gives the agent `list_files`, `grep_files`, and `read_file` tools.
- `memongo-context`: talks to an external memongo sidecar via `MEMONGO_BASE_URL` and uses `/v1/context-bundle` as the prompt-ready context surface.

Diagnostic lanes:

- `memongo-search`: memongo `/v1/search-detailed`.
- `mongodb-text`: naive direct MongoDB classic text-index retrieval.

The benchmark does not import, build, edit, or mutate any memongo source checkout.

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
