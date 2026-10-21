# TerraLab AI parameter reference

Generated from the actual shared metadata and the Phase 2 source-grounded explanation adapter on 21 October 2026. These are implemented controls, not a list of proposed future features. Current values depend on the selected saved project; defaults below come from `labParameters` / `defaultLabConfig`.

Facts and ranges cite `packages/shared/src/laboratory.ts`; mathematical mechanisms cite `services/api/terralab/physics.py` and estimator behavior cites `services/api/terralab/estimators.py`. Direction statements describe the implemented mechanism. Effects on observed accuracy/runtime are qualified heuristics, not guaranteed improvements.

## Monte Carlo trials — trials

Unit: **trials**. Default: **20**. Allowed range: **1–1000**. UI step: 1.

Source-grounded fact: Independent measurement realizations per location and sweep point.

Increase: More independent realizations per location/sweep; more work and usually more stable estimated statistics.

Decrease: Fewer realizations reduce work but increase Monte Carlo uncertainty.

Metrics: Attempted samples, runtime and stability of estimated RMSE/quantiles.

Trade-offs and interactions: Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Trajectory duration — duration

Unit: **s**. Default: **0**. Allowed range: **0–300**. UI step: 1.

Source-grounded fact: Zero runs one epoch; positive duration evaluates moving truth at every sample.

Increase: More epochs along the actual motion; more work and more accumulated clock drift.

Decrease: Shorter trajectories reduce work; zero evaluates one epoch.

Metrics: Attempted samples, runtime and stability of estimated RMSE/quantiles.

Trade-offs and interactions: Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Sample interval — sampleStep

Unit: **s**. Default: **1**. Allowed range: **0.1–10**. UI step: 0.1.

Source-grounded fact: Fixed observation/filter update period; samples include t=0.

Increase: Larger intervals produce fewer trajectory samples and may miss motion.

Decrease: Smaller intervals increase sample count and computation.

Metrics: Attempted samples, runtime and stability of estimated RMSE/quantiles.

Trade-offs and interactions: Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Random seed — seed

Unit: **integer**. Default: **42**. Allowed range: **0–2147483647**. UI step: 1.

Source-grounded fact: SeedSequence streams keyed by sweep, trial, location and epoch; estimators share each frame.

Increase: Selects a different deterministic realization; numerical magnitude has no accuracy ordering.

Decrease: Also selects another realization; decreasing seed is not an improvement.

Metrics: Attempted samples, runtime and stability of estimated RMSE/quantiles.

Trade-offs and interactions: Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Spatial grid side — gridSize

Unit: **points**. Default: **0**. Allowed range: **0–12**. UI step: 1.

Source-grounded fact: Adds N×N stationary receiver locations inside anchor bounds; 0 disables grid.

Increase: Adds N squared stationary locations, increasing spatial coverage and work.

Decrease: Reduces grid locations; zero disables the additional grid.

Metrics: Attempted samples, runtime and stability of estimated RMSE/quantiles.

Trade-offs and interactions: Hold seed and observation conditions fixed for controlled comparisons; validate paired observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Timing uncertainty — timingNs

Unit: **ns**. Default: **1**. Allowed range: **0–1000**. UI step: 0.1.

Source-grounded fact: Per-link Gaussian standard deviation, combined in quadrature with anchor timing uncertainty; range sigma = c·sigma_t (RTT: c·sigma_t/2).

Increase: Larger independent timing sigma increases range uncertainty by c·sigma_t, or c·sigma_t/2 for RTT.

Decrease: Smaller timing uncertainty reduces this generated noise component, not bias or geometric ill-conditioning.

Metrics: RMSE, residual distributions, fix rate and covariance estimates.

Trade-offs and interactions: One-way timing scales by c; RTT scales by c/2. Correlation changes covariance weighting, not just marginal variance.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Additional range noise — noiseM

Unit: **m**. Default: **0**. Allowed range: **0–100**. UI step: 0.01.

Source-grounded fact: Independent Gaussian range sigma, combined with anchor residual noise.

Increase: Adds more independent range-noise sigma in quadrature.

Decrease: Reduces this extra range-noise component; anchor noise remains.

Metrics: RMSE, residual distributions, fix rate and covariance estimates.

Trade-offs and interactions: One-way timing scales by c; RTT scales by c/2. Correlation changes covariance weighting, not just marginal variance.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Correlated timing noise — commonTimingNs

Unit: **ns**. Default: **0**. Allowed range: **0–1000**. UI step: 0.1.

Source-grounded fact: One common Gaussian draw per epoch. Adds a rank-one covariance term; cancels in TDOA.

Increase: Increases the shared rank-one timing covariance term; the common component cancels in TDOA differences.

Decrease: Reduces shared timing uncertainty while leaving independent components unchanged.

Metrics: RMSE, residual distributions, fix rate and covariance estimates.

Trade-offs and interactions: One-way timing scales by c; RTT scales by c/2. Correlation changes covariance weighting, not just marginal variance.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Anchor coordinate uncertainty — anchorSigmaM

Unit: **m**. Default: **0**. Allowed range: **0–20**. UI step: 0.01.

Source-grounded fact: Independent x/y survey error fixed per trial/location; estimator uses nominal coordinates and a local variance approximation.

Increase: Increases fixed-per-trial coordinate survey error and its local variance approximation.

Decrease: Reduces nominal-versus-true anchor mismatch.

Metrics: RMSE, residual distributions, fix rate and covariance estimates.

Trade-offs and interactions: One-way timing scales by c; RTT scales by c/2. Correlation changes covariance weighting, not just marginal variance.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Measurement dropout — dropout

Unit: **probability**. Default: **0**. Allowed range: **0–1**. UI step: 0.01.

Source-grounded fact: Independent probability of losing an otherwise detectable anchor each epoch.

Increase: Removes more otherwise detectable links independently.

Decrease: Retains more otherwise detectable links.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Signal availability — availability

Unit: **probability**. Default: **1**. Allowed range: **0–1**. UI step: 0.01.

Source-grounded fact: Probability a detectable anchor is transmitting/available before dropout.

Increase: Keeps more anchors available before dropout.

Decrease: Removes more links before dropout.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Random NLOS probability — nlosProbability

Unit: **probability**. Default: **0**. Allowed range: **0–1**. UI step: 0.01.

Source-grounded fact: Additional independent NLOS events; obstacle intersections always classify NLOS.

Increase: Adds more independent random NLOS events beyond geometric obstruction.

Decrease: Reduces random NLOS events; obstructed links can still be NLOS.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Mean positive NLOS bias — nlosBiasM

Unit: **m**. Default: **5**. Allowed range: **0–1000**. UI step: 0.1.

Source-grounded fact: Exponential excess path length for NLOS timing. Bearing deflection ±atan(bias/d) is an approximation.

Increase: Increases the mean exponential excess path length on NLOS links.

Decrease: Reduces this excess timing-path component; it does not remove NLOS classification or loss.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## NLOS signal attenuation — nlosLossDb

Unit: **dB**. Default: **10**. Allowed range: **0–100**. UI step: 0.1.

Source-grounded fact: Extra link-budget/RSS loss on random or geometrically obstructed NLOS links.

Increase: Adds more dB loss to NLOS links and may trigger signal/SNR exclusion.

Decrease: Reduces this NLOS attenuation term; timing bias is a separate control.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Heavy-tailed outlier probability — outlierProbability

Unit: **probability**. Default: **0**. Allowed range: **0–1**. UI step: 0.01.

Source-grounded fact: Probability of an additive Student-t(3) contaminant; shared link flag across hybrid components.

Increase: Contaminates a larger proportion of links with the shared heavy-tail event.

Decrease: Reduces how often heavy-tail contamination is generated.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Outlier scale — outlierScale

Unit: **sigma**. Default: **20**. Allowed range: **0–1000**. UI step: 0.5.

Source-grounded fact: Student-t contamination multiplier relative to the observation Gaussian sigma; may have either sign.

Increase: Makes Student-t contamination larger relative to Gaussian sigma, with either sign.

Decrease: Reduces contamination amplitude, while event probability remains unchanged.

Metrics: Availability, failure reasons, residual tails, RMSE and P95 error conditional on a fix.

Trade-offs and interactions: Robust losses can resist some outliers but cannot recover unobservable geometry. NLOS and detection interact.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Bearing uncertainty — bearingSigmaDeg

Unit: **deg**. Default: **1**. Allowed range: **0–45**. UI step: 0.1.

Source-grounded fact: Gaussian bearing sigma; angles are wrapped to [-π,π).

Increase: Increases angular observation sigma; position impact depends on range and geometry.

