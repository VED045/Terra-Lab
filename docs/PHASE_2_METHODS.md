# Phase 2 scientific methods

Software model version 0.2.0. Phase 1 `/solve`, browser QR preview, editing, mobility, project IDs, cloud policy and export contracts are retained. The laboratory is an additional, explicit Python experiment workflow. Its canvas preview is a frozen result, not the Phase 1 preview relabeled as another algorithm.

## Coordinates, time and units

All geometry is horizontal Cartesian XY in metres. Altitude/device type are descriptive fields and do not enter 2D equations. Time is seconds; clock offsets, hardware delays and timing jitter controls are nanoseconds; drift is ppm; carrier and bandwidth are MHz. The exact conversion is `c=299792458 m/s`, `1 ns=0.299792458 m`, and `1 ppm=1000 ns/s`.

Each epoch evaluates the receiver's configured mobility at that epoch's time, including its observation update interval. Stationary, velocity/linear, circular, seeded random waypoint and editable trajectory modes use the same route equations as Phase 1. A trial is one full trajectory realization, not repeated evaluation of the initial location. Anchor survey errors and shadowing are held fixed per trial/location; jitter, dropouts, contamination and common timing noise are redrawn per epoch.

## Measurement models

Let `a_i` be the nominal anchor, `a_i* = a_i + survey_error_i` the simulated actual anchor, and `d_i=||p(t)-a_i*||`. Survey errors have independent X/Y sigma `anchorSigmaM`. Estimators receive nominal anchor coordinates. Define:

```
b_rx_ns(t) = receiver.clockOffset + 1000*receiver.clockDrift*t
b_tx_i_ns(t) = anchor.timingOffset + 1000*anchor.clockDrift*t
sigma_t_i_ns = hypot(experiment.timingNs, anchor.timingUncertainty)
sigma_r_i_m = hypot(experiment.noiseM, anchor.noise)
```

The simulator supplies a **known nominal covariance**, not a covariance inferred from measured residuals. First-order survey-error contributions to bearing/RSS variance use the simulated true distance; this is a simulator-side covariance approximation, not an operational method for estimating unknown noise. A `1e-12` variance floor supports zero-noise numerical tests. `covarianceScale` changes the assumed covariance, not the generated draws. Random-waypoint mobility preserves the Phase 1 project seed; the laboratory seed controls independent error/experiment streams. Both seeds/configurations are recorded.

| Model | Observation and residual units | Assumptions / limits |
|---|---|---|
| Calibrated TOA | `rho_i=d_i+c*(b_rx_ns+b_tx_i_ns+hardwareDelay_i)*1e-9+NLOS_i+noise_i`, metres | Configured delays are **residual calibration/synchronization errors**, so nonzero values deliberately bias the position-only estimator. Clean calibration means zero residual delays and synchronized receiver. |
| One-way pseudorange | Same generated observation; prediction `||p-a_i||+B`, metres | Joint XY and unknown receiver clock bias `B` in metres. No ground-truth clock initialization. At least four available noncollinear anchors are required by this implementation. Transmitter-specific errors cannot be absorbed by one common receiver-clock state. |
| TDOA | `D*rho`, metres; `D` subtracts one shared reference | Prediction is the distance difference. Covariance is exactly `D R Dᵀ`; shared receiver-clock/common timing terms cancel. Four available anchors are required here to reduce minimal-layout ambiguity. `auto` selects the first available enabled anchor in network order; a missing explicit reference causes no fix, not a silent replacement. |
| RTT | `T_ns=(2*(d_i+NLOS_i)/c*1e9 + actualTurnaroundNs + hardwareDelay_i)*(1+receiverDrift*1e-6)`; `r=c*(T_ns-calibratedTurnaroundNs-calibratedEquipmentNs)*1e-9/2+noise`, metres | Constant clock offset and transmitter epoch offset cancel. Receiver clock-rate error scales the interval. One timing-jitter/common-noise draw represents uncertainty of the **total** round-trip interval and therefore has half the one-way range conversion. Turnaround and equipment calibration errors remain explicit. |
| AOA | `atan2(p_y-a_iy*,p_x-a_ix*) + angular_noise + NLOS_deflection`, radians | Gaussian angular sigma entered in degrees. Residuals wrap to `[-π,π)`. NLOS deflection is the signed approximation `atan2(excess_path,max(d,1 m))`; no array, antenna orientation or phase front is simulated. At least two nonparallel bearings with full local Jacobian rank are needed. |
| RSS | `P_tx - PL0 - 20log10(f/f0) - 10n log10(max(d,1 m)) + shadow - NLOS_loss + noise`, dBm | Reference distance is 1 m; `PL0`, `f0`, exponent, Gaussian dB shadowing and measurement noise are configurable. Fits use the log-distance dB equation; RSS linear LS/RANSAC first invert it to range and are not log-domain MLE. Distances below 1 m are clamped in path loss and have no RSS distance gradient. |
| Hybrid | Any selected two or three of calibrated TOA, AOA and RSS | Stack native observation residuals and whiten with a nominal block covariance. Common timing correlation exists within the TOA block; cross-block zero-mean noises are assumed independent. Shared NLOS/outlier flags and survey perturbations induce unmodeled cross-block dependence; the block covariance is a nominal approximation. RTT/pseudorange/TDOA hybrid combinations are not declared or exposed. |

