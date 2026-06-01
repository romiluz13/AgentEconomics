import { describe, expect, test } from "bun:test";
import { buildStatisticsReport } from "../src/report/statistics";
import type { RunResult } from "../src/types";

describe("statistics report", () => {
  test("pairs filesystem and MongoDB runs by task, size, and repetition", () => {
    const report = buildStatisticsReport(
      [
        run("q1", "filesystem", 10, 1, 0.03),
        run("q1", "mongodb", 10, 1, 0.01),
        run("q1", "filesystem", 10, 2, 0.04),
        run("q1", "mongodb", 10, 2, 0.02),
      ],
      [],
    );

    expect(report.pairedDeltas).toHaveLength(1);
    expect(report.pairedDeltas[0]?.pairedRuns).toBe(2);
    expect(report.pairedDeltas[0]?.meanCostDeltaUsd).toBeCloseTo(0.02);
    expect(report.backendSummaries.find((row) => row.backend === "mongodb")?.p95CostUsd).toBe(0.02);
  });
});

function run(
  taskId: string,
  backend: RunResult["backend"],
  corpusSize: number,
  repetition: number,
  costUsd: number,
): RunResult {
  return {
    taskId,
    backend,
    corpusSize,
    repetition,
    turns: 1,
    toolCalls: 1,
    usagePerTurn: [],
    traceEvents: [],
    totalInputTokens: 100,
    totalOutputTokens: 10,
    totalReasoningTokens: 0,
    totalCachedTokens: 0,
    costUsd,
    latencyMs: 100,
    correct: true,
    answer: "ok",
    judgeCostUsd: 0.001,
    ingestionCostUsd: 0,
  };
}
