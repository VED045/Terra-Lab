# Phase 1 implementation progress

Status: **Phase 2 implementation and automated scientific/API validation delivered; browser/cloud acceptance pending**. Current Desktop checks: 126 frontend/shared unit tests, 85 Python tests, one separately enabled real Next-handler/FastAPI integration test, strict TypeScript and production build pass. Two actual six-anchor/three-location benchmarks each completed 3,600 paired estimator epochs. Full browser interaction/visual export/authenticated cloud acceptance remains unverified because access to the user tab was policy-blocked. See PHASE_2_COMPLETION_REPORT.md and PHASE_2_METHODS.md. The Phase 2 acceptance gate is not represented as fully closed; Phase 3 has not started.

Delivery directory: `C:\Users\Ved\Desktop\TerraLab`.
Date: 20 October 2026.
Git origin: `https://github.com/VED045/Terra-Lab.git`. The user has authorized pushing Phase 1 to this remote.

## Completed

The sections below record the historical Phase 1 delivery. Current Phase 2 scope and validation are recorded at the end and in the completion report.

- Inspected all seven supplied PDFs and the screenshot. Recorded paper-specific decisions, measurement assumptions and evidence limits in `research/methodology-matrix.md`.
- Built the requested monorepo: Next.js App Router/strict TypeScript web UI, shared Zod models and deterministic simulation functions, FastAPI/Pydantic/NumPy/SciPy service, Supabase migrations and tests.
- Added a navy engineering workspace with light theme, navigation rail, object tree/search, command bar, toolbar, vector canvas, inspector and collapsible simulation/log panel. Mobile has a properties drawer. Radix dialogs/tooltips and keyboard focus states are implemented.
- Implemented transmitter/receiver/building/wall/polygon/path models. Editable coordinates, enabled flags, RF, timing/calibration, noise, receiver, motion and trajectory properties are saved as structured state.
- Implemented selection, multi-selection, selection box, drag, numeric geometry, duplicate/delete, zoom about cursor, pan, fit, labels/grid, 5 m snapping, distance measurement, layers, context actions, undo/redo and keyboard shortcuts.
- Implemented stationary, constant velocity, linear, circular, seeded random waypoint and editable waypoint mobility. Play, pause, stop/reset, restart, single step, speed multiplier and timeline scrubbing use deterministic simulation time.
- Implemented calibrated-range synthesis and Householder QR/SVD baselines with observation validation, minimum-count/rank/condition checks, explicit failure states, links, estimates, truth, error vectors, fitted distances, residuals and position error.
- Connected explicit Python baseline runs through `/api/solve` to FastAPI. Verified that returned coordinates reach the canvas/inspector. Browser QR powers live preview and time-sampled charts.
- Implemented local project save/reload/autosave; create from four seed templates; rename, duplicate, archive/unarchive and delete; versioned JSON import/export; complete configuration snapshots. Fresh workspaces receive individual UUIDs.
- Implemented optional Supabase registration, email/password login, logout, user project queries/upserts/deletes and private Storage snapshots. Included per-owner row/storage policies and local Supabase configuration. No service-role key is used.
- Added Plotly error/time charts, CSV truth/estimate exports, diagnostics and documentation. Chart/export samples cover the latest 400 timestamps at intervals of `max(step, 0.5 seconds)`.
- Installed dependencies and verified the application in the requested Desktop directory.

## Verification executed

| Command / check                                    | Final result                  | Evidence covered                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                | PASS                          | Strict TypeScript compilation                                                                                                                                                                                                                                                               |
| `npm test`                                         | PASS — 53 tests               | Coordinate transforms, Euclidean distance, noiseless recovery, redundant observations, translated geometry, rank/conditioning, invalid observations, duplicate IDs, seeded noise, LOS, six motion modes, clock, schema validation, serialization, persistence and editor transactions       |
| `npm run test:python`                              | PASS — 20 tests               | SVD recovery, redundancy, translated geometry, invalid/duplicate/wrong-type/wrong-unit input, API contract, degeneracy, residuals and estimates outside anchor editing bounds                                                                                                               |
| `npm run build`                                    | PASS                          | Next.js production compilation, types, prerender and API route                                                                                                                                                                                                                              |
| `npm run dev`                                      | PASS                          | Both web and scientific service started from Desktop folder without activating Python manually                                                                                                                                                                                              |
| Web HTTP health                                    | PASS — 200                    | `http://127.0.0.1:3000`                                                                                                                                                                                                                                                                     |
| Scientific health                                  | PASS — `status=ok`, `phase=1` | `http://127.0.0.1:8000/health`                                                                                                                                                                                                                                                              |
| Playwright Chromium                                | PASS — 14 tests               | Solver/table without browser errors; add/edit/undo/redo/save/reload; playback; polygon/path creation; degeneracy; actual Next→Python request; response rendering; themes/account setup; drag/multi-select; autosave during playback; project lifecycle; mobile width/inspector; screenshots |
| Visual review                                      | PASS                          | Desktop dark, desktop light, project library and 390 px mobile screenshots inspected                                                                                                                                                                                                        |
| Authenticated Supabase / migration / RLS / Storage | NOT RUN                       | Credentials and Supabase instance not supplied                                                                                                                                                                                                                                              |

## Failures encountered and resolved

