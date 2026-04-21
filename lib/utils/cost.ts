import { CLAUDE_MODELS, type ClaudeModelId } from "@/lib/claude/router";

type PricePerMTok = { input: number; output: number };

const PRICING: Record<ClaudeModelId, PricePerMTok> = {
  [CLAUDE_MODELS.haiku]: { input: 1, output: 5 },
  [CLAUDE_MODELS.sonnet]: { input: 3, output: 15 },
  [CLAUDE_MODELS.opus]: { input: 5, output: 25 },
};

const USD_TO_KRW = 1400;
const CACHE_READ_DISCOUNT = 0.1;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function calculateCost(model: ClaudeModelId, usage: TokenUsage): number {
  const price = PRICING[model];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const normalInput = usage.input_tokens - cacheRead - cacheCreate;

  const inputCost =
    (normalInput * price.input +
      cacheRead * price.input * CACHE_READ_DISCOUNT +
      cacheCreate * price.input * 1.25) /
    1_000_000;

  const outputCost = (usage.output_tokens * price.output) / 1_000_000;

  return inputCost + outputCost;
}

export function usdToKrw(usd: number): number {
  return Math.round(usd * USD_TO_KRW);
}
