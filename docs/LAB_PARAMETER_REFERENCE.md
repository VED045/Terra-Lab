# Laboratory parameter reference

Generated from the validated UI control catalog. Every numeric control has both direct entry and a slider. Bounds below are enforced by the shared schema and Python contract. Integer controls additionally require whole numbers. Per-object controls and model-specific interpretation are described in PHASE_2_METHODS.md and in their inline UI descriptions.

| Control | Unit | Valid bounds | Default | Mathematical interpretation |
|---|---|---|---|---|
| Experiment: Monte Carlo trials (trials) | trials | 1 to 1000 | 20 | Independent measurement realizations per location and sweep point. |
| Experiment: Trajectory duration (duration) | s | 0 to 300 | 0 | Zero runs one epoch; positive duration evaluates moving truth at every sample. |
| Experiment: Sample interval (sampleStep) | s | 0.1 to 10 | 1 | Fixed observation/filter update period; samples include t=0. |
| Experiment: Random seed (seed) | integer | 0 to 2147483647 | 42 | SeedSequence streams keyed by sweep, trial, location and epoch; estimators share each frame. |
| Experiment: Spatial grid side (gridSize) | points | 0 to 12 | 0 | Adds N×N stationary receiver locations inside anchor bounds; 0 disables grid. |
| Timing & ranges: Timing uncertainty (timingNs) | ns | 0 to 1000 | 1 | Per-link Gaussian standard deviation, combined in quadrature with anchor timing uncertainty; range sigma = c·sigma_t (RTT: c·sigma_t/2). |
| Timing & ranges: Additional range noise (noiseM) | m | 0 to 100 | 0 | Independent Gaussian range sigma, combined with anchor residual noise. |
| Timing & ranges: Correlated timing noise (commonTimingNs) | ns | 0 to 1000 | 0 | One common Gaussian draw per epoch. Adds a rank-one covariance term; cancels in TDOA. |
| Timing & ranges: Anchor coordinate uncertainty (anchorSigmaM) | m | 0 to 20 | 0 | Independent x/y survey error fixed per trial/location; estimator uses nominal coordinates and a local variance approximation. |
| Availability & propagation: Measurement dropout (dropout) | probability | 0 to 1 | 0 | Independent probability of losing an otherwise detectable anchor each epoch. |
| Availability & propagation: Signal availability (availability) | probability | 0 to 1 | 1 | Probability a detectable anchor is transmitting/available before dropout. |
| Availability & propagation: Random NLOS probability (nlosProbability) | probability | 0 to 1 | 0 | Additional independent NLOS events; obstacle intersections always classify NLOS. |
| Availability & propagation: Mean positive NLOS bias (nlosBiasM) | m | 0 to 1000 | 5 | Exponential excess path length for NLOS timing. Bearing deflection ±atan(bias/d) is an approximation. |
| Availability & propagation: NLOS signal attenuation (nlosLossDb) | dB | 0 to 100 | 10 | Extra link-budget/RSS loss on random or geometrically obstructed NLOS links. |
| Availability & propagation: Heavy-tailed outlier probability (outlierProbability) | probability | 0 to 1 | 0 | Probability of an additive Student-t(3) contaminant; shared link flag across hybrid components. |
| Availability & propagation: Outlier scale (outlierScale) | sigma | 0 to 1000 | 20 | Student-t contamination multiplier relative to the observation Gaussian sigma; may have either sign. |
| AOA & RSS: Bearing uncertainty (bearingSigmaDeg) | deg | 0 to 45 | 1 | Gaussian bearing sigma; angles are wrapped to [-π,π). |
| AOA & RSS: Reference path loss at 1 m (referenceLossDb) | dB | 0 to 150 | 40 | PL(d)=PL0+20log10(f/f0)+10n log10(max(d,1 m)); empirical model, not ray tracing. |
| AOA & RSS: Path-loss exponent (pathLossExponent) | dimensionless | 1 to 6 | 2 | Distance slope in the log-distance path-loss equation. |
| AOA & RSS: Reference frequency (referenceFrequencyMHz) | MHz | 1 to 100000 | 2400 | Frequency at which the 1 m reference loss is defined; anchor frequencies alter link budget. |
| AOA & RSS: Lognormal shadowing (shadowingDb) | dB sigma | 0 to 30 | 0 | Gaussian dB offset fixed per link/trial; temporally correlated and not explicitly augmented in filters. |
| AOA & RSS: RSS measurement noise (rssNoiseDb) | dB sigma | 0 to 30 | 1 | Independent Gaussian dB observation noise; Gaussian MLE is performed in dB, not converted ranges. |
| Detection: Receiver detection threshold (detectionDbm) | dBm | -200 to 0 | -120 | Links with predicted received power below this level are unavailable. |
| Detection: Minimum detectable SNR (minSnrDb) | dB | -50 to 50 | -20 | Requires received power − thermal noise floor ≥ threshold. |
| Detection: Receiver noise figure (noiseFigureDb) | dB | 0 to 40 | 5 | Noise floor = −174 dBm/Hz + 10log10(anchor bandwidth in Hz) + noise figure. |
| RTT calibration: Actual RTT turnaround (turnaroundNs) | ns | 0 to 1000000 | 100 | Physical responder turnaround included in total round-trip time. |
| RTT calibration: Calibrated RTT turnaround (turnaroundCalibrationNs) | ns | 0 to 1000000 | 100 | Known turnaround estimate subtracted before dividing round-trip time by two. |
| RTT calibration: Calibrated equipment delay (equipmentCalibrationNs) | ns | -100000 to 100000 | 0 | Subtracted RTT equipment-delay estimate. Anchor hardware delay is the actual residual equipment delay. |
| Estimator & filters: Robust loss transition (robustScale) | whitened sigma | 0.1 to 20 | 1.5 | Huber/Soft-L1 f_scale applied to Cholesky-whitened residuals. |
| Estimator & filters: Residual rejection threshold (rejectionSigma) | marginal sigma | 1 to 20 | 4 | Marginal normalized residual gate after a robust seed, or RANSAC consensus threshold. |
| Estimator & filters: RANSAC iterations (ransacIterations) | subsets | 5 to 500 | 50 | Seeded three-anchor hypotheses; consensus is refit with weighted nonlinear LS. |
| Estimator & filters: Optimizer evaluation limit (maxIterations) | evaluations | 20 to 1000 | 150 | Maximum function evaluations per nonlinear start; failed convergence produces a failed fix. |
| Estimator & filters: Acceleration process noise (processNoise) | m/s² sigma | 0.000001 to 100 | 0.5 | CV process noise Q=σa²·[[dt⁴/4,dt³/2],[dt³/2,dt²]] on each position/velocity pair. |
| Estimator & filters: Clock acceleration noise (clockProcessNoise) | m/s² sigma | 0.000001 to 100 | 0.01 | Same integrated-acceleration Q for pseudorange clock bias/range-rate states. |
| Estimator & filters: Assumed covariance multiplier (covarianceScale) | variance factor | 0.01 to 100 | 1 | Scales the covariance supplied to weighted estimators/filters without changing generated noise. |

