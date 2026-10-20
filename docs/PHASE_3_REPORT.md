# TerraLab Phase 3 delivery report

20 October 2026 · platform 0.3.0 · positioning model 0.2.0 · project schema 1

**Delivery status:** Phase 3 code, local automated validation, research examples and deployment configuration are delivered in `C:\Users\Ved\Desktop\TerraLab`. Hosted migrations, Vercel/Render provisioning, live Supabase Auth/Storage and browser acceptance have **not** been performed. The production acceptance gate remains open; this report does not claim an already deployed or fully verified multi-user service.

**Required next action for the existing cloud project:** apply migrations **202610200002** and **202610200003**, in that order. Migration 001 is already part of Phase 1/2 and must not be rerun. Signed-in cloud saves now require the checked versioned RPC; there is deliberately no fallback that silently overwrites a peer's revision. [Exact setup and deployment steps](DEPLOYMENT.md).

## Completed features

- Research workspace: owned, recently opened, shared, starred and archived networks; recent local/cloud experiments and failed job metadata; saved structured templates; teams; search/sort, copies, archive/restore and owner-only deletion of projects without immutable history. The initial index is bounded to 200 accessible rows/table; local recent history is browser-specific.
- Locked expected-version saves, immutable author/timestamp/config revisions and restore-as-new-revision. Save-copy/reload conflict recovery retains working edits. Saves completed during an edit advance version metadata without erasing those edits; undo/redo retains the latest accepted version.
- Explicit owners, team/direct viewer/editor grants, authenticated invitation tokens with 244 random bits, SHA-256 storage, seven-day expiry and revocation. All invitation kinds grant the project's whole history/export scope; snapshot/report kinds are viewer-only. Existing accepted membership is removed separately. No unsolicited invitation email or unreliable live editing layer was added.
- Immutable worker-published runs retain exact configuration, measurement/estimator/mobility/environment settings, seed, scientific software version, timestamp, environment, metrics, raw observations/residuals/matched hashes, failures, runtime and logs. Rerun creates a new project/run. Nested configuration comparison includes per-object changes and arrays.
- Private worker result chunks with full byte-count/SHA-256 manifests; direct authorized Storage retrieval; optional append-only derived export history with actor/hash provenance. Old per-user Phase 2 cloud backups remain separate from authoritative worker history. Downloads already obtained cannot be recalled by revoking access.
- Scientific JSON/CSV/PNG/SVG/PDF and reproducibility manifests. Publication titles, axis labels/units, legend and dimensions are configurable. SVG CDFs use complete stored data with bounded trace display; PDF trajectories/CDFs use a clearly labelled sample while all summary metrics use the complete run. Real generated PDF includes layout/trajectory figures, methods, configuration, units, seed, failures, runtime, assumptions and limitations. CSV text cells guard against spreadsheet formulas.
- Persistent PostgreSQL queue, four active jobs/user and 100 globally, UUID idempotency keys, lease-fenced worker claims/publication, progress, cancellation, retry/abandon handling and safe error/log persistence. Raw results publish only after all chunks upload. Production refuses local-filesystem-only mode; small local development mode is preserved.
- Separate synthetic CSI module: explicit complex frequency-domain channel, paths/delays/gains, bands/bandwidth/spacing, snapshots, SNR and calibration error; conventional matched scan, inverse-noise weighted scan, experimental MUSIC and restricted single-band Hankel ESPRIT. Unsupported assumptions are rejected/labelled. Full MBWDE is a documented research gap.
- Root non-root Dockerfile, explicit Render API/worker Blueprint, Vercel frontend settings, environment reference, three versioned Supabase migrations, private buckets/policies, safe seed and local setup. Architecture, algorithms, API/schema, user/troubleshooting/deployment/reproduction guides and research matrix/progress are updated.

## Executed verification

The checks below were executed against the final Desktop checkout, after dependency repair. The existing running Next process locked its native binary during `npm ci`; `npm install --ignore-scripts` successfully repaired dependencies in place. No user dev process was stopped. The lockfile matches the reviewed source.

