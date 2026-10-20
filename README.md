# TerraLab

Phase 1 research studio for GNSS-independent terrestrial positioning. A coordinate-aware network editor, deterministic mobility simulator, and calibrated-range 2D multilateration baseline.

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
services/api/
  terralab/models.py     Pydantic observation/response contracts
  terralab/engine.py     NumPy/SciPy SVD baseline
  terralab/main.py       FastAPI /health and /solve
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

The solver accepts calibrated 2D ranges, not unknown-clock one-way pseudoranges. RF and clock fields are persisted calibration metadata. Only range sigma changes the Phase 1 noise model. Altitude is metadata. Obstructions flag geometric LOS; exclusion is optional, and no RF propagation is simulated. The displayed geometry condition is not GDOP. Position error is simulated truth comparison, not a measured hardware result.

Read `docs/research/methodology-matrix.md` for equations, assumptions, paper-by-paper evidence and extension boundaries. `docs/IMPLEMENTATION_PROGRESS.md` records actual verification and known limits. Phase 2 requires explicit approval; no timing-method comparison, robust estimation, Monte Carlo, collaboration or hardware processing is included.

## Repository

Target origin: `https://github.com/VED045/Terra-Lab.git`. Source and documentation belong in this repository; local environment values and generated personal exports stay out of Git. See docs/PROFILE_SHARING.md for the profile and export follow-up.

## Profile and sharing

Click your avatar to view and edit your signed-in researcher profile. Share / export in the command bar provides PNG network screenshots, importable setup JSON, CSV simulation samples and printable HTML reports. File sharing uses the device share sheet when supported; downloads work without making cloud projects public. See docs/PROFILE_SHARING.md for usage, verification limits and acceptance steps.