Decrease: Reduces angular noise but cannot resolve ambiguous geometry by itself.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Reference path loss at 1 m — referenceLossDb

Unit: **dB**. Default: **40**. Allowed range: **0–150**. UI step: 0.1.

Source-grounded fact: PL(d)=PL0+20log10(f/f0)+10n log10(max(d,1 m)); empirical model, not ray tracing.

Increase: Adds loss at all distances, reducing predicted received power.

Decrease: Reduces the reference loss and may preserve more detectable links.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Path-loss exponent — pathLossExponent

Unit: **dimensionless**. Default: **2**. Allowed range: **1–6**. UI step: 0.1.

Source-grounded fact: Distance slope in the log-distance path-loss equation.

Increase: Increases distance-dependent loss for distances above the one-metre floor.

Decrease: Reduces the log-distance slope; the one-metre reference is unchanged.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Reference frequency — referenceFrequencyMHz

Unit: **MHz**. Default: **2400**. Allowed range: **1–100000**. UI step: 1.

Source-grounded fact: Frequency at which the 1 m reference loss is defined; anchor frequencies alter link budget.

Increase: With PL0 and anchor frequency fixed, reduces the 20log10(f/f0) term. Changing the reference without recalibration changes the empirical model.

Decrease: With other terms fixed, increases the frequency correction term.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Lognormal shadowing — shadowingDb

Unit: **dB sigma**. Default: **0**. Allowed range: **0–30**. UI step: 0.1.

Source-grounded fact: Gaussian dB offset fixed per link/trial; temporally correlated and not explicitly augmented in filters.

Increase: Increases the fixed-per-link/trial Gaussian dB shadowing sigma and temporal correlation.

Decrease: Reduces that shadowing component; independent RSS noise remains.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## RSS measurement noise — rssNoiseDb

Unit: **dB sigma**. Default: **1**. Allowed range: **0–30**. UI step: 0.1.

Source-grounded fact: Independent Gaussian dB observation noise; Gaussian MLE is performed in dB, not converted ranges.

Increase: Increases independent RSS observation noise in dB.

Decrease: Reduces independent RSS noise; lognormal shadowing remains separate.

Metrics: Position errors, native residuals, received power and fix availability.

Trade-offs and interactions: RSS is an empirical log-distance approximation, not full-wave propagation. Compare native residuals only within a measurement model.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Receiver detection threshold — detectionDbm

Unit: **dBm**. Default: **-120**. Allowed range: **-200–0**. UI step: 1.

Source-grounded fact: Links with predicted received power below this level are unavailable.

Increase: Raises the received-power cutoff, retaining fewer weak links.

Decrease: Lowers the cutoff, retaining more weak links in this synthetic model.

Metrics: Usable anchors, fix rate and failure reasons; conditional accuracy may change with survivor selection.

Trade-offs and interactions: Bandwidth, noise floor, loss and transmitter power jointly determine simulated detection.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Minimum detectable SNR — minSnrDb

Unit: **dB**. Default: **-20**. Allowed range: **-50–50**. UI step: 1.

Source-grounded fact: Requires received power − thermal noise floor ≥ threshold.

Increase: Requires a larger signal-to-noise margin and can remove more links.

Decrease: Accepts lower-SNR links; this is not hardware validation.

Metrics: Usable anchors, fix rate and failure reasons; conditional accuracy may change with survivor selection.

Trade-offs and interactions: Bandwidth, noise floor, loss and transmitter power jointly determine simulated detection.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Receiver noise figure — noiseFigureDb

Unit: **dB**. Default: **5**. Allowed range: **0–40**. UI step: 0.1.

Source-grounded fact: Noise floor = −174 dBm/Hz + 10log10(anchor bandwidth in Hz) + noise figure.

Increase: Raises the calculated noise floor and reduces predicted SNR.

Decrease: Lowers the noise floor while signal power is unchanged.

Metrics: Usable anchors, fix rate and failure reasons; conditional accuracy may change with survivor selection.

Trade-offs and interactions: Bandwidth, noise floor, loss and transmitter power jointly determine simulated detection.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Actual RTT turnaround — turnaroundNs

Unit: **ns**. Default: **100**. Allowed range: **0–1000000**. UI step: 1.

Source-grounded fact: Physical responder turnaround included in total round-trip time.

Increase: Adds actual RTT responder delay; mismatched calibration creates a positive range offset.

