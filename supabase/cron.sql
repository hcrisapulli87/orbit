-- Orbit — schedule the push notifier.
--
-- Kept OUT of schema.sql on purpose: this file embeds a project URL and a
-- shared secret, and schema.sql is meant to be safely re-runnable by anyone at
-- any time. Run this once, by hand, after deploying the function.
--
-- Prerequisites (Dashboard → Database → Extensions): enable pg_cron and pg_net.
--
-- Do NOT fill the placeholders in THIS file — it is committed. Copy it to
-- supabase/cron.local.sql (gitignored) and edit that, or paste straight into
-- the SQL editor and fill them there.
--
-- Replace the two placeholders and run the whole file.
--   <PROJECT-REF>   e.g. pxgqfwicnwcwnimeulin
--   <NOTIFY-SECRET> the same value passed to
--                   supabase secrets set NOTIFY_SECRET=…

-- Idempotent: unschedule first so re-running doesn't stack duplicate jobs.
select cron.unschedule('orbit-notify')
where exists (select 1 from cron.job where jobname = 'orbit-notify');

select cron.schedule(
  'orbit-notify',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-orbit-secret', '<NOTIFY-SECRET>'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- Check it registered:
--   select jobname, schedule, active from cron.job where jobname = 'orbit-notify';
-- Recent runs:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'orbit-notify')
--   order by start_time desc limit 10;
