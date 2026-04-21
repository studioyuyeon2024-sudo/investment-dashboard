import Anthropic from "@anthropic-ai/sdk";
import {
  BASE_SYSTEM_PROMPT,
  type AnalysisResult,
  type Confidence,
  type Recommendation,
} from "./prompts";
import {
  buildDataHash,
  getCachedReport,
  saveReport,
  type CachedReport,
} from "./cache";
import { selectModel, type ClaudeModelId, type TaskType } from "./router";
import { logUsage } from "./usage";
import { calculateCost } from "@/lib/utils/cost";
import type { ReportType } from "@/types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 미설정");
  }
  client = new Anthropic({ apiKey });
  return client;
}

export type AnalyzeParams = {
  ticker: string;
  reportType: ReportType;
  taskType: TaskType;
  marketData: Record<string, unknown>;
  userId?: string | null;
  maxTokens?: number;
};

export type AnalyzeOutcome = {
  cached: boolean;
  reportId: string;
  model: ClaudeModelId;
  parsed: AnalysisResult;
  raw: string;
  costUsd: number;
};

export async function analyzeTicker(
  params: AnalyzeParams,
): Promise<AnalyzeOutcome> {
  const userId = params.userId ?? null;
  const hash = buildDataHash(params.ticker, params.reportType, params.marketData);

  const cached = await getCachedReport(hash);
  if (cached) {
    return {
      cached: true,
      reportId: cached.id,
      model: cached.model_used as ClaudeModelId,
      parsed: cached.parsed,
      raw: cached.analysis_text,
      costUsd: 0,
    };
  }

  const model = selectModel(params.taskType);
  const maxTokens = params.maxTokens ?? 600;

  const userMessage = buildUserMessage(params.ticker, params.marketData);
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: BASE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = extractText(response);
  const parsed = parseAnalysis(raw);

  await logUsage({
    userId,
    model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
    },
    requestType: params.reportType,
  });

  const reportId = await saveReport({
    userId,
    ticker: params.ticker,
    reportType: params.reportType,
    dataHash: hash,
    marketData: params.marketData,
    analysisText: raw,
    parsed,
    modelUsed: model,
  });

  return {
    cached: false,
    reportId,
    model,
    parsed,
    raw,
    costUsd: estimateCost(response.usage, model),
  };
}

function buildUserMessage(
  ticker: string,
  marketData: Record<string, unknown>,
): string {
  return `종목: ${ticker}\n\n시장 데이터:\n${JSON.stringify(marketData, null, 2)}\n\n위 데이터를 분석하여 지정된 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 포함하지 마세요.`;
}

function extractText(response: Anthropic.Messages.Message): string {
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude 응답에 텍스트 블록 없음");
  }
  return block.text.trim();
}

function parseAnalysis(raw: string): AnalysisResult {
  const cleaned = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude 응답 JSON 파싱 실패: ${raw.slice(0, 200)}`);
  }

  if (!isAnalysisResult(parsed)) {
    throw new Error(`Claude 응답 형식 불일치: ${raw.slice(0, 200)}`);
  }
  return parsed;
}

function stripCodeFence(text: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const match = text.match(fence);
  return match && match[1] ? match[1] : text;
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const rec = v.recommendation;
  const conf = v.confidence;
  const validRec: Recommendation[] = [
    "hold",
    "partial_buy",
    "partial_sell",
    "full_sell",
  ];
  const validConf: Confidence[] = ["high", "medium", "low"];
  return (
    typeof rec === "string" &&
    validRec.includes(rec as Recommendation) &&
    typeof conf === "string" &&
    validConf.includes(conf as Confidence) &&
    typeof v.reasoning === "string" &&
    typeof v.action_plan === "object" &&
    Array.isArray(v.risks)
  );
}

function estimateCost(
  usage: Anthropic.Messages.Message["usage"],
  model: ClaudeModelId,
): number {
  return calculateCost(model, {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  });
}
