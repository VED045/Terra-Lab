# Local setup

Prerequisites: Node 20.9+ (tested Node 24.19.0), Python 3.12, npm. No paid service is needed for small local studies. Docker/Supabase CLI are optional for the full Auth/Storage stack.

```powershell
cd C:\Users\Ved\Desktop\TerraLab
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/api/requirements-dev.txt
npm run dev
```

The frontend opens at `http://127.0.0.1:3000`; API at `http://127.0.0.1:8000`, health `/health`, schemas `/docs`. `scripts/python.mjs` finds the repo venv without activation. Local API is bound to loopback; do not expose its single-user filesystem job mode publicly.

Without cloud variables, structured networks save in localStorage and experiments in IndexedDB plus ignored `.terralab/experiments/` checkpoints. This data belongs to this browser/origin/device. Export JSON backups. A local restart preserves terminal checkpoints and marks unfinished jobs interrupted; it does not pretend to resume them. Browser QR/editor can run without Python, but the scientific Laboratory, CSI lab and PDF need it.

For a local Supabase stack install Docker and Supabase CLI, run `supabase start`, `supabase db reset`, then read public configuration with `supabase status`. Copy `.env.example` to `apps/web/.env.local`, set local public URL/key and server `SIMULATION_API_URL=http://127.0.0.1:8000`, then restart Next. Hosted Supabase can be used instead after applying the versioned migrations; existing Phase 2 databases need 002/003 only. Do not use local reset against a linked hosted database.

To exercise production-style durable jobs locally, set the following in the terminal running the API, and configure the worker separately:

```powershell
$env:TERRALAB_JOB_MODE='supabase'
$env:SUPABASE_URL='http://127.0.0.1:54321'
$env:SUPABASE_PUBLISHABLE_KEY='local-public-key'
npm run dev:api
# In another terminal, same repository:
$env:TERRALAB_JOB_MODE='supabase'
$env:SUPABASE_URL='http://127.0.0.1:54321'
$env:SUPABASE_SERVICE_ROLE_KEY='local-service-role-jwt'
npm run worker
```

These are placeholders, not credentials. Use keys printed by your local stack; do not paste server keys into the browser env file. User JWTs authorize cloud jobs; save a project while signed in before running. Local confirmation is disabled by `supabase/config.toml`; hosted confirmation follows hosted settings.

`npm run test:database` requires no Docker; it executes real PostgreSQL WASM with fixture Auth/Storage tables. `node scripts/test-cloud-worker.mjs` additionally starts isolated real API/worker subprocesses and local protocol fixtures, cleans up its own children and uses no hosted credentials. It is not a hosted Supabase integration pass.
