import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { calculateCost, type TokenUsage } from "@/lib/utils/cost";
import type { ClaudeModelId } from "./router";

export type LogUsageParams = {
  userId: string | null;
  model: ClaudeModelId;
  usage: TokenUsage;
  requestType: string;
};

export async function logUsage(params: LogUsageParams): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const cost = calculateCost(params.model, params.usage);

  const { error } = await supabase.from("api_usage").insert({
    user_id: params.userId,
    model: params.model,
    input_tokens: params.usage.input_tokens,
    output_tokens: params.usage.output_tokens,
    cache_read_tokens: params.usage.cache_read_input_tokens ?? 0,
    estimated_cost_usd: cost,
    request_type: params.requestType,
  });

  if (error) {
    console.error(`api_usage 로깅 실패: ${error.message}`);
  }
}
