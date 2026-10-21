-- Hotfix after 007: PostgREST 14 retries SQLSTATE 40001 indefinitely.
-- Business conflicts are final HTTP 409 responses, not serialization failures.
-- Preserve installed function bodies, ownership, search_path, validation and EXECUTE grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE
 signature text;
 fn regprocedure;
 definition text;
 repaired text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.save_research_project(jsonb,integer)',
  'public.restore_project_revision(uuid,integer,integer)',
  'public.assign_project_team(uuid,uuid,integer)',
  'public.enqueue_research_job(jsonb,uuid)'
 ] LOOP
  fn := to_regprocedure(signature);
  IF fn IS NULL THEN RAISE EXCEPTION 'Required function missing: %. Apply migrations through 007 first.', signature; END IF;
  definition := pg_get_functiondef(fn);
  repaired := replace(definition, quote_literal('40001'), quote_literal('PT409'));
  IF repaired = definition AND position(quote_literal('PT409') in definition) = 0 THEN
   RAISE EXCEPTION 'Expected conflict code missing from %. Review the installed function before patching.', signature;
  END IF;
  IF repaired <> definition THEN EXECUTE repaired; END IF;
 END LOOP;
END
$repair$;
NOTIFY pgrst, 'reload schema';
COMMIT;