For one-way timing, nominal range covariance is diagonal `(c*sigma_t*1e-9)^2 + sigma_r^2 + survey_sigma^2`, plus a rank-one common timing term. For RTT, timing/common terms divide by two before squaring. AOA survey variance adds approximately `survey_sigma²/max(d,1)²`; RSS adds `(10n/ln(10)*survey_sigma/max(d,1))²` to shadowing/noise variance. TDOA differences the resulting entire covariance, including the reference variance. Hybrid covariance is built from all rows before whitening.

## Availability and approximate propagation

Obstacle polygons/rectangles/walls use segment intersection, boundary contact and point-in-polygon tests. A geometric obstruction always means NLOS. Additional random NLOS probability is independent per link/epoch. Timing excess paths are nonnegative exponential draws with configurable mean. This is a statistical approximation, not material-specific multipath or RF ray tracing.

The received-power model above also gates every measurement type. A link must exceed the dBm detection threshold and an SNR threshold using `noise floor = -174 + 10log10(bandwidth_Hz) + noiseFigure_dB`. Carrier frequency, power and bandwidth therefore have real link-budget effects. Availability probability, deterministic missing-anchor IDs, independent dropout and optional blocked-link exclusion further remove observations. The output records the reason for every unavailable anchor. Detection under shadowing/NLOS is informative censoring; the estimators do not model that selection likelihood.

Gaussian noises are distinct from heavy-tailed contamination. With the configured outlier probability, an additive Student-t(3) draw times `outlierScale` times the native Gaussian sigma is injected; the link's contamination draw/flag is shared between hybrid components. NLOS timing bias is positive; heavy-tailed errors may have either sign. Raw synthetic ranges are not truncated to zero, so sufficiently extreme contaminants can be physically inconsistent and produce large errors or no fix. Every such outcome remains in the record.

## Estimators and compatibility

| Estimator | TOA | Pseudorange | TDOA | RTT | AOA | RSS | Declared hybrid |
|---|---|---|---|---|---|---|---|
| Linear LS | yes | — | — | yes | — | inverted range | — |
| Weighted nonlinear LS | yes | yes | yes | yes | yes | yes | yes |
| Nonlinear LS | yes | yes | yes | yes | yes | yes | whitened joint |
| Robust NLS: Huber / Soft-L1 | yes | yes | yes | yes | yes | yes | yes |
| Residual rejection | yes | yes | yes | yes | yes | yes | yes |
| Range RANSAC | yes | — | — | yes | — | inverted range | — |
| Nominal Gaussian MLE | yes | yes | yes | yes | yes | yes | yes |
| EKF / UKF | yes | yes | yes | yes | yes | yes | yes |

The UI disables incompatible pairs; both request schemas reject them. Linear LS solves reference-differenced squared ranges by SVD, using a translated origin. It ignores the transformed observation covariance. WLS minimizes `||L^-1(h(x)-y)||²` for `R=L Lᵀ`. Gaussian MLE is the same objective when this known covariance is fixed; it is a separately named equivalent estimator, not a claimed new algorithm. For angular observations, the local wrapped-residual Gaussian objective approximates the exact wrapped-normal likelihood at large angular uncertainty. NLS minimizes native unweighted residuals for a single model; hybrid NLS is whitened to avoid adding metres, radians and dB without a scale.