Measurement model, estimator list, hybrid components, TDOA reference, missing-anchor IDs, blocked-link exclusion and sweep type are discrete controls. Sweep values are a bounded numeric list: timing 0–1000 ns (initial benchmark 0.1–10 ns), NLOS probability 0–1, moving receiver speed 0–1000 m/s, or integer anchor counts 3–100 bounded by the enabled network. Defaults are TOA, LS/WLS/Huber, TOA+AOA hybrid components, automatic reference, no deliberate missing anchors, blocked-link exclusion off, and timing values 0.1, 1, 3, 10 ns.

## Per-object laboratory editor

These controls edit the existing anchor/receiver fields. Editor ranges below support direct numeric entry and sliders; existing projects retain the broader Phase 1 calibration schema and are never silently clipped.

| Control | Unit | Editor range | Default | Interpretation |
|---|---|---|---|---|
| Transmitter timing offset | ns | -10000 to 10000 | 0 | Residual synchronization error in one-way timing; differential errors remain in TDOA; cancels in RTT. |
| Anchor timing uncertainty | ns sigma | 0 to 1000 | 0 | Independent jitter combined in quadrature with experiment timing sigma. |
| Anchor equipment delay | ns | -10000 to 10000 | 0 | Adds c·delay to one-way observations and c·delay/2 to RTT before equipment calibration. |
| Anchor range noise | m sigma | 0 to 1000 | 0.15 | Independent range noise combined in quadrature with experiment range noise. |
| Transmit power | dBm | -100 to 100 | 20 | Sets the RSS/link-budget received power and detectability. |
| Carrier frequency | MHz | 0.001 to 100000 | 3960 | Empirical frequency correction 20log10(f/f0). |
| Bandwidth | MHz | 0.001 to 10000 | 160 | Determines integrated thermal-noise power used in SNR gating. |
| Receiver clock offset | ns | -10000 to 10000 | 0 | Common one-way bias, estimated in pseudorange and cancelled by TDOA/RTT. |
| Anchor / receiver clock drift | ppm | -10 to 10 | 0 | Adds 1000·drift·t ns to one-way clocks; receiver rate scales RTT duration. |

Position, speed, heading, update interval, radius and custom path geometry remain editable in the existing network inspector. Altitude/device type remain descriptive in the horizontal 2D model. Every stored network and mobility field is preserved in each experiment snapshot.
