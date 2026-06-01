import type { StatisticsReport } from "./statistics";

export function renderMethodologyDoc(): string {
  return [
    "# Methodology",
    "",
    "AgentEconomics measures cost per completed correct outcome, not raw token usage.",
    "",
    "## Controlled Variables",
    "",
    "- Same task set, corpus seed, model, Grove API mode, loop budget, and judge for every backend.",
    "- Same LongMemEval-S source file is used locally; the raw dataset is never committed.",
    "- Grove Responses requests use `store: false` and no temperature for `gpt-5.5` because the endpoint rejects temperature.",
    "- `memongo-context` runs are described as external memongo context management over HTTP.",
    "- `mongodb-text` is a naive direct MongoDB text-index baseline and is never labeled as memongo.",
    "",
    "## Measurement",
    "",
    "- Agent inference cost and judge cost are separated.",
    "- Ingestion cost is reported separately and can be amortized by workload volume.",
    "- Retry-tail tokens are tokens after the first model turn.",
    "- Context-inflation tokens are retrieved/read tokens recorded in trace events.",
    "- Statistics are paired by task ID, corpus size, and repetition.",
  ].join("\n");
}

export function renderReproduceDoc(runId: string): string {
  return [
    "# Reproduce",
    "",
    "## Synthetic Smoke",
    "",
    "```bash",
    "bun install",
    "bun run benchmark -- demo --backend filesystem,memongo-context --memongo-base-url http://127.0.0.1:3847 --run-id synthetic-smoke",
    "```",
    "",
    "## Memongo Sidecar",
    "",
    "Run memongo from a pinned checkout before live benchmarks. AgentEconomics talks to it only through `MEMONGO_BASE_URL` and does not vendor or modify memongo source.",
    "",
    "## Full Benchmark",
    "",
    "```bash",
    "bun run benchmark -- \\",
    "  --backend filesystem,memongo-context \\",
    "  --sizes 10,50,100,300,500 \\",
    "  --tasks 20 \\",
    "  --repetitions 3 \\",
    "  --model gpt-5.5 \\",
    "  --judge-model gpt-5.5 \\",
    "  --grove-api-mode responses \\",
    "  --grove-auth-header api-key \\",
    "  --loop-budget 10 \\",
    "  --dataset /path/to/longmemeval_s_cleaned.json \\",
    "  --memongo-base-url http://127.0.0.1:3847 \\",
    "  --memongo-enrichment-mode enabled \\",
    "  --memongo-query-decomposition-mode enabled \\",
    "  --memongo-enrichment-model DeepSeek-V4-Pro \\",
    "  --memongo-repo https://github.com/romiluz13/Memongo \\",
    "  --memongo-commit <pinned-commit> \\",
    `  --run-id ${runId}`,
    "```",
    "",
    "Use `--dry-run-estimate` first and set `--max-cost-usd` to bound spend.",
  ].join("\n");
}

export function renderResultsDoc(statistics: StatisticsReport): string {
  const largest = [...statistics.pairedDeltas].sort(
    (left, right) => right.corpusSize - left.corpusSize,
  )[0];
  const largestSummaries = largest
    ? statistics.backendSummaries.filter((row) => row.corpusSize === largest.corpusSize)
    : [];
  const filesystem = largestSummaries.find((row) => row.backend === "filesystem");
  const candidate = largest
    ? largestSummaries.find((row) => row.backend === largest.candidateBackend)
    : undefined;
  return [
    "# Results",
    "",
    "Same task. Same model. Different memory architecture.",
    "",
    largest
      ? `At N=${largest.corpusSize}, the paired mean filesystem minus ${largest.candidateBackend} cost delta was $${largest.meanCostDeltaUsd.toFixed(
          6,
        )} per run.`
      : "No paired filesystem/MongoDB results are available yet.",
    largest
      ? `The observed mean cost ratio was ${largest.meanCostRatio?.toFixed(2) ?? "n/a"}x, with a linear avoided-cost extrapolation of $${(
          largest.avoidedCostPer1MSuccessfulTasksUsd ?? 0
        ).toFixed(0)} per 1M successful tasks.`
      : "",
    filesystem && candidate
      ? `Accuracy at the largest measured N was ${(filesystem.accuracy * 100).toFixed(1)}% for filesystem and ${(candidate.accuracy * 100).toFixed(1)}% for ${largest?.candidateBackend}.`
      : "",
    "",
    "## Visuals",
    "",
    "![Scaling cliff](../public-artifacts/latest/scaling-cliff.svg)",
    "",
    "![Cost waterfall](../public-artifacts/latest/cost-waterfall.svg)",
    "",
    "![Trace comparison](../public-artifacts/latest/trace-comparison.svg)",
    "",
    "## Published Artifacts",
    "",
    "Public artifacts include aggregate metrics, redacted traces, task IDs, checksums, and exact commands. Raw LongMemEval-S text and private traces are excluded.",
    "",
    "## Current Limitation",
    "",
    "The checked-in public artifact is the final memongo enriched run. Claims should reference the exact run ID and matrix in `public-artifacts/latest/run-manifest.json`, including the observed accuracy tradeoff and recorded timeout/loop-budget/provider failures.",
  ].join("\n");
}
