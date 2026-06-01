import { estimateTokens } from "../agent/tokenizer";
import type { BackendId, Corpus, MemorySession, PricingTable } from "../types";
import { MemongoHttpClient } from "./memongo-http";
import type { Backend, BackendRunContext, ToolDefinition, ToolExecutionResult } from "./types";

export interface MemongoBackendOptions {
  id: Extract<BackendId, "memongo-context" | "memongo-search">;
  baseUrl: string;
  apiKey?: string;
  pricing: PricingTable;
}

export class MemongoBackend implements Backend {
  readonly id: Extract<BackendId, "memongo-context" | "memongo-search">;
  private readonly client: MemongoHttpClient;
  private readonly pricing: PricingTable;

  constructor(options: MemongoBackendOptions) {
    this.id = options.id;
    this.client = new MemongoHttpClient({ baseUrl: options.baseUrl, apiKey: options.apiKey });
    this.pricing = options.pricing;
  }

  async setup(corpus: Corpus): Promise<BackendRunContext> {
    const agentId = `agent-economics-${this.id}-${corpus.id}-${Date.now()}`;
    let ingestedTokens = 0;

    await this.client.status();
    for (const session of corpus.sessions) {
      ingestedTokens += await this.writeSession(agentId, corpus, session);
    }
    await this.client.sync(agentId);

    return {
      backend: this.id,
      corpus,
      tools: [this.id === "memongo-context" ? this.contextTool(agentId) : this.searchTool(agentId)],
      ingestionCost: {
        tokens: ingestedTokens,
        costUsd: (ingestedTokens / 1_000_000) * this.pricing.voyageEmbedPerMTok,
        notes:
          "Estimated memongo embedding ingestion cost, reported separately from per-task inference.",
      },
      teardown: async () => {},
    };
  }

  private async writeSession(
    agentId: string,
    corpus: Corpus,
    session: MemorySession,
  ): Promise<number> {
    let tokens = 0;
    for (const [turnIndex, turn] of session.turns.entries()) {
      tokens += estimateTokens(turn.content);
      await this.client.writeEvent({
        agentId,
        sessionId: session.id,
        role: turn.role,
        content: turn.content,
        timestamp: turn.timestamp ?? metadataTimestamp(session),
        metadata: {
          benchmark: "agent-economics",
          corpusId: corpus.id,
          backend: this.id,
          sessionId: session.id,
          turnIndex,
          sourceQuestionIds: session.sourceQuestionIds,
          answerSession: corpus.answerSessionIds.includes(session.id),
          ...session.metadata,
        },
      });
    }
    return tokens;
  }

  private contextTool(agentId: string): ToolDefinition {
    return {
      name: "search_memory",
      description:
        "Build a prompt-ready memongo context bundle for the question. Use this before answering.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language memory query." },
          limit: { type: "number", description: "Maximum evidence items to retrieve." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const query = stringArg(args, "query");
        const limit = Math.min(Math.max(numberArg(args, "limit", 8), 20), 30);
        const result = await this.client.contextBundle({
          agentId,
          query,
          tokenBudget: 12_000,
          maxEvidenceItems: limit,
          maxRecentEvents: 30,
          includeProfile: true,
          includeDiscoveryProjection: true,
          mode: "full",
        });
        return memongoResult(result);
      },
    };
  }

  private searchTool(agentId: string): ToolDefinition {
    return {
      name: "search_memory",
      description: "Search memongo detailed memory retrieval for relevant context.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language memory query." },
          limit: { type: "number", description: "Maximum memory chunks to retrieve." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const query = stringArg(args, "query");
        const limit = Math.min(Math.max(numberArg(args, "limit", 8), 20), 30);
        const result = await this.client.searchDetailed({
          agentId,
          query,
          limit,
          searchMode: "agentic",
        });
        return memongoResult(result);
      },
    };
  }
}

function memongoResult(value: unknown): ToolExecutionResult {
  const content = extractReadableContent(value);
  return {
    content,
    retrievedBytes: new TextEncoder().encode(content).length,
    retrievedTokens: estimateTokens(content),
  };
}

function extractReadableContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  if (typeof object.rendered === "string") return object.rendered;
  if (object.bundle && typeof object.bundle === "object") {
    const bundle = object.bundle as Record<string, unknown>;
    if (typeof bundle.rendered === "string") return bundle.rendered;
  }
  const candidates = [object.results, object.memories, object.items, object.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate))
      return candidate.map((entry) => formatSearchEntry(entry)).join("\n\n");
  }
  return JSON.stringify(value, null, 2);
}

function formatSearchEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return JSON.stringify(entry);
  const object = entry as Record<string, unknown>;
  const lines = [
    stringField(object, "title"),
    stringField(object, "summary"),
    stringField(object, "content"),
    stringField(object, "text"),
    stringField(object, "memory"),
    stringField(object, "chunk"),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(entry);
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Missing string argument: ${key}`);
  return value.trim();
}

function numberArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function stringField(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataTimestamp(session: MemorySession): string | undefined {
  const value = session.metadata?.date ?? session.metadata?.timestamp;
  return typeof value === "string" ? value : undefined;
}