Decrease: Removes actual RTT delay relative to a fixed calibration.

Metrics: Range residuals, bias, RMSE and estimator validity.

Trade-offs and interactions: Match calibration to actual delay before attributing error to geometry; RTT conversion divides time by two.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Calibrated RTT turnaround — turnaroundCalibrationNs

Unit: **ns**. Default: **100**. Allowed range: **0–1000000**. UI step: 1.

Source-grounded fact: Known turnaround estimate subtracted before dividing round-trip time by two.

Increase: Subtracts more assumed responder delay before the RTT divide-by-two conversion.

Decrease: Subtracts less assumed responder delay. Accuracy depends on signed calibration mismatch.

Metrics: Range residuals, bias, RMSE and estimator validity.

Trade-offs and interactions: Match calibration to actual delay before attributing error to geometry; RTT conversion divides time by two.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Calibrated equipment delay — equipmentCalibrationNs

Unit: **ns**. Default: **0**. Allowed range: **-100000–100000**. UI step: 1.

Source-grounded fact: Subtracted RTT equipment-delay estimate. Anchor hardware delay is the actual residual equipment delay.

Increase: Subtracts more equipment-delay estimate; an overestimate can bias RTT range downward.

Decrease: Subtracts less equipment-delay estimate; compare against actual anchor hardware delay.

Metrics: Range residuals, bias, RMSE and estimator validity.

Trade-offs and interactions: Match calibration to actual delay before attributing error to geometry; RTT conversion divides time by two.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Robust loss transition — robustScale

Unit: **whitened sigma**. Default: **1.5**. Allowed range: **0.1–20**. UI step: 0.1.

Source-grounded fact: Huber/Soft-L1 f_scale applied to Cholesky-whitened residuals.

Increase: Moves the whitened robust-loss transition outward, downweighting fewer residuals.

Decrease: Downweights smaller normalized residuals; excessive robustness can reduce efficiency.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Residual rejection threshold — rejectionSigma

Unit: **marginal sigma**. Default: **4**. Allowed range: **1–20**. UI step: 0.1.

Source-grounded fact: Marginal normalized residual gate after a robust seed, or RANSAC consensus threshold.

Increase: Uses a more permissive marginal-normalized residual/consensus gate.

Decrease: Rejects more residuals; too few retained links can cause no fix.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## RANSAC iterations — ransacIterations

Unit: **subsets**. Default: **50**. Allowed range: **5–500**. UI step: 1.

Source-grounded fact: Seeded three-anchor hypotheses; consensus is refit with weighted nonlinear LS.

Increase: Tests more seeded three-anchor hypotheses and consumes more computation.

Decrease: Tests fewer hypotheses, potentially reducing consensus discovery.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Optimizer evaluation limit — maxIterations

Unit: **evaluations**. Default: **150**. Allowed range: **20–1000**. UI step: 1.

Source-grounded fact: Maximum function evaluations per nonlinear start; failed convergence produces a failed fix.

Increase: Allows more nonlinear function evaluations, with greater possible runtime.

Decrease: Can stop optimization earlier and increase convergence failures.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Acceleration process noise — processNoise

Unit: **m/s² sigma**. Default: **0.5**. Allowed range: **0.000001–100**. UI step: 0.01.

Source-grounded fact: CV process noise Q=σa²·[[dt⁴/4,dt³/2],[dt³/2,dt²]] on each position/velocity pair.

Increase: Increases acceleration covariance Q quadratically, allowing the tracker to respond more to departures from constant velocity.

Decrease: Enforces smoother constant-velocity prediction and can lag actual acceleration.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Clock acceleration noise — clockProcessNoise

Unit: **m/s² sigma**. Default: **0.01**. Allowed range: **0.000001–100**. UI step: 0.001.

Source-grounded fact: Same integrated-acceleration Q for pseudorange clock bias/range-rate states.

Increase: Increases process noise for augmented pseudorange clock-bias/rate states.

Decrease: Enforces smoother clock evolution; relevant only where those states are implemented.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Assumed covariance multiplier — covarianceScale

Unit: **variance factor**. Default: **1**. Allowed range: **0.01–100**. UI step: 0.01.

Source-grounded fact: Scales the covariance supplied to weighted estimators/filters without changing generated noise.

Increase: Increases assumed measurement variance, not the generated samples; filtering trusts measurement updates less relative to its process model.

