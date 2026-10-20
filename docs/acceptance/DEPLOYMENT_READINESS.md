# TerraLab Phase 4A deployment readiness

20 October 2026. **NOT PRODUCTION-READY. No deployment or hosted migration was performed.** Baseline source `e2e84ba`; acceptance patch is local/uncommitted. Build success is distinct from a provider deployment and live permissions acceptance.

## Status by environment

| Environment / claim | Status | Evidence |
|---|---|---|
| Local JavaScript, scientific Python, SQL/RLS and fixture worker | PASS with documented scope | 145 JS + separately enabled integration; 178 Python; 44 SQL checks; worker fixture |
| Local browser interactions | 24 passed (serial Chromium); parallel-run limitation retained | Every assertion retained; serial Chromium against owned loopback web/API services. Parallel reload failure is separately documented. |
| Local production compile/types | PASS | `npm run typecheck`, `npm run build`; no provider implied |
| Actual exported report | Five PDF pages rendered and visually inspected | Real browser-generated PDF, publication PNG/SVG, complete JSON/CSV/manifest; metrics retained |
| Existing Supabase `rkhtwvsryzldikzfwrbj` | PENDING upgrade/acceptance | Read-only Auth settings 200; anonymous projects HEAD 401; Phase 3 table probes 404. No project rows retrieved. |
| Live migration ledger/backup/buckets/RLS | NOT VERIFIED | Public key does not administer schema or read migration state. Read-only schema probes are insufficient to reconstruct the ledger. |
| Real Auth-issued user roles/private Storage | PENDING | No real isolated accounts/approved staging destination; prepared harness syntax checked only |
| Docker/Linux image | NOT BUILT | Docker unavailable on this host; Dockerfile reviewed only |
| Render Blueprint API/worker provisioning | NOT PERFORMED | Config reviewed, provider-side validation/runtime/plan capacity pending |
| Vercel deployment/custom origin/Auth redirects | NOT PERFORMED | Static configuration and local build only |
| Concurrent hosted edits/queue load/process restarts | PENDING | SQL locks and simulated lease tests are not a real provider load test |

## Reviewed configuration

`Dockerfile` uses Python 3.12 slim, non-root UID 10001, pinned API requirements, `PYTHONPATH`, single-threaded BLAS, loopback-only development versus externally bound Render command. No secret is copied from a project `.env`; `.dockerignore` excludes relevant local material. A real Linux build/runtime remains required.

