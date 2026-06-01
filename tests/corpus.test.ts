import { describe, expect, test } from "bun:test";
import { buildCorpus, selectStratifiedTasks } from "../src/dataset/corpus";
import { parseLongMemEval } from "../src/dataset/longmemeval";

describe("corpus builder", () => {
  test("selects deterministic stratified tasks and includes answer sessions", async () => {
    const fixture = await Bun.file("tests/fixtures/synthetic-longmemeval.json").json();
    const entries = parseLongMemEval(fixture);
    const tasks = selectStratifiedTasks(entries, 2, 7);
    const again = selectStratifiedTasks(entries, 2, 7);

    expect(tasks.map((task) => task.questionId)).toEqual(again.map((task) => task.questionId));

    const corpus = buildCorpus(entries, tasks, 3, 7);
    const answerIds = new Set(corpus.answerSessionIds);
    for (const task of tasks) {
      expect(task.answerSessionIds.some((id) => answerIds.has(id))).toBe(true);
    }
    expect(corpus.sessions.length).toBeGreaterThanOrEqual(tasks.length);
  });
});
