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


## Hosted repair and UI follow-up — 21 October 2026

The owner subsequently authorized applying the collaboration migration to the hosted Terra-Lab project (rkhtwvsryzldikzfwrbj). Read-only preflight confirmed the existing save/conflict/activity prerequisites were already installed; the migration ledger was empty because earlier schema had been installed outside it. Only the collaboration migration was applied, preserving existing projects and grants. Supabase recorded it as version **20261021154113**, name **collaboration_center**, containing the exact checked-in SQL from supabase/migrations/20261021064834_collaboration_center.sql. Do not blindly replay all repository migrations against this existing database: reconcile ledger history first when adopting CLI migration deployment.

Hosted verification confirmed collaboration_state() exists, authenticated has EXECUTE, anon does not, and RLS is enabled on peer_profiles, access_requests and collaboration_notifications. A schema-cache reload was issued. A real HTTP POST to /rest/v1/rpc/collaboration_state with the public key returns the expected anonymous permission denial (SQLSTATE 42501), rather than PGRST202/function-not-found. No real user data was read or written by that HTTP probe.

Custom SMTP was confirmed disabled. The owner explicitly approved unverified signup on the hosted **main Production** project for development/testing after a first approval review correctly identified the target-label mismatch. Confirm email was disabled and the saved setting survived a dashboard reload. A real GET /auth/v1/settings returned email enabled and mailer_autoconfirm=true. No confirmation email was sent and no real hosted test accounts were created. Full hosted multi-account lifecycle/concurrency acceptance remains pending; these configuration/RPC checks do not substitute for it.

The security advisor reported the existing intentional authenticated SECURITY DEFINER RPC boundary (22 functions) and disabled leaked-password protection. RPC authorization remains checked in SQL and the local RLS/lifecycle suites. There were no missing-RLS findings. References: [RPC execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection advisory](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No unrelated authentication policy was changed. Email ownership is not proven while confirmation is disabled, including for opt-in exact-email discovery.

UI follow-up: Network objects collapses to a keyboard-accessible rail, remembers its view preference and expands for the search shortcut. Simulation explains why the baseline uses distance plus noise and defines each equation symbol. Every delete action uses red, with contrast checks across all ten themes. Monochrome palette tests retain grayscale assertions for all remaining tokens and now explicitly require readable red for destructive actions. Signup distinguishes an immediate session from a confirmation-required response, explains project-wide email limits, prevents overlapping submissions and persists a minimum retry pause across email changes/reloads without blocking sign-in.


Final follow-up validation: 206 unit tests passed with one existing skip; TypeScript passed; 60 database checks and 19 collaboration security/lifecycle groups passed; all 208 Python tests passed; all seven authenticated browser tests passed. The full editor browser run passed 49 cases and exposed a setup/selector mistake in the newly added style test (unsaved project, then a summary queried as a button). After correcting setup and using the existing accessible label, both new panel/model/style cases passed on rerun. All 50 distinct editor browser cases are covered; no assertions were weakened. The optimized build and isolated production 2D/WebGL/3D/save/reload/mobile/comparison/PNG smoke test passed. React component review covered hook cleanup, duplicate-submit protection, semantic model definitions, keyboard focus and hidden-panel controls. No new dependencies were added.

A hosted read-only transaction also executed collaboration_state() as authenticated with a synthetic empty identity, checking the result shape and zero unread count, then rolled back. No actual hosted account was impersonated or created. The HTTP probe and configuration checks above are the extent of hosted acceptance in this follow-up.
