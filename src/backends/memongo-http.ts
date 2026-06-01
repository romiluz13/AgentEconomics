export interface MemongoClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface WriteEventInput {
  agentId: string;
  sessionId: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchDetailedInput {
  agentId: string;
  query: string;
  limit: number;
  searchMode: "agentic" | "auto" | "direct" | "hybrid" | "vector" | "text";
}

export interface ContextBundleInput {
  agentId: string;
  query: string;
  tokenBudget?: number;
  maxEvidenceItems?: number;
  maxRecentEvents?: number;
  includeProfile?: boolean;
  includeDiscoveryProjection?: boolean;
  mode?: "full" | "wake-up";
}

export class MemongoHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: MemongoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async health(): Promise<unknown> {
    return this.request("GET", "/health");
  }

  async status(): Promise<unknown> {
    return this.request("GET", "/v1/status");
  }

  async detailedStatus(): Promise<unknown> {
    return this.request("GET", "/v1/status/detailed");
  }

  async probeEmbedding(): Promise<unknown> {
    return this.request("GET", "/v1/probes/embedding");
  }

  async probeVector(): Promise<unknown> {
    return this.request("GET", "/v1/probes/vector");
  }

  async writeEvent(input: WriteEventInput): Promise<unknown> {
    const { content, ...rest } = input;
    return this.request("POST", "/v1/write-event", { ...rest, body: content });
  }

  async sync(agentId: string): Promise<unknown> {
    return this.request("POST", "/v1/sync", {
      agentId,
      reason: "agent-economics-benchmark",
      force: true,
    });
  }

  async searchDetailed(input: SearchDetailedInput): Promise<unknown> {
    return this.request("POST", "/v1/search-detailed", input);
  }

  async contextBundle(input: ContextBundleInput): Promise<unknown> {
    return this.request("POST", "/v1/context-bundle", input);
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `memongo ${method} ${path} failed with ${response.status}: ${await response.text()}`,
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}
