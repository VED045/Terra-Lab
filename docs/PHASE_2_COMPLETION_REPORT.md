# TerraLab Phase 2 completion report

20 October 2026 · scientific model version 0.2.0

**Status:** Phase 2 implementation and automated scientific/API validation are delivered. Browser interaction, visual export/print layout and authenticated cloud acceptance remain pending manual verification. The Phase 2 acceptance gate is therefore not represented as fully closed. No Phase 3 work has started.

The implementation is in `C:\Users\Ved\Desktop\TerraLab`. Existing Phase 1 editing, project persistence, auth/profile, ten themes, calibrated-range preview and `/solve` contract are preserved. The new Laboratory command adds an explicit experiment workflow; it does not relabel Phase 1 outputs as other estimators.

## Implemented behavior

- Independent calibrated TOA, one-way pseudorange with an estimated receiver clock, covariance-aware reference TDOA, calibrated RTT, AOA, log-distance RSS, and declared two/three-component TOA/AOA/RSS hybrids.
- SVD linear LS; weighted/unweighted nonlinear LS; Huber and Soft-L1 robust fits; residual rejection; seeded range RANSAC; nominal fixed-covariance Gaussian MLE; EKF and UKF with position/velocity and optional clock bias/drift. The compatibility matrix is enforced in the UI and both request schemas. Particle filtering remains optional and is not included.
- Gaussian jitter/range noise, receiver/transmitter clocks and drift, hardware/calibration delay, survey uncertainty, deterministic missing links, dropout/availability, positive NLOS path bias, Student-t contamination, common timing correlation, geometric blockage, detection/SNR, shadowing and RSS noise. All new numeric controls expose units, bounds, defaults, descriptions, sliders and direct entry.
- Existing mobility evaluated at each observation epoch; fixed-seed independent streams; immutable matched frames across estimators; parameter sweeps for timing, NLOS, speed and anchor count; optional interior grid locations; actual progress, cancellation, job errors, checkpoint recovery and runtime measurement.
- Actual mean/median/RMSE/P95/max error, availability/failure counts and reasons, residual statistics, geometry condition and median/P95 computation time. Histograms, CDF, trajectories, time/sweep/runtime plots and sampled spatial error/availability layers use stored numerical output.
- Toggleable truth/estimate paths, error vectors, ranges, TDOA contours, AOA bearings, active/NLOS/missing/rejected links, justified nominal ellipses, coverage, geometry and heatmaps. Inspector/bottom-panel labels and Share/export switch to recorded scientific results when a laboratory overlay is active, avoiding mixed baseline/scientific metrics.
- Complete snapshots in browser IndexedDB, atomic API JSON checkpoints, import/export JSON and CSV, printable HTML reports, scientific screenshots, and optional immutable private Supabase Storage snapshots in checked JSON chunks. Workspace edits do not alter previous results; no new database migration or credential is required.

The full equations, estimator matrix and limitations are in [PHASE_2_METHODS.md](PHASE_2_METHODS.md). Every numeric laboratory parameter is listed in [LAB_PARAMETER_REFERENCE.md](LAB_PARAMETER_REFERENCE.md). The research methodology matrix and implementation progress have been updated.

## Executed validation

| Check | Actual result |
|---|---|
| `npm test` in the Desktop checkout | **126 passed**. One live integration test is skipped by default and was executed separately. |
| `npm run test:python` in the Desktop checkout | **85 passed**, including all 20 preserved Phase 1 Python tests. One nonblocking upstream Starlette/httpx deprecation warning remains. |
| Isolated real Next route → FastAPI worker → persisted output integration | **1 passed** against the final Desktop API on port 18002; 18 generated noiseless estimator epochs returned matching hashes and <1e-6 m errors. |
| `npm run typecheck` | **PASS**, strict TypeScript. |
| `npm run build` | **PASS**, production Next.js build with existing local public Supabase configuration; both `/api/solve` and `/api/laboratory` included. |
| Clean timing example | **3,600/3,600 estimator epochs completed**, 1,200 shared frames, no failed fixes; 4.023 s total on this run. |
| Contaminated timing example | **3,600/3,600 estimator epochs completed**, 1,200 shared frames, no failed fixes; 5.231 s total on this run. Large errors are retained as successful numerical estimates, not discarded. |
| New browser workflows / visual QA | **NOT RUN**. The existing user tab was blocked by browser policy; that restriction was not bypassed. New acceptance tests are written in `tests/e2e/laboratory.spec.ts`. The older 14 Chromium baseline passes are historical evidence, not a new Phase 2 pass. |
| Live authenticated cloud / two-user isolation | **NOT RUN**. Chunking, checksum failures and incomplete upload publication are unit-tested with Storage mocks; this does not establish a live user-session pass. Existing owner policies are preserved. |

