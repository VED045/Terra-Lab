# Workspace, timestamps and combined Render runtime: verification

Validated locally on 2026-10-20. No hosted database migration, secret rotation, provider configuration change or authenticated production experiment was performed by this update.

## Delivered behavior

- Valid ISO timestamps with UTC offsets and fractional microseconds from PostgREST normalize to UTC milliseconds. Invalid or timezone-free timestamps remain rejected. Editor loads retain the parsed canonical data.
- Signed-in / opens /projects (Research workspace); signed-out / retains Network studio. Explicit /studio navigation stays in the editor. Project categories, templates, teams, revisions and experiment history are available on the Projects page.
- Run demo opens /studio?demo=moving and autoplays the real synthetic waypoint receiver simulation. It preserves the prior active workspace, disables demo autosave and fits the constellation on initial viewport sizing. Explicit manual save remains available.
- Snapshot overlays compare canonical configurations, avoiding a false network-change warning caused by normalized property order/defaults. Stored scientific results remain untouched.
- Docker starts python -m terralab.runtime. TERRALAB_RUN_WORKER=1 enables one supervised queue worker beside the API. The supervisor strips both service-key variables from the API child, forwards shutdown, and stops the sibling if a child exits. Modern Supabase secret keys use apikey authentication; legacy worker credentials remain compatible.
- Render Free setup is documented in RENDER-FREE.md and render.free.yaml. No local worker is needed once the combined service is configured and deployed. Cold-start errors advise retrying instead of starting local services.

## Executed checks

| Check | Result |
|---|---|
| npm test | 154 passed; 1 existing opt-in scientific integration excluded by default |
| RUN_SCIENCE_INTEGRATION=1, laboratory integration test against isolated API | 1 passed: actual Next handler → Python → persisted 18 noiseless epochs |
| npm run test:python | 186 passed; one existing upstream Starlette/httpx deprecation warning |
| npm run test:database | 44 actual PostgreSQL migration/grant/RLS/RPC checks passed |
| npm run test:worker | Separate-worker protocol integration passed; hash-checked 18 noiseless epochs; unrelated user denied |
| npm run test:combined | Supervisor + API + modern-key worker protocol integration passed; hash-checked 18 noiseless epochs; unrelated user denied |
| npm run test:e2e | 26/26 serial Chromium cases passed |
| npm run test:e2e:auth | 1/1 passed: auth landing, offset cloud project load, explicit studio navigation, logout, signed-out landing |
| Final targeted browser run after auto-fit | 4/4 passed: laboratory controls/overlays, demo motion, all anchors within canvas bounds, workspace preservation, small-screen Projects page |
| npm run typecheck and final npm run build | Passed; /projects and /studio generated |
| Source/client literal secret scan | 184 files including 30 client chunks; zero service-role JWT or long secret-key literals |
| git diff --check | Passed |

Reviewed screenshots of the desktop/mobile Projects page and live demo. Auth/Storage HTTP integration and authenticated browser sessions use local fixtures, not hosted accounts. Docker is unavailable on this machine, so no Linux container build or Render free-plan performance acceptance is claimed.

## Public deployment baseline

Before the push, https://terra-lab-wine.vercel.app/ returned HTTP 200 and https://terra-lab.onrender.com/health returned HTTP 200 with status ok and jobMode supabase. This checks reachability of the existing deployments, not rollout of these changes or queue readiness. Enable the combined runtime environment, deploy this commit, then submit/reopen a small real authenticated job as described in RENDER-FREE.md.

No additional migration is required beyond the user's already-applied 004.
