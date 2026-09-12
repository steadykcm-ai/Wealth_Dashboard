BEGIN;

CREATE TABLE IF NOT EXISTS public.market_snapshots (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_snapshots_owner_select_policy ON public.market_snapshots;
CREATE POLICY market_snapshots_owner_select_policy
  ON public.market_snapshots
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.market_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.market_snapshots TO authenticated;

COMMIT;
