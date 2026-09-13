BEGIN;

CREATE TABLE IF NOT EXISTS public.nhplug_token_cache (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nhplug_token_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.nhplug_token_cache FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS nhplug_token_cache_expires_at_idx
  ON public.nhplug_token_cache (expires_at);

COMMIT;
