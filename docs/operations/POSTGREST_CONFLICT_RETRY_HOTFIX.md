# PostgREST conflict retry hotfix — 21 October 2026

## Cause and correction

The reported logs identify PostgREST 14.18, SQLSTATE 40001 and an explicit VERSION_CONFLICT raised in save_research_project. The original migration and 007 incorrectly used serialization_failure for a permanent application-level version mismatch. PostgREST 14 can retry that transaction indefinitely, creating many database errors from a single HTTP request. Browser retry guards cannot run until that request returns.

The new CLI-generated migration 20261021043045_non_retryable_conflicts.sql replaces only the quoted 40001 code with PT409 in four installed function definitions: save_research_project, restore_project_revision, assign_project_team and enqueue_research_job. It preserves their validation, version checks, locking, ownership, search path and grants. A real stale edit still fails once; it does not overwrite the latest cloud revision. Identical retries retain the no-write reconciliation from 007. Reapplying the hotfix is safe. Previously applied migrations are unchanged.

## Live repair

The user authorized applying the fix in the signed-in Supabase dashboard. The preflight found nine active save requests and all four affected functions using the retryable code. The hotfix was applied through SQL Editor at approximately **10:05:06 IST**.

Afterward:

- All four functions reported no remaining quoted 40001 and a present PT409 code.
- Active save requests fell from nine to zero without terminating a backend or restarting the project.
- A guarded SQL probe submitted a deliberately different configuration against a stale version, caught exactly PT409 and left the project unchanged. Unexpected success would have raised an error and rolled back the statement.
- The dashboard result was observed_conflict_code=PT409, corrected_rpcs=4, active_looping_saves=0.
- Fresh Postgres logs searched with %VERSION_CONFLICT% for **10:06:00–10:07:37 IST** returned zero matches. The nine final PT409 responses at 10:05:06 closed the old requests; historical 40001 entries remain in older log windows.

The Supabase Security Advisor linter was rerun after the repair: zero errors, with the same 16 warnings shown before the rerun. This was not a separate review or remediation of those existing warnings.

No database rows, research history, credentials or role grants were changed. The dashboard CPU warning was still visible during verification; no new CPU percentage or provider upgrade is claimed. The database fix does not require a Vercel/Render redeploy to become active. Keep the existing notification-driven Render worker from the preceding release.

## Tests

- Actual PostgreSQL WASM: 60 checks passed, including exact PT409 codes for all four conflict cases, unchanged access rules, immutable data and safe hotfix reapplication.
- Frontend/shared: 194 passed, one pre-existing opt-in integration skip.
- Authenticated browser fixtures: four passed. A rejected save makes one request; dismissing recovery, continuing edits, and reopening recovery do not repeat it. Owner/editor reapplication works; viewer saves remain denied.
- Combined API/worker protocol fixture: schema-2 metadata, checked publication, zero idle service requests, second-submission wake and one-shot abandoned-lease recovery passed.

These local fixtures do not implement the real PostgREST transaction retry engine. The actual cause is supported by the provider's documentation and the live database/log checks above. Production app code did not change in this hotfix, so the previous build/browser smoke remains applicable.

## Recovery elsewhere

Apply the hotfix after 007, then run VERIFY_NON_RETRYABLE_CONFLICTS.sql. If any previously looping session remains, inspect pg_stat_activity and match its PID, start time and query against current error logs before terminating that one backend. Do not terminate every authenticator connection or delete saved data. In this incident the sessions stopped after the function update, so termination was unnecessary.

Supabase SQL Editor changes were applied directly, without manually fabricating CLI migration-history rows. The committed migration is idempotent for a later normal migration deployment.

Primary sources:
- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
- https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes
