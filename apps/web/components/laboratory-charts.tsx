'use client';
import { useMemo } from 'react';
import { estimatorNames, type LabRecord, type EstimatorId } from '@terralab/shared';
import type { ExperimentResult } from '@/lib/laboratory';
type Series = { name: string; points: [number, number | null][]; color: string; dash?: boolean };
const colors = [
  'var(--cyan)',
  'var(--purple)',
  'var(--green)',
  'var(--amber)',
  'var(--blue)',
  'var(--text)',
];
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
function Plot({
  title,
  xLabel,
  yLabel,
  series,
  xy = false,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  series: Series[];
  xy?: boolean;
}) {
  const all = series
    .flatMap((s) => s.points)
    .filter(
      (p): p is [number, number] => p[1] !== null && Number.isFinite(p[0]) && Number.isFinite(p[1]),
    );
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (const p of all) {
    xmin = Math.min(xmin, p[0]);
    xmax = Math.max(xmax, p[0]);
    ymin = Math.min(ymin, p[1]);
    ymax = Math.max(ymax, p[1]);
  }
  if (!all.length) {
    xmin = 0;
    xmax = 1;
    ymin = 0;
    ymax = 1;
  }
  if (xmax === xmin) xmax = xmin + 1;
  if (ymax === ymin) ymax = ymin + 1;
  if (!xy) ymin = Math.min(0, ymin);
  const x = (v: number) => 48 + ((v - xmin) / (xmax - xmin)) * 330,
    y = (v: number) => 173 - ((v - ymin) / (ymax - ymin)) * 145;
  return (
    <figure className="lab-plot">
      <figcaption>{title}</figcaption>
      <svg viewBox="0 0 400 215" role="img" aria-label={`${title}: ${xLabel} versus ${yLabel}`}>
        {!all.length && (
          <text x="210" y="98" textAnchor="middle">
            No valid plotted values
          </text>
        )}
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <path d={`M48 ${28 + t * 145}H378`} stroke="var(--grid-major)" />
            <text x="42" y={32 + t * 145} textAnchor="end">
              {fmt(ymax - t * (ymax - ymin))}
            </text>
            <text x={48 + t * 330} y="188" textAnchor="middle">
              {fmt(xmin + t * (xmax - xmin))}
            </text>
          </g>
        ))}
        <text x="210" y="208" textAnchor="middle">
          {xLabel}
        </text>
        <text transform="translate(12 105) rotate(-90)" textAnchor="middle">
          {yLabel}
        </text>
        {series.map((s, i) => {
          let begun = false;
          const stride = Math.max(1, Math.ceil(s.points.length / 2000));
          const path = s.points
            .map((p, j) => {
              if (p[1] === null) {
                begun = false;
                return '';
              }
              if (j % stride && j !== s.points.length - 1) return '';
              const command = begun ? 'L' : 'M';
              begun = true;
              return `${command}${x(p[0]).toFixed(2)} ${y(p[1]).toFixed(2)}`;
            })
            .join('');
          return (
            <g key={s.name}>
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth="1.8"
                strokeDasharray={s.dash ? '5 3' : undefined}
              />
              {s.points.length === 1 && s.points[0][1] !== null && (
                <circle cx={x(s.points[0][0])} cy={y(s.points[0][1])} r="3" fill={s.color} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="lab-plot-legend">
        {series.map((s) => (
          <span key={s.name} style={{ color: s.color }}>
            {s.dash ? '┄' : '━'} {s.name}
          </span>
        ))}
      </div>
    </figure>
  );
}
export function LaboratoryCharts({
  result,
  selected,
}: {
  result: ExperimentResult;
  selected: LabRecord | null;
}) {
  const data = useMemo(() => {
    const first = selected ?? result.records[0];
    if (!first) return null;
    const estimators = result.request.config.estimators;
    const group = result.records.filter((r) => r.sweepValue === first.sweepValue);
    const trajectory = group.filter(
      (r) => r.trial === first.trial && r.locationId === first.locationId,
    );
    const errors = group.flatMap((r) => (r.errorM === null ? [] : [r.errorM]));
    const max = errors.reduce((maximum, value) => Math.max(maximum, value), 1);
    const byEstimator = (e: EstimatorId) => group.filter((r) => r.estimator === e);
    const make = (build: (e: EstimatorId) => [number, number | null][]) =>
      estimators.map((e, i) => ({
        name: estimatorNames[e],
        color: colors[i % colors.length],
        dash: i >= colors.length,
        points: build(e),
      }));
    return {
      first,
      group,
      trajectory,
      estimators,
      time: make((e) => trajectory.filter((r) => r.estimator === e).map((r) => [r.time, r.errorM])),
      paths: [
        {
          name: 'Ground truth',
          color: 'var(--text)',
          points: trajectory
            .filter((r) => r.estimator === estimators[0])
            .map((r) => [r.truth[0], r.truth[1]] as [number, number]),
          dash: true,
        },
        ...make((e) =>
          trajectory
            .filter((r) => r.estimator === e)
            .map((r) => (r.position ? [r.position[0], r.position[1]] : [r.truth[0], null])),
        ),
      ],
      cdf: make((e) => {
        const a = byEstimator(e)
          .flatMap((r) => (r.errorM === null ? [] : [r.errorM]))
          .sort((a, b) => a - b);
        return a.map((v, i) => [v, (i + 1) / a.length]);
      }),
      histogram: make((e) => {
        const counts = Array(20).fill(0);
        byEstimator(e).forEach((r) => {
          if (r.errorM !== null) counts[Math.min(19, Math.floor((r.errorM / max) * 20))]++;
        });
        return counts.map((v, i) => [((i + 0.5) * max) / 20, v]);
      }),
      sweep: make((e) =>
        result.summaries
          .filter((s) => s.estimator === e)
          .sort((a, b) => a.sweepValue - b.sweepValue)
          .map((s) => [s.sweepValue, s.rmseM]),
      ),
      runtime: make((e) =>
        result.summaries
          .filter((s) => s.estimator === e)
          .sort((a, b) => a.sweepValue - b.sweepValue)
          .map((s) => [s.sweepValue, s.medianRuntimeMs]),
      ),
    };
  }, [result, selected]);
  if (!data) return <p className="small-copy">No attempted epochs yet.</p>;
  const sweepLabels = {
    none: 'Single configuration',
    timingNs: 'Timing uncertainty (ns)',
    nlosProbability: 'NLOS probability',
    speed: 'Receiver speed (m/s)',
    anchorCount: 'Enabled anchors',
  };
  return (
    <>
      <p className="field-caption">
        Distributions include successful fixes at sweep {data.first.sweepValue}; failure counts
        remain in the table. Trajectories show trial {data.first.trial + 1}, location{' '}
        {data.first.locationId}. Plots show at most 2,000 points per trace; metrics use all records.
      </p>
      <div className="lab-chart-grid">
        <Plot
          title="Position error over time"
          xLabel="Time (s)"
          yLabel="Position error (m)"
          series={data.time}
        />
        <Plot
          title="True and estimated trajectory"
          xLabel="X (m)"
          yLabel="Y (m)"
          series={data.paths}
          xy
        />
        <Plot
          title="Error histogram · 20 bins"
          xLabel="Position error (m)"
          yLabel="Successful fixes"
          series={data.histogram}
        />
        <Plot
          title="Empirical CDF · successful fixes"
          xLabel="Position error (m)"
          yLabel="Cumulative fraction"
          series={data.cdf}
        />
        <Plot
          title="Error across parameter sweep"
          xLabel={sweepLabels[result.request.config.sweep]}
          yLabel="RMSE (m)"
          series={data.sweep}
        />
        <Plot
          title="Estimator computation cost"
          xLabel={sweepLabels[result.request.config.sweep]}
          yLabel="Median runtime (ms)"
          series={data.runtime}
        />
      </div>
    </>
  );
}
export { fmt as labFormat };
export function LaboratoryObservations({
  result,
  selected,
}: {
  result: ExperimentResult;
  selected: LabRecord | null;
}) {
  const frame = selected && result.frames[selected.frameId];
  if (!selected || !frame) return null;
  return (
    <details className="lab-control-group">
      <summary>Selected epoch observations and residuals</summary>
      {selected.clockBiasM !== null && selected.clockBiasM !== undefined && (
        <p className="field-caption">
          Estimated receiver clock bias: {fmt(selected.clockBiasM)} m ={' '}
          {fmt((selected.clockBiasM / 299792458) * 1e9)} ns.
        </p>
      )}
      {frame.reference && (
        <p className="field-caption">
          TDOA reference: {frame.reference.id}. Shared-reference covariance is included in
          whitening.
        </p>
      )}
      <table className="lab-table">
        <thead>
          <tr>
            {[
              'Anchor / type',
              'Observed',
              'Unit',
              'Assumed marginal σ',
              'Predicted − observed',
              'State',
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {frame.observations.map((o, i) => (
            <tr key={i}>
              <th>
                {o.id} / {o.kind}
              </th>
              <td>{fmt(o.value)}</td>
              <td>{o.kind === 'aoa' ? 'rad' : o.kind === 'rss' ? 'dBm' : 'm'}</td>
              <td>{fmt(Math.sqrt(frame.covariance[i]?.[i] ?? o.sigma ** 2))}</td>
              <td>{fmt(selected.residuals?.[i])}</td>
              <td>
                {selected.rejected?.includes(i)
                  ? 'Rejected'
                  : o.nlos
                    ? 'Active NLOS'
                    : 'Active LOS'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {frame.anchors
        .filter((o) => !o.available)
        .map((o) => (
          <p className="field-caption" key={o.id}>
            {o.id}: unavailable ({o.reason}).
          </p>
        ))}
      <p className="field-caption">
        Covariance multiplier: {result.request.config.covarianceScale}. Full covariance matrices and
        observation hashes are in the JSON export. Normalized residual statistics use original
        available observations, including those later rejected.
      </p>
    </details>
  );
}
