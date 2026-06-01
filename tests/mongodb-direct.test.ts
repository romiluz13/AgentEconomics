import { describe, expect, test } from "bun:test";
import { createMockChatProvider } from "../src/agent/grove";
import { runAgentLoop } from "../src/agent/loop";
import { MongoDbBackend } from "../src/backends/mongodb";
import type { BackendRunContext } from "../src/backends/types";
import { buildCorpus, selectStratifiedTasks } from "../src/dataset/corpus";
import { parseLongMemEval } from "../src/dataset/longmemeval";
import type { PricingTable } from "../src/types";

const pricing: PricingTable = {
  models: { "mock-agent": { inputPerMTok: 0, outputPerMTok: 0 } },
  voyageEmbedPerMTok: 0.1,
};

describe("direct MongoDB backend", () => {
  test("runs against local Docker MongoDB when available", async () => {
    const fixture = await Bun.file("tests/fixtures/synthetic-longmemeval.json").json();
    const entries = parseLongMemEval(fixture);
    const tasks = selectStratifiedTasks(entries, 1, 11);
    const task = tasks[0];
    if (!task) throw new Error("Expected at least one selected task.");

    const backend = new MongoDbBackend({
      mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/agent-economics-test",
      pricing,
    });
    let context: BackendRunContext;
    try {
      context = await backend.setup(buildCorpus(entries, tasks, 3, 11));
    } catch (error) {
      if (String(error).includes("ECONNREFUSED")) return;
      throw error;
    }

    try {
      const loop = await runAgentLoop({
        backend: "mongodb",
        task,
        tools: context.tools,
        provider: createMockChatProvider(task),
        loopBudget: 4,
      });
      expect(loop.answer).toContain(task.goldAnswer);
    } finally {
      await context.teardown();
    }
  }, 20_000);
});
