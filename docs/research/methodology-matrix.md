# TerraLab Phase 1 methodology matrix

Reviewed 20 October 2026. All seven user-supplied PDFs were extracted and reviewed for their relevant measurement, estimator, calibration and scope sections. The supplied implementation prompt defines the task; research documents supply evidence and context. Editorial instructions embedded in research notes do not alter the task.

## Source inventory and implementation decisions

| Supplied document                                                                                                       | Evidence used                                                                                                                                                                                                                                                                                               | Phase 1 decision                                                                                                                  | Boundary / caution                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ground_based_positioning_literature_survey.pdf` (5 pages)                                                              | Consolidates six publications; p. 2 distinguishes calibrated ranges, pseudoranges, TDOA and RTT; pp. 3–4 connect geometry, calibration and measurement reliability.                                                                                                                                         | Synthetic calibrated horizontal ranges; four-anchor and redundant six-anchor starter networks; explicit measurement discriminant. | The survey proposes later robust comparisons. Those are not implemented in Phase 1.                                                                                                         |
| `HybridDecimalPositioningPaper.pdf` (18 PDF pages; original Nature article plus repository cover and extended material) | Koelemeij et al., Nature 611 (2022), 473–478, DOI [10.1038/s41586-022-05315-7](https://doi.org/10.1038/s41586-022-05315-7). Printed pp. 474–475 and Methods describe six fibre-synchronized transmitters, calibrated hardware delays, OFDM delay observations and joint receiver clock/position estimation. | Surveyed anchor coordinates; separate RF/timing metadata; no promise of field accuracy; ground truth distinct from estimate.      | The original system estimates receiver clock bias; TerraLab Phase 1 does not replicate that radio front end or its estimator. Published accuracy is not TerraLab performance.               |
| `Ved_Paper_Review.pdf` (11 pages)                                                                                       | Secondary review of Nature 2022: pp. 2–5 explain White Rabbit, hardware delay and pseudorange terms; pp. 7–9 cover calibration and deployment limits.                                                                                                                                                       | Store clock offset/drift, timing uncertainty and hardware delay with clear metadata labels.                                       | These values are assumed compensated in the calibrated-range baseline. Changing them does not inject timing errors.                                                                         |
| `tanaya_review_paper.pdf` (6 pages)                                                                                     | Secondary analysis of Widdison & Long, “A Review of Linear Multilateration Techniques and Applications,” IEEE Access (2024), DOI [10.1109/ACCESS.2024.3361835](https://doi.org/10.1109/ACCESS.2024.3361835). Linearization, reference geometry, redundancy and weighting discussion.                        | Squared-range differencing; Householder QR browser solver and SVD Python solver; rank and condition checks; residual reporting.   | Original Widdison & Long full text was not supplied. Attribution here is through the supplied review and consolidated survey. No weighted/nonlinear refinement is implemented.              |
| `GNSS-Independent Positioning Review.pdf` (14 pages)                                                                    | Project presentation. pp. 4–5 distinguish timing observables; pp. 8–9 emphasize QR/SVD and clock assumptions; pp. 11–13 separate development phases and accuracy claims. Also summarizes Li et al., RSI (2016), DOI [10.1063/1.4947001](https://doi.org/10.1063/1.4947001).                                 | Transparent baseline, geometric error vector and observations; explicit no-fix diagnostics.                                       | The actual Li TOA/TDOA review was not separately supplied. TOA, TDOA, RTT and AOA comparisons remain deferred.                                                                              |
| `priyal_paper5_pseudolite_survey.pdf` (5 pages)                                                                         | Secondary review of Chen, Reuscher & Vallery, IEEE Sensors Reviews (2026), DOI as provided [10.1109/SR.2026.3674871](https://doi.org/10.1109/SR.2026.3674871). Highlights GNSS-like pseudolite observables and scenario-dependent performance.                                                              | Configurable ground transmitters and reproducible layouts; no cross-paper accuracy ranking or hardware claim.                     | No pseudolite waveform, carrier ambiguity, fusion or clock-bias solver in Phase 1. Bibliographic details are taken from the supplied survey, not independently verified original full text. |
| `gunjan_review_paper.pdf` (6 pages)                                                                                     | Secondary review of Kazaz et al., IEEE TWC 21 (2022), 2591–2607, DOI [10.1109/TWC.2021.3113771](https://doi.org/10.1109/TWC.2021.3113771). Discusses multiband CSI, delay resolution, SVD/subspace processing, calibration and model-order limits.                                                          | Preserve frequency/bandwidth metadata and leave a documented observation interface for a later measurement front end.             | No CSI generation, multipath channel model or MBWDE estimator is implemented. Editorial text in the note is not an instruction to rewrite it.                                               |

The consolidated survey also summarizes Ivanov et al. (2022), DOI [10.13052/jmm1550-4646.1913](https://doi.org/10.13052/jmm1550-4646.1913), for cellular-network context. This does not imply unmodified cellular towers supply calibrated observations.

## Implemented mathematical model

All coordinates and ranges are metres in a horizontal Cartesian plane. Positive X points right/east and positive Y points up/north. Altitude is stored but is not part of the 2D range equation.

For an enabled anchor `a_i` and receiver truth `p(t)`:

```text
d_i(t) = hypot(p_x(t) - a_ix, p_y(t) - a_iy)
r_i(t) = max(0, d_i(t) + sigma_i * z_i(t))
```

`z_i(t)` is a deterministic standard Gaussian draw from a seeded LCG and Box–Muller transform, keyed by anchor ID, receiver ID and simulation tick. The nonnegative clamp prevents nonphysical negative synthetic ranges; at very short distance with large noise it creates a truncated distribution. Default sigma is 0.15 m, chosen as a simulator parameter, not derived performance of the Nature system. Set all sigmas to zero to verify noiseless recovery. The observation interface carries metres, timestamp, anchor ID, range, truth range, sigma and geometric obstruction flag.

Subtract the reference anchor's squared range equation. Translate the coordinate origin to that anchor before forming squared coordinates:

```text
delta_i = a_i - a_0
A_i = 2 * [delta_ix, delta_iy]
b_i = ||delta_i||^2 + (r_0 - r_i) * (r_0 + r_i)
A * q ~= b
p_estimate = q + a_0
```

The browser uses Householder QR, then a triangular back substitution. Python uses `scipy.linalg.lstsq(..., cond=1e-12, lapack_driver="gelsd")`, an SVD least-squares solution. Neither solver explicitly inverts `A^T A`. The browser estimates the 2-norm condition number from its 2x2 R factor; Python uses the SVD singular values. Both reject deficient rank and condition greater than `1e8`. At least 3 non-collinear anchors are needed for calibrated 2D ranges; 4 or more provide redundancy. The condition number describes this reference-differenced linear system, not GDOP or a covariance estimate.

Residual sign is `predicted distance - observed range`. Residual RMS is `sqrt(mean(residual^2))`. Position error is the Euclidean distance from truth to estimate. The solver minimizes the linearized system; it is not a nonlinear maximum-likelihood range fit. Reference differencing correlates the noise terms; Phase 1 does not whiten them or make an optimality claim.

One-way pseudoranges have an additional unknown common clock term, `rho_i = ||p-a_i|| + c*b + h_i + epsilon_i`. These must not be supplied to this solver. Both browser and Python APIs reject an observation type other than `calibrated_range`.

## Geometry and deterministic time

```text
canvas_x = viewport_width/2 + pan_x + world_x * pixels_per_metre
canvas_y = viewport_height/2 + pan_y - world_y * pixels_per_metre
```

The inverse is tested at several zooms and translations. View preferences affect rendering only. SVG is the retained-mode vector canvas engine used instead of Konva: object geometry, pointer capture, selection, coordinate conversion and view transforms are explicit and testable.

Obstacle intersections include segment crossings, endpoints, collinear contact and points inside polygons. Walls are thin rectangles. Obstruction is geometric only: with exclusion off (default), blocked links still carry ideal synthetic ranges. With exclusion on, they are removed from the solution. No attenuation or NLOS bias is silently introduced.

Simulation state is a timestamp on a fixed-step clock. Monotonic elapsed wall time accumulates into complete simulation steps; motion is evaluated from simulation time, never animation-frame count. Receiver update intervals quantize position observations. Constant velocity and linear modes follow speed and heading; the circular centre is one radius left of the initial position so motion starts continuously at the saved receiver position. Random waypoint paths are seed-reproducible and evaluated independently of scrub order. User paths use trajectory speed, optional closing segments and endpoint clamping when not looping. Chart/export samples are generated deterministically at `max(step, 0.5 s)` and retain the latest 400 sample timestamps, with null estimates for failed fixes.

## Phase 2 extension contract

Add new tagged observation types and separate validation/solvers. Preserve Phase 1 fixtures as regression tests. Require explicit receiver-clock state for pseudoranges, explicit differencing/covariance assumptions for TDOA, and turnaround/hardware calibration for RTT. Noise/bias injection, robust refinements, comparisons, Monte Carlo studies and multiband CSI processing require user approval for the next phase.
