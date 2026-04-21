export type Holding = {
  id: string;
  portfolio_id: string;
  ticker: string;
  name: string | null;
  avg_price: number;
  quantity: number;
  entry_date: string | null;
  target_price: number | null;
  stop_loss: number | null;
  notes: string | null;
  created_at: string;
};

export type Portfolio = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type MarketSnapshot = {
  ticker: string;
  snapshot_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  foreign_net: number | null;
  institution_net: number | null;
  individual_net: number | null;
  short_balance: number | null;
};

export type ReportType = "daily" | "on_demand" | "alert" | "monthly";

export type AnalysisReport = {
  id: string;
  user_id: string;
  ticker: string;
  report_type: ReportType;
  data_hash: string;
  market_data: Record<string, unknown>;
  analysis_text: string;
  recommendation: string;
  confidence: string;
  model_used: string;
  created_at: string;
};
