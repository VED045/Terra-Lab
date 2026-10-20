# TerraLab

Research workspace for GNSS-independent positioning. Phase 3 adds versioned cloud projects, teams, authenticated sharing, immutable experiment history, comparison, scientific exports and deployment configuration. The Phase 1 editor and validated Phase 2 numerical model remain in place. Platform 0.3.0; positioning model 0.2.0; project schema 1.

**Cloud upgrade:** the existing Supabase project needs migrations **002 and 003**, in order. Migration 001 was already used for Phase 1/2; do not rerun it. The implementation has not applied hosted migrations or deployed services. See [deployment steps](docs/DEPLOYMENT.md).

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

Cloud jobs use PostgreSQL queue state and a separate Render worker with fenced leases, retries, progress, cancellation and immutable Storage chunks. The browser checks the full artifact hash. The API uses the caller's JWT; only the worker has a server-only service credential. Existing per-user Phase 2 snapshots remain personal backups. [Architecture](docs/ARCHITECTURE.md) and [database/security contracts](docs/DATABASE.md).

## Validate and reproduce

```powershell
npm test
npm run test:python
npm run test:database
npm run test:worker
npm run typecheck
npm run build
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100 --clean --out docs/examples/timing-clean
node scripts/python.mjs scripts/example_phase3.py
```

The database harness executes actual PostgreSQL grants/RLS/RPCs with fixture Auth/Storage tables. The worker integration executes real FastAPI/Python calculations against that database using local HTTP protocol fixtures. Neither is a hosted Supabase Auth/Storage or production deployment pass. Browser automation, two-user hosted acceptance and provider/container checks remain explicitly separate. See [validation/reproduction](docs/REPRODUCTION.md) and the Phase 3 report for actual executed results.

## Deployment

Next.js frontend: Vercel root `apps/web`, public Supabase URL/key and server API URL. FastAPI: root Dockerfile/Render web service with exact CORS origins. Numerical work: separate Render worker; server-only service-role JWT belongs only there. Supabase: versioned migrations, private buckets, checked RPCs and RLS. Production startup refuses filesystem-only jobs. `render.yaml`, `apps/web/vercel.json`, `.env.example`, local Supabase configuration and safe seed are included. [Exact deployment and two-user verification guide](docs/DEPLOYMENT.md).

## Documentation

- [User guide](docs/USER_GUIDE.md), [troubleshooting](docs/TROUBLESHOOTING.md), [API](docs/API.md), [local setup](docs/LOCAL_SETUP.md).
- [Scientific methods](docs/PHASE_2_METHODS.md), [parameter reference](docs/LAB_PARAMETER_REFERENCE.md), [advanced CSI scope/gaps](docs/ADVANCED_SIGNALS.md), [research methodology matrix](docs/research/methodology-matrix.md).
- [Phase 3 delivery report](docs/PHASE_3_REPORT.md), [implementation progress](docs/IMPLEMENTATION_PROGRESS.md), [historical Phase 2 report](docs/PHASE_2_COMPLETION_REPORT.md).

Synthetic horizontal positioning is not validated RF hardware performance. WLS/MLE assume nominal Gaussian covariance, robust methods need not improve every case, and EKF/UKF use constant velocity. Scientific model version 0.2.0 remains authoritative for existing results. Cloud/browser/provider acceptance is not inferred from a local production build. Phase 3 is the final scope; unrelated features have not been added.
