# TerraLab Phase 4A acceptance matrix

20 October 2026. Repository: `C:\Users\Ved\Desktop\TerraLab`. Baseline: clean commit `e2e84ba` (Phase 3). Platform 0.3.0; positioning model 0.2.0; project schema 1. The acceptance patch is uncommitted. No push, deployment, hosted migration, infrastructure change, or real-user data mutation was performed.

**Gate: NOT ACCEPTED FOR PRODUCTION.** Local evidence is substantial; real multi-account Supabase Auth/Storage, hosted migrations, provider/container checks, and production concurrency remain pending. Shared project access and optimistic versioning are implemented; synchronized real-time multiwriter editing is not implemented or claimed.

## Evidence and baseline

`PASS-L` means executed local automated acceptance; `PASS-SQL` means actual PostgreSQL grants/RLS/RPC execution with fixture Auth/Storage tables; `PASS-F` means a protocol/transport fixture; `PARTIAL` means explicitly bounded evidence; `PENDING-H` means real hosted acceptance is required. A fixture result is never a hosted pass.

| Check | Baseline before fixes | Final evidence |
|---|---|---|
| `npm test` | 145 passed; existing opt-in integration skipped | 145 passed; `logs/javascript.txt` |
| `npm run test:python` | 103 passed | 178 passed; `logs/python.txt` |
| `npm run test:database` | 31 checks passed | 44 checks passed; `logs/database.txt` |
| `npm run test:worker` | Passed; 18 noiseless estimator epochs | Passed after migration changes; `logs/worker.txt` |
| Existing opt-in Next route integration | Not enabled in default suite | Separately enabled: 1 passed; `logs/optin.txt` |
| `npm run typecheck` | Passed | Passed; `logs/typecheck.txt` |
| `npm run build` | Passed | PASS; `logs/build.txt` |
| `npm run test:e2e` | Discovery failed: CommonJS `import.meta` | 24 passed (serial Chromium); parallel-run limitation retained; `logs/browser-serial.txt` |
| Parallel browser run | After discovery repair: 16/20 passed; stale selectors, missing API, snapshot race exposed | Later 23/24 passed; active-page reload during export, retained in `logs/browser.txt`. Serial result is reported separately. |
| Hosted read-only probe | Historical reports were not treated as current proof | Auth settings 200; email enabled, confirmation required; projects HEAD 401; Phase 3 table probes 404; `HOSTED_READ_ONLY_PROBE.json` |

Existing skipped integration was **not added or newly skipped**: its opt-in case was explicitly executed separately against an owned temporary API. No scientific tolerance or prior assertion was loosened. The new all-pair test retains `<1e-5 m`; it first failed for AOA/Huber and passes after the minimal initialization fix.

Evidence files are delivered alongside this matrix in the chat output directory. The repository keeps these documents in `docs/acceptance/`; generated logs and figures remain outside source control.

## Feature traceability

Implementation paths below are repository-relative. Additional hosted steps refer to `COLLABORATION_TEST_PLAN.md` case IDs.

