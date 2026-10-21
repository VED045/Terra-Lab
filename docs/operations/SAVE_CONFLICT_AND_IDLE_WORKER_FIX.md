# Save conflicts and idle database traffic — 21 October 2026

**Correction after live investigation:** Migration 007 retained SQLSTATE 40001 for business conflicts. On PostgREST 14 this can cause an infinite retry inside a single HTTP request, before the browser receives an error. The browser pause and idle-worker changes below remain valid, but do not fix that server loop. Apply 20261021043045_non_retryable_conflicts.sql after 007. See POSTGREST_CONFLICT_RETRY_HOTFIX.md for the live repair and verification. Earlier statements below about lack of live access describe the first implementation, before the user signed in to the dashboard.

The supplied PostgreSQL log identifies an explicit VERSION_CONFLICT (40001) raised by save_research_project. It is a stale expected-version rejection, not evidence of a failed migration. Query timings and CPU metrics have not been read from the live project: the Supabase plugin is enabled, but database commands were not exposed to this chat during implementation.

## Behavior

- Identical concurrent browser submissions share one save request. Metadata-only acknowledgements do not dirty an already saved draft, and late responses cannot lower its accepted version.
- An identical stale retry returns the accepted cloud configuration without adding history/activity. Different stale content still fails the version check. Explicit restore/team assignment retain strict version checks.
- All active-project save paths notify the recovery dialog. Autosave remains paused for the rejected revision even after dismissing the dialog or editing further. Manual Save reopens recovery without retrying the stale write. Compare and reapply by ID, open a new copy, or reload the latest cloud revision after backing up the draft. Recovery does not erase edits made while comparing.
- Unchanged auth identity events no longer refresh the entire eight-query workspace. Saves mark the dashboard stale without immediately refetching it; actions share dashboard refreshes. Revision lists fetch metadata, with complete configurations fetched on demand.
- Worker wakeups are events, not continuous polling: application/API enqueue -> private loopback notification -> drain queue -> indefinite event wait. Startup performs one drain. Only known queued/unfinished work schedules a recovery wake, and transient database failure retries are bounded. Heartbeats occur only during active calculation.
- Active browser status updates use 5 seconds queued / 2 seconds running, with error backoff. Active API status reads skip the result-table query until a terminal state.
- Migration 007 adds queue/history/order indexes, bounds expiry housekeeping, and prevents activity triggers running for progress-only updates.

## Rollout

1. Apply supabase/migrations/202610210007_save_retry_and_query_load.sql once after 005/006. It does not rewrite research payloads or history. A lock timeout aborts the transaction; retry during a quiet moment if necessary.
2. Deploy this commit to the existing combined Render Web Service with TERRALAB_RUN_WORKER=1 and command python -m terralab.runtime. The API and worker run in the same container. No new external service, cron, local worker, or wake configuration is required.
3. Deploy/reload Vercel. Export any valuable unsaved draft before closing older TerraLab tabs. Close/reload all old tabs so old autosave code cannot keep issuing stale saves.
4. Resolve any genuine existing conflict once using the new dialog. Repeated failed writes stop; the draft remains locally recoverable.
5. Verify one small experiment, allow the queue to become idle, then submit another. An empty queue has no recurring claim RPC. Direct SQL enqueues require an application submission or service restart to notify the worker.

The optional paid render.yaml now uses one combined service too. An existing separate polling worker must be stopped separately by its operator; this source update cannot stop old deployed processes.

## Evidence and limitations

Tests use isolated local PostgreSQL/Auth/Storage protocol fixtures. They do not prove that a live migration or deployment has completed, or that measured CPU usage has fallen. Use Supabase Query Performance / pg_stat_statements to compare calls and execution time before and after rollout. Do not reset statistics or delete history to hide the symptom.

Primary references: https://supabase.com/docs/guides/troubleshooting/high-cpu-usage and https://supabase.com/docs/guides/database/extensions/pg_stat_statements

## Verification of this change

- JavaScript/shared: 193 passed, one pre-existing opt-in integration test skipped.
- Python/API: 207 passed, one existing upstream Starlette/httpx deprecation warning.
- PostgreSQL migrations/RLS: 58 checks passed using actual PostgreSQL WASM and fixture Auth/Storage tables.
- Browser: 41/42 normal cases initially passed; the archived-list visibility regression was fixed and its complete rename/duplicate/archive/restore/delete case passed on rerun. Four authenticated browser fixture cases passed, including conflict pause during further edits and owner/editor reapplication with viewer denial.
- Combined Render runtime/schema 2: authenticated enqueue -> notification -> worker -> immutable checked publication; zero recurring idle service requests; a second experiment wakes the idle worker; an abandoned lease recovers through its scheduled wake. Explicit same-host worker fixture also passed idle/second-submission checks.
- Optimized Next production build, TypeScript and production browser smoke passed. The smoke exercises actual 2D/3D, mobile rendering, schema-2 height persistence, comparison and PNG output, with external requests blocked.

No live database migration, provider deployment, CPU metric reduction, or Linux Docker build is claimed by these local checks.
