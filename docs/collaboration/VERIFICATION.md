# Final verification — 21 October 2026

| Command | Actual final result | Duration |
| --- | --- | --- |
| npm run test:e2e | 46 passed (full existing browser suite plus delayed-response regression) | 309s |
| npm run test:e2e:auth | 5 passed (four independent collaboration sessions plus existing owner/editor/viewer and session tests) | 90s |
| npm run test | 194 passed; 1 existing skipped test / file (no assertions weakened, no new skips) | 3s |
| npm run typecheck | Passed | 3s |
| npm run test:database | 60 checks passed; unmodified migrations and actual PostgreSQL/RLS | 2s |
| npm run test:collaboration | 19 security/lifecycle groups passed; actual local PostgreSQL/RLS | 2s |
| npm run test:python | 208 passed; 1 existing Starlette/httpx deprecation warning | 8s |
| npm run test:worker | Passed; actual Python worker/local PostgreSQL and test-only Auth/Storage transport | 9s |
| npm run test:combined | Passed; combined supervisor, modern secret-key fixture, queue and immutable outputs | 9s |
| npm run build | Passed; optimized Next.js build includes /collaboration | 30s |
| npm run test:production | Passed; isolated optimized 2D/WebGL/3D/save/reload/comparison/PNG smoke test; external requests blocked | 18s |

All listed final commands passed in serial verification. Hosted acceptance remains pending; see TEST_PLAN.md. Local Auth/Storage transports are fixtures and PostgreSQL calls are serialized; hosted identity, exposure/advisors and true multi-connection contention were not validated. At that verification point, no hosted migrations, push or deployment had been performed. Source publication was subsequently authorized by the user.

Baseline: 194 unit pass / 1 existing skip; 60 database checks; 207 Python tests; 45 browser tests. Regression-discovered terminal checkpoint and metadata-only baseline-save races were fixed with deterministic tests. Local queued feedback now refreshes sooner without changing hosted polling. An earlier overlapping dev/build manifest error and a SQL quote error in the added trigger were repaired before their final affected checks passed.

## Follow-up: Projects navigation and blank projects

Home and Projects now have distinct navigation states, active indicators and dashboard/library headings. Projects resets stale search and filters. New Project defaults to a blank canvas with zero objects; existing starter networks remain selectable and workspace themes are preserved.

Affected browser verification: the five dashboard cases and two workspace cases passed across the follow-up runs, including the new Projects-reset and blank-project save/reload/manual-object-creation flows. An unsupported test matcher was corrected without changing the asserted behavior. Unit tests: 194 passed, one existing skip. TypeScript and the production build passed. The earlier full collaboration/scientific regression results above remain recorded separately.

The user explicitly authorized committing and pushing the complete upgrade after these changes. No hosted migration or manual deployment is part of this source publication.
