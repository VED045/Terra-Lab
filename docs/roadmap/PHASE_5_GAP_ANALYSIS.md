# Phase 5 gap analysis

Audit date: 2026-10-20. Source baseline: `8dc4fdcc7bf4a997e77c28c1d0e0b74e48f9703e` (`main`), clean before this documentation-only audit.

## Scope and approval boundary

This is the planning deliverable required by the supplied Phase 5 brief. No Phase 5 application feature, shared schema, migration, hosted setting, or scientific algorithm has been changed. The brief requires: “First deliver the gap analysis and prioritized plan” and “Stop and wait for explicit approval before implementing Phase 5 features.” Its new approval gate controls this phase. Earlier push authorization covered the completed preceding work; this planning delivery is not pushed.

The user's specific requests are included: physical obstacle dimensions, dashboard palettes, five top-positioned action tooltips, clearer laboratory parameter effects, easier project renaming, and simulations longer than one minute. These take priority within the proposed usability work.

## Evidence and confidence

| Evidence category | What is established | What remains unestablished |
|---|---|---|
| Source inspected now | Workspace, project metadata saving, run comparison, parameter controls, theme selectors, simulation playback, Zod/Pydantic contracts, SQL collaboration/versioning, worker publication, 3D coordinate rules | Source inspection alone does not demonstrate runtime success |
| Previously tested locally | Phase 4B completion report records 173 JS tests, 186 Python tests, 44 SQL checks, 34 normal browser cases, 4 authenticated fixture cases, build and production browser smoke; separate scientific and worker integrations also passed | Those checks were not rerun for this documentation-only audit; fixtures are not hosted Auth/Storage acceptance |
| Previously observed on hosting | Workspace update report records public frontend 200 and Render health 200 before that update; user reports deployed services and migrations through 004 | Current deployed SHA, migration definitions, real multi-account permissions, worker readiness, cold-start recovery and actual queued result publication were not verified by this audit |
| Proposed | All subphases below | No proposed feature should be described as implemented, tested, or hosted-verified |

Earlier Phase 4A documents describe their own historical baseline as uncommitted and not deployed. They are retained as dated evidence, rather than interpreted as the current Git state. The later Phase 4B report and current Git baseline supersede those historical commit statements; they do not close the hosted acceptance gate.

## Concrete requests: existing behavior and gaps

| Request | Actual implementation | Gap and recommended treatment |
|---|---|---|
| Buildings, walls and obstacles have depth and Z height | `packages/shared/src/model.ts` defines obstacle `width` and `height` as XY footprint dimensions. `scene-renderer.tsx` extrudes footprints using a global illustrative view preference. No per-obstacle vertical dimensions exist. | Preserve existing `height` as footprint Y depth. Separately add explicit optional vertical height/base elevation under an approved compatibility contract. Label inspector dimensions Width (X), Depth (Y), Height (Z). Do not turn XY `height` into Z. See proposed 5B. |
| Dashboard follows theme | `studio.tsx` applies `research-page theme-*`. In `globals.css`, dark/light include that surface, but the eight other palette selectors cover only `.studio`, `.dialog-content`, `.tooltip`. | Confirmed selector coverage defect. Include the dashboard surface for every palette, verify tokens/contrast and navigation. No new theme system needed. |
| Tooltips above Run baseline, Run demo, Lab, Load benchmark, Run reproducible experiment | Existing Radix tooltip wrapper is designed for icon tools. These text actions use ordinary buttons. | Reuse existing tooltip infrastructure, set side to top, support keyboard focus/touch access and disabled-state explanations; retain concise visible labels. |
| Explain laboratory parameters and effects | `labParameters` already supplies units, bounds, defaults and descriptions; `laboratory-dialog.tsx` renders them below number/slider controls. Object controls have descriptions too. | Improve scanability and explain directional effects/assumptions where absent, including model applicability. Cover model/estimator/sweep selectors as well as numeric fields. Do not promise lower error or better robustness for every configuration. |
| Change project name | Dashboard Details already has Rename via browser `prompt`, with role checks and metadata saving that preserves live geometry and undo history. Studio breadcrumb displays a name without editing. | Discoverable Rename action and accessible validated dialog in studio/dashboard. Keep 1–80 trimmed characters, expected revision, local-draft preservation and viewer publication denial. Reuse existing save path. |
| Simulation beyond a minute | Baseline settings UI and shared schema already allow 1–3,600 seconds. Playback reads project duration. Laboratory UI/shared/Python allow 0–300 seconds. | No one-minute hard limit was found in these paths. Make the two durations explicit, add useful presets and tests at 120+ seconds. Preserve current computation budgets; do not automatically raise maximums. If a hosted run still stops at 60 seconds, capture job/HTTP evidence and diagnose that separate failure. |

## Phase 5 platform coverage

