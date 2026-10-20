# TerraLab

Research studio for GNSS-independent terrestrial positioning. Phase 2 adds a reproducible scientific laboratory while preserving the Phase 1 network editor, deterministic mobility and calibrated-range baseline.

## Start on Windows

Prerequisites: Node.js 20.9+ (tested with 24.19.0), Python 3.12+ (tested with 3.12), npm. No paid services are required for local use.

```powershell
cd C:\Users\Ved\Desktop\TerraLab
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/api/requirements-dev.txt
.\.venv\Scripts\Activate.ps1
npm run dev
```

If PowerShell blocks activation, run the two services in separate terminals without activation:

```powershell
npm run dev:web
# Second terminal, same repository directory:
.\.venv\Scripts\python.exe -m uvicorn terralab.main:app --app-dir services/api --reload --port 8000
```

Open http://127.0.0.1:3000. API health: http://127.0.0.1:8000/health. Interactive API documentation: http://127.0.0.1:8000/docs.

Browser QR works without Python. In the right inspector, choose **Simulation → Solver engine → Python API · SVD**, then **Run baseline**, to validate the current observations through the backend. Playback previews use browser QR; selecting Python affects explicit baseline runs. The API is bound to loopback for local development.

## First network in one minute

1. Open the folder icon in the left rail and choose a starter project.
2. Click a transmitter or receiver. Drag it or edit its X/Y coordinates in Properties. Coordinates are metres, with positive Y upwards.
3. Add objects from the floating toolbar. Click several points then press Enter to finish a polygon or trajectory. Use Shift-click or a selection box for multiple objects.
4. Run the baseline. Open Measurements to inspect ranges, fitted distances, residuals and LOS flags.
5. For motion, open **A receiver in motion**, then press Play. Pause, step or scrub the timeline.
6. Save the project. Edits autosave after 1.5 seconds. Open the project library to rename, duplicate, archive, delete or reload saved projects. Export JSON for a portable backup.

On phones, use the sliders button in the command bar to open/close the properties inspector. Open **Workspace settings → Appearance & canvas** for ten theme previews, including monochrome black/white, blue, green, amber, violet, rose and sand. The sun/moon rail button cycles palettes; themes save with the project. The question-mark button lists keyboard shortcuts and model assumptions. See [themes and session status](docs/THEMES_AND_SESSION.md) for details and acceptance checks.

## Scientific laboratory

Click **Laboratory** in the command bar. Experiments use a frozen copy of the current network. Configure the measurement model, compatible estimators, noise/propagation, filters, trials and parameter sweep. Every numeric laboratory control has units, bounds, defaults, a slider and direct entry. **Load six-anchor benchmark** opens the documented synthetic layout with three receiver locations and timing values 0.1, 1, 3 and 10 ns; it explicitly replaces the current workspace like a starter template.

The Python API must be running. **Run reproducible experiment** starts a background job with matched observations across estimators. Results show progress/cancellation, fix and failure counts, position/residual statistics, runtime, trajectories, histograms, CDF and sweep plots. Use a positive duration and a moving receiver for filtering/speed studies. Add a spatial grid for sampled coverage/error maps.

**Preview on studio canvas** displays selected recorded layers. The inspector and bottom panel then show scientific snapshot metrics; **Clear lab overlay** returns to the live baseline. **Share / export** exports that scientific snapshot as PNG, complete JSON, CSV or a printable HTML report. JSON/CSV contain real attempted epochs, including failures. Restore the saved network before visual exports if the network has changed.

Completed/cancelled/failed snapshots persist in browser IndexedDB and atomic API checkpoint files under ignored `.terralab/experiments/`. **Saved snapshots** opens local/imported or private cloud outputs. Cloud storage uses the existing owner-protected bucket in JSON chunks with a checked manifest; no new Supabase migration or credential is required. Editing the workspace never changes an old result.

Reproduce both committed examples:

```powershell
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100 --clean --out docs/examples/timing-clean
```

Each example runs 3,600 estimator epochs: six anchors, three locations, 100 trials, four timing levels and LS/WLS/Huber. Actual requests, complete outputs and summary JSON are in `docs/examples/`. The contaminated case uses 10% extra NLOS, a 5 m mean excess path, and 2% Student-t outliers; the clean case disables contamination. These are simulation settings, not hardware claims. Local computation times vary.

See [scientific methods](docs/PHASE_2_METHODS.md), [parameter reference](docs/LAB_PARAMETER_REFERENCE.md), and [Phase 2 completion report](docs/PHASE_2_COMPLETION_REPORT.md) for assumptions, compatibility, actual results, tests, limits and manual acceptance. The new browser workflows and authenticated cloud operations still require manual acceptance; the numerical tests and isolated API integration are independently executable.

## Architecture