| Check | Actual result / scope |
|---|---|
| `npm test` | **145 passed, 1 skipped by default**. Includes existing editor/scientific/theme/auth tests and new state-race, manifest/chunk round-trip, configuration diff, publication/escaping, session forwarding and streamed-size tests. |
| `npm run test:python` | **103 passed** (all 85 prior tests plus 18 Phase 3 cases). One upstream Starlette/httpx deprecation warning; no test tolerance weakened. |
| `npm run test:database` | **31 checks passed**, executing all migrations and real PostgreSQL grants/RLS/RPCs in PGlite. Auth/Storage service tables are explicit minimal fixtures. |
| `npm run test:worker` | **PASS**: real FastAPI + Python worker + migrated PostgreSQL, local PostgREST/Storage protocol fixtures, idempotent duplicate submission, outsider denial, lease/finalization and checked immutable chunks. **18 actual noiseless estimator epochs**, each error <1e-6 m. This is not hosted Supabase JWT/Storage validation. |
| Opt-in Next route → real local API integration | **1 passed**, separately enabled against an isolated final API on port 18002. 18 actual estimator epochs, matched observation hashes and <1e-6 m noiseless errors. The owned helper was stopped afterward. |
| `npm run typecheck` | **PASS** in final Desktop checkout. |
| `npm run build` | **PASS** in final Desktop checkout with existing local public configuration; `/`, `/api/solve`, `/api/laboratory`, `/api/signals`, `/api/reports` generated. |
| Python backend | **PASS** import/compilation, TestClient/API tests and actual production-mode API/worker startup in the isolated protocol fixture. No Linux Docker image build is claimed. |
| Configuration syntax | Render YAML and Vercel JSON parsed successfully. Provider-side Blueprint validation/provisioning and Docker build **not executed**; Docker is unavailable on this host. |
| PDF | Actual **five-page vector report** generated from the committed clean 3,600-epoch run. All five rendered pages inspected; labels, units, tables, CDF, layout and configuration appendix checked. |
| Existing scientific core | `physics.py`, `estimators.py`, `experiments.py` and `lab_models.py` are **byte-for-byte unchanged** from the approved Phase 2 checkout. Scientific version remains 0.2.0. |
| Browser workflows / responsive / all-theme visual QA / PNG browser rasterization | **NOT RUN**. New Playwright cases are authored; the earlier browser-policy restriction was respected and not bypassed. Historical Phase 1 passes are not a Phase 3 pass. |
| Hosted login/registration/confirmation, project CRUD, two-user permissions and Storage HTTP | **NOT RUN** against the actual Supabase project. SQL and local protocol fixtures do not establish a hosted integration pass. |
| Vercel / Render production deployment | **NOT PERFORMED**. No provider credentials or explicit service-provisioning authorization were supplied. Exact manual steps are provided. A local build is not represented as a production deployment. |

Database cases cover anonymous/stranger denial; viewer versus editor actions; owner-only access administration; team membership; invitation hashes/redemption/revocation; revision conflicts/restores; direct mutation denial; immutable history/derived artifacts; private result/object reads; duplicate-key conflicts; stale-worker rejection; expired lease retry, retry exhaustion, abandoned queue expiry and per-user queue limits. Cloud checks must still exercise actual Auth-issued tokens and Storage HTTP in separate browser profiles.

## Actual advanced example and scientific limits

`docs/examples/csi-example.result.json` contains the executed seed-123, two-band/two-path synthetic example: path truth **100 and 180 ns**, 40 dB nominal SNR, 1,001 scan points. Conventional matched and weighted profiles select **100 and 112.5 ns**; experimental MUSIC selects **100 and 180 ns**. The baseline sidelobe error is retained, rather than hidden. Runtime is recorded in the file and is host/load dependent. These values do not demonstrate guaranteed estimator superiority or RF hardware performance.

