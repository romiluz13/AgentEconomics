import type { PricingTable } from "../types";

export async function loadPricing(path: string): Promise<PricingTable> {
  const text = await Bun.file(path).text();
  const parsed = JSON.parse(text) as PricingTable;
  validatePricing(parsed);
  return parsed;
}

export function validatePricing(pricing: PricingTable): void {
  if (!pricing.models || typeof pricing.models !== "object") {
    throw new Error("Pricing file must include a models object.");
  }
  for (const [model, value] of Object.entries(pricing.models)) {
    if (!Number.isFinite(value.inputPerMTok) || !Number.isFinite(value.outputPerMTok)) {
      throw new Error(`Pricing for ${model} must include numeric inputPerMTok/outputPerMTok.`);
    }
  }
  if (!Number.isFinite(pricing.voyageEmbedPerMTok)) {
    throw new Error("Pricing file must include numeric voyageEmbedPerMTok.");
  }
}