| Area | Implemented now | Material gaps |
|---|---|---|
| Project workspace | My, recent, shared, starred, archived, experiments, templates and Teams views; name search; sorting; role/revision/update indicators; duplicate, archive/restore, JSON import/export and details | Team-specific project filtering; owner/type/date/status filters; last-editor summary; network/configuration/recent-run overview. Index requests cap categories at 200 rows, so current search is bounded. Duplicate/archive/restore lack consistent explicit confirmation. |
| Invitations and permissions | Owner/editor/viewer RPC/RLS; direct/team role composition; creation/redemption/expiry/revocation; private storage; scope warnings | Better capability preview and recoverable invitation errors/re-invitation flow. Invitations are reusable until expiry/revocation and grant project history access; revoking a link does not remove accepted members. Hosted behavior pending. |
| Activity | Revision author/timestamps, jobs, run logs and artifact provenance provide some event evidence | No unified append-only activity table/feed was found. Do not describe existing records as a complete audit trail or real-time notifications. New authoritative event writes require server/database work. |
| Concurrent editing | Expected-version saves reject stale writes; revisions immutable; local draft remains after conflict; reload/copy guidance | No dedicated local-versus-latest conflict comparison or selective reapply UI. Use existing configuration diff as a foundation, but merge objects by ID, not array position. No live synchronization/presence system. |
| Comparison | Two saved runs can show recursive request/configuration differences. Frozen requests and rerun-as-copy exist. Laboratory compares estimators on matched observations within a run. | No first-class cross-run metrics/CDF/residual/trajectory comparison, compatibility classification or combined export. Independent runs must not be implied to have paired observations merely because seeds match. |
| Reports and provenance | Complete JSON, epoch CSV, publication charts/PNG/SVG/PDF and manifests; private derivatives, hashes and source references; synthetic limitations stated | Named report collections, comparison reports and methodology templates. Need explicit imported/modified lineage and distinction between raw results and derivatives. Hashes are integrity checks, not signatures or scientific validation. |
| Scientific validation | Deterministic/noisy fixtures, multiple models/estimators, failure accounting and covariance/filter diagnostics; methodology documentation | Pre-registered controlled studies across all requested sensitivities, misspecification and consistency coverage. No hardware-environment validation; no full MBWDE or true XYZ scientific contract. |
| Optional 3D | Lazy renderer, navigation/projections/presets, shared selection and XY editing, layers, view-only controls, stored scientific XY overlays and WebGL recovery; bounded performance fixture | Per-object physical Z dimensions, reusable persisted view presets, deterministic visual regression and broader GPU/browser/soak coverage. Current estimates/covariances remain horizontal. |
| Operations | Combined supervised Render API/worker, queue leases/heartbeats, fenced publication, retries/expiry/cancellation; workload/queue/artifact caps | Hosted acceptance, readiness vs liveness, queue/resource observability, full database/browser validation parity, reviewed retention/orphan cleanup, request/lifetime quotas and tested backup restoration. Do not raise limits first. |
| Onboarding | Templates, moving demo, benchmark, model documentation and existing parameter descriptions | Requested action help, parameter-effect explanations, searchable contextual help/checklist and clearer supported-duration controls. Avoid decorative redesign. |

## Risks and dependencies

1. **Schema semantics:** Changing obstacle `height` meaning would alter geometry, obstruction and old scientific requests. Proposed 5B must be additive, keep missing Z unknown, preserve immutable runs and document old-client field loss before implementation.
2. **Validation parity:** SQL currently checks broad project structure, not every nested Zod constraint (Phase 4A R02). New physical dimensions need browser, API and database validation at their respective boundaries. The Python laboratory currently preserves original object extras but does not specifically validate new vertical dimensions.
3. **Permissions:** Direct/team grants compose; every new conflict, activity, report or filter endpoint must use effective access. No client button is an authorization boundary. Revocation cannot recall downloaded files or browser-local copies.
4. **Immutable provenance:** Reports/comparisons consume stored results; edits and reruns create distinct configurations/records. No regeneration over historical output.
5. **Compute:** Baseline duration, laboratory duration, sample interval, trials, grid and sweep multiply work. Existing laboratory caps are 100,000 estimator epochs and 500,000 stored anchor observations; it supports at most 100 network objects, versus 500 in the editor. Keep caps and make rejection actionable.
6. **3D interpretation:** Physical object dimensions can describe a scene without becoming inputs to the currently approved 2D obstruction/range/estimation models. Full XYZ physics needs an independent scientific phase, model version and validation.
7. **Hosted gate:** User-reported migrations and healthy HTTP endpoints do not establish hosted security or worker acceptance. Operational expansion and destructive cleanup depend on controlled staging tests with explicitly scoped accounts/data.

## Recommendation

Approve only 5A first: the requested palette fix, action explanations, discoverable rename, improved parameter help and clear duration controls using current limits. It has immediate value, no data migration and no numerical change. Then approve 5B separately for per-obstacle physical dimensions after reviewing its compatibility proposal. Collaboration/conflict improvements follow in small changes, building on the existing implementation.

See [priorities](FEATURE_PRIORITIES.md) and [subphase plan, acceptance criteria and tests](PHASE_5_IMPLEMENTATION_PLAN.md).

## Source evidence

- `apps/web/components/research-dashboard.tsx`, `studio.tsx`, `simulation-settings.tsx`, `laboratory-dialog.tsx`, `laboratory-object-controls.tsx`, `ui/tool.tsx`, `ui/number-field.tsx`
- `apps/web/app/globals.css`; `apps/web/lib/research.ts`, `persistence.ts`, `store.ts`, `laboratory.ts`, `scene-model.ts`, `scene-view.ts`
- `packages/shared/src/model.ts`, `laboratory.ts`; `services/api/terralab/lab_models.py`, `reports.py`, `worker.py`, `runtime.py`, `main.py`
- `supabase/migrations/202610200002_research_platform.sql`, `202610200003_export_artifacts.sql`, `202610200004_acceptance_security.sql`
- `docs/acceptance/SECURITY_REVIEW.md`, `ACCEPTANCE_MATRIX.md`, `DEPLOYMENT_READINESS.md`; `docs/WORKSPACE-UPDATE-VERIFICATION.md`; `docs/3d/COMPLETION_REPORT.md`, `COORDINATE_MODEL.md`

## Subsequent authorization

The user subsequently approved proceeding with the roadmap and explicitly authorized pushing after verification. The approval gate in this initial planning document has been satisfied. See PHASE_5_IMPLEMENTATION_STATUS.md for implemented, locally tested and still-gated hosted work.
