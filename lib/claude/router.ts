export const CLAUDE_MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
} as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export type TaskType =
  | "daily_summary"
  | "indicator_interpretation"
  | "news_classification"
  | "buy_sell_recommendation"
  | "complex_market_judgment"
  | "monthly_portfolio_review"
  | "strategy_pivot_decision";

const DEFAULT_MODEL: ClaudeModelId = CLAUDE_MODELS.haiku;

export function selectModel(taskType: TaskType): ClaudeModelId {
  switch (taskType) {
    case "daily_summary":
    case "indicator_interpretation":
    case "news_classification":
      return CLAUDE_MODELS.haiku;

    case "buy_sell_recommendation":
    case "complex_market_judgment":
      return CLAUDE_MODELS.sonnet;

    case "monthly_portfolio_review":
    case "strategy_pivot_decision":
      return CLAUDE_MODELS.opus;

    default:
      return DEFAULT_MODEL;
  }
}