Numerical fixtures cover all seven noiseless models (<1e-5 m tolerance), unknown clock recovery, exact timing/RTT conversions, TDOA off-diagonal covariance and common-mode cancellation, collinearity/condition, total dropout, detection, missing reference, robust/rejection/RANSAC behavior, fixed-seed replay and paired hashes, supported EKF/UKF model combinations, known velocity and motion, parameter sensitivity, large translated coordinates, cancellation, failed jobs and stored checkpoint recovery. Tolerances were not loosened to hide failures.

A real stability issue was corrected: subtracting large common timing covariance terms could erase tiny independent variances. TDOA now differences the independent and common factors separately, preserving the small positive covariance. Windows test temp-directory ACL problems were addressed with an ignored repository-local pytest temporary directory.

## Reproducible actual experiment

Six anchors at `(0,0), (60,-10), (120,0), (120,85), (60,100), (0,85)` m; three receiver locations `(45,38), (25,25), (90,60)` m; 100 independent trials/location; seed **20261020**; timing sweep **0.1, 1, 3, 10 ns**; per-anchor extra timing sigmas `0, .2, .4, .6, .8, 1 ns`; calibrated TOA; LS/WLS/Huber; one epoch per trial. Each estimator receives exactly the same observations/covariance for its paired frame. Values are synthetic simulation parameters, not real hardware specifications.

The contaminated example adds 10% independent NLOS with exponential mean excess path 5 m, 2% Student-t(3) contamination with scale 20 sigma, and zero extra NLOS attenuation so this benchmark isolates observation corruption from signal loss. The clean example disables both contamination probabilities. Both use zero additional range noise, surveyed coordinates and no obstacles. There are 300 attempts per estimator/timing level.

Run from the repository root:

```powershell
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100 --clean --out docs/examples/timing-clean
```

The script writes request, complete result and summary JSON. Committed actual files:

- [Contaminated request](examples/timing-benchmark.request.json), [complete output](examples/timing-benchmark.result.json), [summary](examples/timing-benchmark.summary.json).
- [Clean request](examples/timing-clean.request.json), [complete output](examples/timing-clean.result.json), [summary](examples/timing-clean.summary.json).

Full outputs include every observation, covariance, truth, estimate, residual, failure, rejection, matched hash, software/runtime environment and measured timing. To open them in TerraLab, use Laboratory → Saved snapshots → Import experiment JSON; restore the snapshot network to rerun/preview. Random values/outputs reproduce with the same seed and pinned software; IDs derived from the example, elapsed time, timestamps and runtime are not statistical accuracy claims or cross-platform timing guarantees.

### Position RMSE, metres

| Timing ns | Clean LS | Clean WLS | Clean Huber | Contaminated LS | Contaminated WLS | Contaminated Huber |
|---|---|---|---|---|---|---|
| 0.1 | 0.1622 | 0.0774 | 0.0770 | 2.4518 | 3.0097 | 2.8101 |
| 1 | 0.3537 | 0.2935 | 0.2937 | 2.3160 | 1.8847 | 0.7316 |
| 3 | 0.8548 | 0.7271 | 0.7320 | 4.6001 | 2.9614 | 1.4034 |
| 10 | 3.1374 | 2.6098 | 2.6528 | 27.0337 | 13.5261 | 7.6175 |

Every group had **100% numerical fix availability / zero failed fixes**. This does not imply small error: extrema remain in the data. At 0.1 ns under contamination, WLS and Huber have worse RMSE than LS even though their median errors improve. At 1 ns, Huber reduces RMSE by 61.2% relative to WLS. Under clean noise at 0.1 ns, WLS reduces RMSE by 52.3% relative to linear LS, but that comparison changes both linearization and weighting. Add NLS to isolate weighting. There is no claim that robust losses or weights always improve accuracy.

### Estimator runtime, milliseconds: median / P95

| Timing ns | Estimator | Clean median / P95 | Contaminated median / P95 |
|---|---|---|---|
| 0.1 | ls | 0.3120 / 0.3807 | 0.3148 / 0.4243 |
| 0.1 | wls | 1.0259 / 1.2652 | 1.1372 / 1.4620 |
| 0.1 | huber | 1.6790 / 2.6210 | 2.2744 / 8.6047 |
| 1 | ls | 0.3124 / 0.3773 | 0.3113 / 0.3712 |
| 1 | wls | 1.0429 / 1.2554 | 1.1620 / 1.5086 |
| 1 | huber | 1.2555 / 1.6683 | 1.5598 / 7.1239 |
| 3 | ls | 0.3140 / 0.4052 | 0.3141 / 0.3831 |
| 3 | wls | 1.1662 / 1.4175 | 1.2003 / 1.6443 |
| 3 | huber | 1.3931 / 1.7116 | 1.5203 / 6.0215 |
| 10 | ls | 0.3106 / 0.3948 | 0.3573 / 0.4215 |
| 10 | wls | 1.2631 / 1.5114 | 1.4708 / 2.0438 |
| 10 | huber | 1.5559 / 1.9091 | 1.7776 / 2.6683 |

