# Local setup

Prerequisites: Node 22.13+ (tested Node 24.19.0), Python 3.12, npm. No paid service is needed for small local studies. Docker/Supabase CLI are optional for the full Auth/Storage stack.

```powershell
cd C:\Users\Ved\Desktop\TerraLab
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/api/requirements-dev.txt
npm run dev
```

The frontend opens at `http://127.0.0.1:3000`; API at `http://127.0.0.1:8000`, health `/health`, schemas `/docs`. `scripts/python.mjs` finds the repo venv without activation. Local API is bound to loopback; do not expose its single-user filesystem job mode publicly.

Without cloud variables, structured networks save in localStorage and experiments in IndexedDB plus ignored `.terralab/experiments/` checkpoints. This data belongs to this browser/origin/device. Export JSON backups. A local restart preserves terminal checkpoints and marks unfinished jobs interrupted; it does not pretend to resume them. Browser QR/editor can run without Python, but the scientific Laboratory, CSI lab and PDF need it.

For a local Supabase stack install Docker and Supabase CLI, run `supabase start`, `supabase db reset`, then read public configuration with `supabase status`. Copy `.env.example` to `apps/web/.env.local`, set local public URL/key and server `SIMULATION_API_URL=http://127.0.0.1:8000`, then restart Next. Hosted Supabase can be used instead after applying the versioned migrations; existing databases must apply each missing versioned migration in order, currently through 20261022115124_research_workspace.sql (after the earlier 20261021043045 migration). Do not use local reset against a linked hosted database.

To exercise production-style durable jobs locally, use the combined runtime. It starts the API and a notification-driven worker together, strips the worker credential from the API, and configures their private loopback channel automatically:

```powershell
$env:TERRALAB_JOB_MODE='supabase'
$env:TERRALAB_RUN_WORKER='1'
$env:SUPABASE_URL='http://127.0.0.1:54321'
$env:SUPABASE_PUBLISHABLE_KEY='local-public-key'
$env:SUPABASE_SECRET_KEY='local-server-secret'
node scripts/python.mjs -m terralab.runtime
```

Advanced same-host separate processes may use `npm run worker` and the API with an identical `TERRALAB_WORKER_WAKE_PORT` and a randomly generated `TERRALAB_WORKER_WAKE_TOKEN` of at least 32 characters in both process environments. This channel binds only to loopback and does not support workers in separate containers. The normal deployment and local verification use the combined runtime.

These are placeholders, not credentials. Use keys printed by your local stack; do not paste server keys into the browser env file. User JWTs authorize cloud jobs; save a project while signed in before running. Local confirmation is disabled by `supabase/config.toml`; hosted confirmation follows hosted settings.

`npm run test:database` requires no Docker; it executes real PostgreSQL WASM with fixture Auth/Storage tables. `node scripts/test-cloud-worker.mjs` additionally starts isolated real API/worker subprocesses and local protocol fixtures, cleans up its own children and uses no hosted credentials. It is not a hosted Supabase integration pass.

## Research documents and free local AI

Use [the Ollama guide](ai/LOCAL_OLLAMA_GUIDE.md) to start the free local profile on 13040 and verify generation/tools. Research documents and files work independently of AI. Open /research, choose a saved project, create a paper or blank document, upload sources, and attach saved runs or actual Network studio captures. Local research is stored in this browser's IndexedDB; export source and original files for backups.

Cloud Research Workspace requires the new additive migration. It creates private research tables/RPCs and the research-library bucket. Review and apply pending migrations through the existing administrator workflow without resetting a hosted database. The follow-up applied and verified this migration on Terra-Lab; other environments still need the pending migrations. See [the research report](research/RESEARCH_WORKSPACE_REPORT.md) for permission and verification details. Cloud uploads through the app are limited to 4 MiB; local files to 10 MiB. The renderer previews math, not a full TeX paper. Full paper PDF compilation is external.