Decrease: Makes assumed measurement covariance smaller; this can over-trust noisy observations.

Metrics: Tracking error/lag, runtime, residuals, rejected links and failure rate.

Trade-offs and interactions: This is a parameter-family heuristic, not a monotonic guarantee. Weighting uses the assumed covariance and must be tested against actual generated noise.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy and runtime is a qualified heuristic.

## Discrete laboratory controls

Defaults are read from the existing schema:

```json
{
  "measurement": "toa",
  "estimators": ["ls", "wls", "huber"],
  "hybrid": ["toa", "aoa"],
  "referenceId": "auto",
  "sweep": "timingNs",
  "sweepValues": [0.1, 1, 3, 10],
  "missingIds": [],
  "excludeBlocked": false
}
```

Supported observations are TOA, pseudorange, TDOA, RTT, AOA, RSS and hybrid. Supported estimator IDs are ls, wls, nls, huber, soft_l1, reject, ransac, mle, ekf, ukf. The existing compatibility rule restricts LS/RANSAC to TOA, RTT and RSS. The scientific API also checks reference/missing IDs, active anchors/receivers, mobility references and valid sweep ranges. A speed sweep requires actual motion. An anchor-count sweep cannot remove an explicitly selected TDOA reference.

TDOA uses the chosen/automatic reference and includes shared-reference covariance. Native AOA residuals and RSS residuals are not interchangeable with metre residuals. One run shares generated frames across its estimators, whereas matching seeds across different scenarios alone does not prove paired observations. The agent returns actual observation-hash references and sample counts.

## Entity and mobility parameters

### anchor.noise

Unit: m sigma. Factory default: 0.15.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0,
  "maximum": 1000
}
```

Source-grounded fact: Anchor range sigma combines with laboratory noiseM by hypot; the baseline also uses anchor noise.

Increase: Adds observation variance in the implemented range/timing models; AOA and RSS have separate noise controls.

Decrease: Reduces this independent noise component, while bias, other noise and geometry remain.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.timingOffset

Unit: ns. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Signed nanosecond timing terms enter the laboratory observation generator; they are not all estimated by every model.

Increase: Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.

Decrease: Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.

Metrics: Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.

Trade-offs and interactions: Anchor timing offset/drift and hardware delay can leave per-anchor biases in TOA/pseudorange/TDOA. RTT uses hardware delay and turnaround/equipment calibration; AOA/RSS do not use these timing terms.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.timingUncertainty

Unit: ns sigma. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0
}
```

Source-grounded fact: Independent anchor timing sigma combines with timingNs by hypot before the c or c/2 range conversion.

Increase: Adds observation variance in the implemented range/timing models; AOA and RSS have separate noise controls.

Decrease: Reduces this independent noise component, while bias, other noise and geometry remain.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.clockDrift

Unit: ppm. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Clock drift is ppm: drift × 1000 × time gives ns. Receiver drift also scales the RTT interval by 1 + ppm × 1e-6.

Increase: Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.

Decrease: Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.

Metrics: Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.

Trade-offs and interactions: Anchor timing offset/drift and hardware delay can leave per-anchor biases in TOA/pseudorange/TDOA. RTT uses hardware delay and turnaround/equipment calibration; AOA/RSS do not use these timing terms.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.hardwareDelay

Unit: ns. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Signed nanosecond timing terms enter the laboratory observation generator; they are not all estimated by every model.

Increase: Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.

Decrease: Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.

Metrics: Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.

Trade-offs and interactions: Anchor timing offset/drift and hardware delay can leave per-anchor biases in TOA/pseudorange/TDOA. RTT uses hardware delay and turnaround/equipment calibration; AOA/RSS do not use these timing terms.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.power

Unit: dBm. Factory default: 20.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": -100,
  "maximum": 100
}
```

Source-grounded fact: The synthetic link budget uses power − referenceLoss − 20 log10(frequency/referenceFrequency) and a noise floor −174 + 10 log10(bandwidth × 1e6) + noiseFigure.

Increase: Raises simulated received power and SNR; the calibrated RSS prediction also knows transmitter power.

Decrease: Reduces received power/SNR and can remove usable observations.

Metrics: Recorded signalDbm, availability/failure reasons, usable anchor count and position error.

Trade-offs and interactions: These are empirical synthetic assumptions, not a waveform or full-wave RF simulation; inspect detection and NLOS controls together.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.frequency

Unit: MHz. Factory default: 3960.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "exclusiveMinimum": 0,
  "maximum": 100000
}
```

