'use client';
import { useState, useRef } from 'react';
import { z } from 'zod';
import type { ExperimentResult } from '@/lib/laboratory';
import {
  comparisonRows,
  comparisonWarnings,
  comparisonCsv,
  comparisonManifest,
  empiricalCdf,
  reportHtml,
  scientificConfiguration,
  sampledTrajectory,
} from '@/lib/run-comparison';
import { configurationDiff } from '@/lib/research';
import { downloadFile } from '@/lib/downloads';
import { Button } from './ui/button';
const collectionSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(80),
      runIds: z.array(z.string().uuid()).min(2).max(4),
      createdAt: z.string(),
    }),
  )
  .max(50);
const colors = ['#008c99', '#b55d15', '#8a4daf', '#46822a'];
export function RunComparison({
  ids,
  load,
  onSelect,
}: {
  ids: string[];
  onSelect: (ids: string[]) => void;
  load: (id: string) => Promise<ExperimentResult>;
}) {
  const [runs, setRuns] = useState<ExperimentResult[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [name, setName] = useState('Research comparison'),
    [collections, setCollections] = useState<
      { name: string; runIds: string[]; createdAt: string }[]
    >([]),
    [collectionMessage, setCollectionMessage] = useState('');
  const current = runs.length === ids.length && runs.every((r) => ids.includes(r.id));
  const rows = current ? comparisonRows(runs) : [];
  const save = (data: string, filename: string, type: string) =>
    downloadFile(new File([data], filename, { type }));
  return (
    <section className="research-detail">
      <h3>Immutable run comparison</h3>
      <p>
        Select two to four runs. Metrics use complete recorded summaries; plotted CDFs retain
        empirical rank and may sample at most 601 points.
      </p>
      <Button
        disabled={busy || ids.length < 2}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setRuns(await Promise.all(ids.map(load)));
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Compare selected runs
      </Button>
      <Button
        onClick={() => {
          try {
            const raw = JSON.parse(localStorage.getItem('terralab.report-collections.v1') ?? '[]');
            collectionSchema.parse(raw);
            setCollections(raw);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Show local collections
      </Button>
      {collections.map((c, i) => (
        <p key={i}>
          {c.name} · {c.createdAt} · {c.runIds.join(', ')}{' '}
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              onSelect(c.runIds);
              setName(c.name);
              try {
                setRuns(await Promise.all(c.runIds.map(load)));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Open collection {c.name}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              save(
                JSON.stringify(c, null, 2),
                'terralab-report-collection.json',
                'application/json',
              )
            }
          >
            Export collection reference
          </Button>
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {current && runs.length >= 2 && (
        <>
          <ul>
            {comparisonWarnings(runs).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="lab-table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  {[
                    'Run / estimator / sweep',
                    'RMSE m',
                    'Median m',
                    'P95 m',
                    'Max m',
                    'Availability',
                    'Fixes / attempted',
                    'Median runtime ms',
                    'Run planned / unattempted',
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.runId} / {r.estimator} / {r.sweepValue}
                    </td>
                    {[r.rmseM, r.medianErrorM, r.p95ErrorM, r.maxErrorM, r.availability].map(
                      (v, k) => (
                        <td key={k}>{v === null ? 'unavailable' : String(v)}</td>
                      ),
                    )}
                    <td>
                      {r.fixes} / {r.attempted}
                    </td>
                    <td>{r.medianRuntimeMs ?? 'unavailable'}</td>
                    <td>
                      {r.planned} / {r.unattempted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ComparisonCharts runs={runs} />
          <details>
            <summary>Scientific configuration differences</summary>
            {runs.slice(1).map((r) => (
              <section key={r.id}>
                <h4>
                  {runs[0].id} → {r.id}
                </h4>
                <pre>
                  {JSON.stringify(
                    configurationDiff(scientificConfiguration(runs[0]), scientificConfiguration(r)),
                    null,
                    2,
                  )}
                </pre>
              </section>
            ))}
          </details>
          <label>
            Report collection name
            <input
              aria-label="Report collection name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="research-inline">
            <Button
              onClick={async () => {
                try {
                  save(
                    JSON.stringify({ manifest: await comparisonManifest(runs), runs }, null, 2),
                    'terralab-comparison.json',
                    'application/json',
                  );
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Export comparison and complete source JSON
            </Button>
            <Button
              onClick={() => save(comparisonCsv(runs), 'terralab-comparison.csv', 'text/csv')}
            >
              Export comparison CSV
            </Button>
            <Button
              onClick={async () =>
                save(
                  JSON.stringify(await comparisonManifest(runs), null, 2),
                  'terralab-comparison.manifest.json',
                  'application/json',
                )
              }
            >
              Export reproducibility manifest
            </Button>
            <Button
              onClick={() =>
                save(reportHtml(runs, name), 'terralab-comparison-report.html', 'text/html')
              }
            >
              Export printable report / PDF
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                try {
                  const raw = JSON.parse(
                    localStorage.getItem('terralab.report-collections.v1') ?? '[]',
                  );
                  collectionSchema.parse(raw);
                  const list = [
                    {
                      name: name.trim(),
                      runIds: runs.map((r) => r.id),
                      createdAt: new Date().toISOString(),
                    },
                    ...raw,
                  ].slice(0, 50);
                  localStorage.setItem('terralab.report-collections.v1', JSON.stringify(list));
                  setCollections(list);
                  setCollectionMessage(
                    'Named collection saved locally. It references run IDs and does not copy or modify source data.',
                  );
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Save named collection locally
            </Button>
          </div>
          {collectionMessage && <p role="status">{collectionMessage}</p>}

          <p className="small-copy">
            Collections are browser-local references; they do not grant cloud access. Export source
            JSON with the report. Printable HTML uses your browser’s Print / Save PDF; per-run
            native PDF remains in Publication exports.
          </p>
        </>
      )}
    </section>
  );
}
function ComparisonCharts({ runs }: { runs: ExperimentResult[] }) {
  const charts = useRef<HTMLDivElement>(null),
    [exportError, setExportError] = useState('');
  async function exportChart(index: number, format: 'svg' | 'png') {
    try {
      const svg = charts.current?.querySelectorAll('svg')[index];
      if (!svg) throw Error('Chart not available');
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.style.color = '#172c39';
      clone.style.background = 'white';
      clone.setAttribute('width', '1200');
      clone.setAttribute('height', index === 2 ? '560' : '520');
      const source = new XMLSerializer().serializeToString(clone),
        blob = new Blob([source], { type: 'image/svg+xml' });
      if (format === 'svg') {
        downloadFile(
          new File([blob], 'terralab-comparison-' + index + '.svg', { type: 'image/svg+xml' }),
        );
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = index === 2 ? 560 : 520;
        const context = canvas.getContext('2d');
        if (!context) throw Error('PNG canvas unavailable');
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(Error('PNG export failed'))), 'image/png'),
        );
        downloadFile(
          new File([png], 'terralab-comparison-' + index + '.png', { type: 'image/png' }),
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  const [estimator, setEstimator] = useState(''),
    [location, setLocation] = useState(''),
    [trial, setTrial] = useState(''),
    [sweep, setSweep] = useState('');
  const records = runs.flatMap((r) => r.records),
    estimators = [...new Set(records.map((r) => r.estimator))],
    locations = [...new Set(records.map((r) => r.locationId))],
    trials = [...new Set(records.map((r) => String(r.trial)))],
    sweeps = [...new Set(records.map((r) => String(r.sweepValue)))];
  const chosen = estimator || estimators[0],
    chosenLocation = location || locations[0],
    chosenTrial = trial || trials[0],
    chosenSweep = sweep || sweeps[0];
  const values = runs.map((r) =>
      r.records.filter((x) => x.estimator === chosen && String(x.sweepValue) === chosenSweep),
    ),
    cdf = values.map((v) => empiricalCdf(v.flatMap((r) => (r.errorM === null ? [] : [r.errorM])))),
    max = Math.max(1, ...cdf.flatMap((p) => p.map((v) => v.x)));
  const residuals = values.map((v) => empiricalCdf(v.flatMap((r) => r.normalizedResiduals ?? []))),
    rmin = Math.min(0, ...residuals.flatMap((p) => p.map((v) => v.x))),
    rmax = Math.max(1, ...residuals.flatMap((p) => p.map((v) => v.x)));
  const trajectory = values.map((v) =>
    v.filter((r) => r.locationId === chosenLocation && String(r.trial) === chosenTrial),
  );
  const xy = trajectory.flatMap((v) =>
    v.flatMap((r) => [r.truth, ...(r.position ? [r.position] : [])]),
  );
  const xmin = xy.reduce((a, p) => Math.min(a, p[0]), 0),
    xmax = xy.reduce((a, p) => Math.max(a, p[0]), 1),
    ymin = xy.reduce((a, p) => Math.min(a, p[1]), 0),
    ymax = xy.reduce((a, p) => Math.max(a, p[1]), 1);
  function line(points: { x: number; y: number }[], lo: number, hi: number) {
    return points
      .map(
        (p, i) => (i ? 'L' : 'M') + (50 + ((p.x - lo) / (hi - lo)) * 500) + ',' + (220 - p.y * 180),
      )
      .join(' ');
  }
  return (
    <div className="comparison-charts" ref={charts}>
      <div className="research-inline">
        {['Position CDF', 'Residual CDF', 'Trajectory'].map((label, index) => (
          <span key={label}>
            {(['svg', 'png'] as const).map((format) => (
              <Button key={format} size="sm" onClick={() => void exportChart(index, format)}>
                Export {label} {format.toUpperCase()}
              </Button>
            ))}
          </span>
        ))}
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      <div className="research-inline">
        {[
          ['Estimator', chosen, estimators, setEstimator],
          ['Location', chosenLocation, locations, setLocation],
          ['Trial', chosenTrial, trials, setTrial],
          ['Sweep value', chosenSweep, sweeps, setSweep],
        ].map(([label, value, options, setter]) => (
          <label key={label as string}>
            {label as string}
            <select
              aria-label={'Comparison ' + label}
              value={value as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
            >
              {(options as string[]).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p>
        {runs.map((r, i) => (
          <span key={r.id} style={{ color: colors[i] }}>
            {' '}
            {i + 1}: {r.id}{' '}
          </span>
        ))}
      </p>
      <svg viewBox="0 0 600 260" role="img" aria-label="Comparison empirical position error CDF">
        <path d="M50 40V220H550" fill="none" stroke="currentColor" />
        {cdf.map((p, i) => (
          <path
            key={i}
            d={line(p, 0, max)}
            fill="none"
            stroke={colors[i]}
            strokeWidth={2}
            strokeDasharray={i ? '6 3' : undefined}
          />
        ))}
        <text x="50" y="245" fill="currentColor">
          Position error (m), 0 to {max.toPrecision(4)}; empirical probability 0–1
        </text>
      </svg>
      <svg
        viewBox="0 0 600 260"
        role="img"
        aria-label="Comparison normalized residual empirical distributions"
      >
        <path d="M50 40V220H550" fill="none" stroke="currentColor" />
        {residuals.map((p, i) => (
          <path key={i} d={line(p, rmin, rmax)} fill="none" stroke={colors[i]} strokeWidth={2} />
        ))}
        <text x="50" y="245" fill="currentColor">
          Standardized residual (dimensionless), {rmin.toPrecision(3)} to {rmax.toPrecision(3)}; CDF
          0–1
        </text>
      </svg>
      <svg viewBox="0 0 600 280" role="img" aria-label="Comparison selected XY trajectories">
        {trajectory.map((rows, k) => {
          const v = sampledTrajectory(rows);
          let pen = false;
          const d = v
            .map((r) => {
              if (!r.position) {
                pen = false;
                return '';
              }
              const cmd = pen && !r.breakEstimate ? 'L' : 'M';
              pen = true;
              return (
                cmd +
                (50 + ((r.position[0] - xmin) / (xmax - xmin)) * 500) +
                ',' +
                (220 - ((r.position[1] - ymin) / (ymax - ymin)) * 180)
              );
            })
            .join(' ');
          const truth = v
            .map(
              (r, i) =>
                (i ? 'L' : 'M') +
                (50 + ((r.truth[0] - xmin) / (xmax - xmin)) * 500) +
                ',' +
                (220 - ((r.truth[1] - ymin) / (ymax - ymin)) * 180),
            )
            .join(' ');
          return (
            <g key={k}>
              <path d={truth} fill="none" stroke={colors[k]} strokeDasharray="2 5" />
              <path d={d} fill="none" stroke={colors[k]} strokeWidth={2} />
            </g>
          );
        })}
        <text x="30" y="245" fill="currentColor">
          X east (m): {xmin.toPrecision(3)} to {xmax.toPrecision(3)}; Y north (m):{' '}
          {ymin.toPrecision(3)} to {ymax.toPrecision(3)}
        </text>
        <text x="30" y="265" fill="currentColor">
          Dotted truth; solid estimate. Selected cohort sampled to 2,000 points; failure gaps
          retained.
        </text>
      </svg>
    </div>
  );
}
