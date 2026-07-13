CREATE TABLE IF NOT EXISTS public.benchmark_daily (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  value NUMERIC NOT NULL CHECK (value > 0),
  source TEXT NOT NULL DEFAULT 'KIS',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS benchmark_daily_date_idx
  ON public.benchmark_daily (date DESC);
