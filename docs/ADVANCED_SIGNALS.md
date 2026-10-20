# Advanced CSI module: scientific scope and gaps

Status: **experimental synthetic demonstrations**, separate from the validated Phase 2 positioning engine. No MBWDE reproduction or hardware accuracy claim.

Sources inspected: the uploaded ground-based literature survey and GNSS-independent review identify Kazaz et al.; the accessible [author manuscript](https://arxiv.org/pdf/2111.10682) is the original reference consulted. Its channel/discrete models, Hankel construction and weighted subspace fit appear in equations 7, 12–21 and 25–26. It also requires calibration, rank conditions and data-extension/initialization choices. Those full steps are not reproduced here.

The implemented synthetic model is `H(f,s)=sum_k alpha(k,s) exp(-j 2*pi*(f-f_ref)*tau(k))+noise(f,s)`. Shifting the frequency reference is absorbed into the unknown complex gains. Input paths have delays in ns and real/imaginary gains. Band centres are MHz, spacing kHz and occupied bandwidth MHz. Tones are uniformly spaced **inside each band**, while the union can have gaps. Overlapping/touching bands are rejected. A path's complex gain is frequency-independent. `independent` snapshots randomize each path's phase independently; `coherent` snapshots repeat its complex gain. This is a configurable synthetic assumption, not a measured channel process.

Nominal complex noise power is `sum_k |alpha_k|² * 10^(-SNR/10)` times a per-band power factor. Circular complex noise has half this variance per quadrature. SNR is a nominal path-power ratio, not instantaneous coherent received power. One residual phase/gain/group-delay error per band is drawn and held across snapshots. These errors are deliberately not secretly calibrated away.

| Method | Implemented calculation | Conditions / limits |
|---|---|---|
| matched | Average squared matched-filter profile over snapshots; strongest K local grid peaks | Conventional baseline. Grid and sidelobes can confuse path identity; not a joint multipath optimum or guaranteed first-arrival detector. |
| weighted | Same single-delay profile after inverse known diagonal noise weighting | Illustrative weighted profile scan; **not** weighted subspace fitting and never called MBWDE. Equal powers give the same spectrum as matched. |
| music | Eigenspace of diagonally whitened snapshot covariance; normalized steering vectors; reciprocal noise-subspace projection, grid peak selection | Experimental, known K/noise powers and sufficiently independent path gains, ≥max(K+1,8) snapshots. Coherent multipath is rejected rather than producing misleading covariance-rank results. No MDL/model-order inference. |
| esprit | Single-band Hankel smoothing, SVD signal basis, LS adjacent-row rotation, eigenphase-to-delay mapping | Experimental, one contiguous uniform band only, known K and rank checks. No multiband phase unwrapping or optimal subspace weighting. |

The scan is restricted below the per-band alias period `1/spacing`. Multiple bands can still generate strong ambiguous lobes. Grid spacing is not physical resolution. A detected earliest path is not guaranteed LOS. At most 4 paths, 4 bands, **128 total tones**, 64 snapshots and 2,048 scan points are allowed. Two small signal/PDF operations may run concurrently per API process; high-volume signal studies need a future durable batch design. CSI output is portable JSON, not yet integrated into cloud positioning-run history.

Fixtures verify the analytic single-path complex model, seed replay, near-noiseless delay recovery, coherent single-band ESPRIT, independent multiband MUSIC, unequal noise, calibration changes, gapped-band ESPRIT rejection and input/resource bounds. This validates the stated code paths on synthetic cases, not asymptotic efficiency, a CRB, real radios or paper reproduction.

`node scripts/python.mjs scripts/example_phase3.py` writes an actual seeded example. In the recorded two-band, two-path, 40 dB example (truth 100 and 180 ns), matched/weighted select 100 and 112.5 ns, while MUSIC selects 100 and 180 ns. The baseline's sidelobe error is retained. There is no claim that MUSIC always performs better.

Before any exact MBWDE label: implement and independently review the full stacked Hankel/data-extension model, rank/model-order choices, specified subspace weights, multiresolution initialization, separable nonlinear fitting, noise estimation, calibration assumptions and CRB; then reproduce original simulation cases and compare real calibrated CSI. These are documented research gaps, not fabricated results.
