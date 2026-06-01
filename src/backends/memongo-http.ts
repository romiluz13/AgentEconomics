export interface MemongoClientOptions {
  baseUrl: string;
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
  searchMode: "agentic" | "hybrid" | "vector" | "text";
}

export class MemongoHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: MemongoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async status(): Promise<unknown> {
    return this.request("GET", "/v1/status");
  }

  async writeEvent(input: WriteEventInput): Promise<unknown> {
    return this.request("POST", "/v1/write-event", input);
  }

  async sync(agentId: string): Promise<unknown> {
    return this.request("POST", "/v1/sync", { agentId });
  }

  async searchDetailed(input: SearchDetailedInput): Promise<unknown> {
    return this.request("POST", "/v1/search-detailed", input);
  }

  async contextBundle(agentId: string, query: string, limit: number): Promise<unknown> {
    return this.request("POST", "/v1/context-bundle", { agentId, query, limit });
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
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
