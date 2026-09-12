BEGIN;

WITH duplicate_daily_logs AS (
  SELECT ctid,
         ROW_NUMBER() OVER (PARTITION BY user_id, date ORDER BY ctid DESC) AS row_number
  FROM public.daily_log
)
DELETE FROM public.daily_log AS daily_log
USING duplicate_daily_logs
WHERE daily_log.ctid = duplicate_daily_logs.ctid
  AND duplicate_daily_logs.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS daily_log_user_date_unique_idx
  ON public.daily_log (user_id, date);

WITH duplicate_running_jobs AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, job
           ORDER BY started_at DESC, id DESC
         ) AS row_number
  FROM public.sync_runs
  WHERE status = 'running'
)
UPDATE public.sync_runs AS sync_run
SET status = 'failed',
    finished_at = NOW(),
    error_message = '중복 실행 이력 정리'
FROM duplicate_running_jobs
WHERE sync_run.id = duplicate_running_jobs.id
  AND duplicate_running_jobs.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_one_running_job_idx
  ON public.sync_runs (user_id, job)
  WHERE status = 'running';

COMMIT;
