import type { BackendId, BenchmarkConfig } from "./types";

const DEFAULT_SIZES = [10, 50, 100, 300, 500];

export function parseArgs(argv: string[]): BenchmarkConfig {
  const args = [...argv];
  const demo = args[0] === "demo";
  if (demo) args.shift();

  const getValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    return args[index + 1];
  };

  const hasFlag = (name: string): boolean => args.includes(name);
  const backends = parseBackends(
    getValue("--backend") ?? (demo ? "filesystem" : "filesystem,mongodb"),
  );
  const model = getValue("--model") ?? process.env.GROVE_MODEL ?? (demo ? "mock-agent" : "gpt-5.5");
  const mockModel = demo || hasFlag("--mock-model") || model === "mock-agent";

  return {
    backends,
    sizes: parseNumberList(getValue("--sizes"), demo ? [3] : DEFAULT_SIZES),
    tasks: parseInteger(getValue("--tasks"), demo ? 2 : 20),
    repetitions: parsePositiveInteger(getValue("--repetitions"), demo ? 1 : 3),
    maxCostUsd: parseOptionalPositiveNumber(getValue("--max-cost-usd")),
    dryRunEstimate: hasFlag("--dry-run-estimate"),
    model: mockModel ? "mock-agent" : model,
    judgeModel: getValue("--judge-model") ?? process.env.GROVE_JUDGE_MODEL ?? model,
    loopBudget: parseInteger(getValue("--loop-budget"), demo ? 4 : 10),
    datasetPath: getValue("--dataset"),
    outDir: getValue("--out") ?? "./artifacts",
    runId: sanitizeRunId(getValue("--run-id") ?? createRunId()),
    seed: parseInteger(getValue("--seed"), 42),
    pricingPath: getValue("--pricing") ?? "./pricing.json",
    memongoBaseUrl: getValue("--memongo-base-url") ?? process.env.MEMONGO_BASE_URL,
    mongodbUri:
      getValue("--mongodb-uri") ??
      process.env.MONGODB_URI ??
      "mongodb://127.0.0.1:27017/agent-economics",
    groveBaseUrl:
      getValue("--grove-base-url") ??
      process.env.GROVE_BASE_URL ??
      "https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1",
    groveApiKey: getValue("--grove-api-key") ?? process.env.GROVE_API_KEY,
    groveAuthHeader: parseAuthHeader(
      getValue("--grove-auth-header") ?? process.env.GROVE_AUTH_HEADER,
    ),
    groveApiMode: parseApiMode(
      getValue("--grove-api-mode") ?? process.env.GROVE_API_MODE,
      mockModel ? "mock-agent" : model,
    ),
    demo,
    mockModel,
  };
}

function parseApiMode(value: string | undefined, model: string): "chat" | "responses" {
  if (!value) return model.toLowerCase() === "gpt-5.5" ? "responses" : "chat";
  if (value === "chat" || value === "responses") return value;
  throw new Error("--grove-api-mode must be chat or responses.");
}

function parseAuthHeader(value: string | undefined): "api-key" | "bearer" {
  if (!value) return "api-key";
  if (value === "api-key" || value === "bearer") return value;
  throw new Error("--grove-auth-header must be api-key or bearer.");
}

export function requireLiveModelConfig(config: BenchmarkConfig): void {
  if (config.mockModel) return;
  if (!config.groveApiKey) {
    throw new Error("GROVE_API_KEY is required unless demo mode or --mock-model is used.");
  }
}

function parseBackends(value: string): BackendId[] {
  const ids = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const valid = new Set(["filesystem", "mongodb"]);
  for (const id of ids) {
    if (!valid.has(id)) throw new Error(`Unsupported backend: ${id}`);
  }
  return ids as BackendId[];
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  const parsed = value.split(",").map((entry) => parseInteger(entry.trim(), Number.NaN));
  if (parsed.some((entry) => !Number.isFinite(entry) || entry <= 0)) {
    throw new Error(`Invalid positive integer list: ${value}`);
  }
  return parsed;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid integer: ${value}`);
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = parseInteger(value, fallback);
  if (parsed <= 0) throw new Error(`Invalid positive integer: ${value ?? fallback}`);
  return parsed;
}

function parseOptionalPositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive number: ${value}`);
  }
  return parsed;
}

function createRunId(): string {
  const safeDate = new Date().toISOString().replace(/[:.]/g, "-");
  return `run-${safeDate}`;
}

function sanitizeRunId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("Run ID must contain at least one alphanumeric, underscore, dot, or dash.");
  }
  return sanitized;
}
