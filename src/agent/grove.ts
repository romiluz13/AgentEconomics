import type { ToolDefinition } from "../backends/types";
import type { TaskSpec, TurnUsage } from "../types";
import { estimateJsonTokens, estimateTokens } from "./tokenizer";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: TurnUsage;
}

export type ChatProvider = (
  messages: ChatMessage[],
  tools: ToolDefinition[],
) => Promise<ChatResponse>;

export interface GroveOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  authHeader: "api-key" | "bearer";
  apiMode: "chat" | "responses";
}

export function createGroveChatProvider(options: GroveOptions): ChatProvider {
  if (options.apiMode === "responses") return createResponsesProvider(options);
  return async (messages, tools) => {
    const payload = {
      model: options.model,
      messages: messages.map(toWireMessage),
      tools: tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      temperature: 0,
      parallel_tool_calls: false,
    };
    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: authHeaders(options.apiKey, options.authHeader),
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Grove chat failed with ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const choice = readChoice(data);
    const message = choice.message;
    const content = typeof message.content === "string" ? message.content : "";
    return {
      content,
      toolCalls: readToolCalls(message),
      usage: readUsage(data.usage, options.model, payload, content),
    };
  };
}

function createResponsesProvider(options: GroveOptions): ChatProvider {
  return async (messages, tools) => {
    const payload = {
      model: options.model,
      input: toResponsesInput(messages),
      tools: tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      parallel_tool_calls: false,
      store: false,
    };
    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: authHeaders(options.apiKey, options.authHeader),
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Grove responses failed with ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const content = readResponsesText(data);
    return {
      content,
      toolCalls: readResponsesToolCalls(data),
      usage: readUsage(data.usage, options.model, payload, content),
    };
  };
}

export function authHeaders(
  apiKey: string,
  authHeader: "api-key" | "bearer",
): Record<string, string> {
  return authHeader === "bearer"
    ? { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }
    : { "api-key": apiKey, "content-type": "application/json" };
}

export function createMockChatProvider(task: TaskSpec): ChatProvider {
  return async (messages, tools) => {
    const assistantTurns = messages.filter((message) => message.role === "assistant").length;
    const transcript = messages.map((message) => message.content).join("\n");
    const model = "mock-agent";

    if (assistantTurns === 0) {
      const searchTool = tools.find((tool) => tool.name === "search_memory");
      const grepTool = tools.find((tool) => tool.name === "grep_files");
      if (searchTool) {
        return mockToolResponse(model, "search_memory", { query: task.question, limit: 5 });
      }
      if (grepTool) {
        return mockToolResponse(model, "grep_files", { pattern: bestKeyword(task.question) });
      }
    }

    if (assistantTurns === 1 && tools.some((tool) => tool.name === "read_file")) {
      const path = firstMarkdownPath(transcript);
      if (path) return mockToolResponse(model, "read_file", { path });
    }

    const found = transcript.toLowerCase().includes(task.goldAnswer.toLowerCase());
    const answer = found
      ? task.goldAnswer
      : `I could not verify the answer from retrieved context. Best known answer: ${task.goldAnswer}`;
    return {
      content: answer,
      toolCalls: [],
      usage: {
        promptTokens: estimateTokens(transcript),
        completionTokens: estimateTokens(answer),
        totalTokens: estimateTokens(transcript) + estimateTokens(answer),
        model,
      },
    };
  };
}

function mockToolResponse(
  model: string,
  name: string,
  args: Record<string, unknown>,
): ChatResponse {
  const call = { id: `mock-${name}-${Date.now()}`, name, arguments: args };
  const promptTokens = estimateJsonTokens(args);
  return {
    content: "",
    toolCalls: [call],
    usage: {
      promptTokens,
      completionTokens: 1,
      totalTokens: promptTokens + 1,
      model,
    },
  };
}

function bestKeyword(question: string): string {
  const stop = new Set([
    "what",
    "when",
    "where",
    "which",
    "whose",
    "about",
    "the",
    "did",
    "was",
    "for",
  ]);
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.find((word) => word.length > 3 && !stop.has(word)) ?? words[0] ?? question;
}

function firstMarkdownPath(text: string): string | undefined {
  return text.match(/[A-Za-z0-9_.-]+\.md/)?.[0];
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.tool_call_id) wire.tool_call_id = message.tool_call_id;
  if (message.tool_calls) {
    wire.tool_calls = message.tool_calls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
  }
  return wire;
}

function toResponsesInput(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return [
        {
          type: "function_call_output",
          call_id: message.tool_call_id ?? "unknown-call",
          output: message.content,
        },
      ];
    }

    const entries: Record<string, unknown>[] = [];
    if (message.content) entries.push({ role: message.role, content: message.content });
    for (const call of message.tool_calls ?? []) {
      entries.push({
        type: "function_call",
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      });
    }
    return entries;
  });
}

function readChoice(data: Record<string, unknown>): { message: Record<string, unknown> } {
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0)
    throw new Error("Grove response had no choices.");
  const first = choices[0] as Record<string, unknown>;
  const message = first.message;
  if (!message || typeof message !== "object")
    throw new Error("Grove response choice had no message.");
  return { message: message as Record<string, unknown> };
}

function readToolCalls(message: Record<string, unknown>): ToolCall[] {
  const calls = message.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.map((call, index) => {
    const object = call as Record<string, unknown>;
    const fn = (object.function ?? {}) as Record<string, unknown>;
    return {
      id: typeof object.id === "string" ? object.id : `call-${index}`,
      name: typeof fn.name === "string" ? fn.name : "",
      arguments: parseArguments(fn.arguments),
    };
  });
}

function readResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const output = data.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const object = item as Record<string, unknown>;
    if (object.type !== "message") continue;
    const content = object.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partObject = part as Record<string, unknown>;
      const text = partObject.text ?? partObject.output_text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function readResponsesToolCalls(data: Record<string, unknown>): ToolCall[] {
  const output = data.output;
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => item.type === "function_call")
    .map((item, index) => ({
      id:
        typeof item.call_id === "string"
          ? item.call_id
          : typeof item.id === "string"
            ? item.id
            : `response-call-${index}`,
      name: typeof item.name === "string" ? item.name : "",
      arguments: parseArguments(item.arguments),
    }));
}

export function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
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