Huber and Soft-L1 apply SciPy's loss to whitened residuals with configurable `f_scale`. For correlated TDOA, the loss acts in the specified Cholesky-whitened basis; it is not invariant to arbitrary rotations/reordering of correlated observations. Residual rejection starts with Huber, applies a fixed marginal-sigma gate, then refits retained observations by WLS. It fails explicitly if too few observations remain. RANSAC samples seeded three-anchor subsets, scores marginal-sigma consensus, and refits its best consensus by WLS. Rejected indices are retained with full original observations/residuals.

Nonlinear fits use analytic Jacobians, range-LS or centroid initialization, an observed pseudorange clock initialization, and additional layout-based starts for angular, TDOA, pseudorange and hybrid objectives. SciPy trust-region least squares enforces evaluation limits and convergence checks. Rank deficiency, observation shortages, collinear range layouts, nonfinite values, condition above `1e8`, and nonconvergence produce failed estimates. Multistart reduces local-minimum risk but does not prove a global optimum. RANSAC's finite iteration budget does not guarantee a consensus.

**Interpret comparisons carefully:** linear LS versus nonlinear WLS changes both the linearization and weighting. Compare NLS against WLS to isolate weighting, and WLS against Huber/Soft-L1/rejection to assess robustness with the same nominal covariance. MLE is only optimal under the stated zero-mean Gaussian model; NLOS, drift, shadowing over time and heavy tails violate parts of that model.

SciPy loss and solver definitions follow its [official least-squares documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html).

## Tracking filters and uncertainty

EKF/UKF states are `[x,y,vx,vy]`, or `[x,y,vx,vy,B,Bdot]` for pseudorange, with clock states in metres and m/s. Constant-velocity transitions advance position and clock bias by their rates. A discrete constant-acceleration model supplies `Q=σa²[[dt⁴/4,dt³/2],[dt³/2,dt²]]` per position/rate pair. Position and clock acceleration sigmas are independently configurable.