These are measured estimator-call costs, including initialization/diagnostics and failed calls if present. Observation generation, browser rendering and storage are excluded. Benchmarks were recorded sequentially; machine scheduling, warmup and background load can change timings. There is no worst-case throughput guarantee at the configured job limits.

Runtime environment recorded by the example: Python **3.12.14**, NumPy **2.5.4**, SciPy **1.18.1**, `Windows-11-10.0.26300-SP0`. The tested frontend uses Node 24.19.0 and Next 16.4.2; package locks/pinned Python requirements remain authoritative.

## Limits and acceptance still required

1. Horizontal synthetic measurements only. No RF waveforms, ray tracing, real-radio calibration, antenna arrays, carrier ambiguities, multiband CSI or hardware accuracy validation.
2. Nominal Gaussian covariance/likelihood and local uncertainty assumptions can be misspecified by NLOS, residual clock/hardware bias, temporally correlated survey/shadowing and heavy-tailed noise. Angular likelihood is a local wrapped-residual approximation. Nonlinear multistart and finite RANSAC do not guarantee a global solution. Ellipses are suppressed where the implemented assumptions are clearly violated.
3. EKF/UKF assume constant velocity with configurable acceleration noise; first covariance/rate initialization is fixed as documented. Missing/invalid updates count as failed fixes, with only the internal prediction retained for later epochs. Particle filtering is not included.
4. This is a bounded local-process worker, not a distributed or multi-user experiment scheduler. Limits are 100 objects, 100,000 estimator epochs, 500,000 stored anchor observations and four queued/running jobs. Restarted jobs are interrupted, not silently resumed; checkpointed partial data is retained. Cancelled jobs may have a partial paired set at their boundary.
5. SVG plots cap displayed traces at 2,000 points; all metrics use full output. Spatial overlays summarize sampled bins and make no claim of continuous/interpolated coverage. TDOA contours are a marching-squares visualization, separate from the numerical solver.
6. Local IndexedDB depends on this browser/origin/storage availability; raw JSON is the portable backup. Cloud chunk uploads use existing policies; failed uploads may leave unpublished fragments, and the current cloud browser list loads the newest 100 manifests. No anonymous grants were added.
7. Phase 1 unit/API contracts and the production build pass. Full Phase 1/2 browser interactions, responsive layout, all themes, screenshot rasterization, print layout, auth session behavior and cloud isolation must still be checked manually. No visual/browser pass is claimed.

## Manual verification steps

1. Restart the existing dev processes in `C:\Users\Ved\Desktop\TerraLab` if needed, then run `npm run dev` and refresh the app. Confirm the editor, settings, profile, signed-in cloud badge and ten themes still work. Save/reload a Phase 1 project and run both browser/Python baselines.
2. Open **Laboratory**. Switch every measurement model; confirm incompatible LS/RANSAC choices are disabled. Change numeric values with both slider and direct entry; check units, bounds and inline descriptions. Set a TDOA reference and deliberate missing link, then confirm a missing explicit reference yields no fix.
3. Load the six-anchor benchmark, run it, inspect all performance/failure/runtime tables, distributions and sweeps, then import the committed actual example. Its numerical values should match the table above; freshly measured runtime will differ. Include NLS when isolating weighting.
4. Choose a moving receiver, positive duration (for example 10 s), and WLS/EKF/UKF; inspect the changing truth and estimate trajectories. Sweep moving speed. Run anchor-count/NLOS sweeps separately. Set dropout to 1 and confirm unavailable/null errors, 0% availability and 100% failure rather than zero error.
5. Start a longer job, request cancellation and confirm partial counts/status. Refresh while a job runs and check reconnection. Restart the API during a separate test job and verify interrupted/checkpointed status rather than false completion.
6. Add a grid, preview a recorded epoch and toggle every scientific layer. Check the selected estimator/epoch in the canvas, inspector and bottom panel. Change the network: the old overlay must be hidden. Explicitly restore its snapshot to preview again; change view/theme without changing scientific values.
7. From the scientific preview, open Share/export; check PNG, complete JSON, CSV with failures, and printable HTML report. Verify that scientific metrics are used. Clear the lab overlay and check that Phase 1 export behavior returns.
8. Reopen local snapshots after reload and change the workspace; old results must remain unchanged. Save/load a private cloud snapshot while signed in, including an output larger than 2 MB. Confirm a second test user cannot list/download the first user's objects. Confirm interrupted/failed uploads do not appear as completed manifests.

Stop at Phase 2. Phase 3 requires the user's explicit approval.
