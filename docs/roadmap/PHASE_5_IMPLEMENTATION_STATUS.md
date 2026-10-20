# Phase 5 implementation status

2026-10-21. Base: 8dc4fdc. The user approved the roadmap and explicitly authorized pushing after verification. This report distinguishes delivered code from hosted acceptance and later scientific capabilities.

| Subphase | Implemented | Verification / remaining boundary |
|---|---|---|
| 5A usability | All ten dashboard palettes; top action tooltips and accessible descriptions; parameter effects; discoverable validated rename; explicit baseline/lab duration presets and planned-work guidance | Local unit/browser checks; baseline up to 3,600 s and lab up to 300 s retained, no larger compute caps |
| 5B dimensions | Optional per-obstacle physical Z height and base elevation, independent extrusion, camera bounds and readouts; XY width/height semantics retained; schema 2 opt-in | v1/v2 round trips, invalid dimensions, unchanged horizontal results, 3D editing/persistence, deterministic Windows visual baseline, real built-app reload and combined schema-2 worker passed; live migration 005 still required |
| 5C1 workspace/sharing | Team-project view, loaded-index owner/team/type/date/cloud-run-status filters, editor/config/recent-run details, copy/archive/restore confirmation and permission preview | Local browser and SQL/auth fixtures. Search/filter scope remains 200 loaded rows per category; no new global pagination claim |
| 5C2 conflicts | Preserved draft, latest-revision comparison, ID-based selective object/settings reapply, export/copy and local recovery backup | Unit tests plus real browser fixture owner/editor successful expected-version reapply; viewer server denial retained. Two-way comparison, no automatic three-way merge/live editing |
| 5C3 recorded activity | Transactional append-only references for revisions, archive/restore/team assignment, direct/team access, invitations, job states, publication and derivatives | SQL grants/RLS/spoofing/revocation checks passed. Needs live migration 006; no historical backfill, no real-time notification claim and no server observation of offline report generation |
| 5D comparison | Two to four immutable runs; recorded full-data metrics, scientific differences, seed/model/dataset warnings, position/residual CDFs and selected trajectory cohorts | Full-precision JSON/CSV, hashes and failure accounting tested; actual PNG export tested in built app. CDFs bound points using full-data ranks; trajectories bound points and retain hidden failure gaps. Metrics do not use plotted samples |
| 5E reports | Named browser-local collections with reopen/export, complete source comparison JSON, manifest, CSV, SVG/PNG and printable methodology/results/limitations report; imported snapshot labels | Local browser and export tests; printable HTML uses browser Print/Save PDF; existing native per-run PDF remains. No cloud collection table or shared collection permission claim |
| 5F validation | Frozen 16-case / five-seed study matrix; 170 full estimator summaries, covariance diagnostics, negative results and source/environment references | Independent exact fixture and repeated full study execution passed; scientific metrics/observation hashes reproduce exactly, excluding environment-dependent runtime. Synthetic XY only |
| 5G 3D maturity | Separate versioned browser-local view presets, physical geometry, deterministic Windows Chromium visual fixture, bounded rendering | Existing 500-object test: 3,885 ms on local SwiftShader, 18 draw calls/14 geometries. Canonical camera preset/projection retained; free-orbit pose not saved. Other-platform visual references/long hardware soak remain unverified |
| 5H1 hosted acceptance | Reviewed procedure and target/account requirements documented | Not executed: no separate staging or isolated accounts supplied. User was given a plain-language staging explanation. Public health is not authenticated worker/permission acceptance |
| 5H2 operations | Backup/restore, retention inventory/dry-run, rollout/rollback and monitoring requirements documented | Operational expansion remains gated by H1. No live deletion, retention service, privileged metrics endpoint, cap increase, migration or recovery drill was performed |
| Separate scientific capabilities | MBWDE/XYZ feasibility and acceptance contract documented | No full MBWDE, vertical solver, RF volumes, hardware accuracy claim or new scientific algorithm shipped |

## Executed local checks

- JavaScript: 186 passed; one existing opt-in integration excluded by default. The full browser suite includes a real Next-to-Python experiment flow.
- Python: 197 passed; final targeted metadata-compatibility checks: 11 passed.
- Database: 52 checks passed against actual embedded PostgreSQL using fixture Auth/Storage tables.
- Full serial Chromium suite: 40 passed. Subsequent focused checks cover collection reopen, real SVG/PNG downloads, physical-height visual/persistence and the additional loaded-index filter and cancel/confirm save-copy cases; see final run output.
- Authenticated browser fixtures: 4 passed, including successful owner/editor conflict reapply preserving a remote title and viewer denial.
- Separate v1 worker and combined schema-2 worker: passed, each with actual numerical computation, 18 noiseless epochs, immutable hash-checked publication and unrelated-user denial.
- Optimized build/typecheck and built-app browser smoke: passed. Smoke blocks external browser requests and exercises default 2D, real 3D, camera/project stability, mobile width, cleanup, icon routes, schema-2 physical-height save/reload, run comparison and PNG bytes.
- Source and generated client chunks: no literal service-role JWT or long secret key detected. Numerical files physics.py, estimators.py, experiments.py and shared solver.ts are unchanged.

One later development-only reload encountered an incomplete Next JSON build manifest. Its failed result was retained during investigation; clearing only the verified generated dev cache after owned servers stopped made the same visual/persistence test pass. The built-app smoke also passed. No application error was hidden with retries. Upstream Three.Clock and Starlette/httpx deprecation warnings remain visible.

## Release requirements and limits

Apply missing migrations 005 then 006 once, after target/backup/definition review, before relying on cloud-saved physical dimensions or activity. No user-hosted migration was performed. V1 work remains readable without a forced data rewrite. An older client rejects a v2 project, preserving new metadata rather than silently stripping it; reload the current app after rollout.

Review [hosted acceptance](../operations/PHASE_5_HOSTED_ACCEPTANCE.md), [backup/retention/rollback](../operations/BACKUP_RETENTION_RECOVERY.md), [controlled studies](../research/PHASE_5_CONTROLLED_STUDIES.md) and [scientific feasibility](../research/MBWDE_AND_XYZ_FEASIBILITY.md). No hosted production-readiness claim is made by a GitHub push, fixture result or healthy public URL.