`render.yaml` declares separate API and numerical worker, manual deploy trigger, Singapore region, API health path `/health`, and service-specific environment. The current [Render Blueprint reference](https://render.com/docs/blueprint-spec) documents the plan/trigger/shutdown fields used. This reference check does not validate a specific provisioned service or its capacity/cost. Confirm plans/region/pricing in the user's account before provisioning.

`apps/web/vercel.json` selects Next.js, monorepo-root install/build commands, `.next` output and 60-second proxy duration, with nosniff/frame/referrer headers. Vercel root `apps/web` must include workspace files outside that root. Next.js 16.4.2, React 19.3.1, Node 24.19.0 and the repository lockfile were used locally. No dependency upgrade was performed.

Production API import rejects filesystem job mode and wildcard CORS; new subprocess tests execute both guards. Explicit production origins and HTTPS backend/provider values still need operator verification. `/solve` remains the bounded public Phase 1 baseline computation; private experiment/state access uses JWT/RLS. `/health` is liveness, not DB/worker readiness.

| Service | Environment placement |
|---|---|
| Frontend | `NEXT_PUBLIC_SUPABASE_URL`, public publishable/legacy anon key; server-only `SIMULATION_API_URL` |
| API | `TERRALAB_ENV=production`, `TERRALAB_JOB_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, exact `TERRALAB_CORS_ORIGINS` |
| Worker only | Production/Supabase mode and URL; `SUPABASE_SERVICE_ROLE_KEY` in server secret storage |

The worker credential must never be in frontend/Vercel public variables, browser code, source fixtures, logs or screenshots. API user transport uses the caller's JWT/public key, not the worker credential. All local worker test keys are fake. Service-role privileges inherently bypass RLS, as described by [Supabase](https://supabase.com/docs/guides/storage/security/access-control); protect that boundary rather than treating RLS as protection against a leaked service secret.

## Exact migration preflight — read-only first

1. Confirm the project ref in Supabase Dashboard → Project settings and record whether it is disposable staging or the existing project. Confirm its owner and intended target. Do not infer target from an arbitrary environment file.
2. In the target SQL Editor, **read only**, inspect:

```sql
select version from supabase_migrations.schema_migrations order by version;
select to_regclass('public.projects'),
       to_regclass('public.project_revisions'),
       to_regclass('public.research_jobs'),
       to_regclass('public.research_artifacts');
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('projects','project_revisions','research_jobs',
                    'experiment_runs','research_artifacts','share_links',
                    'teams','team_members','project_members');
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('project-exports','research-results','research-artifacts');
```

If the migration-history schema/table is absent because 001 was pasted manually, record that fact and compare deployed definitions with source. Do not mark migrations applied merely to silence an error. Supabase documents its ledger and repair workflow in [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

3. Confirm a restorable database backup and separately preserve required Storage objects. Verify restoration in isolated staging, including Auth-related references and bucket/object policies. Record backup timestamp, target and operator. Database schema backup alone is not a backup of raw result bytes.
4. Review the complete SQL, existing rows, expected lock duration and staging test outcome. New 004 replaces cancellation and enqueue RPC bodies/result-read policy, and adds the checked artifact-upload function/policy. It does not drop user project/run tables or rewrite stored scientific outputs.
5. Present the exact confirmed target, backup and missing migrations for **explicit approval before any hosted change**. This audit has not passed that boundary.

## Intended approved migration steps

For an existing Phase 2 project with verified matching migration 001, the intended order is:

```text
202610200002_research_platform.sql
202610200003_export_artifacts.sql
202610200004_acceptance_security.sql
```

Do not rerun 001. If 002/003 are already verified applied, apply only missing 004. A fresh disposable staging database uses all four in order.

After approval, in SQL Editor run each reviewed missing file as a separate explicit transaction (`BEGIN;` + exact file contents + `COMMIT;`), stop on any error, and verify functions/policies before the next step. If using CLI instead, first verify linkage and history, inspect `supabase migration list` / `supabase db push --dry-run`, then obtain approval for the exact pending set before `supabase db push`. Repair of a manually applied 001 is a separate administrative history mutation and also needs verified equivalence/approval.

Do not restore the weaker pre-004 access policies as an ordinary rollback. If 004 cannot complete, its transaction must roll back; keep the service unavailable to untrusted collaborators until corrected. For a post-commit defect, prefer a reviewed forward fix or an approved backup restore plan. Backups and data/Storage restoration are operator actions, not silently performed by this audit.

## Hosted service steps after separate approval

1. Provision the reviewed staging Render API/worker with the exact environment placement above; validate actual Docker build, private credentials, production startup, plans and logs.
2. Provision/build the staging Vercel frontend using root `apps/web`; configure the server API URL and public Supabase values. Verify the generated client contains no worker secret.
3. Set exact HTTPS CORS origins and Supabase Site URL/redirect allowlist for the approved staging domain; verify registration/confirmation/token refresh/logout. Keep production confirmation enabled according to the user's chosen policy. Do not widen redirect/CORS patterns to hide errors.
4. Execute H01–H11 with independent isolated accounts. Positive authorized chunk downloads and negative outsider/revoked requests must use known existing published artifacts.
5. Verify actual job readiness, cancellation, worker kill/retry, queue overlap, failed publication, retention/orphan cleanup dry run, logs, alerts and backup restoration. Startup/liveness alone is insufficient.
6. Record results and remaining risks. Obtain separate production deployment/migration approval after staging acceptance. No public deploy, GitHub push or infrastructure change is authorized by this document.

## Outstanding decisions

An exact staging target, isolated accounts, provider access and explicit create/delete test-project scope are required to execute the supplied hosted subset. Automatic approval review rejected execution without that destination/scope; only its source and syntax check were completed. Native device sharing, full all-theme visual combinations, alternate browsers, complete database/browser schema parity, real overlapping transactions, provider resource capacity and automated orphan cleanup remain unverified or limited as identified in the other acceptance documents.