| Feature / intended behavior | Implementation / database | Executed tests and result | Additional acceptance / evidence limit | Severity / hosted? |
|---|---|---|---|---|
| 2D editor creates/selects/edits/duplicates/deletes real objects | `components/network-canvas.tsx`, `lib/store.ts`, shared model | `studio.spec.ts`, `interactions.spec.ts`, `store.test.ts`: PASS-L | Physical touch/pen and browser engines beyond Chromium pending | LOW / no for local |
| World coordinates, dragging, multi-selection | canvas; shared geometry | Drag/world-coordinate assertions and undo: PASS-L | Large-network manual ergonomics pending | LOW / no |
| Zoom, pan, fit, grid and labels | canvas; shared geometry | Tablet controls and existing geometry tests: PASS-L | Zoom/pan acceptance exercises controls; not every pointer gesture is exhaustively asserted | LOW / no |
| Undo/redo and accepted cloud version retention | `lib/store.ts` | Store/research tests; archive regression preserves geometry/history: PASS-L | H07/H08 live two-session conflict/recovery | HIGH fixed / yes |
| Autosave, reload and recovery | studio; persistence | Playback autosave, save/reload, corrupt-index recovery tests: PASS-L | H08 expired session during pending autosave | MEDIUM / yes |
| Six mobility modes | shared mobility; Python physics | Stationary, velocity, linear, circular, random, waypoint coverage across suites: PASS-L | Synthetic only, no hardware tracking | INFORMATIONAL / no |
| Ten palettes and dark/light persistence | shared themes; settings; CSS | All ten applied to canvas/dialog, reload and contrast unit tests: PASS-L | Only selected desktop/light/mobile screenshots visually reviewed; not all theme × viewport pairs | LOW / no |
| Desktop/tablet/mobile layout | studio, research CSS | 1600/1440 desktop, 1024 tablet, 390 mobile interactions: PASS-L | Mobile toolbar is horizontally scrollable; not every action appears simultaneously | LOW / no |
| Calibrated browser QR and Python SVD baseline | shared solver; API engine; `/api/solve` | Existing recovery/geometry suites and real browser → Next → Python: PASS-L | Public bounded baseline compute is intentionally separate from private experiment data | INFORMATIONAL / no |
| TOA synchronized timing and SI conversion | `physics.py`, `lab_models.py` | Known-position/noise/calibration tests; all compatible pairs: PASS-L | Synthetic assumptions retained | INFORMATIONAL / no |
| Pseudorange unknown receiver clock | physics; estimators | Unknown clock recovery, drift sensitivity, filters, pair matrix: PASS-L | Fixed CV filter assumptions; no real clock calibration | INFORMATIONAL / no |
| TDOA full shared-reference covariance | physics; estimators | Covariance, common-mode cancellation, missing reference, pair matrix: PASS-L | Minimal-layout ambiguities remain documented | INFORMATIONAL / no |
| RTT calibration and clock rate | physics | Round-trip factor/calibration sensitivity and all compatible pairs: PASS-L | No RF timestamp hardware validation | INFORMATIONAL / no |
| AOA wrapped residuals | physics; estimators | Wrap/coincident anchor, pair matrix: PASS-L after F07 | Zero-noise robust initialization was corrected; original tolerance preserved | MEDIUM fixed / no |
| RSS log-distance assumptions | physics; estimators | Power/frequency/bandwidth/shadowing/noise and pair matrix: PASS-L | Empirical path loss, 1 m clamp; no measured-channel acceptance | INFORMATIONAL / no |
| Declared TOA/AOA/RSS hybrid | lab models; covariance; estimators | Compatible combinations/invalid pairs and pair matrix: PASS-L | Nominal block covariance; not arbitrary measurement combinations | INFORMATIONAL / no |
| All supported estimators | `estimators.py` | New 62-pair noiseless first-fix matrix, each `<1e-5 m`; prior contaminated/filter cases: PASS-L | First fix does not prove all filters converge for all moving/noisy cases | INFORMATIONAL / no |
| NLOS, outliers, dropout, detection, missing rows | physics; experiments | Obstruction, contamination, dropout/availability, poor geometry/failure cases: PASS-L | Statistical simulation, not material-specific ray tracing | INFORMATIONAL / no |
| Seeded Monte Carlo / matched observations | experiments | Seed replay, shared hashes, sweeps, immutable input tests: PASS-L | Runtime/timestamps/platform bits intentionally differ | INFORMATIONAL / no |
| Accuracy/availability/failures retain bad estimates | experiments metrics | Full-data metrics test includes 1e9 m finite error and null failure: PASS-L | Error metrics conditional on successful fixes; availability includes failures | INFORMATIONAL / no |
| Sampled plots versus complete metrics | charts; publication; reports | Unit sampling tests, SVG/manifest comparison, PDF labels reviewed: PASS-L | PDF CDF is explicitly sampled; full SVG/JSON available | INFORMATIONAL / no |
| Local queued jobs/checkpoints/restart | experiments | Atomic checkpoints, interruption, cancellation/error tests: PASS-L | Local mode is single-user development, not a hosted queue | INFORMATIONAL / no |
| Durable queue/idempotency/resource caps | migration 002/004; cloud | SQL duplicate/conflict, 4-user cap and global 100/101 boundary: PASS-SQL | True overlapping transactions and provider load: H10 pending | MEDIUM fixed / yes |
| Leases/retry/stale worker fencing | migration 002; worker | Expired lease, new token, stale heartbeat/finalize, exhaustion, expiry: PASS-SQL; worker PASS-F | Actual process-kill/redeploy/provider recovery: H10 | HIGH / yes |
| Cancellation respects current access | migration 004 | Former submitter denied after revocation: PASS-SQL | In-flight requests may complete under an earlier authorization snapshot | HIGH fixed / yes |
| Worker computation → DB → Storage publication | cloud; worker; migrations | Actual FastAPI/worker/calculation + local HTTP fixtures: PASS-F; 18 epochs <1e-6 m | Real Supabase JWT and Storage HTTP success paths: H09 | BLOCKER pending / yes |
| Chunk checksums, bytes and identities | worker upload; research download | Unicode chunk roundtrip, tamper/path/identity/size checks: PASS-L | Server does not cryptographically attest user derivatives | INFORMATIONAL / yes |
| Unpublished/stale chunks remain inaccessible | migration 004 result policy | Viewer denied before publication and for unlisted old-attempt chunks: PASS-SQL | Hosted Storage list/download semantics: H09 | HIGH fixed / yes |
| Failed publication does not invent success | worker | Forced upload failure gives failed terminal state with null manifest and sanitized error: PASS-L | Orphan object retention/cleanup remains operational work | MEDIUM / yes |
| Immutable run and revision history | migrations; result schema; store | Direct update/delete denied; snapshot unchanged after workspace edit/reload: PASS-SQL/PASS-L | Admin/service-role compromise can bypass application protections | INFORMATIONAL / yes |
| Derived artifacts append-only and bounded | migration 003/004; publication | Metadata/object update/delete denied; 129th uploaded file denied, including orphans: PASS-SQL | Aggregate account/project quotas and cleanup pending | HIGH fixed / yes |
| Local project library and templates | research dashboard; persistence | Save, star, search, copy, rename, archive/restore/delete: PASS-L | Index is bounded to 200/table, search applies to loaded entries | LOW / yes for cloud |
| Versioned cloud saves/restore | migrations 002; persistence | SQL expected-version conflict and restore-as-new-revision: PASS-SQL; save-race unit tests | H02/H07 actual cloud UI and independent sessions | BLOCKER pending / yes |
| Renaming/archiving preserves pending edits | research dashboard | Red browser regression observed 99→45; now passes and undo survives | Revision replacement asks before discarding dirty current edits | HIGH fixed / yes |
| Snapshot completion feedback/archive refresh | laboratory dialog | Existing red browser test now passes after poll cleanup ordering fix | Storage-full behavior is an explicit error path; not every device quota tested | MEDIUM fixed / no |
| Local real experiment and re-open | Next proxy → Python → disk → IndexedDB | New acceptance workflow runs actual job, exports, edits workspace, reloads snapshot and verifies exact JSON | Does not establish durable hosted acceptance | INFORMATIONAL / no |
| Scientific JSON/CSV/SVG/PNG/PDF/manifest | exports; publication; reports | Actual download signatures, units/conditioning labels, full-metric manifest, 5 rendered PDF pages: PASS-L in isolated workflow | Native device sharing and arbitrary print drivers pending | LOW / no |
| CSI synthetic module | signals; signal dialog | Matched/weighted/MUSIC/ESPRIT, coherent/gapped/noise/validation tests; fixture browser output: PASS-L/PASS-F | Full MBWDE, CRB, real CSI/hardware are not implemented | INFORMATIONAL / no |
| Auth restore/events/token forwarding | auth-session; account; proxies | Unit race/unmount cases, production missing-session and JWT forwarding tests: PASS-L | Real confirmation/refresh/logout/account switching: H01/H08 | BLOCKER pending / yes |
| Owner/editor/viewer/outsider access | RLS + checked security-definer RPCs | Four isolated SQL identities, direct mutation and outsider reads denied: PASS-SQL | Four real Auth sessions/browser profiles: H03 | BLOCKER pending / yes |
| Direct + team grant composition | project_role; team RPCs | Team editor wins over viewer, owner-only team actions, last grant revocation: PASS-SQL | Actual hosted Teams UI: H05 | HIGH / yes |
| Invitation lifecycle and scope | share RPCs; dashboard | Malformed/null/expired/revoked/repeat redemption, no downgrade, snapshot viewer-only: PASS-SQL | H04 real supported UI invitation flow; reusable links are intentional | HIGH / yes |
| Shared history/export privacy | policies; private buckets | Outsider project/revision/run/job/artifact/object reads denied; final-grant revocation: PASS-SQL | Known published-object HTTP test required; empty/nonexistent downloads alone are insufficient | BLOCKER pending / yes |
| Request validation and safe errors | Zod proxies; Pydantic API; cloud | Invalid models/units/bounds/stream size, upstream error sanitization, missing sessions, CORS rejection: PASS-L | Database project validator is less complete than browser Zod; residual R02 | MEDIUM / yes |
| Production configuration | Dockerfile; Render; Vercel; env; startup | Local build/types; unsafe-local mode and wildcard CORS startup rejected: PASS-L | Docker unavailable; provider validation/deployment, redirects, secrets, health/readiness pending | BLOCKER pending / yes |

## Changes and remaining gate

See `SECURITY_REVIEW.md` F01–F08 for causes and regression evidence. New migration `202610200004_acceptance_security.sql` must be reviewed and applied only after approval and verification of hosted state. Existing migration 001 must not be rerun. An existing Phase 2 database is expected to need 002 → 003 → 004, but the live migration ledger has not been read.

No 3D or unrelated product work was started. The local audit stops at this gate. Production acceptance requires the hosted checklist, the unresolved limits in the security review, and the deployment verification plan.