Source-grounded fact: The synthetic link budget uses power − referenceLoss − 20 log10(frequency/referenceFrequency) and a noise floor −174 + 10 log10(bandwidth × 1e6) + noiseFigure.

Increase: Raises the implemented frequency loss at fixed reference frequency and can remove links at detection thresholds.

Decrease: Reduces this frequency loss term within the same empirical model.

Metrics: Recorded signalDbm, availability/failure reasons, usable anchor count and position error.

Trade-offs and interactions: These are empirical synthetic assumptions, not a waveform or full-wave RF simulation; inspect detection and NLOS controls together.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### anchor.bandwidth

Unit: MHz. Factory default: 160.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "exclusiveMinimum": 0,
  "maximum": 10000
}
```

Source-grounded fact: The synthetic link budget uses power − referenceLoss − 20 log10(frequency/referenceFrequency) and a noise floor −174 + 10 log10(bandwidth × 1e6) + noiseFigure.

Increase: Raises the implemented noise floor and can remove low-SNR links. It does not automatically reduce timingNs.

Decrease: Reduces the noise-floor term at fixed power; timing uncertainty remains separately configured.

Metrics: Recorded signalDbm, availability/failure reasons, usable anchor count and position error.

Trade-offs and interactions: These are empirical synthetic assumptions, not a waveform or full-wave RF simulation; inspect detection and NLOS controls together.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.clockOffset

Unit: ns. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Signed nanosecond timing terms enter the laboratory observation generator; they are not all estimated by every model.

Increase: Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.

Decrease: Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.

Metrics: Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.

Trade-offs and interactions: TOA assumes calibrated receiver timing; pseudorange estimates a receiver clock state. TDOA cancels a common receiver clock term. RTT ignores clock offset but uses receiver drift; AOA/RSS do not use these timing terms.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.clockDrift

Unit: ppm. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Clock drift is ppm: drift × 1000 × time gives ns. Receiver drift also scales the RTT interval by 1 + ppm × 1e-6.

Increase: Raises the signed timing contribution, rather than necessarily its absolute error. Drift accumulates with time.

Decrease: Lowers the signed contribution; crossing zero may increase or decrease the absolute calibration mismatch.

Metrics: Range bias, residuals, position error, clock-state estimates where supported, and nominal-model validity.

Trade-offs and interactions: TOA assumes calibrated receiver timing; pseudorange estimates a receiver clock state. TDOA cancels a common receiver clock term. RTT ignores clock offset but uses receiver drift; AOA/RSS do not use these timing terms.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.speed

Unit: m/s. Factory default: 2.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0,
  "maximum": 1000
}
```

Source-grounded fact: Receiver speed drives nonstationary velocity/circular/random motion; waypoint motion instead uses trajectory speed.

Increase: Increases travel per sampled interval where this speed is active; tracking lag can increase.

Decrease: Reduces travel; zero stops progress where the speed is active.

Metrics: Sampled truth positions, tracking error/lag and availability along the route.

Trade-offs and interactions: Compare duration, sampleStep and receiver updateInterval. Changing speed at time zero cannot demonstrate accumulated movement.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.mobility

Unit: discrete / see domain schema. Factory default: "stationary".

Allowed values from the actual entity schema:

```json
{
  "type": "string",
  "enum": ["stationary", "velocity", "linear", "circular", "random", "waypoints"]
}
```

Source-grounded fact: Mobility selects the implemented stationary, velocity, circular, waypoints or seeded random truth model.

Increase: Discrete selection: increasing a numeric value is not meaningful. Select the intended route or mode.

Decrease: Discrete selection: decreasing is not meaningful; compare actual sampled truth under the chosen mode.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Waypoint motion uses trajectory speed; duration and update/sample intervals determine which parts of the path are observed.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.heading

Unit: deg. Factory default: 0.

Allowed values from the actual entity schema:

```json
{
  "type": "number"
}
```

Source-grounded fact: Heading in degrees sets the velocity/linear direction through cosine and sine.

Increase: Rotates the direction toward increasing mathematical angle in the XY coordinate model.

Decrease: Rotates it toward decreasing angle. Stationary, circular and waypoint modes do not use this heading.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.updateInterval

