import { authHeaders } from "../agent/grove";
import { estimateJsonTokens, estimateTokens } from "../agent/tokenizer";
import { costForUsage } from "../cost/tracker";
import type { PricingTable, TaskSpec, TraceEvent, TurnUsage } from "../types";

export interface JudgeOptions {
  answer: string;
  task: TaskSpec;
  apiKey?: string;
  baseUrl: string;
  model: string;
  authHeader: "api-key" | "bearer";
  apiMode: "chat" | "responses";
  pricing: PricingTable;
  mock: boolean;
  step: number;
}

export interface JudgeResult {
  correct: boolean;
  costUsd: number;
  usage: TurnUsage;
  traceEvent: TraceEvent;
}

export async function judgeAnswer(options: JudgeOptions): Promise<JudgeResult> {
  if (options.mock) return exactJudge(options);
  if (options.apiMode === "responses") return judgeWithResponses(options);

  if (!options.apiKey) throw new Error("GROVE_API_KEY is required for live judging.");
  const payload = {
    model: options.model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          'You are an evaluation judge. Return strict JSON: {"correct": boolean, "reason": string}.',
      },
      {
        role: "user",
        content: [
          `Question: ${options.task.question}`,
          `Gold answer: ${options.task.goldAnswer}`,
          `Candidate answer: ${options.answer}`,
          "Mark correct if the candidate is semantically equivalent to the gold answer.",
        ].join("\n"),
      },
    ],
  };

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: authHeaders(options.apiKey, options.authHeader),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Judge call failed with ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const content = readJudgeContent(data);
  const usage = readUsage(data.usage, options.model, payload, content);
  const correct = parseJudgeDecision(content);
  return toJudgeResult(options, correct, usage, content);
}

async function judgeWithResponses(options: JudgeOptions): Promise<JudgeResult> {
  if (!options.apiKey) throw new Error("GROVE_API_KEY is required for live judging.");
  const payload = {
    model: options.model,
    store: false,
    input: [
      {
        role: "system",
        content:
          'You are an evaluation judge. Return strict JSON: {"correct": boolean, "reason": string}.',
      },
      {
        role: "user",
        content: [
          `Question: ${options.task.question}`,
          `Gold answer: ${options.task.goldAnswer}`,
          `Candidate answer: ${options.answer}`,
          "Mark correct if the candidate is semantically equivalent to the gold answer.",
        ].join("\n"),
      },
    ],
  };

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: authHeaders(options.apiKey, options.authHeader),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `Judge responses call failed with ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as Record<string, unknown>;
  const content = readResponsesText(data);
  const usage = readUsage(data.usage, options.model, payload, content);
  return toJudgeResult(options, parseJudgeDecision(content), usage, content);
}

export function parseJudgeDecision(content: string): boolean {
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.correct === "boolean") return parsed.correct;
  } catch {
    return /\bcorrect\b/i.test(content) && !/\bincorrect\b/i.test(content);
  }
  return /\btrue\b/i.test(content) || /\bcorrect\b/i.test(content);
}

function exactJudge(options: JudgeOptions): JudgeResult {
  const normalizedAnswer = normalize(options.answer);
  const normalizedGold = normalize(options.task.goldAnswer);
  const correct =
    normalizedAnswer.includes(normalizedGold) || normalizedGold.includes(normalizedAnswer);
  const usage: TurnUsage = {
    promptTokens: estimateTokens(
      `${options.task.question}\n${options.task.goldAnswer}\n${options.answer}`,
    ),
    completionTokens: 1,
    totalTokens:
      estimateTokens(`${options.task.question}\n${options.task.goldAnswer}\n${options.answer}`) + 1,
    model: "mock-agent",
  };
  return toJudgeResult(options, correct, usage, correct ? "exact match" : "exact mismatch");
}

function toJudgeResult(
  options: JudgeOptions,
  correct: boolean,
  usage: TurnUsage,
  outputSummary: string,
): JudgeResult {
  const costUsd = costForUsage(usage, options.pricing);
  return {
    correct,
    costUsd,
    usage,
    traceEvent: {
      kind: "judge",
      step: options.step,
      timestamp: new Date().toISOString(),
      taskId: options.task.questionId,
      tokens: usage,
      costUsd,
      inputSummary: options.task.question,
      outputSummary,
    },
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readJudgeContent(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0)
    throw new Error("Judge response had no choices.");
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

function readUsage(
  raw: unknown,
  model: string,
  promptPayload: unknown,
  completion: string,
): TurnUsage {
  const usage = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const promptTokens =
    numberValue(usage.prompt_tokens) ??
    numberValue(usage.input_tokens) ??
    estimateJsonTokens(promptPayload);
  const completionTokens =
    numberValue(usage.completion_tokens) ??
    numberValue(usage.output_tokens) ??
    estimateTokens(completion);
  const inputDetails = objectValue(usage.input_tokens_details ?? usage.prompt_tokens_details);
  const outputDetails = objectValue(usage.output_tokens_details ?? usage.completion_tokens_details);
  return {
    promptTokens,
    completionTokens,
    totalTokens: numberValue(usage.total_tokens) ?? promptTokens + completionTokens,
    model,
    reasoningTokens:
      numberValue(usage.reasoning_tokens) ??
      numberValue(outputDetails.reasoning_tokens) ??
      numberValue(objectValue(outputDetails.reasoning).tokens),
    cachedTokens:
      numberValue(usage.cached_tokens) ??
      numberValue(inputDetails.cached_tokens) ??
      numberValue(objectValue(inputDetails.cache_read).tokens),
    rawProviderUsage: Object.keys(usage).length > 0 ? usage : undefined,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const output = data.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}
