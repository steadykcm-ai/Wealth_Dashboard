CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_key)
);

CREATE INDEX IF NOT EXISTS notification_reads_user_read_idx
  ON public.notification_reads (user_id, read_at DESC);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_reads_owner_policy ON public.notification_reads;
CREATE POLICY notification_reads_owner_policy
  ON public.notification_reads
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.notification_reads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_reads TO authenticated;
