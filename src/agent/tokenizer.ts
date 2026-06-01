import type { ConversationTurn } from "../types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const charEstimate = Math.ceil(text.length / 4);
  return Math.max(1, Math.ceil((words + charEstimate) / 2));
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value));
}

export function estimateMessageTokens(messages: ConversationTurn[]): number {
  return messages.reduce(
    (sum, message) => sum + estimateTokens(`${message.role}: ${message.content}`),
    0,
  );
}
