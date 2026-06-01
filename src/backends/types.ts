import type { BackendId, Corpus, IngestionCost } from "../types";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: Record<string, unknown>): Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  content: string;
  retrievedBytes?: number;
  retrievedTokens?: number;
}

export interface BackendRunContext {
  backend: BackendId;
  corpus: Corpus;
  tools: ToolDefinition[];
  ingestionCost: IngestionCost;
  teardown(): Promise<void>;
}

export interface Backend {
  id: BackendId;
  setup(corpus: Corpus, runDir: string): Promise<BackendRunContext>;
}

export function toOpenAiTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
