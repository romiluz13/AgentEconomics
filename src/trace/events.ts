import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TraceEvent } from "../types";

export async function writeTraceJsonl(path: string, events: TraceEvent[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = events.map((event) => JSON.stringify(event)).join("\n");
  await writeFile(path, body ? `${body}\n` : "");
}

export function summarizeTrace(events: TraceEvent[]): {
  modelCalls: number;
  toolCalls: number;
  retrievalTokens: number;
  retryEvents: number;
} {
  return {
    modelCalls: events.filter((event) => event.kind === "model").length,
    toolCalls: events.filter((event) => event.kind === "tool" || event.kind === "retrieval").length,
    retrievalTokens: events.reduce((sum, event) => sum + (event.retrievedTokens ?? 0), 0),
    retryEvents: events.filter((event) => event.kind === "retry").length,
  };
}
