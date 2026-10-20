# API contracts

Interactive FastAPI schemas: `/docs`; OpenAPI: `/openapi.json`. Platform version 0.3.0, scientific positioning version 0.2.0. All inputs are structured JSON, never executable source. CORS uses exact configured origins. Body limits are enforced on streamed bytes at the API and Next proxies.

| Endpoint | Contract |
|---|---|
| GET /health | Liveness, versions, job mode and supported positioning models. Not a database/worker readiness assertion. |
| POST /solve | Preserved Phase 1 MeasurementSet → Solution contract; three or more calibrated ranges. Numerical/geometry validation remains unchanged. |
| POST /experiments | Phase 2 `{project,config}` schema. Local mode returns a disk-checkpoint job ID. Supabase mode requires `Authorization: Bearer <user access token>` and UUID `Idempotency-Key`; checked enqueue returns `{id}` with 202. |
| GET /experiments/{uuid} | Authorized current status/progress/summaries. UUIDs alone do not authorize cloud access. `?detail=true` returns a private artifact manifest for terminal cloud runs; the browser checks and reconstructs the full result from Storage. Local detail retains the complete Phase 2 result. |
| DELETE /experiments/{uuid} | Cooperative cancellation. Production job requester or project owner only; terminal work is not deleted. |
| POST /signals | Bounded experimental SignalRequest → generated CSI, normalized spectra, actual delay estimates/runtimes, validation labels/errors. Production requires a validated Supabase session. No MBWDE claim. |
| POST /reports/pdf | Bounded Report payload (complete configuration/summaries, ≤2,000 display records) → real `application/pdf`; does not rerun a solver. Production session required. Authenticated browser obtained protected source data through RLS; arbitrary supplied report data is not cryptographically attested. |

Next routes `/api/solve`, `/api/laboratory`, `/api/signals`, `/api/reports` proxy these operations to `SIMULATION_API_URL`. The laboratory query uses `?id=uuid&detail=true`. Requests forward user JWTs and idempotency keys, never worker credentials. Upstream errors are sanitized; validation issues return 400/422, size failures 413, permission/session failures 401/403, conflicts 409 where provided by PostgREST, unavailable services 503, small-operation saturation 429. API local invalid job IDs retain the prior 404 contract. Client save conflicts expose the SQL VERSION_CONFLICT message so edits can be recovered.

Database RPCs are documented by their typed migration signatures: save/restore/delete projects; manage direct/team members; assign teams; create/redeem/revoke invitations; save/delete templates; enqueue/cancel jobs; record derived artifacts. Only the worker may claim, heartbeat or finish jobs. Browser roles have no direct project/history/job mutation grants. Do not substitute a service-role client to resolve a user's denied request.

Production result transport format `terralab-result-1`: private bucket, ordered job/lease/part paths, total decoded byte count and full UTF-8 JSON SHA-256. Each part is a JSON envelope with base64 bytes. Publication manifests are inserted only after all chunks succeed. Per-frame observation hashes remain those produced by the unchanged scientific core. A reproducibility export separately hashes recursively key-sorted JS UTF-16-key-order JSON configuration; PostgreSQL's jsonb-text request hash uses its own serialization convention and should not be compared to that browser hash.

Only immutable terminal runs have complete artifacts. Failed/retry-exhausted jobs may expose durable metadata/logs/progress with `artifactUnavailable=true`, with no fabricated record rows. Administrative cleanup of unpublished upload fragments is separate from user-accessible history.
