import type { PricingTable, TurnUsage } from "../types";

export function costForUsage(usage: TurnUsage, pricing: PricingTable): number {
  const modelPricing = pricing.models[usage.model] ?? pricing.models["gpt-5.4"];
  if (!modelPricing) throw new Error(`No pricing configured for model ${usage.model}.`);
  return (
    (usage.promptTokens / 1_000_000) * modelPricing.inputPerMTok +
    (usage.completionTokens / 1_000_000) * modelPricing.outputPerMTok
  );
}

export function costForUsages(usages: TurnUsage[], pricing: PricingTable): number {
  return usages.reduce((sum, usage) => sum + costForUsage(usage, pricing), 0);
}

export function usageTotals(usages: TurnUsage[]): {
  input: number;
  output: number;
  total: number;
  reasoning: number;
  cached: number;
} {
  return usages.reduce(
    (totals, usage) => ({
      input: totals.input + usage.promptTokens,
      output: totals.output + usage.completionTokens,
      total: totals.total + usage.totalTokens,
      reasoning: totals.reasoning + (usage.reasoningTokens ?? 0),
      cached: totals.cached + (usage.cachedTokens ?? 0),
    }),
    { input: 0, output: 0, total: 0, reasoning: 0, cached: 0 },
  );
}
