import type { ToolDefinition } from "../backends/types";
import type { BackendId, TaskSpec, TraceEvent, TurnUsage } from "../types";
import type { ChatMessage, ChatProvider, ToolCall } from "./grove";
import { estimateTokens } from "./tokenizer";

export interface AgentLoopOptions {
  backend: BackendId;
  task: TaskSpec;
  tools: ToolDefinition[];
  provider: ChatProvider;
  loopBudget: number;
}

export interface AgentLoopResult {
  answer: string;
  turns: number;
  toolCalls: number;
  usagePerTurn: TurnUsage[];
  traceEvents: TraceEvent[];
  latencyMs: number;
  finishReason: "answer" | "loop_budget_exceeded";
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const started = performance.now();
  const traceEvents: TraceEvent[] = [];
  const usagePerTurn: TurnUsage[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: options.task.question },
  ];
  let answer = "";
  let toolCalls = 0;
  let finishReason: AgentLoopResult["finishReason"] = "loop_budget_exceeded";

  for (let step = 0; step < options.loopBudget; step += 1) {
    const turnStarted = performance.now();
    const response = await options.provider(messages, options.tools);
    usagePerTurn.push(response.usage);
    traceEvents.push({
      kind: "model",
      step,
      timestamp: new Date().toISOString(),
      backend: options.backend,
      taskId: options.task.questionId,
      tokens: response.usage,
      latencyMs: Math.round(performance.now() - turnStarted),
      inputSummary: summarize(messages.at(-1)?.content ?? ""),
      outputSummary: summarize(response.content || `${response.toolCalls.length} tool call(s)`),
    });

    messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });

    if (response.toolCalls.length === 0) {
      answer = response.content.trim();
      finishReason = "answer";
      break;
    }

    if (step > 0) {
      traceEvents.push({
        kind: "retry",
        step,
        timestamp: new Date().toISOString(),
        backend: options.backend,
        taskId: options.task.questionId,
        tokens: response.usage,
        outputSummary: "Additional model turn required before final answer.",
      });
    }

    for (const call of response.toolCalls) {
      const result = await executeTool(options.tools, call);
      toolCalls += 1;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
      traceEvents.push({
        kind:
          call.name.includes("search") || call.name.includes("grep") || call.name.includes("read")
            ? "retrieval"
            : "tool",
        step,
        timestamp: new Date().toISOString(),
        backend: options.backend,
        taskId: options.task.questionId,
        toolName: call.name,
        inputSummary: summarize(JSON.stringify(call.arguments)),
        outputSummary: summarize(result.content),
        retrievedBytes: result.retrievedBytes ?? new TextEncoder().encode(result.content).length,
        retrievedTokens: result.retrievedTokens ?? estimateTokens(result.content),
      });
    }
  }

  if (!answer) {
    answer =
      messages
        .filter((message) => message.role === "assistant" && message.content)
        .at(-1)
        ?.content.trim() ?? "";
  }

  return {
    answer,
    turns: usagePerTurn.length,
    toolCalls,
    usagePerTurn,
    traceEvents,
    latencyMs: Math.round(performance.now() - started),
    finishReason,
  };
}

function systemPrompt(): string {
  return [
    "You are a benchmark agent answering questions from memory.",
    "Use the provided retrieval tools before answering.",
    "Answer concisely and only from retrieved context.",
    "If the context is insufficient, say what is missing.",
  ].join(" ");
}

async function executeTool(tools: ToolDefinition[], call: ToolCall) {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return { content: `Tool not found: ${call.name}` };
  }
  try {
    return await tool.execute(call.arguments);
  } catch (error) {
    return {
      content: `Tool ${call.name} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function summarize(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
}
