# Separate scientific capability feasibility

Status: research/design assessment, not an implemented or accepted new estimator. Phase 5 retains scientific model 0.2.0 and the existing experimental CSI labels.

## Primary reference reviewed

Kazaz, Janssen, Romme and van der Veen, *Delay Estimation for Ranging and Localization Using Multiband Channel State Information*, [author manuscript](https://arxiv.org/pdf/2111.10682), Section III. Its model uses stacked Hankel data and multiple shift invariances. It discusses modified MDL for path count, multiresolution initialization with nonlinear refinement, subspace-column weighting and data extensions. Inter-band calibration and model assumptions matter; weighting a scalar delay scan is not the same objective. See equations 22–26 and Section III-C. These paper-derived observations describe the reference method, not TerraLab performance.

## TerraLab assessment and proposed research contract

Code inspection of signals.py confirms current weighted profiles, covariance MUSIC and single-band ESPRIT. They do not implement the complete reference pipeline. Retain those names. A distinct future implementation should expose calibrated complex CSI, tone frequencies and band identities, snapshot structure, calibration metadata, noise assumptions and a declared model-order strategy. It needs independent matrix fixtures before optimizer tuning.

Proposed acceptance: freeze separate noiseless, unequal-noise, close-multipath, coherent/incoherent and calibration-mismatch fixtures; validate ranks, units, ambiguity intervals, initialization failure and model-order errors; compare the full pipeline against clearly identified baselines on matched raw samples. Publish every seed, failed detection and runtime. Reproduce reference simulation conditions before claiming reproduction, and obtain suitable calibrated measured data before hardware claims. No reference-method accuracy number is transferred to TerraLab.

Implementation dependencies are a dedicated CSI request/result version, documented noise estimation/weight construction, bounded resource plan and independently reviewed numerical tests. Existing synthetic demonstrations and the new positioning study matrix do not satisfy that gate. No complete MBWDE algorithm is introduced by this phase.

## Genuine XYZ positioning assessment

Physical building dimensions alone do not supply surveyed anchor/path Z or a vertical measurement model. A separate contract must distinguish unknown from measured/assumed Z, define each model's position/clock state and vertical units, specify a full-rank geometry/Jacobian acceptance test, and keep old horizontal runs immutable. Vertical ambiguity, poor geometry, missing observations and covariance failure need explicit outcomes.

Proposed acceptance: independent non-coplanar and degenerate layouts, noiseless reference solutions, noisy vertical/horizontal error and availability metrics, covariance coverage under stated assumptions and cross-environment reproduction. Obstruction would need a separately validated 3D intersection rule with known or explicitly assumed base/top dimensions. The shipped Phase 5 height metadata does not change range/bearing generation, horizontal blocking or solver state. Full XYZ numerical implementation remains a separately reviewed scientific capability, not a visualization toggle.
