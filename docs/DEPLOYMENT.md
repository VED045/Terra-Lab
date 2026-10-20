# Deployment and environment guide

No Vercel, Render or hosted Supabase deployment/migration has been performed by this implementation. The supplied public Supabase URL/key is insufficient to administer schema or provision services. Production deployment needs the user's explicit authorization and provider access; manual steps below are complete without asking for passwords in chat.

## 1. Supabase

1. Back up the existing database; test on a staging project/local stack. For this existing Phase 2 project, run `supabase/migrations/202610200002_research_platform.sql`, then `202610200003_export_artifacts.sql` in SQL Editor. Do not rerun migration 001. A fresh project applies all three in order, or `supabase db push` with a correctly linked CLI and migration history. If 001 was originally pasted manually, reconcile its history with `supabase migration repair 202610200001 --status applied` **after verifying it matches**, before CLI push.
2. Verify all research tables have RLS enabled, anonymous grants are absent, and the three buckets are private. See DATABASE.md and run the two-user checklist below. Do not widen policies to fix a client error.
3. Enable email/password Auth. Set Site URL to the final HTTPS frontend domain. Add exact approved local/preview/production redirect URLs; do not broadly allow arbitrary production domains. Keep hosted email confirmation enabled as desired. Configure production SMTP/rate limits in Supabase for real research peers.
4. Keep the public publishable key for the frontend/API. Obtain the **legacy service-role JWT** for the Render worker secret. This key has broad database/storage privileges; store it only as a Render worker environment secret. It is not needed by the Vercel frontend or Render API. Do not send it in chat, commit it, or prefix it `NEXT_PUBLIC_`.
5. Seed personal starter networks by creating real accounts and saving the built-in templates. `supabase/seed.sql` deliberately creates no credentials or public projects.

## 2. Render API and worker

Import the repository Blueprint `render.yaml`. It defines two separately billed services; deployment is manual (`autoDeployTrigger: off`). Match the Supabase region where practical; the example uses Singapore. The API plan is `0.5c-512mb`, and the single numerical worker is `1c-2g`. Check current provider pricing before provisioning. No persistent disk is assumed.

Both services build the root Dockerfile. Startup commands:

```sh
# API (Docker CMD expands Render's PORT):
uvicorn terralab.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --limit-concurrency 32 --timeout-keep-alive 5
# Separate background worker (no inbound port or web health path):
python -m terralab.worker
```

| Render API variable | Value |
|---|---|
| TERRALAB_ENV | production |
| TERRALAB_JOB_MODE | supabase |
| SUPABASE_URL | your HTTPS project URL |
| SUPABASE_PUBLISHABLE_KEY | public key |
| TERRALAB_CORS_ORIGINS | exact comma-separated frontend origins; no wildcard |

| Render worker variable | Value |
|---|---|
| TERRALAB_ENV | production |
| TERRALAB_JOB_MODE | supabase |
| SUPABASE_URL | same HTTPS project URL |
| SUPABASE_SERVICE_ROLE_KEY | legacy service-role JWT, server secret |

The image sets `PYTHONPATH`, single-threaded BLAS, a non-root user and unbuffered logs. The worker requires Supabase mode; API startup rejects production/local mode. `/health` is liveness and reports platform/scientific versions and job mode; it does not claim database/worker readiness. Verify readiness by submitting and retrieving an authenticated test job.

Queue correctness depends on PostgreSQL leases, not process memory/disks. Limits: 4 active jobs/user, 100 globally; 20,000 estimator epochs; 100,000 stored anchor observations; a conservative 15 MB estimated-output budget; final raw artifact ≤20 MB; cooperative 120-second compute budget. Covariance matrices scale quadratically, so high-anchor/hybrid requests may be rejected well below the epoch cap. The worker repeats validation for direct RPC submissions. Initial local benchmarks with 100 trials may exceed the conservative cloud budget; use 20 trials first. API requests ≤2 MB; signal proxy ≤32 KB; `/solve` proxy ≤200 KB; report trace input ≤2,000 rows. Two small CSI/report operations may run concurrently per API instance; these are not large batch endpoints.

