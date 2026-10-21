-- Read-only verification after applying the hotfix and stopping the reported retries.
SELECT p.oid::regprocedure AS function_name,
 position(quote_literal('40001') in p.prosrc)>0 AS still_uses_retryable_code,
 position(quote_literal('PT409') in p.prosrc)>0 AS uses_final_http_409
FROM pg_proc p
WHERE p.oid IN (
 'public.save_research_project(jsonb,integer)'::regprocedure,
 'public.restore_project_revision(uuid,integer,integer)'::regprocedure,
 'public.assign_project_team(uuid,uuid,integer)'::regprocedure,
 'public.enqueue_research_job(jsonb,uuid)'::regprocedure
);
-- Expected: four rows, still_uses_retryable_code=false, uses_final_http_409=true.
SELECT pid,backend_start,state,query_start
FROM pg_stat_activity
WHERE usename='authenticator' AND datname=current_database()
 AND state='active' AND query ILIKE '%save_research_project%'
 AND pid<>pg_backend_pid();
-- Check fresh logs after recovery. Genuine stale edits return a single PT409, not an endless 40001 loop.
