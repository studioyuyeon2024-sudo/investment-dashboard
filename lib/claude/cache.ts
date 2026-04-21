import { getSupabaseServiceClient } from "@/lib/supabase/client";
import { dataHash } from "@/lib/utils/hash";
import type { AnalysisResult } from "./prompts";
import type { ReportType } from "@/types";

const CACHE_TTL_SECONDS = 60 * 60;

export type CachedReport = {
  id: string;
  analysis_text: string;
  parsed: AnalysisResult;
  recommendation: string;
  confidence: string;
  model_used: string;
  created_at: string;
};

export function buildDataHash(
  ticker: string,
  reportType: ReportType,
  marketData: unknown,
): string {
  return dataHash({ ticker, reportType, marketData });
}

export async function getCachedReport(
  hash: string,
): Promise<CachedReport | null> {
  const supabase = getSupabaseServiceClient();
  const cutoff = new Date(Date.now() - CACHE_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from("analysis_reports")
    .select(
      "id, analysis_text, recommendation, confidence, model_used, created_at",
    )
    .eq("data_hash", hash)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`analysis_reports 조회 실패: ${error.message}`);
  }
  if (!data) return null;

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(data.analysis_text) as AnalysisResult;
  } catch {
    return null;
  }

  return { ...data, parsed };
}

export type SaveReportParams = {
  userId: string | null;
  ticker: string;
  reportType: ReportType;
  dataHash: string;
  marketData: unknown;
  analysisText: string;
  parsed: AnalysisResult;
  modelUsed: string;
};

export async function saveReport(params: SaveReportParams): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("analysis_reports")
    .insert({
      user_id: params.userId,
      ticker: params.ticker,
      report_type: params.reportType,
      data_hash: params.dataHash,
      market_data: params.marketData,
      analysis_text: params.analysisText,
      recommendation: params.parsed.recommendation,
      confidence: params.parsed.confidence,
      model_used: params.modelUsed,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`analysis_reports 저장 실패: ${error.message}`);
  }

  return data.id;
}