Both filters initialize from a valid WLS observation fit, zero velocity and fixed broad rate uncertainty (variance 100). The initial position covariance uses the nominal WLS covariance; pseudorange clock/rate variances use 100 and initial cross-covariances are omitted. Each filter is reset per trial, receiver and sweep condition. EKF uses the analytic native-model Jacobian, full measurement covariance and Joseph covariance update. UKF uses scaled sigma points (`alpha=.5, beta=2, kappa=0`), circular bearing means and wrapped innovations. Symmetrization/eigenvalue floors repair roundoff; materially negative covariance is a failure. These choices follow the [EKF derivation by Welch and Bishop](https://www.cs.unc.edu/~welch/media/pdf/kalman_intro.pdf) and [Wan and van der Merwe's UKF formulation](https://groups.seas.harvard.edu/courses/cs281/papers/unscented.pdf).

A missing/invalid update produces a failed fix and no published predicted position. Its internal prediction is kept for the next epoch; first-fix shortages delay initialization. Thus a prediction-only interval does not inflate fix availability. Turning/random paths stress the constant-velocity approximation. Per-trial survey errors and shadowing have temporal correlation that these filters do not explicitly augment; covariance coverage may be optimistic.

Local Jacobian condition is computed from the whitened observation Jacobian, including the clock column when applicable. It is not the Phase 1 differenced-system condition, GDOP, a global observability proof or a hardware accuracy claim. Nominal 95% XY ellipses use the 2D chi-square factor `5.991`: inverse local Fisher covariance for WLS/MLE, posterior covariance for filters. Ellipses are suppressed for robust/linear estimates, contamination/NLOS, unmodeled residual calibration bias, and first filter initialization. Remaining ellipses are local Gaussian approximations, particularly with survey uncertainty and temporally correlated errors.

## Experiments, metrics and persistence

NumPy PCG64 streams are initialized by `SeedSequence([seed,sweep_index,trial,location_index,epoch_index])`. Survey/shadowing and per-epoch observations use separate keyed streams. All selected estimators receive the **same frame object**, raw observations and covariance. Frames have canonical SHA-256 identifiers recorded on each estimator output. RANSAC receives a separate fixed seed stream. Adding/reordering estimators does not change measurements. Runtime and timestamps naturally vary across executions; cross-version/platform floating-point bit identity is not promised.

Sweeps support timing uncertainty, NLOS probability, receiver speed and enabled anchor count (first N enabled anchors in network order). An optional interior XY grid adds stationary receiver locations. A speed sweep requires a moving receiver; an explicit TDOA reference cannot be removed by the sweep. Noisy timing values are synthetic parameters, not inferred specifications of real radios.

Mean, median, RMSE, 95th percentile and maximum position error are conditional on successful fixes. Fix availability is successful/attempted; failure rate is failed/attempted. Failed fixes retain reason, epoch, truth, observation hash and computation time, with **null** position/error. Normalized residual RMS, mean, population standard deviation and absolute 95th percentile use original available observations, including rejected observations after a robust fit. Native-unit residual vectors remain in the output. Median/P95 runtime include every attempted estimator call, failures and filter initialization; generation, rendering and storage are excluded. Runtime includes estimator diagnostics/initialization and is machine/load dependent.

Cancellation is cooperative between estimator calls and keeps all completed epochs. Status distinguishes queued, running, completed, cancelled, failed and interrupted. Cancelled jobs can contain an incomplete paired set at the boundary; use completed jobs for balanced comparisons. API restart retains the last checkpoint and marks unfinished jobs interrupted; work since the last checkpoint is not claimed complete. Unexpected job errors retain checkpointed partial data and an explicit job error. Every report exposes attempted/planned counts and failure reasons.

The numerical loop runs in a bounded Python worker, separate from SVG/React rendering. Limits: 100 objects, 100,000 estimator epochs, 500,000 stored anchor rows, four queued/running jobs, and one active numerical worker per API process. These are local-process jobs, not a distributed scheduler. Atomic JSON checkpoints live under ignored `.terralab/experiments/`; terminal results are also saved to browser IndexedDB. Project edits never mutate those snapshots. Running-job IDs allow reconnection after refresh.

Private cloud snapshots use the existing `project-exports` bucket and owner-prefixed policies. JSON parts stay under the existing 2 MB per-file limit, with an immutable manifest published last and a complete-payload checksum. An incomplete upload has no complete manifest; unlisted fragments may remain after upload failure. No service key, new database migration or anonymous grant is needed. Local JSON/CSV export is available without an account; cloud acceptance still requires the signed-in user's manual test.

The laboratory plots error/time, truth/estimate trajectory, histograms, empirical CDF, sweep RMSE and median runtime from stored records. Each trace is capped at 2,000 displayed points; metrics/histogram/CDF calculations include all records. Trajectory gaps preserve failed estimates. Coverage and spatial-error canvas layers aggregate **sampled** locations into bins, with actual counts/availability; they do not interpolate an unmeasured continuous coverage field. Range circles, marching-squares TDOA contours, bearings, links, rejected observations, error vectors, trajectories, diagnostics and ellipses are independently toggleable. The overlay is hidden after network changes until its saved network is explicitly restored.

Every new numeric control has a slider, direct numeric entry, units, bounds, defaults and interpretation in the UI and [parameter reference](LAB_PARAMETER_REFERENCE.md). The source catalog is `packages/shared/src/laboratory.ts`; per-object timing/RF controls are in `laboratory-object-controls.tsx`. Existing inspector mobility fields remain available. Controls apply only to their documented measurement/estimator modes; a zero-duration run initializes filters once and is not a trajectory tracking experiment.

No particle filter, collaboration, advanced multiband CSI, RF waveform simulation or Phase 3 work is included.


## Phase 4A numerical correction

The acceptance matrix exercises all 62 declared model/estimator pairs at a noiseless known position with the existing `<1e-5 m` tolerance. AOA/Huber originally terminated 0.000263471965 m away at the covariance floor. Angular Huber/Soft-L1 now also try an observation-only WLS initialization; all candidates still minimize the same robust loss and the lowest converged cost wins. No ground truth, measurement equation, covariance, failure filtering or tolerance was changed. Existing stored outputs remain immutable; implementation commit/file hashes distinguish the correction. Broader robust-performance guarantees are not claimed.
