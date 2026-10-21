-- Optional read-only snapshot, run in Supabase SQL Editor as the project administrator.
-- It reads aggregate query statistics, without printing user SQL or project payloads.
-- Requires pg_stat_statements to be enabled already. No statistics are reset.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT now() AS captured_at, queryid, calls,
       round(total_exec_time::numeric,2) AS total_exec_ms,
       round(mean_exec_time::numeric,2) AS mean_exec_ms,
       rows,
       CASE WHEN query ILIKE '%save_research_project%' THEN 'project save'
            WHEN query ILIKE '%claim_research_job%' THEN 'worker claim'
            WHEN query ILIKE '%research_queue_wake_delay%' THEN 'pending lease recovery'
            WHEN query ILIKE '%heartbeat_research_job%' THEN 'active worker heartbeat'
            WHEN query ILIKE '%project_revisions%' THEN 'revision reads'
            WHEN query ILIKE '%research_jobs%' THEN 'job access'
            ELSE 'other' END AS query_category
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC LIMIT 20;
COMMIT;
