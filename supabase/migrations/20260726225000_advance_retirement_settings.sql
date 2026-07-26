ALTER TABLE public.retirement_settings
  ADD COLUMN IF NOT EXISTS public_pension_start_age INTEGER NOT NULL DEFAULT 65 CHECK (public_pension_start_age BETWEEN 50 AND 100),
  ADD COLUMN IF NOT EXISTS private_pension_start_age INTEGER NOT NULL DEFAULT 60 CHECK (private_pension_start_age BETWEEN 50 AND 100),
  ADD COLUMN IF NOT EXISTS pension_contribution_ratio NUMERIC(5, 2) NOT NULL DEFAULT 50 CHECK (pension_contribution_ratio BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS monthly_contribution_after_retirement NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (monthly_contribution_after_retirement >= 0),
  ADD COLUMN IF NOT EXISTS withdrawal_priority TEXT NOT NULL DEFAULT 'pension_first' CHECK (withdrawal_priority IN ('pension_first', 'taxable_first', 'proportional'));
