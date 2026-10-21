# Render Free: combined API and queue worker

The Docker image now starts a supervisor. Set TERRALAB_RUN_WORKER=1 to run the API and one science worker together. Both stop if either process exits. The worker secret is removed from the API child environment. Supabase retains jobs and immutable result artifacts; no local worker or Render disk is needed.

The worker is notification-driven: experiment submission wakes it over a private, authenticated loopback channel. It drains the durable queue and then waits without querying Supabase. The supervisor configures this channel automatically; there are no new Render environment variables. Five-second lease heartbeats occur only while an experiment is running. An unfinished lease schedules a one-shot recovery wake. Startup checks the queue once; database failures have five bounded retries and then wait for a new submission/restart.

Apply migration 007 after 006 before deploying this worker version. It adds the service-only scheduling hint, bounded expiry maintenance, query indexes and safe handling of identical stale save retries. If a wake notification fails after enqueue commits, the API reports 503; retry the same submission with its retained idempotency key. A direct SQL enqueue is not a notification: use the application/API submission path or restart the service to drain such work.

## Existing Render Web Service

1. Wait for the updated main branch to appear in GitHub. In Render open your existing Docker Web Service, select main, repository root (leave Root Directory empty), Dockerfile ./Dockerfile, Singapore, Free.
2. Under Settings remove any old Docker Command override, or set it to python -m terralab.runtime. Health Check Path: /health. Render supplies PORT; do not hardcode a different port.
3. Under Environment set TERRALAB_ENV=production, TERRALAB_JOB_MODE=supabase, TERRALAB_RUN_WORKER=1, SUPABASE_URL to your Supabase project URL, SUPABASE_PUBLISHABLE_KEY to its public publishable key (legacy anon also works), and SUPABASE_SECRET_KEY to a new server-only secret key. Set TERRALAB_CORS_ORIGINS to your exact Vercel origin, without a trailing slash. Never prefix the worker secret with NEXT_PUBLIC_ or add it to the Vercel frontend.
4. The service-role credential pasted into chat must be replaced. Create the new key in Supabase Settings > API Keys, update the deployment, verify the worker, then deactivate the exposed legacy keys using Supabase's rotation instructions. Creating a new secret alone does not invalidate the old JWT. Do not paste credentials into commands or chat.
5. Save and deploy the latest commit. Logs should say TerraLab runtime started: API + queue worker. Open https://YOUR-SERVICE.onrender.com/health and expect a successful JSON response. Stop the old local worker after this is working.
6. In Vercel keep SIMULATION_API_URL=https://YOUR-SERVICE.onrender.com (no trailing slash) and the existing NEXT_PUBLIC_SUPABASE_URL and public key. Redeploy the frontend so build-time public configuration and code are current. No worker secret belongs here.
7. Sign in: / opens /projects with Research workspace, projects, experiments, templates and teams. Network studio opens /studio. Signed-out / opens Network studio. Run demo starts the synthetic moving rover in the browser; it preserves the prior active workspace and does not autosave demo changes. Explicit Save remains available if you want to keep a demo copy.
8. Verify a real small cloud run: save a project, open Laboratory, submit a short experiment, confirm queued > running > completed, reload, then reopen and export the saved result. This exercises the combined worker; the browser-only demo does not test the cloud queue.

## Free-plan behavior

Render Free Web Services sleep after 15 minutes without inbound traffic. The idle worker makes no recurring database calls and does not keep the service awake. Opening the app and submitting/polling a job wakes the API; cold starts can take about a minute and the first request can time out, so retry after it wakes. A queued job waits while the service sleeps; an interrupted job uses the existing lease/retry recovery when it next runs. One small CPU and 512 MB are suitable for short demos, not heavy Monte Carlo runs; existing cloud limits and 120-second worker compute bounds still apply. There is no uptime guarantee, persistent local disk or always-on queue processing.

For a new optional Blueprint use render.free.yaml (one free Web Service). render.yaml is a paid combined-service alternative using the same notification path; it no longer creates a separate polling worker. Do not create both unless you intend to operate both setups.

## Verification

npm run test:combined runs the actual supervisor, FastAPI and numerical worker against PostgreSQL migrations/RLS and local Auth/Storage protocol fixtures, with a fixture sb_secret_ key. It checks idempotency, outsider denial, publication hashes, all 18 noiseless epochs, no recurring idle claims, and successful notification of a second experiment after idle. This is local integration evidence, not a hosted Supabase or Render acceptance claim.

References: https://render.com/docs/free and https://supabase.com/docs/guides/api/api-keys
