# Troubleshooting

| Symptom | Check / recovery |
|---|---|
| save_research_project missing / schema cache error | Install migrations 002 and 003 on the existing Phase 2 database, then refresh. Do not rerun 001 or bypass RLS with a service key. |
| VERSION_CONFLICT | Your edits are retained. Open workspace, save/export a copy or reload current cloud revision. Restore uses the current expected version and creates another revision. |
| Viewer save/run denied | Expected. Request editor access or duplicate an accessible setup into your own project. A URL UUID is not authorization. |
| Signed in but cloud action fails | Check session refresh, public project URL/key, migration status and current direct/team grants. Open Profile, confirm email/account ID; sign out/in if session expired. |
| Project cannot be deleted | Immutable job/history exists. Archive instead; deliberate administrative retention/purge is outside normal user operations. |
| Invitation unavailable | Requires sign-in, exact 64-character token, unexpired/unrevoked link. Revocation does not remove previously accepted membership; owner removes it separately. |
| No experiment progresses | Verify API jobMode, migrations, a running Render worker, worker-only secret and queue connectivity. API /health is liveness, not worker readiness. |
| Interrupted / retry exhausted | Worker lease expired twice or compute limit reached. Stored request and last durable status remain. Inspect safe logs, lower workload and create a new run. Sudden kills do not promise partial-record resumption. |
| Lost POST response | Retry the unchanged setup; the pending submission keeps its original idempotency key. Changed configurations require a new key. |
| Result unavailable / artifactUnavailable | Calculation/publication failed before a complete manifest. Status/progress/logs remain; no complete numerical artifact is asserted. Rerun within limits. |
| Resource limit / result too large | Reduce trials, duration, sweep size, anchors or spatial grid. Hybrid covariance storage grows quadratically. Use local execution for the larger reference benchmarks. |
| Storage checksum mismatch | Do not treat it as a valid result. Check all chunks, auth permissions and failed uploads; restore a known JSON backup. Do not ignore the digest. |
| PDF unavailable | Install pinned reportlab dependency, run/configure Python API, check bearer session in production and ≤2 MB report request. Local build alone cannot make an external API available. |
| Export artifact not saved | File may still have downloaded. Cloud artifact history needs a worker-published run, current permission, migration 003 and ≤2 MB/file. Large raw JSON already has its worker manifest. |
| MUSIC rejects coherent multipath | Expected covariance-rank restriction. Choose independent synthetic phases, or single-band Hankel ESPRIT. Neither is full MBWDE. |
| ESPRIT rejects separated bands | Expected: gaps violate the implemented uniform-shift assumption. Use one band; no multiband phase-unwrapping claim. |
| Baseline picks a sidelobe | Inspect actual spectrum and bandwidth/band gaps. Strongest matched peaks are not guaranteed physical paths. The recorded example intentionally retains this failure. |
| Windows test temp EPERM | Run tests in a normally writable terminal/profile; pytest uses ignored repository-local temp. Sandboxed transform-temp failures are environment failures, not test passes. |
| Supabase request says denied/unavailable | Inspect provider logs with authorized administrator access. Backend sanitizes URLs/SQL/secret details; never make private buckets public as a workaround. |

Before publishing: complete the two-user hosted RLS/Storage checklist, browser/theme/responsive/PNG/PDF checks, Docker/provider configuration validation and actual frontend/backend communication. These checks must be recorded independently of local unit/build passes.
