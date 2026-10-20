import { estimatorNames } from '@terralab/shared';
import type { ExperimentResult } from './laboratory';
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const format = (value: number | null) =>
  value === null ? 'unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 5 });
export function buildExperimentReport(
  result: ExperimentResult,
  svg: string,
  index: number,
): string {
  const row = result.records[index];
  const headers = [
    'Estimator',
    'Sweep',
    'Attempts',
    'Failures',
    'Availability',
    'Mean m',
    'Median m',
    'RMSE m',
    'P95 m',
    'Maximum m',
    'Median / P95 ms',
  ];
  const rows = result.summaries.map((s) => [
    estimatorNames[s.estimator],
    s.sweepValue,
    s.attempted,
    s.failures,
    s.availability === null ? 'unavailable' : `${format(s.availability * 100)}%`,
    format(s.meanErrorM),
    format(s.medianErrorM),
    format(s.rmseM),
    format(s.p95ErrorM),
    format(s.maxErrorM),
    `${format(s.medianRuntimeMs)} / ${format(s.p95RuntimeMs)}`,
  ]);
  const failures = result.summaries
    .filter((s) => s.failures)
    .map(
      (s) =>
        `<li>${escape(estimatorNames[s.estimator])} / ${s.sweepValue}: ${escape(JSON.stringify(s.failureReasons))}</li>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(result.request.project.name)} · scientific experiment</title><style>body{font:14px Arial,sans-serif;color:#222;background:#fff;max-width:1200px;margin:35px auto;padding:0 25px;line-height:1.6}h1{font-size:29px}h2{font-size:20px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{padding:7px;border:1px solid #bbb;text-align:right}th:first-child,td:first-child{text-align:left}.viewport svg{width:100%;height:auto}.viewport{border:1px solid #ccc;margin:20px 0}pre{font:10px monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:14px}button{padding:10px 16px;cursor:pointer}@media print{button{display:none}body{margin:0;padding:0}tr{break-inside:avoid}h2{break-after:avoid}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${escape(result.request.project.name)}</h1><p>TerraLab scientific experiment · software ${escape(result.softwareVersion)} · seed ${result.request.config.seed} · ${escape(result.status)}</p><p>Run ${escape(result.id)} · ${escape(result.createdAt)} · ${result.completed}/${result.planned} recorded estimator epochs${result.unattempted ? ` · ${result.unattempted} unattempted` : ''}</p><p>${escape(result.error)}</p><h2>Calculated performance</h2><p>Position-error statistics are conditional on successful fixes. Availability includes every attempted epoch. Failures are retained as null estimates, not zero error. Runtime includes estimator initialization and diagnostics; observations, rendering and storage are excluded.</p><table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${failures ? `<h2>Failure reasons</h2><ul>${failures}</ul>` : ''}<h2>Selected recorded epoch</h2><p>${row ? `${escape(row.estimator)} · location ${escape(row.locationId)} · trial ${row.trial + 1} · ${row.time} s · sweep ${row.sweepValue} · ${row.failure ? escape(row.failure) : `error ${format(row.errorM)} m`}` : 'No recorded epoch'}</p><p>The network image captures the currently selected scientific layers and viewport. It is not an interpolated coverage map.</p><div class="viewport">${svg}</div><pre>${escape(JSON.stringify(row, null, 2))}</pre><h2>Assumptions and interpretation</h2><p>Synthetic horizontal XY geometry; calibrated TOA, clock-unknown pseudorange, covariance-aware TDOA, calibrated RTT, wrapped bearings, empirical RSS or a declared hybrid. Geometric blockage/log-distance propagation are approximations, without RF ray tracing. Nominal Gaussian weighting and local uncertainty approximations can be misspecified under NLOS, shadowing, clock errors and heavy-tailed contamination. Robust estimators do not guarantee improvement. Linear LS versus weighted nonlinear LS changes both linearization and weighting; include NLS to isolate weighting. These values are simulation settings, not measured hardware performance.</p><p>EKF/UKF use constant-velocity states and configured process/measurement covariance. Cancelled/interrupted jobs are partial; use completed runs for balanced comparisons. See PHASE_2_METHODS.md for the complete scientific contract. Export full experiment JSON for every observation/covariance/estimate and CSV for all attempted epochs.</p><h2>Complete experiment configuration</h2><pre>${escape(JSON.stringify(result.request, null, 2))}</pre></body></html>`;
}
