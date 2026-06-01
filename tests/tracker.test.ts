import { describe, expect, test } from "bun:test";
import { costForUsage, usageTotals } from "../src/cost/tracker";
import type { PricingTable, TurnUsage } from "../src/types";

const pricing: PricingTable = {
  models: {
    test: { inputPerMTok: 2, outputPerMTok: 10 },
  },
  voyageEmbedPerMTok: 0.1,
};

describe("cost tracker", () => {
  test("converts usage to dollars", () => {
    const usage: TurnUsage = {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      totalTokens: 1_500_000,
      model: "test",
    };
    expect(costForUsage(usage, pricing)).toBe(7);
  });

  test("sums usage totals", () => {
    const totals = usageTotals([
      { promptTokens: 10, completionTokens: 3, totalTokens: 13, model: "test" },
      { promptTokens: 5, completionTokens: 2, totalTokens: 7, model: "test" },
    ]);
    expect(totals).toEqual({ cached: 0, input: 15, output: 5, reasoning: 0, total: 20 });
  });
});
