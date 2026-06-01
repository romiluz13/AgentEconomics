import type { BackendId, FailureRecord, RunResult } from "../types";

export interface StatisticsReport {
  generatedAt: string;
  runCount: number;
  failures: FailureSummary[];
  backendSummaries: BackendStatistics[];
  pairedDeltas: PairedDeltaStatistics[];
  notes: string[];
}

export interface FailureSummary {
  kind: string;
  count: number;
}

export interface BackendStatistics {
  backend: BackendId;
  corpusSize: number;
  runs: number;
  accuracy: number;
  meanCostUsd: number;
  medianCostUsd: number;
  p95CostUsd: number;
  costPerCorrectAnswerUsd: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanReasoningTokens: number;
  meanCachedTokens: number;
  meanJudgeCostUsd: number;
  meanIngestionCostUsd: number;
}

export interface PairedDeltaStatistics {
  corpusSize: number;
  baselineBackend: BackendId;
  candidateBackend: BackendId;
  pairedRuns: number;
  meanCostDeltaUsd: number;
  medianCostDeltaUsd: number;
  bootstrap95CiUsd: [number, number];
  meanCostRatio: number | null;
  meanInputTokenDelta: number;
  meanLatencyDeltaMs: number;
  accuracyDelta: number;
  avoidedCostPer1MSuccessfulTasksUsd: number | null;
}

export function buildStatisticsReport(
  results: RunResult[],
  failures: FailureRecord[],
): StatisticsReport {
  return {
    generatedAt: new Date().toISOString(),
    runCount: results.length,
    failures: summarizeFailures(results, failures),
    backendSummaries: backendSummaries(results),
    pairedDeltas: pairedDeltas(results),
    notes: [
      "Paired deltas compare filesystem minus the preferred non-filesystem backend for matching task, corpus size, and repetition.",
      "Bootstrap confidence intervals use deterministic resampling of paired deltas.",
      "Avoided cost per 1M successful tasks is a linear extrapolation from observed paired costs.",
    ],
  };
}

function backendSummaries(results: RunResult[]): BackendStatistics[] {
  const grouped = groupBy(results, (run) => `${run.backend}:${run.corpusSize}`);
  return [...grouped.entries()]
    .map(([key, runs]) => {
      const [backend, size] = key.split(":") as [BackendId, string];
      const correctRuns = runs.filter((run) => run.correct);
      return {
        backend,
        corpusSize: Number(size),
        runs: runs.length,
        accuracy: mean(runs.map((run) => (run.correct ? 1 : 0))),
        meanCostUsd: mean(runs.map((run) => run.costUsd)),
        medianCostUsd: quantile(
          runs.map((run) => run.costUsd),
          0.5,
        ),
        p95CostUsd: quantile(
          runs.map((run) => run.costUsd),
          0.95,
        ),
        costPerCorrectAnswerUsd:
          correctRuns.length === 0
            ? null
            : sum(runs.map((run) => run.costUsd)) / correctRuns.length,
        p50LatencyMs: quantile(
          runs.map((run) => run.latencyMs),
          0.5,
        ),
        p95LatencyMs: quantile(
          runs.map((run) => run.latencyMs),
          0.95,
        ),
        meanInputTokens: mean(runs.map((run) => run.totalInputTokens)),
        meanOutputTokens: mean(runs.map((run) => run.totalOutputTokens)),
        meanReasoningTokens: mean(runs.map((run) => run.totalReasoningTokens)),
        meanCachedTokens: mean(runs.map((run) => run.totalCachedTokens)),
        meanJudgeCostUsd: mean(runs.map((run) => run.judgeCostUsd)),
        meanIngestionCostUsd: mean(runs.map((run) => run.ingestionCostUsd)),
      };
    })
    .sort((left, right) =>
      left.corpusSize === right.corpusSize
        ? left.backend.localeCompare(right.backend)
        : left.corpusSize - right.corpusSize,
    );
}

