CREATE TABLE IF NOT EXISTS public.kis_token_cache (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kis_token_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kis_token_cache FROM anon;
REVOKE ALL ON TABLE public.kis_token_cache FROM authenticated;

CREATE INDEX IF NOT EXISTS kis_token_cache_expires_at_idx
  ON public.kis_token_cache (expires_at);
