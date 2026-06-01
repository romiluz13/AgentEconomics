import { createGroveChatProvider, createMockChatProvider } from "../agent/grove";
import { runAgentLoop } from "../agent/loop";
import type { ToolDefinition } from "../backends/types";
import { costForUsages, usageTotals } from "../cost/tracker";
import { judgeAnswer } from "../judge/judge";
import type {
  BackendId,
  BenchmarkConfig,
  FailureRecord,
  PricingTable,
  RunFailureKind,
  RunResult,
  TaskSpec,
  TraceEvent,
} from "../types";

export async function runOneTask(options: {
  backendId: BackendId;
  task: TaskSpec;
  repetition: number;
  corpusSize: number;
  config: BenchmarkConfig;
  pricing: PricingTable;
  tools: ToolDefinition[];
  ingestionCostUsd: number;
  failures: FailureRecord[];
}): Promise<RunResult> {
  try {
    const loop = await runAgentLoop({
      backend: options.backendId,
      task: options.task,
      tools: options.tools,
      provider: options.config.mockModel
        ? createMockChatProvider(options.task)
        : createGroveChatProvider({
            apiKey: options.config.groveApiKey ?? "",
            baseUrl: options.config.groveBaseUrl,
            model: options.config.model,
            authHeader: options.config.groveAuthHeader,
            apiMode: options.config.groveApiMode,
          }),
      loopBudget: options.config.loopBudget,
    });
    const loopFailure = loopFailureKind(loop);
    let judgeCorrect = false;
    let judgeCostUsd = 0;
    let judgeTrace: TraceEvent | undefined;
    try {
      const judge = await judgeAnswer({
        answer: loop.answer,
        task: options.task,
        apiKey: options.config.groveApiKey,
        baseUrl: options.config.groveBaseUrl,
        model: options.config.judgeModel,
        authHeader: options.config.groveAuthHeader,
        apiMode: options.config.groveApiMode,
        pricing: options.pricing,
        mock: options.config.mockModel,
        step: loop.turns,
      });
      judgeCorrect = judge.correct;
      judgeCostUsd = judge.costUsd;
      judgeTrace = { ...judge.traceEvent, backend: options.backendId };
    } catch (error) {
      options.failures.push(
        failureRecord("judge_failure", error, {
          backend: options.backendId,
          corpusSize: options.corpusSize,
          taskId: options.task.questionId,
          repetition: options.repetition,
        }),
      );
    }
    const traceEvents = judgeTrace ? [...loop.traceEvents, judgeTrace] : loop.traceEvents;
    const totals = usageTotals(loop.usagePerTurn);
    const failureKind = loopFailure ?? (judgeTrace ? undefined : "judge_failure");
    return {
      taskId: options.task.questionId,
      backend: options.backendId,
      corpusSize: options.corpusSize,
      repetition: options.repetition,
      turns: loop.turns,
      toolCalls: loop.toolCalls,
      usagePerTurn: loop.usagePerTurn,
      traceEvents,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalReasoningTokens: totals.reasoning,
      totalCachedTokens: totals.cached,
      costUsd: costForUsages(loop.usagePerTurn, options.pricing),
      latencyMs: loop.latencyMs,
      correct: judgeCorrect && !failureKind,
      answer: loop.answer,
      judgeCostUsd,
      ingestionCostUsd: options.ingestionCostUsd,
      failureKind,
      failureMessage: failureKind
        ? "Run completed with a protocol-level failure signal."
        : undefined,
    };
  } catch (error) {
    const kind = classifyRunFailure(error);
    options.failures.push(
      failureRecord(kind, error, {
        backend: options.backendId,
        corpusSize: options.corpusSize,
        taskId: options.task.questionId,
        repetition: options.repetition,
      }),
    );
    return failedResult(options, kind, error);
  }
}

export function failureRecord(
  kind: RunFailureKind,
  error: unknown,
  context: {
    backend?: BackendId;
    corpusSize?: number;
    taskId?: string;
    repetition?: number;
  },
): FailureRecord {
  return {
    kind,
    ...context,
    message: errorMessage(error),
    timestamp: new Date().toISOString(),
  };
}

function loopFailureKind(
  loop: Awaited<ReturnType<typeof runAgentLoop>>,
): RunFailureKind | undefined {
  if (loop.finishReason === "loop_budget_exceeded") return "exceeded_loop_budget";
  const retrievalEvents = loop.traceEvents.filter((event) => event.kind === "retrieval");
  if (
    retrievalEvents.length > 0 &&
    retrievalEvents.every((event) => (event.retrievedTokens ?? 0) === 0)
  ) {
    return "empty_retrieval";
  }
  return undefined;
}

function failedResult(
  options: {
    backendId: BackendId;
    task: TaskSpec;
    repetition: number;
    corpusSize: number;
    ingestionCostUsd: number;
  },
  kind: RunFailureKind,
  error: unknown,
): RunResult {
  return {
    taskId: options.task.questionId,
    backend: options.backendId,
    corpusSize: options.corpusSize,
    repetition: options.repetition,
    turns: 0,
    toolCalls: 0,
    usagePerTurn: [],
    traceEvents: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningTokens: 0,
    totalCachedTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    correct: false,
    answer: "",
    judgeCostUsd: 0,
    ingestionCostUsd: options.ingestionCostUsd,
    failureKind: kind,
    failureMessage: errorMessage(error),
  };
}

function classifyRunFailure(error: unknown): RunFailureKind {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("timeout") || message.includes("aborted")) return "timeout";
  return "model_failure";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