The supplied reviews and accessible original [Kazaz author manuscript](https://arxiv.org/pdf/2111.10682) informed the module. It does **not** implement the complete weighted subspace fit/data extensions/initialization/CRB of MBWDE. Weighted profile scanning must not be described as MBWDE. MUSIC assumes known path count/noise powers and independent snapshot path gains; ESPRIT accepts a single uniformly spaced band only. No calibrated real CSI/hardware study has been performed. [Full advanced-module status](ADVANCED_SIGNALS.md).

Phase 2 caveats remain: horizontal synthetic geometry, empirical propagation/NLOS, nominal fixed Gaussian covariance, local uncertainty approximations, robust losses that can worsen results and constant-velocity EKF/UKF. Error statistics are conditional on successful numerical estimates; a numerical fix is not an accuracy threshold. [Scientific methods](PHASE_2_METHODS.md) and [parameter reference](LAB_PARAMETER_REFERENCE.md).

## Persistence, security and resource boundaries

Every public research table enables RLS. Browser roles cannot directly mutate projects/revisions/jobs/runs/access grants. Checked RPCs enforce the current user, explicit roles and versions. API calls use the public project key plus caller JWT; only the dedicated Render worker receives the legacy service-role JWT. The key is never in frontend code or source. Private result/artifact reads use current project permissions. Test fixtures use obviously fake keys and local-only accounts, not production credentials.

Production limits are 20,000 estimator epochs, 100,000 anchor observations, a conservative 15 MB estimated-output budget and 20 MB decoded result artifact, with a cooperative 120-second compute budget. Leases last 90 seconds and heartbeat every five seconds; at most two attempts, 24-hour queued expiry. A killed worker recomputes deterministically from the immutable input; it does not promise partial-epoch resumption. Artifact uploads may leave unpublished fragments after failure; administrator cleanup/retention remains operational work. Two small CSI/PDF operations may run per API instance, with strict request/shape bounds. The CSI endpoint is not a large batch scheduler.

Published terminal records are immutable. Projects with history are archived rather than user-deleted. Derived artifacts are append-only, ≤2 MB/file and ≤128/run. Personal local caches remain browser/device data, not a security boundary for two people sharing one unlocked browser profile. User-generated imported reports/derivatives and SHA hashes are not signed scientific attestations. Ownership transfer, public anonymous reports and real-time multiwriter synchronization are not supplied.

## Configuration and research-peer instructions

1. Back up/test the database, then apply migrations 002 and 003 to the existing Terra-Lab Supabase project. Keep private buckets and RLS intact. Do not rerun migration 001 or substitute a service client for user access checks.
2. Restart/reload local dev services if needed, sign in, save/reload a project, create two revisions and test a stale second-tab save. Open workspace Details for templates, membership, teams and invitation scope.
3. Run a small paired experiment, inspect actual failures/runtime, compare two frozen configurations, rerun as a new record and check immutable history. Start with 20 trials for cloud limits; the larger reference benchmarks remain reproducible in local mode.
4. Export actual JSON/CSV/SVG/PNG/PDF/manifest, inspect publication labels/units and optionally append a small artifact. Downloaded raw JSON is a portable backup. Compare hashes after transport, not different serialization conventions.
5. Deploy using the documented Vercel frontend + Render API + separate Render worker + Supabase database/storage sequence. Web/API need only public configuration and user tokens; the worker secret goes only in the worker's provider settings. Configure exact production CORS and Auth redirects and rebuild public environment changes.
6. Complete the deployment guide's real owner/editor/viewer/stranger checklist, registration/confirmation/session tests, worker restart/cancellation and visual/browser checks. Record URLs, commit and migration versions before treating the service as production accepted.

[Architecture](ARCHITECTURE.md) · [Database/security](DATABASE.md) · [API](API.md) · [Local setup](LOCAL_SETUP.md) · [Deployment/environment checklist](DEPLOYMENT.md) · [User guide](USER_GUIDE.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Reproduction](REPRODUCTION.md).

Suggested research extensions: independently reproduce full MBWDE with the specified assumptions/CRB and real CSI, add model-order/calibration studies, evaluate NLOS mixtures and filter covariance consistency, isolate weighting effects using NLS, and benchmark larger worker loads before raising limits. These are future research directions, not delivered results. Stop at Phase 3; no unrelated phase expansion is included.
