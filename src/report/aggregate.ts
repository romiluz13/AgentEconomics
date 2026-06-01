import type { BackendId, RunResult } from "../types";

export interface AggregateRow {
  backend: BackendId;
  corpusSize: number;
  runs: number;
  accuracy: number;
  meanCostUsd: number;
  medianCostUsd: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanTurns: number;
  meanLatencyMs: number;
}

export function aggregateResults(results: RunResult[]): AggregateRow[] {
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const key = `${result.backend}:${result.corpusSize}`;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }

  return [...grouped.entries()]
    .map(([key, runs]) => {
      const [backend, size] = key.split(":") as [BackendId, string];
      return {
        backend,
        corpusSize: Number(size),
        runs: runs.length,
        accuracy: mean(runs.map((run) => (run.correct ? 1 : 0))),
        meanCostUsd: mean(runs.map((run) => run.costUsd)),
        medianCostUsd: median(runs.map((run) => run.costUsd)),
        meanInputTokens: mean(runs.map((run) => run.totalInputTokens)),
        meanOutputTokens: mean(runs.map((run) => run.totalOutputTokens)),
        meanTurns: mean(runs.map((run) => run.turns)),
        meanLatencyMs: mean(runs.map((run) => run.latencyMs)),
      };
    })
    .sort((left, right) =>
      left.corpusSize === right.corpusSize
        ? left.backend.localeCompare(right.backend)
        : left.corpusSize - right.corpusSize,
    );
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
