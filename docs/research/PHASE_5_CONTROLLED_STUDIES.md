# Phase 5 controlled synthetic studies

Executed locally on 2026-10-21 using the checked-in plan and unchanged scientific model 0.2.0. The plan fixes 16 cases and all five seeds (11, 29, 47, 83, 109) before execution. All 170 estimator summaries are retained in JSON and CSV, including failed fixes and adverse cases. No estimator was required to win and no seed was removed.

Reproduce from the repository root: `node scripts/python.mjs scripts/run-controlled-studies.py --output work/phase5-study-results.json`. The script uses local scientific code only and does not access hosting. Runtime measurements vary by machine and are not asserted repeatable.

The independent four-anchor noiseless fixture produced error 4.440892098500626e-16 m, below the predefined 1e-5 m tolerance. Repeated requests produced identical observation hashes and position values. Within each run every estimator record references the same stored observation frame. Attempted/fixed/failed counts were checked; result JSON rejects NaN/Infinity.

## Results, including negative outcomes

RMSE is conditional on successful fixes. The table reports the median and range of **per-seed RMSE**, with total attempted epochs and failures across the five seeds. It does not substitute this aggregation for the full precision per-seed metrics, P95/max error, failure reasons and availability in [JSON](phase5-study-results.json) and [CSV](phase5-study-results.csv).

| Case / estimator | Attempted | Failed | Median seed RMSE m | Seed RMSE range m |
|---|---|---|---|---|
| geometry-surrounding / wls | 100 | 0 | 0.4596992808079428 | 0.45322230681294035 … 0.6252511317503822 |
| geometry-surrounding / huber | 100 | 0 | 0.47163676896953627 | 0.4426842543326319 … 0.5972027379607018 |
| geometry-near-collinear / wls | 100 | 0 | 48.09383457420181 | 41.60988644829009 … 61.26422707476527 |
| geometry-near-collinear / huber | 100 | 70 | 49.89157796518734 | 37.65078150989679 … 62.18981217984321 |
| timing-precise / wls | 100 | 0 | 0.07878011690272417 | 0.07773091688975564 … 0.10719364135987602 |
| timing-precise / huber | 100 | 0 | 0.08082643201755892 | 0.07592113019442222 … 0.10237268882891082 |
| timing-coarse / wls | 100 | 0 | 2.2912624778143336 | 2.2524800560798406 … 3.109378656664472 |
| timing-coarse / huber | 100 | 0 | 2.3505571322054117 | 2.2003903154410565 … 2.9714632928807494 |
| calibration-clean / wls | 100 | 0 | 0.4596992808079428 | 0.45322230681294035 … 0.6252511317503822 |
| calibration-clean / huber | 100 | 0 | 0.47163676896953627 | 0.4426842543326319 … 0.5972027379607018 |
| calibration-unmodelled-offset / wls | 100 | 0 | 2.6685433486726335 | 2.6043503570079585 … 2.7098239098146033 |
| calibration-unmodelled-offset / huber | 100 | 0 | 0.8363975437566825 | 0.7513136463175393 … 0.9538187866696732 |
| clock-static / wls | 315 | 0 | 0.4987223396051943 | 0.4740688570972975 … 0.5756205230390289 |
| clock-static / ekf | 315 | 0 | 0.4330086256840778 | 0.39697953800886726 … 0.5190734691181472 |
| clock-drifting / wls | 315 | 0 | 0.49872234204875965 | 0.474068853619846 … 0.5756205222923029 |
| clock-drifting / ekf | 315 | 0 | 57.71353594072875 | 57.66363772874767 … 57.908655698993975 |
| contamination-clean / wls | 100 | 0 | 0.4596992808079428 | 0.45322230681294035 … 0.6252511317503822 |
| contamination-clean / huber | 100 | 0 | 0.47163676896953627 | 0.4426842543326319 … 0.5972027379607018 |
| contamination-heavy / wls | 100 | 0 | 7.763524394407499 | 6.94216406811424 … 9.857950661948536 |
| contamination-heavy / huber | 100 | 0 | 4.415869730227131 | 2.9055900198255036 … 5.384575169033913 |
| availability-full / wls | 100 | 0 | 0.4596992808079428 | 0.45322230681294035 … 0.6252511317503822 |
| availability-full / huber | 100 | 0 | 0.47163676896953627 | 0.4426842543326319 … 0.5972027379607018 |
| availability-intermittent / wls | 100 | 16 | 0.7538508581404039 | 0.6362536307861048 … 0.8891415569653491 |
| availability-intermittent / huber | 100 | 16 | 0.7561538220047358 | 0.6445785805715645 … 0.8921412880174547 |
| dynamic-tight-filter / wls | 315 | 0 | 0.4816522215033537 | 0.4807065285208833 … 0.5590822170029618 |
| dynamic-tight-filter / ekf | 315 | 0 | 0.30330409373590006 | 0.2925219537743065 … 0.34058906583095533 |
| dynamic-tight-filter / ukf | 315 | 0 | 0.3046451642469274 | 0.2938211297907347 … 0.34264310639854567 |
| dynamic-flexible-filter / wls | 315 | 0 | 0.4816522215033537 | 0.4807065285208833 … 0.5590822170029618 |
| dynamic-flexible-filter / ekf | 315 | 0 | 0.4225460213647586 | 0.40133171781080884 … 0.5083538375226077 |
| dynamic-flexible-filter / ukf | 315 | 0 | 0.4234191026125361 | 0.4030658957084493 … 0.5096228062336153 |
| covariance-nominal / wls | 100 | 0 | 0.4596992808079428 | 0.45322230681294035 … 0.6252511317503822 |
| covariance-nominal / huber | 100 | 0 | 0.47163676896953627 | 0.4426842543326319 … 0.5972027379607018 |
| covariance-understated / wls | 100 | 0 | 0.4596992808079428 | 0.4532223068129403 … 0.6252511317503823 |
| covariance-understated / huber | 100 | 0 | 0.5477469399852546 | 0.485310770856708 … 0.6521860658674346 |

## Interpretation and limits

The cases cover surrounding/near-collinear geometry, independent timing precision, unmodelled transmitter calibration offset, receiver clock bias/drift, NLOS/heavy contamination, missing observations, dynamic filter tuning and covariance misspecification. Robust-versus-WLS comparisons use matched observations within a case/seed. Across cases, changed physics/configuration can change the generated dataset; these are not identical-observation comparisons.

Stored full-rank XY covariance supports descriptive NEES (eᵀP⁻¹e) and ellipse coverage at threshold 5.991. Rows report the covariance denominator as well as mean NEES and observed coverage. These small finite synthetic samples do not establish covariance calibration or hardware validity. Missing covariance is unavailable, not a zero-error case. This is no non-coplanar/vertical study and no MBWDE implementation.

The JSON records dependency/platform versions, the complete declared plan and source SHA-256 references. These are integrity references, not signatures or proof that conclusions are correct. Existing Python tests separately cover estimator/model negative cases and geometry failures; local fixtures do not replace hosted operational acceptance.
