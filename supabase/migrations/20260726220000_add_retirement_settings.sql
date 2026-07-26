CREATE TABLE IF NOT EXISTS public.retirement_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_age INTEGER NOT NULL CHECK (current_age BETWEEN 18 AND 100),
  retirement_age INTEGER NOT NULL CHECK (retirement_age BETWEEN 19 AND 100),
  life_expectancy INTEGER NOT NULL CHECK (life_expectancy BETWEEN 20 AND 120),
  monthly_contribution NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (monthly_contribution >= 0),
  monthly_living_cost NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (monthly_living_cost >= 0),
  public_pension_monthly NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (public_pension_monthly >= 0),
  expected_return_rate NUMERIC(6, 3) NOT NULL DEFAULT 5,
  inflation_rate NUMERIC(6, 3) NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (retirement_age > current_age),
  CHECK (life_expectancy > retirement_age)
);

ALTER TABLE public.retirement_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retirement_settings_owner_policy ON public.retirement_settings;
CREATE POLICY retirement_settings_owner_policy
  ON public.retirement_settings
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.retirement_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.retirement_settings TO authenticated;
