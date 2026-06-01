import type { BenchmarkConfig, OutcomeAttribution } from "../types";
import type { AggregateRow } from "./aggregate";

export function renderMarkdownReport(
  config: BenchmarkConfig,
  aggregates: AggregateRow[],
  attribution: OutcomeAttribution[],
): string {
  return [
    "# AgentEconomics report",
    "",
    renderSummary(aggregates, attribution),
    "",
    "## Headline Metrics",
    "",
    "| Backend | Corpus N | Runs | Accuracy | Mean cost | Median cost | Mean turns | Mean input tokens |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...aggregates.map(
      (row) =>
        `| ${row.backend} | ${row.corpusSize} | ${row.runs} | ${percent(row.accuracy)} | ${money(
          row.meanCostUsd,
        )} | ${money(row.medianCostUsd)} | ${row.meanTurns.toFixed(2)} | ${row.meanInputTokens.toFixed(0)} |`,
    ),
    "",
    "## Fairness Disclosure",
    "",
    `- Model: ${config.model}`,
    `- Judge model: ${config.mockModel ? "mock exact judge" : config.judgeModel}`,
    `- Grove API mode: ${config.mockModel ? "mock" : config.groveApiMode}`,
    `- Loop budget: ${config.loopBudget}`,
    `- Repetitions: ${config.repetitions}`,
    `- Backends: ${config.backends.join(", ")}`,
    "- Same task set, corpus object, system prompt skeleton, model endpoint mode, and judge are used for every backend.",
    "- Temperature is fixed only for providers/endpoints that support it; Grove Responses for gpt-5.5 rejects temperature and is documented in config.json.",
    "- Filesystem uses list/grep/read over whole Markdown files after matching.",
    "- `memongo-context` uses the external memongo `/v1/context-bundle` API; `memongo-search` uses `/v1/search-detailed`.",
    "- `mongodb-text` is a naive direct MongoDB text-index diagnostic baseline, not memongo.",
    "- Memongo ingestion cost is estimated and reported separately from per-task inference cost.",
    "",
    "## Attribution",
    "",
    "| Backend | Corpus N | Cost per task | Cost per correct answer | Retry-tail tokens | Context tokens | Useful outcome rate |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...attribution.map(
      (row) =>
        `| ${row.backend} | ${row.corpusSize} | ${money(row.costPerTask)} | ${
          row.costPerCorrectAnswer === null ? "n/a" : money(row.costPerCorrectAnswer)
        } | ${row.retryTailTokens} | ${row.contextInflationTokens} | ${percent(row.usefulOutcomeRate)} |`,
    ),
    "",
  ].join("\n");
}

export function renderFairness(config: BenchmarkConfig): string {
  return [
    "# Fairness controls",
    "",
    `Run ID: ${config.runId}`,
    `Model: ${config.model}`,
    `Grove API mode: ${config.mockModel ? "mock" : config.groveApiMode}`,
    `Loop budget: ${config.loopBudget}`,
    `Repetitions: ${config.repetitions}`,
    `Seed: ${config.seed}`,
    "",
    "- Retrieval tools are the only intended difference between backends.",
    "- Filesystem context is represented as session Markdown files and read whole-file after grep.",
    "- Memongo context is retrieved through a pinned external memongo HTTP sidecar.",
    "- Direct MongoDB text indexing is labeled `mongodb-text` and treated as a diagnostic baseline only.",
    "- Judge cost is tracked separately because it is identical across backends for the same task.",
    "- Ingestion and embedding cost are reported separately and can be amortized by the reader.",
  ].join("\n");
}

function renderSummary(aggregates: AggregateRow[], attribution: OutcomeAttribution[]): string {
  const best = attribution
    .filter((row) => row.costPerCorrectAnswer !== null)
    .sort(
      (left, right) =>
        (left.costPerCorrectAnswer ?? Infinity) - (right.costPerCorrectAnswer ?? Infinity),
    )[0];
  const largest = [...aggregates].sort((left, right) => right.corpusSize - left.corpusSize)[0];
  return [
    "## Executive Summary",
    "",
    best
      ? `Lowest observed cost per correct answer: ${money(best.costPerCorrectAnswer ?? 0)} on ${best.backend} at N=${best.corpusSize}.`
      : "No correct answers were recorded, so cost per correct answer is undefined.",
    largest
      ? `Largest corpus measured: N=${largest.corpusSize}, with ${largest.runs} run(s) per listed backend.`
      : "No runs were recorded.",
  ].join("\n");
}

function money(value: number): string {
  return `$${value.toFixed(6)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