```text
apps/web/
  app/                   Next.js App Router, global design system, /api/solve proxy
  components/            Studio shell, SVG canvas, property inspector, project/account dialogs
  components/ui/         shadcn-style Button, Radix Dialog and Tooltip primitives
  lib/                   Zustand editor state; local/Supabase persistence
packages/shared/src/
  model.ts               Strict Zod schemas, units and editable object definitions
  geometry.ts            World/canvas mapping and LOS intersections
  mobility.ts            Deterministic clock and six motion modes
  solver.ts              Measurement interface, seeded ranges, Householder QR
  templates.ts           Four runnable seed networks
  laboratory.ts          Phase 2 configuration, compatibility and parameter catalog
services/api/
  terralab/models.py     Pydantic observation/response contracts
  terralab/engine.py     NumPy/SciPy SVD baseline
  terralab/main.py       FastAPI /health and /solve
  terralab/physics.py    TOA/pseudorange/TDOA/RTT/AOA/RSS/hybrid observations
  terralab/estimators.py SVD, nonlinear/robust estimators, EKF and UKF
  terralab/experiments.py Paired Monte Carlo jobs, metrics and atomic checkpoints
supabase/                PostgreSQL migration, RLS and private Storage policies
docs/                    Methodology, implementation status and acceptance report
tests/e2e/               Playwright editor-to-API acceptance tests
```

Strict TypeScript, React 19.3.1, Next.js 16.4.2, Tailwind 4, Lucide, Zustand, TanStack Query, Radix UI, Plotly.js, FastAPI, Pydantic, NumPy and SciPy. Exact JavaScript versions are locked in `package-lock.json`; Python requirements are pinned. Compatibility was checked against the package registry, installed Next.js docs, and a successful production build. Next requires Node 20.9+ ([official installation guide](https://nextjs.org/docs/app/getting-started/installation)). Python least squares uses SciPy's documented SVD driver ([official reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.lstsq.html)). SVG is the equivalent vector canvas engine; chart code is loaded on demand.

## Optional Supabase setup

Cloud registration/login, personal projects, archive/delete and Storage snapshots are implemented. Public configuration is now present locally, and Auth/table presence were checked. Authenticated cloud CRUD, profile updates and two-user RLS/Storage isolation have not been independently tested against the live user session.

1. Create a Supabase project, or install Docker and Supabase CLI and run `supabase start` from this repository for a free local stack. The repository includes local API/Auth/DB settings in `supabase/config.toml`.
2. For a hosted project, paste `supabase/migrations/202610200001_projects.sql` into its SQL editor. For local development, run `supabase db reset` after starting the stack. The migration creates `public.projects`, per-user row policies and the private `project-exports` bucket.
3. Copy `.env.example` to `apps/web/.env.local` and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
SIMULATION_API_URL=http://127.0.0.1:8000
```

Use the hosted project URL instead for hosted Supabase. Get the local public key from `supabase status`, or the hosted public anon key from project API settings. Never place a service-role key in this file or in browser code.

4. In hosted Supabase Auth, allow `http://127.0.0.1:3000` and `http://localhost:3000` as site/redirect URLs. Enable email/password registration. Hosted email confirmation follows the project's Auth setting; local confirmation is disabled for development.
5. Restart Next.js. Open Account → Create account, complete email confirmation when enabled, then sign in. Saving now writes to PostgreSQL under your user JWT. Project list/update/delete requests rely on RLS. Use **Cloud snapshot** in the project library to upload a user-owned JSON export to private Storage.
6. Open each starter template and save it while signed in to seed your personal cloud library. Existing local projects stay in the browser; open/import a JSON export and save while signed in to copy one to your account.
7. Verify with two separate test users that projects and Storage files are isolated before relying on the cloud integration. Check registration, email confirmation, session refresh, logout, create/rename/duplicate/archive/delete, save/reload, and Storage upload policies.

No variables are required for local browser persistence or browser QR. `SIMULATION_API_URL` is server-only and defaults to loopback. Configuration files and virtual environments are ignored by Git.

## Test and build

```powershell
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m pytest services/api/tests -q
npm run build
npx playwright install chromium
# Start both services before the E2E suite, or let Playwright start the web server:
npm run test:e2e
```

The Python service must be running on 8000 for the API E2E test. Test reports and traces are ignored. Production web mode: `npm run build`, then `npm start`; run the Python service separately. For future internet deployment, add an explicit hosting/security configuration; this delivery is local development software.

## Scientific scope

The preserved Phase 1 live preview and `/solve` endpoint accept calibrated 2D ranges, with RF/clock fields assumed compensated. The separate Phase 2 laboratory injects documented RF/timing/clock/propagation errors and supports clock-unknown pseudorange estimation, covariance-aware TDOA, RTT, AOA, RSS and declared hybrid models. Altitude remains outside the horizontal equations. Geometry condition is not GDOP; uncertainty is a nominal local approximation. Position error compares against simulated truth and is not measured hardware performance.

Read `docs/research/methodology-matrix.md` for research evidence and `docs/PHASE_2_METHODS.md` for the current equations, assumptions, estimator matrix and failure accounting. `docs/IMPLEMENTATION_PROGRESS.md` records verification and known limits. Phase 2 was explicitly approved. No Phase 3 collaboration, particle filter, advanced multiband CSI or waveform/hardware processing is included; Phase 3 requires separate approval.

## Repository

Target origin: `https://github.com/VED045/Terra-Lab.git`. Source and documentation belong in this repository; local environment values and generated personal exports stay out of Git. See docs/PROFILE_SHARING.md for the profile and export follow-up.

## Profile and sharing

Click your avatar to view and edit your signed-in researcher profile. Share / export in the command bar provides PNG network screenshots, importable setup JSON, CSV simulation samples and printable HTML reports. File sharing uses the device share sheet when supported; downloads work without making cloud projects public. See docs/PROFILE_SHARING.md for usage, verification limits and acceptance steps.
