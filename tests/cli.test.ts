import { describe, expect, test } from "bun:test";
import { helpText } from "../src/cli";

describe("cli help", () => {
  test("documents supported configuration flags", () => {
    const help = helpText();
    for (const flag of [
      "--backend",
      "--sizes",
      "--tasks",
      "--repetitions",
      "--max-cost-usd",
      "--dry-run-estimate",
      "--run-id",
      "--seed",
      "--grove-base-url",
      "--grove-auth-header",
      "--grove-api-mode",
      "--grove-api-key",
      "--memongo-base-url",
      "--memongo-api-key",
      "--memongo-enrichment-mode",
      "--memongo-enrichment-model",
      "--memongo-query-decomposition-mode",
      "--memongo-repo",
      "--memongo-commit",
      "--mongodb-uri",
    ]) {
      expect(help).toContain(flag);
    }
  });
});
