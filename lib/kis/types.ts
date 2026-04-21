export type KisEnvironment = "paper" | "real";

export type KisToken = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  access_token_token_expired: string;
};

export type KisQuote = {
  ticker: string;
  name: string;
  price: number;
  change: number;
  change_rate: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  trade_value: number;
  market_cap: number | null;
  fetched_at: string;
};

export type KisDailyOhlcv = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trade_value: number;
};

export type KisPeriodCode = "D" | "W" | "M" | "Y";