- Initial object-union inference failed TypeScript validation; factory overloads now retain the correct object type.
- Sandbox cache permissions prevented an initial test/build attempt. Both were rerun with approved filesystem access and passed in the final folder.
- SVG title fragments caused React hydration errors. Titles now use single string children; browser tests assert no page errors.
- A test initially selected the simulation tab in the bottom panel instead of the inspector. The selector now identifies the inspector explicitly.
- The estimate overlay intercepted receiver pointer events. Estimate/measurement overlays no longer intercept node selection or dragging.
- Autosave initially reset its timer on simulation renders. The mutation callback is stable, and autosave during playback is covered by an E2E test.
- Final server-log inspection found a Plotly resize rejection during panel changes. Resize now checks visibility and handles a panel disappearing mid-resize; plots are purged only on unmount. Playback/panel toggling is included in the browser error check.
- Reviewed and corrected the Supabase auth subscription lifecycle under React Strict Mode. This was code review, not a live cloud test.
- Made test screenshot output paths portable and gave each fresh browser project its own UUID to avoid collisions in a shared cloud table.

## Known limits and remaining setup

1. Supabase public URL/key are configured, Auth responds successfully and the project table now exists with anonymous access denied. Authenticated profile updates, two-user RLS, cloud CRUD and Storage isolation still require live acceptance using the README checklist. Do not treat local/mock tests as authenticated cloud acceptance.
2. RF/timing/clock/altitude fields are persisted metadata in Phase 1. They do not inject propagation or clock errors into calibrated horizontal ranges. Unknown clock bias is not solved.
3. Obstructions flag exact 2D geometric intersections. With exclusion off they do not change the synthetic range; with exclusion on those observations are removed. No advanced propagation is implemented.
4. Constant-velocity and linear modes both follow the configured speed and heading. User-defined paths use the trajectory's speed. Random waypoint evaluation is seed reproducible.
5. Charts/CSV retain a bounded deterministic sample window, not an unlimited result database. Playback always uses browser QR for responsiveness; explicit Python runs use SVD. Failed fixes remain missing observations, not zero error.
6. Local persistence is browser/origin specific. Use JSON exports for portable backups; account sync requires configuration. No collaboration or automatic local-to-cloud migration is included.
7. Tests were executed on Windows with Chromium, Node 24.19.0 and Python 3.12. Other browsers/platforms were not tested. A nonblocking upstream Starlette warning recommends a future `httpx2` test-client migration; all Python tests pass with pinned `httpx`.
8. No public deployment has been performed. GitHub source publication is authorized; the push result is recorded in the user handoff.

## Review gate

Phase 1 local acceptance is complete. Cloud acceptance remains an explicit setup task. Stop here and wait for user review. Do not implement Phase 2 until the user explicitly approves it. Proposed next-phase steps are in `PHASE_1_REPORT.md`.

## Profile and export follow-up

Signed-in profile cards, display-name editing, network PNG screenshots, importable setup JSON, timestamped CSV samples and printable HTML reports are implemented. The original browser results below are historical; later UI changes were not re-tested in the blocked in-app tab. See PROFILE_SHARING.md for the exact current verification and manual acceptance checklist.

## Phase 2 — 20 October 2026

Explicit user approval superseded the historical Phase 1 review gate. Preserved the working editor/baseline and added a separate scientific laboratory: TOA/pseudorange/TDOA/RTT/AOA/RSS/declared hybrids; LS/WLS/NLS/Huber/Soft-L1/rejection/RANSAC/nominal Gaussian MLE/EKF/UKF; documented clock, covariance, mobility, propagation and compatibility assumptions; bounded paired Monte Carlo jobs; parameter sweeps; all requested error/failure/residual/runtime metrics; scientific charts/layers and actual recorded-output exports.

Complete configurations and outputs persist through atomic API checkpoints, browser IndexedDB, portable JSON/CSV and checked immutable chunks in the existing private Supabase bucket. No new migration, anonymous grant or service credential was needed. Project edits do not mutate previous results. Cancelled, failed and interrupted jobs retain explicit status and recorded partial output.

Final tests in the Desktop checkout: `npm test` 126 passed (one opt-in live integration test skipped by default); `npm run test:python` 85 passed; separately enabled live Next handler → isolated FastAPI worker → checkpoint/output test 1 passed; `npm run typecheck` and `npm run build` pass. The Python suite still emits one upstream nonblocking Starlette/httpx deprecation warning. New browser tests are authored, not executed. Earlier Chromium passes remain historical.

The actual clean and contaminated benchmarks are committed under `docs/examples/`, generated by `scripts/benchmark_phase2.py`. Each contains 3,600 attempted estimator epochs and 1,200 matched observation frames with zero numerical failures. All errors/extrema remain included; weighting/robustness do not always improve RMSE. The report tabulates actual error and runtime results and distinguishes linearization from weighting.

Resolved scientific/verification issues include stable TDOA common-mode covariance cancellation, explicit handling of undefined coincident-anchor AOA, no-fix accounting through filter update gaps, race-free job snapshots/checkpoints, Windows pytest temporary ACLs, and scientific preview/export labels that cannot mix Phase 1 metrics with Phase 2 images.

Manual UI/theme/responsive checks, screenshot/print rendering, signed-in Storage round-trips and two-user cloud isolation remain required. See the manual checklist in PHASE_2_COMPLETION_REPORT.md. Stop after Phase 2 and wait for explicit Phase 3 approval; no collaboration, particle filter, advanced multiband CSI or waveform processing was implemented.