Unit: s. Factory default: 0.1.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0.1,
  "maximum": 60
}
```

Source-grounded fact: Receiver motion time is quantized by floor(time/updateInterval) × updateInterval.

Increase: Updates truth less often, producing larger held-position intervals.

Decrease: Updates truth more often; laboratory observations are still sampled at sampleStep.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: This is a truth-motion control, not an automatic increase in the number of laboratory epochs.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.radius

Unit: m. Factory default: 15.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "exclusiveMinimum": 0,
  "maximum": 10000
}
```

Source-grounded fact: Circular motion uses angle = time × speed/radius and an offset that preserves the initial position.

Increase: Reduces angular speed for fixed linear speed and widens the circle.

Decrease: Increases angular speed and tightens the circle. Other mobility modes ignore radius.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### receiver.trajectoryId

Unit: discrete / see domain schema. Factory default: "optional; not set by the existing factory".

Allowed values from the actual entity schema:

```json
{
  "type": ["string", "null"]
}
```

Source-grounded fact: A waypoint receiver must reference an existing enabled nonempty trajectory for an AI experiment.

Increase: Discrete selection: increasing a numeric value is not meaningful. Select the intended route or mode.

Decrease: Discrete selection: decreasing is not meaningful; compare actual sampled truth under the chosen mode.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Waypoint motion uses trajectory speed; duration and update/sample intervals determine which parts of the path are observed.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### obstacle.width

Unit: m. Factory default: 18.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0.1,
  "maximum": 10000
}
```

Source-grounded fact: Rectangle obstacles use these XY dimensions for geometric segment/polygon blockage; polygon obstacles use vertices instead.

Increase: Expands the rectangle in that direction and may intersect additional links, depending on placement.

Decrease: Shrinks its footprint and may unblock links. Polygon vertices remain independent.

Metrics: Blocked/NLOS observation flags, availability, residuals and position error.

Trade-offs and interactions: Laboratory NLOS adds configured approximate excess-path/loss effects. The baseline marks/excludes blockage; neither is full-wave propagation.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### obstacle.height

Unit: m in XY. Factory default: 12.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0.1,
  "maximum": 10000
}
```

Source-grounded fact: Rectangle obstacles use these XY dimensions for geometric segment/polygon blockage; polygon obstacles use vertices instead.

Increase: Expands the rectangle in that direction and may intersect additional links, depending on placement.

Decrease: Shrinks its footprint and may unblock links. Polygon vertices remain independent.

Metrics: Blocked/NLOS observation flags, availability, residuals and position error.

Trade-offs and interactions: Laboratory NLOS adds configured approximate excess-path/loss effects. The baseline marks/excludes blockage; neither is full-wave propagation.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### obstacle.verticalHeight

Unit: m (display geometry; no XYZ solve). Factory default: "optional; not set by the existing factory".

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "exclusiveMinimum": 0,
  "maximum": 10000
}
```

Source-grounded fact: This field is stored/display geometry; the current laboratory computes XY distances and XY blockage.

Increase: Changes the stored/display height or elevation; it does not add XYZ positioning or height-dependent RF physics.

Decrease: Changes display geometry in the other direction; no scientific improvement follows from this field alone.

Metrics: No direct XY scientific-metric effect is implemented for this display field.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### obstacle.baseElevation

Unit: m. Factory default: "optional; not set by the existing factory".

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": -1000000,
  "maximum": 1000000
}
```

Source-grounded fact: This field is stored/display geometry; the current laboratory computes XY distances and XY blockage.

Increase: Changes the stored/display height or elevation; it does not add XYZ positioning or height-dependent RF physics.

Decrease: Changes display geometry in the other direction; no scientific improvement follows from this field alone.

Metrics: No direct XY scientific-metric effect is implemented for this display field.

Trade-offs and interactions: Hold the other scenario inputs and seed fixed, and compare actual observation hashes.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### trajectory.speed

Unit: m/s. Factory default: 2.

Allowed values from the actual entity schema:

```json
{
  "type": "number",
  "minimum": 0,
  "maximum": 1000
}
```

Source-grounded fact: Waypoint receivers use the referenced trajectory speed; an explicit laboratory speed sweep overrides it.

Increase: Increases travel per sampled interval where this speed is active; tracking lag can increase.

Decrease: Reduces travel; zero stops progress where the speed is active.

