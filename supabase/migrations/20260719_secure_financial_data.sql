BEGIN;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_account_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_owner_policy ON public.assets;
CREATE POLICY assets_owner_policy
  ON public.assets
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS cash_owner_policy ON public.cash;
CREATE POLICY cash_owner_policy
  ON public.cash
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS daily_log_owner_select_policy ON public.daily_log;
CREATE POLICY daily_log_owner_select_policy
  ON public.daily_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS daily_account_log_owner_select_policy ON public.daily_account_log;
CREATE POLICY daily_account_log_owner_select_policy
  ON public.daily_account_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS prices_public_select_policy ON public.prices;
CREATE POLICY prices_public_select_policy
  ON public.prices
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS benchmark_daily_public_select_policy ON public.benchmark_daily;
CREATE POLICY benchmark_daily_public_select_policy
  ON public.benchmark_daily
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.assets FROM anon;
REVOKE ALL ON TABLE public.cash FROM anon;
REVOKE ALL ON TABLE public.daily_log FROM anon;
REVOKE ALL ON TABLE public.daily_account_log FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash TO authenticated;
GRANT SELECT ON TABLE public.daily_log TO authenticated;
GRANT SELECT ON TABLE public.daily_account_log TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.prices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.benchmark_daily FROM anon, authenticated;
GRANT SELECT ON TABLE public.prices TO anon, authenticated;
GRANT SELECT ON TABLE public.benchmark_daily TO anon, authenticated;

COMMIT;
