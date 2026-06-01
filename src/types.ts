export type BackendId = "filesystem" | "memongo-context" | "memongo-search" | "mongodb-text";

export type TraceKind = "model" | "tool" | "retrieval" | "judge" | "retry" | "setup";

export interface TaskSpec {
  questionId: string;
  questionType: string;
  question: string;
  goldAnswer: string;
  answerSessionIds: string[];
}

export interface ConversationTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp?: string;
}

export interface MemorySession {
  id: string;
  sourceQuestionIds: string[];
  turns: ConversationTurn[];
  metadata?: Record<string, string | number | boolean>;
}

export interface Corpus {
  id: string;
  size: number;
  sessions: MemorySession[];
  answerSessionIds: string[];
  distractorSessionIds: string[];
}

export interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  reasoningTokens?: number;
  cachedTokens?: number;
  rawProviderUsage?: Record<string, unknown>;
}

export type RunFailureKind =
  | "backend_setup_failure"
  | "empty_retrieval"
  | "exceeded_loop_budget"
  | "judge_failure"
  | "max_cost_exceeded"
  | "model_failure"
  | "timeout";

export interface FailureRecord {
  kind: RunFailureKind;
  backend?: BackendId;
  corpusSize?: number;
  taskId?: string;
  repetition?: number;
  message: string;
  timestamp: string;
}

export interface TraceEvent {
  kind: TraceKind;
  step: number;
  timestamp: string;
  backend?: BackendId;
  taskId?: string;
  tokens?: TurnUsage;
  latencyMs?: number;
  toolName?: string;
  inputSummary?: string;
  outputSummary?: string;
  retrievedBytes?: number;
  retrievedTokens?: number;
  costUsd?: number;
}

export interface RunResult {
  taskId: string;
  backend: BackendId;
  corpusSize: number;
  repetition: number;
  turns: number;
  toolCalls: number;
  usagePerTurn: TurnUsage[];
  traceEvents: TraceEvent[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCachedTokens: number;
  costUsd: number;
  latencyMs: number;
  correct: boolean;
  answer: string;
  judgeCostUsd: number;
  ingestionCostUsd: number;
  failureKind?: RunFailureKind;
  failureMessage?: string;
}

export interface OutcomeAttribution {
  backend: BackendId;
  corpusSize: number;
  costPerTask: number;
  costPerCorrectAnswer: number | null;
  retryTailTokens: number;
  retryTailCost: number;
  contextInflationTokens: number;
  contextInflationCost: number;
  latencyPerCorrectAnswerMs: number | null;
  usefulOutcomeRate: number;
  routingOpportunity?: RoutingOpportunity;
}

export interface RoutingOpportunity {
  eligibleTasks: number;
  estimatedAvoidableCostUsd: number;
  notes: string;
}

export interface IngestionCost {
  tokens: number;
  costUsd: number;
  notes: string;
}

export interface BenchmarkConfig {
  backends: BackendId[];
  sizes: number[];
  tasks: number;
  repetitions: number;
  maxCostUsd?: number;
  dryRunEstimate: boolean;
  model: string;
  judgeModel: string;
  loopBudget: number;
  datasetPath?: string;
  outDir: string;
  runId: string;
  seed: number;
  pricingPath: string;
  memongoBaseUrl?: string;
  memongoApiKey?: string;
  memongoEnrichmentMode?: string;
  memongoEnrichmentModel?: string;
  memongoRepo?: string;
  memongoCommit?: string;
  memongoQueryDecompositionMode?: string;
  mongodbUri: string;
  groveBaseUrl: string;
  groveApiKey?: string;
  groveAuthHeader: "api-key" | "bearer";
  groveApiMode: "chat" | "responses";
  demo: boolean;
  mockModel: boolean;
}

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface PricingTable {
  models: Record<string, ModelPricing>;
  voyageEmbedPerMTok: number;
}
