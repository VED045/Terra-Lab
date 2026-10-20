# TerraLab

Research workspace for GNSS-independent positioning. Phase 3 adds versioned cloud projects, teams, authenticated sharing, immutable experiment history, comparison, scientific exports and deployment configuration. The Phase 1 editor and validated Phase 2 numerical model remain in place. Platform 0.3.0; positioning model 0.2.0; project schema 1.

**Cloud upgrade:** the existing Supabase project needs migrations **002, 003 and 004**, in order after verifying the actual ledger and backup. Migration 001 was already used for Phase 1/2; do not rerun it. The implementation has not applied hosted migrations or deployed services. See [deployment steps](docs/DEPLOYMENT.md) and the [single free Render service guide](docs/RENDER-FREE.md).

## Run locally

```powershell
cd C:\Users\Ved\Desktop\TerraLab
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/api/requirements-dev.txt
npm run dev
```

Open [TerraLab](http://127.0.0.1:3000), [API health](http://127.0.0.1:8000/health) and [API schemas](http://127.0.0.1:8000/docs). Node 24.19.0/Python 3.12 are tested. Browser QR/editor/local persistence need no cloud subscription. Scientific Laboratory/CSI/PDF require Python. The local API binds to loopback; filesystem job mode is for development only. [Complete local setup](docs/LOCAL_SETUP.md).

## Research workflow

1. Open Research workspace from the folder icon. Create a starter network, import JSON or reload an owned/shared project. Drag/edit anchors, receiver, obstacles and trajectories; use Settings for ten themes. Existing mobility, controls, undo/redo and calibrated-range baseline remain available.
2. Save structured configurations. Cloud saves append revisions and reject stale versions. The dashboard supports personal/recent/shared/starred/archived projects, recent experiments, saved network templates, search/sort/copy/archive/delete and teams. Restore creates a new revision; conflicts offer reload or save-copy recovery. Projects with immutable history are archived instead of hard-deleted.
3. Open Laboratory. Independently choose TOA, unknown-clock pseudorange, covariance-aware TDOA, RTT, AOA, RSS or a declared hybrid; select compatible LS/WLS/NLS/robust/rejection/RANSAC/MLE/EKF/UKF. Configure noise, propagation, mobility, filters, seed, trials and sweeps with explicit units/bounds.
4. Run a new frozen configuration, inspect progress/cancellation and actual accuracy/failure/runtime/observation diagnostics. Historical results never change with workspace edits. Compare two runs' complete nested configurations and rerun as a new project/run.
5. Preview recorded scientific layers, then export actual JSON/CSV, screenshot PNG, publication SVG/PNG, generated PDF or a reproducibility manifest. Figures use stored output; sampled displays and failure conditioning are labelled. Small derived files can optionally be appended to private cloud artifact history.
6. Grant viewer/editor access directly or through a team. Invitations expire in seven days and require sign-in. Every invitation kind grants the project's complete history/export scope; tokens are stored hashed. Revocation stops new redemption; remove accepted members separately. No automatic email or real-time multiwriter layer is claimed.
7. Explore CSI lab separately: synthetic multipath/channel data, matched/weighted scans, experimental MUSIC and restricted single-band ESPRIT. Full Kazaz MBWDE, CRB reproduction and hardware validation remain documented gaps.

Cloud jobs use PostgreSQL queue state and a Render worker (combined with the API on Free, or separate on paid plans) with fenced leases, retries, progress, cancellation and immutable Storage chunks. The browser checks the full artifact hash. The API uses the caller's JWT; only the worker has a server-only service credential. Existing per-user Phase 2 snapshots remain personal backups. [Architecture](docs/ARCHITECTURE.md) and [database/security contracts](docs/DATABASE.md).

## Validate and reproduce

```powershell
npm test
npm run test:python
npm run test:database
npm run test:worker
npm run test:combined
npm run test:e2e:auth
npm run typecheck
npm run build
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100 --clean --out docs/examples/timing-clean
node scripts/python.mjs scripts/example_phase3.py
```

The database harness executes actual PostgreSQL grants/RLS/RPCs with fixture Auth/Storage tables. The worker integration executes real FastAPI/Python calculations against that database using local HTTP protocol fixtures. Neither is a hosted Supabase Auth/Storage or production deployment pass. Browser automation, two-user hosted acceptance and provider/container checks remain explicitly separate. See [validation/reproduction](docs/REPRODUCTION.md) and the Phase 3 report for actual executed results.

## Deployment

Next.js frontend: Vercel root `apps/web`, public Supabase URL/key and server API URL. FastAPI: root Dockerfile/Render web service with exact CORS origins. Numerical work: set TERRALAB_RUN_WORKER=1 and SUPABASE_SECRET_KEY on the same free Web Service to run a supervised queue worker beside the API, or use the separate paid worker. The supervisor removes worker secrets from the API child environment. Supabase: versioned migrations, private buckets, checked RPCs and RLS. Production startup refuses filesystem-only jobs. `render.yaml`, `apps/web/vercel.json`, `.env.example`, local Supabase configuration and safe seed are included. [Exact deployment and two-user verification guide](docs/DEPLOYMENT.md), [free combined setup](docs/RENDER-FREE.md).

## Phase 4A acceptance

The local acceptance audit fixes revoked-job cancellation, unpublished chunk reads, queue and artifact limits, unsaved metadata edits, snapshot feedback and noiseless angular robust initialization. Final evidence: 145 default JavaScript tests plus the separately enabled integration, 178 Python tests, 44 SQL checks and 24 serial Chromium cases pass, along with worker integration, type-check and build. Parallel browser reload, real hosted Auth/Storage, migration state, deployment/container and live concurrency remain unverified or pending. No hosted change or deployment was performed. See [acceptance matrix](docs/acceptance/ACCEPTANCE_MATRIX.md), [security review](docs/acceptance/SECURITY_REVIEW.md), [collaboration plan](docs/acceptance/COLLABORATION_TEST_PLAN.md) and [deployment readiness](docs/acceptance/DEPLOYMENT_READINESS.md).

## Documentation

- [User guide](docs/USER_GUIDE.md), [troubleshooting](docs/TROUBLESHOOTING.md), [API](docs/API.md), [local setup](docs/LOCAL_SETUP.md).
- [Scientific methods](docs/PHASE_2_METHODS.md), [parameter reference](docs/LAB_PARAMETER_REFERENCE.md), [advanced CSI scope/gaps](docs/ADVANCED_SIGNALS.md), [research methodology matrix](docs/research/methodology-matrix.md).
- [Phase 3 delivery report](docs/PHASE_3_REPORT.md), [implementation progress](docs/IMPLEMENTATION_PROGRESS.md), [historical Phase 2 report](docs/PHASE_2_COMPLETION_REPORT.md).

Synthetic horizontal positioning is not validated RF hardware performance. WLS/MLE assume nominal Gaussian covariance, robust methods need not improve every case, and EKF/UKF use constant velocity. Scientific model version 0.2.0 remains authoritative for existing results. Cloud/browser/provider acceptance is not inferred from a local production build. Phase 4A stops at acceptance and minimal corrective fixes; no 3D or unrelated features have been added.

## Workspace and demo update

Signed-in visits to / open the Research workspace at /projects; signed-out visits retain Network studio. /studio always opens the editor. Projects includes projects, runs, teams, templates and a Run demo button that autoplays the synthetic moving receiver without a worker, preserves the prior workspace and disables demo autosave. Valid timezone-offset cloud timestamps are normalized to UTC. This update needs no additional migration beyond 004.
