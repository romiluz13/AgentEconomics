import { afterAll, describe, expect, test } from "bun:test";
import { createMockChatProvider } from "../src/agent/grove";
import { runAgentLoop } from "../src/agent/loop";
import { MongoDbBackend } from "../src/backends/mongodb";
import { buildCorpus, selectStratifiedTasks } from "../src/dataset/corpus";
import { parseLongMemEval } from "../src/dataset/longmemeval";
import { judgeAnswer } from "../src/judge/judge";
import type { PricingTable } from "../src/types";

const memories = new Map<string, string[]>();
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/status") {
      return Response.json({ ok: true });
    }
    const body =
      request.method === "POST" ? ((await request.json()) as Record<string, unknown>) : {};
    if (url.pathname === "/v1/write-event") {
      const agentId = String(body.agentId);
      const current = memories.get(agentId) ?? [];
      current.push(String(body.content ?? ""));
      memories.set(agentId, current);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/v1/sync") return Response.json({ ok: true });
    if (url.pathname === "/v1/search-detailed") {
      const agentId = String(body.agentId);
      const query = String(body.query ?? "").toLowerCase();
      const words = new Set(query.match(/[a-z0-9]+/g) ?? []);
      const results = (memories.get(agentId) ?? [])
        .filter((content) =>
          content
            .toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.some((word) => words.has(word)),
        )
        .map((content) => ({ content }));
      return Response.json({ results });
    }
    return new Response("not found", { status: 404 });
  },
});

afterAll(() => server.stop(true));

const pricing: PricingTable = {
  models: { "mock-agent": { inputPerMTok: 0, outputPerMTok: 0 } },
  voyageEmbedPerMTok: 0.1,
};

describe("mongodb backend smoke", () => {
  test("runs a task through memongo-compatible HTTP endpoints", async () => {
    const fixture = await Bun.file("tests/fixtures/synthetic-longmemeval.json").json();
    const entries = parseLongMemEval(fixture);
    const tasks = selectStratifiedTasks(entries, 1, 3);
    const task = tasks[0];
    if (!task) throw new Error("Expected at least one selected task.");

    const corpus = buildCorpus(entries, tasks, 3, 3);
    const backend = new MongoDbBackend({
      memongoBaseUrl: server.url.href,
      mongodbUri: "mongodb://127.0.0.1:27017/agent-economics-test",
      pricing,
    });
    const context = await backend.setup(corpus);
    const loop = await runAgentLoop({
      backend: "mongodb",
      task,
      tools: context.tools,
      provider: createMockChatProvider(task),
      loopBudget: 4,
    });
    const judge = await judgeAnswer({
      answer: loop.answer,
      task,
      baseUrl: server.url.href,
      model: "mock-agent",
      authHeader: "api-key",
      apiMode: "chat",
      pricing,
      mock: true,
      step: loop.turns,
    });

    expect(judge.correct).toBe(true);
    await context.teardown();
  });
});
