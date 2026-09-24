-- Keep the backend awake.
--
-- The LangGraph service runs on Render's free plan, which puts an instance to
-- sleep after 15 minutes without an inbound request and takes about a minute
-- to wake it. A student signing in after a quiet spell sat through that minute
-- before their quest loaded. Pinging /health every 10 minutes keeps it up.
--
-- One always-on free service fits inside Render's 750 free instance hours a
-- month (a 31-day month is 744), but only if it is the only free service in
-- the workspace.
--
-- To stop it:  select cron.unschedule('keep-backend-awake');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Scheduling under an existing name replaces that job, so this is safe to re-run.
select cron.schedule(
  'keep-backend-awake',
  '*/10 * * * *',
  $$
    select net.http_get(
      url := 'https://mentorable-langgraph.onrender.com/health',
      timeout_milliseconds := 60000
    );
  $$
);
