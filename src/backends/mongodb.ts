import { type Collection, MongoClient } from "mongodb";
import { estimateTokens } from "../agent/tokenizer";
import type { Corpus, PricingTable } from "../types";
import type { Backend, BackendRunContext, ToolDefinition, ToolExecutionResult } from "./types";

export interface MongoDbTextBackendOptions {
  mongodbUri: string;
  pricing: PricingTable;
}

export class MongoDbTextBackend implements Backend {
  readonly id = "mongodb-text" as const;
  private readonly mongodbUri: string;
  private readonly pricing: PricingTable;

  constructor(options: MongoDbTextBackendOptions) {
    this.mongodbUri = options.mongodbUri;
    this.pricing = options.pricing;
  }

  async setup(corpus: Corpus): Promise<BackendRunContext> {
    const client = new MongoClient(this.mongodbUri, {
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 30_000,
    });
    await client.connect();
    const db = client.db();
    const collectionName = `memories_${safeCollectionPart(corpus.id)}_${Date.now()}`;
    const collection = db.collection<MemoryDocument>(collectionName);
    let ingestedTokens = 0;
    const documents: MemoryDocument[] = [];

    for (const session of corpus.sessions) {
      for (const [turnIndex, turn] of session.turns.entries()) {
        ingestedTokens += estimateTokens(turn.content);
        documents.push({
          corpusId: corpus.id,
          sessionId: session.id,
          turnIndex,
          role: turn.role,
          content: turn.content,
          sourceQuestionIds: session.sourceQuestionIds,
          createdAt: new Date(),
        });
      }
    }

    if (documents.length > 0) await collection.insertMany(documents, { ordered: false });
    await collection.createIndex({ content: "text" }, { name: "content_text" });
    await collection.createIndex({ corpusId: 1, sessionId: 1 }, { name: "corpus_session" });

    return {
      backend: this.id,
      corpus,
      tools: [directSearchTool(collection, corpus.id)],
      ingestionCost: {
        tokens: ingestedTokens,
        costUsd: 0,
        notes:
          "Direct Docker MongoDB mode uses a local classic text index; no embedding cost is charged.",
      },
      teardown: async () => {
        await collection.drop().catch(() => undefined);
        await client.close();
      },
    };
  }
}

interface MemoryDocument {
  corpusId: string;
  sessionId: string;
  turnIndex: number;
  role: string;
  content: string;
  sourceQuestionIds: string[];
  createdAt: Date;
}

function directSearchTool(
  collection: Collection<MemoryDocument>,
  corpusId: string,
): ToolDefinition {
  return {
    name: "search_memory",
    description: "Search local MongoDB memory using a text index.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query." },
        limit: { type: "number", description: "Maximum number of memory chunks to retrieve." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const query = stringArg(args, "query");
      const limit = Math.min(numberArg(args, "limit", 3), 3);
      const search = normalizeTextSearch(query);
      const results = await collection
        .find(
          { corpusId, $text: { $search: search } },
          { projection: { score: { $meta: "textScore" }, sessionId: 1, role: 1, content: 1 } },
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .toArray();
      return jsonResult({
        results: results.map((result) => ({
          sessionId: result.sessionId,
          role: result.role,
          content: compactSnippet(result.content, search),
        })),
      });
    },
  };
}

function jsonResult(value: unknown): ToolExecutionResult {
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
  const candidates = [object.results, object.memories, object.items, object.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry) => formatSearchEntry(entry)).join("\n\n");
    }
  }
  return JSON.stringify(value, null, 2);
}

function formatSearchEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return JSON.stringify(entry);
  const object = entry as Record<string, unknown>;
  for (const key of ["content", "text", "memory", "chunk"]) {
    const value = object[key];
    if (typeof value === "string") return value;
  }
  return JSON.stringify(entry);
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

function normalizeTextSearch(query: string): string {
  const words = query
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 2)
    .slice(0, 12);
  return words?.join(" ") || query;
}

function compactSnippet(content: string, search: string): string {
  const maxChars = 900;
  if (content.length <= maxChars) return content;
  const terms = search.split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  const firstHit = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const center = firstHit ?? 0;
  const start = Math.max(0, center - Math.floor(maxChars / 3));
  const end = Math.min(content.length, start + maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

function safeCollectionPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 48);
}