function pairedDeltas(results: RunResult[]): PairedDeltaStatistics[] {
  const bySize = groupBy(results, (run) => String(run.corpusSize));
  return [...bySize.entries()]
    .flatMap(([size, runs]) => {
      const candidates = candidateBackends(runs);
      return candidates.map((candidateBackend) =>
        buildPairedDelta(Number(size), runs, candidateBackend),
      );
    })
    .filter((row) => row.pairedRuns > 0)
    .sort((left, right) =>
      left.corpusSize === right.corpusSize
        ? left.candidateBackend.localeCompare(right.candidateBackend)
        : left.corpusSize - right.corpusSize,
    );
}

function buildPairedDelta(
  corpusSize: number,
  runs: RunResult[],
  candidateBackend: BackendId,
): PairedDeltaStatistics {
  const pairs = pairRuns(runs, "filesystem", candidateBackend);
  const costDeltas = pairs.map((pair) => pair.baseline.costUsd - pair.candidate.costUsd);
  const candidateCosts = pairs.map((pair) => pair.candidate.costUsd);
  const baselineCosts = pairs.map((pair) => pair.baseline.costUsd);
  const successPairs = pairs.filter((pair) => pair.baseline.correct || pair.candidate.correct);
  return {
    corpusSize,
    baselineBackend: "filesystem" as const,
    candidateBackend,
    pairedRuns: pairs.length,
    meanCostDeltaUsd: mean(costDeltas),
    medianCostDeltaUsd: quantile(costDeltas, 0.5),
    bootstrap95CiUsd: bootstrapMeanCi(costDeltas, corpusSize),
    meanCostRatio: safeDivide(mean(baselineCosts), mean(candidateCosts)),
    meanInputTokenDelta: mean(
      pairs.map((pair) => pair.baseline.totalInputTokens - pair.candidate.totalInputTokens),
    ),
    meanLatencyDeltaMs: mean(
      pairs.map((pair) => pair.baseline.latencyMs - pair.candidate.latencyMs),
    ),
    accuracyDelta:
      mean(pairs.map((pair) => (pair.candidate.correct ? 1 : 0))) -
      mean(pairs.map((pair) => (pair.baseline.correct ? 1 : 0))),
    avoidedCostPer1MSuccessfulTasksUsd:
      successPairs.length === 0 ? null : mean(costDeltas) * 1_000_000,
  };
}

function candidateBackends(runs: RunResult[]): BackendId[] {
  const present = new Set(runs.map((run) => run.backend));
  return (["memongo-context", "memongo-search", "mongodb-text"] as BackendId[]).filter((backend) =>
    present.has(backend),
  );
}

function summarizeFailures(results: RunResult[], failures: FailureRecord[]): FailureSummary[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.failureKind)
      counts.set(result.failureKind, (counts.get(result.failureKind) ?? 0) + 1);
  }
  for (const failure of failures) {
    if (failure.taskId) continue;
    counts.set(failure.kind, (counts.get(failure.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
}

function pairRuns(
  runs: RunResult[],
  baselineBackend: BackendId,
  candidateBackend: BackendId,
): Array<{ baseline: RunResult; candidate: RunResult }> {
  const byKey = new Map<string, Partial<Record<BackendId, RunResult>>>();
  for (const run of runs) {
    const key = `${run.taskId}:${run.repetition}`;
    byKey.set(key, { ...(byKey.get(key) ?? {}), [run.backend]: run });
  }
  return [...byKey.values()].flatMap((entry) => {
    const baseline = entry[baselineBackend];
    const candidate = entry[candidateBackend];
    return baseline && candidate ? [{ baseline, candidate }] : [];
  });
}

function bootstrapMeanCi(values: number[], seed: number): [number, number] {
  if (values.length === 0) return [0, 0];
  const means: number[] = [];
  let state = seed >>> 0;
  for (let sample = 0; sample < 1000; sample += 1) {
    const resampled: number[] = [];
    for (let index = 0; index < values.length; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      resampled.push(values[state % values.length] ?? 0);
    }
    means.push(mean(resampled));
  }
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
