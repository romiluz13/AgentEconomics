import type { BackendId, OutcomeAttribution, PricingTable, RunResult } from "../types";

export function attributeOutcomes(
  results: RunResult[],
  pricing: PricingTable,
  model: string,
): OutcomeAttribution[] {
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const key = `${result.backend}:${result.corpusSize}`;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }

  return [...grouped.entries()]
    .map(([key, runs]) => {
      const [backend, size] = key.split(":") as [BackendId, string];
      return attributeGroup(backend, Number(size), runs, pricing, model);
    })
    .sort((left, right) =>
      left.corpusSize === right.corpusSize
        ? left.backend.localeCompare(right.backend)
        : left.corpusSize - right.corpusSize,
    );
}

function attributeGroup(
  backend: BackendId,
  corpusSize: number,
  runs: RunResult[],
  pricing: PricingTable,
  model: string,
): OutcomeAttribution {
  const totalCost = sum(runs.map((run) => run.costUsd));
  const correctRuns = runs.filter((run) => run.correct);
  const retryTailTokens = runs.reduce(
    (total, run) =>
      total +
      run.usagePerTurn
        .slice(1)
        .reduce((turnTotal, usage) => turnTotal + usage.promptTokens + usage.completionTokens, 0),
    0,
  );
  const contextInflationTokens = runs.reduce(
    (total, run) =>
      total +
      run.traceEvents.reduce((sumTokens, event) => sumTokens + (event.retrievedTokens ?? 0), 0),
    0,
  );
  const inputPrice =
    pricing.models[model]?.inputPerMTok ?? pricing.models["gpt-5.4"]?.inputPerMTok ?? 0;

  return {
    backend,
    corpusSize,
    costPerTask: safeDivide(totalCost, runs.length) ?? 0,
    costPerCorrectAnswer: safeDivide(totalCost, correctRuns.length),
    retryTailTokens,
    retryTailCost: tokenCost(retryTailTokens, inputPrice),
    contextInflationTokens,
    contextInflationCost: tokenCost(contextInflationTokens, inputPrice),
    latencyPerCorrectAnswerMs: safeDivide(
      sum(correctRuns.map((run) => run.latencyMs)),
      correctRuns.length,
    ),
    usefulOutcomeRate: safeDivide(correctRuns.length, runs.length) ?? 0,
    routingOpportunity: {
      eligibleTasks: correctRuns.filter((run) => run.turns === 1).length,
      estimatedAvoidableCostUsd: estimateRoutingSavings(correctRuns),
      notes:
        "Heuristic v1 signal: correct single-turn tasks are candidates for a cheaper model audit.",
    },
  };
}

function estimateRoutingSavings(runs: RunResult[]): number {
  return runs
    .filter((run) => run.turns === 1)
    .reduce((sumCost, run) => sumCost + run.costUsd * 0.5, 0);
}

function tokenCost(tokens: number, inputPerMTok: number): number {
  return (tokens / 1_000_000) * inputPerMTok;
}

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