Metrics: Sampled truth positions, tracking error/lag and availability along the route.

Trade-offs and interactions: Compare duration, sampleStep and receiver updateInterval. Changing speed at time zero cannot demonstrate accumulated movement.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### trajectory.points

Unit: discrete / see domain schema. Factory default: [{"x":0,"y":0},{"x":20,"y":0}].

Allowed values from the actual entity schema:

```json
{
  "minItems": 1,
  "maxItems": 1000,
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "x": {
        "type": "number",
        "minimum": -1000000,
        "maximum": 1000000
      },
      "y": {
        "type": "number",
        "minimum": -1000000,
        "maximum": 1000000
      }
    },
    "required": ["x", "y"],
    "additionalProperties": false
  }
}
```

Source-grounded fact: Ordered trajectory points define piecewise-linear travel; their coordinates are in metres.

Increase: Discrete selection: increasing a numeric value is not meaningful. Select the intended route or mode.

Decrease: Discrete selection: decreasing is not meaningful; compare actual sampled truth under the chosen mode.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Waypoint motion uses trajectory speed; duration and update/sample intervals determine which parts of the path are observed.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

### trajectory.loop

Unit: discrete / see domain schema. Factory default: true.

Allowed values from the actual entity schema:

```json
{
  "type": "boolean"
}
```

Source-grounded fact: A looping path adds the closing segment and wraps travel distance; a nonlooping path stops at its endpoint.

Increase: Discrete selection: increasing a numeric value is not meaningful. Select the intended route or mode.

Decrease: Discrete selection: decreasing is not meaningful; compare actual sampled truth under the chosen mode.

Metrics: Recorded position error, residuals, usable observations and fix counts.

Trade-offs and interactions: Waypoint motion uses trajectory speed; duration and update/sample intervals determine which parts of the path are observed.

Classification: source-grounded mechanism / mathematical implication; effect on accuracy is a qualified heuristic.

Receiver clock offset is in nanoseconds and drift in ppm; the time model converts drift to 1000 ns/s per ppm. Unknown receiver-clock terms are relevant to pseudorange; TDOA differences cancel a shared receiver clock term. Anchor timing offset/drift/hardware residuals affect synchronization/calibration assumptions. Greater drift accumulates over longer duration; zero-epoch experiments cannot demonstrate accumulated drift.

Mobility speed is in m/s and heading in degrees. Faster motion increases displacement per sample and can increase tracker lag; lower speed reduces displacement. Smaller update intervals produce more frequently updated truth positions. A waypoint receiver requires an enabled nonempty trajectory. Increasing a circular radius changes angular rate for fixed speed, rather than automatically increasing accuracy.

Anchor noise controls the generated residual range sigma in the calibrated-range baseline; larger noise generally increases uncertainty. Power, frequency and bandwidth participate in the laboratory link/detection approximation: noise floor uses bandwidth in Hz after conversion from the entity MHz unit. These are synthetic assumptions, not measured hardware specifications.

## Geometry and obstacles

Coordinates are bounded to ±1,000,000 m. The project schema permits 500 objects; the current laboratory API accepts at most 100. At least three enabled anchors and an enabled receiver are required for AI laboratory submission. Collinear/coincident or badly conditioned anchor layouts can remain unsolvable even when individual fields are valid. Baseline diagnostics use the existing calibrated-range solver, which rejects condition >1e8; those diagnostics do not certify every laboratory model. Receiver placement and anchor geometry should be evaluated at the actual sampled locations and times.

Obstacle width/height are XY dimensions. Larger footprints may intersect more links, but the effect depends on placement. The laboratory implements geometric blockage, approximate NLOS excess timing path and empirical dB loss; the browser baseline marks/excludes blocked links. Schema-2 verticalHeight/baseElevation are not an XYZ solver or full-wave RF model. No realistic multipath/attenuation claim is inferred merely from drawing an obstacle.

## Interpreting comparisons

A larger trial count can stabilize estimated metrics while increasing cost; it does not improve the underlying estimator on a fixed observation. Report RMSE and quantiles alongside successful fixes, attempted/planned counts, availability and failure reasons. Robust losses trade clean-data efficiency for resistance to some contaminated observations; weighting depends on correctly specified covariance. EKF/UKF process/measurement tuning trades tracking responsiveness against noise and model mismatch. Controlled experiments and actual metrics are required before claiming an improvement.