Lease heartbeat every five seconds extends a 90-second lease. A crashed attempt restarts deterministically at most once, with a new lease and separate upload paths; exhausted retries become interrupted. Unclaimed jobs expire after 24 hours when a worker polls again. Cancellation is cooperative; it is not an immediate process kill. A graceful shutdown publishes partial output when possible. A sudden kill can lose the in-memory partial calculation; the request and last durable progress survive for restart. No automatic partial-epoch resumption is claimed. Orphan chunks from unsuccessful attempts require administrator lifecycle cleanup. Run one worker initially; test additional workers and database load before scaling.

## 3. Vercel frontend

Import the existing GitHub repository, select Next.js and set **Root Directory `apps/web`**. Enable inclusion of files outside the root directory, needed by the workspace package/lockfile. `apps/web/vercel.json` installs/builds from the monorepo root and outputs `.next` relative to `apps/web`. Use Node 24.x as tested, or a currently supported Next.js-compatible version. No Python science runs in Vercel Functions.

Set Production/Preview environment variables explicitly:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-key
SIMULATION_API_URL=https://your-render-api.onrender.com
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is an optional legacy fallback. The `SIMULATION_API_URL` is server-only. Never put the worker key in Vercel/public configuration. Rebuild after changing public variables. Frontend production job/signal/PDF proxies require a bearer session; backend/PostgREST performs actual authorization. Large job output travels directly from private Storage, not through a multi-megabyte Vercel response.

Deploy the frontend after configuring Render, update Supabase redirects and API CORS to its final domain, then rebuild/redeploy any changed environment configuration. A successful local Next build is not an actual Vercel deployment. Docker is not installed on the implementation host; the image/Blueprint are supplied but no container build or provider provisioning is claimed.

## Production acceptance checklist

Use separate real owner/editor/viewer/stranger accounts in separate browser profiles. Record service URLs, commit SHA, database migration versions and results.

1. Register, confirm email, log in, refresh session, edit profile and log out. Check session badge and allowed redirects.
2. Save a new project, reload its structured config, rename/duplicate/archive/unarchive/star/search, create/restore revisions. Edit in two tabs: the stale save must return VERSION_CONFLICT; saving a copy preserves both versions.
3. Give editor/viewer access via direct grant and team, then test authorized/unauthorized reads, edits, deletes and exports through direct REST/RPC as well as UI. Never use the service key for a user permission test.
4. Create/redeem/expire/revoke each invitation kind; remove accepted members explicitly. Verify shared experiment results/raw chunks disappear from server reads after all direct/team grants are removed. Downloaded copies cannot be revoked.
5. Submit a small experiment. Verify progress, cancellation, immutable metrics/config/raw hashes, reload from another authorized browser, comparison and new-run rerun. Retry the identical idempotency key and confirm one job. Change the request with the same key and confirm a conflict.
6. Restart the worker mid-run, confirm lease expiry/retry and stale-publication rejection. Stop all workers, queue a job, restart and recover. Verify retry-exhaustion/abandoned failures and that they remain visible without fake result artifacts.
7. Export JSON/CSV/PNG/SVG/PDF/manifest from an actual run. Inspect labels/units/failures/figures, append a small export artifact, reload/download/check hash. Test unauthorized Storage access directly; do not treat a hidden UI button as proof.
8. Confirm `/health`, frontend/API communication, production builds, resource-limit errors, no client-visible service secrets, private bucket configuration, backup/retention and provider logs.

References used for configuration: [Supabase functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Render workers](https://render.com/docs/background-workers), [Blueprint reference](https://render.com/docs/blueprint-spec), [Vercel environment variables](https://vercel.com/docs/environment-variables/framework-environment-variables).
