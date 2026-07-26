BEGIN;

ALTER TABLE public.portfolio_events
  DROP CONSTRAINT IF EXISTS portfolio_events_event_type_check;

ALTER TABLE public.portfolio_events
  ADD CONSTRAINT portfolio_events_event_type_check CHECK (
    event_type IN (
      'deposit',
      'withdrawal',
      'transfer_in',
      'transfer_out',
      'valuation_adjustment',
      'ignored'
    )
  );

COMMIT;
