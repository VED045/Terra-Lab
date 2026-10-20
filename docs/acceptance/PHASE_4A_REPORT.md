# TerraLab Phase 4A report

20 October 2026. Continued the actual Desktop repository from clean commit `e2e84ba0e0dffe033675db26fffc9e0fa4dafc52`. Read the phase reports, scientific methods, architecture/database/API contracts, deployment files and relevant editor/auth/persistence/worker/test code. Current source snapshot contains 159 tracked/nonignored files; hashes are in `AUDIT_EVIDENCE.json`.

**Outcome: local audit and in-scope fixes completed; hosted/production acceptance remains PENDING.** Changes are in `C:\Users\Ved\Desktop\TerraLab`, uncommitted. No GitHub push, public deployment, provider provisioning, hosted migration or real-user data mutation occurred. No 3D or unrelated feature development was started.

## Executed commands and results

Run from `C:\Users\Ved\Desktop\TerraLab` unless stated otherwise:

| Command | Final result | Evidence |
|---|---|---|
| `npm test` | 145 passed; one existing integration is opt-in | `logs/javascript.txt` |
| `RUN_SCIENCE_INTEGRATION=1` with isolated `SIMULATION_API_URL`, then `npm exec vitest -- run apps/web/app/api/laboratory/integration.test.ts` | 1 separately passed against an owned temporary Python API | `logs/optin.txt` |
| `npm run test:python` | 178 passed; one upstream Starlette/httpx deprecation warning | `logs/python.txt` |
| `npm run test:database` | 44 checks passed with real PostgreSQL/RLS/RPCs in PGlite | `logs/database.txt` |
| `npm run test:worker` | PASS; actual FastAPI/Python computation with local PostgREST/Storage protocol fixtures; 18 noiseless estimator epochs <1e-6 m | `logs/worker.txt` |
| `npm run test:e2e` | 24 passed serially, all assertions retained | `logs/browser-serial.txt` |
| `npm run typecheck` | PASS | `logs/typecheck.txt` |
| `npm run build` | PASS, five application/API paths plus not-found generated | `logs/build.txt` |
| `git diff --check` | PASS | Local final Git review |
| `node --check scripts/test-hosted-acceptance.mjs` | PASS; syntax only, no external mutations | Hosted harness retained for review |
| Secret-shaped literal scan | No secret-key/service-role-JWT literals found in nonignored source or 29 generated client JS files | `AUDIT_EVIDENCE.json`; heuristic check, not a complete security guarantee |

The full suite was baselined before fixes: 145 JS / 103 Python / 31 SQL checks, worker, type-check and build passed; browser discovery failed. Numerical tolerances, assertions and existing tests were not weakened or converted to skips.

## Corrective changes

1. Require current project access before a former job submitter can cancel. Red SQL regression initially reproduced the authorization bypass.
2. Restrict raw result downloads to exact chunks of a published immutable run; deny unpublished and stale-attempt fragments.
3. Serialize global queue capacity count/insert across users; test job 100 succeeds and 101 fails.
4. Enforce the 128-artifact limit on uploaded objects as well as metadata, including unregistered uploads. Red SQL regression initially admitted object 129.
5. Preserve active unsaved geometry and undo when archiving/renaming; warn before replacing dirty edits with a restored cloud revision. Red browser regression initially changed X=99 back to X=45.
6. Finish local snapshot persistence/feedback before clearing the laboratory polling effect's active state. Existing browser snapshot assertion exposed the cleanup race.
7. Add observation-only WLS initialization for angular robust fits. The new AOA/Huber case originally had 0.000263471965 m noiseless error against the unchanged 1e-5 m tolerance. All 62 declared model/estimator first-fix combinations now pass that tolerance. Scientific measurement/filter equations and existing output snapshots are unchanged.
8. Repair browser CommonJS fixture loading, stale library selectors and missing API startup; isolate the web/API ports/data/cloud settings and retain complete browser workflows.

SQL fixes are in new migration `202610200004_acceptance_security.sql`; existing migration files 001–003 were not rewritten. It has been executed only in fresh local fixtures. The existing project needs its actual ledger/backup verified before deciding the missing ordered set, expected to be 002 → 003 → 004 when only 001 is present. **Do not rerun 001 or apply hosted SQL without approval.**

## Browser, scientific and visual evidence

The actual local browser → Next → Python run completed, saved to IndexedDB, exported complete JSON, SVG, PNG, PDF, CSV and reproducibility manifest, then retained identical run data after workspace edits/reload. It is not a fixture-only experiment pass. Existing large-result display and CSI browser tests deliberately use committed generated-output fixtures and are labelled separately in the matrix.

The exported PDF is a real five-page document. All pages were rendered and visually reviewed for figures, units, summary tables, parameters and appendix; text checks retain synthetic assumptions, sampled-plot disclosure, seed and RMSE. Selected dark desktop, light desktop, library and mobile captures were reviewed. All ten palette selections/persistence are automated; exhaustive theme × viewport visual QA is not claimed.

The two-worker browser run had 23 passes and one export-workflow page reload. Route warmup did not eliminate it. The same workflow and all 24 cases pass serially; default local harness now uses one worker. Parallel logs are retained, and independent hosted session/concurrency acceptance remains pending. This limitation was not hidden by a skipped test or a relaxed assertion.

## Hosted evidence and remaining actions

Read-only public Auth settings returned 200 with email enabled and confirmation required. Anonymous project HEAD returned 401. Phase 3 table HEAD probes returned 404; the schema is not exposed at those endpoints, but this does not prove the exact live migration ledger. No project rows, result contents or user records were read. See `HOSTED_READ_ONLY_PROBE.json`.

The live-Auth staging subset harness was prepared and syntax checked. **Automatic approval review rejected its execution** because no exact external staging destination and test-project create/delete scope had been approved. It was not executed or retried through a workaround. Saving its source and static syntax checking were the safe alternative.

Production remains blocked on:

- Explicitly approved disposable staging target, four isolated real identities and supported invitation-flow verification.
- Verified target migration ledger, restorable database/Storage backup and approval for each missing migration.
- Real positive/negative shared-run and known-existing-object Storage HTTP tests, revocation/account switching/token lifecycle and stale-save recovery in independent browsers.
- Actual overlapping PostgreSQL/queue tests, worker-kill/provider restart, final publication and retention/orphan cleanup verification.
- Docker/Linux build, Vercel/Render provider configuration/deployments, exact CORS/Auth redirects, secret placement and authenticated-job readiness.
- Documented limits: partial nested SQL project-schema parity, downloaded cache retention, service-role trust, account-level resource quotas, experimental CSI and synthetic-only positioning accuracy.

## Deliverables

The repository contains the four required files under `docs/acceptance/`: `ACCEPTANCE_MATRIX.md`, `COLLABORATION_TEST_PLAN.md`, `SECURITY_REVIEW.md` and `DEPLOYMENT_READINESS.md`, plus this report. Source/tests/migration are applied locally. The review archive contains only changed source/doc/test files, no credentials or environments. `TerraLab-Phase4A-tracked.patch` covers tracked-file diffs; added files are included as ordinary paths in the archive. Its baseline is recorded in `CHANGE_FILES.json`.

This phase stops at the acceptance gate. It does not authorize hosted mutation, deployment, pushing to GitHub, or the next feature phase.
