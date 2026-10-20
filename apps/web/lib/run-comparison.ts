import type { ExperimentResult } from './laboratory';
import { configurationDiff } from './research';
export function scientificConfiguration(run: ExperimentResult) {
  const p = run.request.project;
  return {
    objects: p.objects.map((o) => {
      const { name, ...rest } = o;
      if (rest.kind === 'obstacle') {
        const { verticalHeight, baseElevation, ...horizontal } = rest;
        return horizontal;
      }
      return rest;
    }),
    config: run.request.config,
  };
}
export function comparisonWarnings(runs: ExperimentResult[]): string[] {
  if (runs.length < 2) return ['Select at least two runs.'];
  const base = runs[0],
    messages = new Set<string>();
  if (runs.some((r) => r.status !== 'completed'))
    messages.add(
      'Partial or unsuccessful runs are included: availability is over attempted fixes; planned and unattempted counts must be considered.',
    );
  for (const run of runs.slice(1)) {
    if (run.request.config.measurement !== base.request.config.measurement)
      messages.add(
        'Different measurement models: compare position errors descriptively; native residuals are not interchangeable.',
      );
    if (run.request.config.seed !== base.request.config.seed)
      messages.add('Seeds differ. This is not a paired-observation comparison.');
    if (run.softwareVersion !== base.softwareVersion)
      messages.add('Scientific software versions differ.');
    const diffs = configurationDiff(scientificConfiguration(base), scientificConfiguration(run));
    if (diffs.length > 1)
      messages.add(
        'Multiple scientific configuration fields changed; do not attribute the result to one controlled variable.',
      );
    const a = Object.values(base.frames)
        .map((f) => f.observationHash)
        .sort(),
      b = Object.values(run.frames)
        .map((f) => f.observationHash)
        .sort();
    if (!a.length || JSON.stringify(a) !== JSON.stringify(b))
      messages.add(
        'Observation datasets are unmatched or unavailable. Matching seeds alone do not prove pairing.',
      );
  }
  return [...messages];
}
export function empiricalCdf(values: number[], limit = 600) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const step = Math.max(1, Math.ceil(sorted.length / limit));
  return sorted.flatMap((value, i) =>
    i % step === 0 || i === sorted.length - 1 ? [{ x: value, y: (i + 1) / sorted.length }] : [],
  );
}
export function comparisonRows(runs: ExperimentResult[]) {
  return runs.flatMap((run) =>
    run.summaries.map((s) => ({
      runId: run.id,
      status: run.status,
      softwareVersion: run.softwareVersion,
      measurement: run.request.config.measurement,
      seed: run.request.config.seed,
      anchors: run.request.project.objects.filter((o) => o.kind === 'anchor' && o.enabled).length,
      planned: run.planned,
      completed: run.completed,
      unattempted: run.unattempted ?? Math.max(0, run.planned - run.completed),
      ...s,
    })),
  );
}
export function comparisonCsv(runs: ExperimentResult[]) {
  const rows = comparisonRows(runs);
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
  const cell = (v: unknown) =>
    JSON.stringify(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
  return (
    keys.map(cell).join(',') +
    '\r\n' +
    rows.map((row) => keys.map((k) => cell(row[k])).join(',')).join('\r\n')
  );
}
export async function comparisonManifest(runs: ExperimentResult[]) {
  const sources = await Promise.all(
    runs.map(async (run) => ({
      runId: run.id,
      softwareVersion: run.softwareVersion,
      seed: run.request.config.seed,
      createdAt: run.createdAt,
      parsedSnapshotSha256: Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(run))),
        ),
        (b) => b.toString(16).padStart(2, '0'),
      ).join(''),
    })),
  );
  return {
    format: 'terralab-comparison-1',
    createdAt: new Date().toISOString(),
    sources,
    warnings: comparisonWarnings(runs),
    metrics: comparisonRows(runs),
    configurations: runs.map((r) => ({ id: r.id, request: r.request })),
    integrityNote:
      'Hashes identify the parsed exported snapshots, not signatures, original worker byte hashes or proof of scientific correctness. Full raw data is included in the companion JSON.',
  };
}
export function reportHtml(runs: ExperimentResult[], title: string) {
  const escape = (v: unknown) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const rows = comparisonRows(runs);
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>' +
    escape(title) +
    '</title><style>body{font:14px system-ui;margin:40px;color:#172c39}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #aaa}pre{white-space:pre-wrap}section{break-inside:avoid}@media print{button{display:none}}</style><h1>' +
    escape(title) +
    '</h1><button onclick="print()">Print / Save PDF</button><h2>Methodology</h2><p>Frozen synthetic experiments; horizontal positioning. Metrics are the recorded full-data summaries, grouped by estimator and sweep. Accuracy is conditional on successful fixes; availability is over attempted fixes.</p><h2>Comparability and limitations</h2>' +
    comparisonWarnings(runs)
      .map((w) => '<p>' + escape(w) + '</p>')
      .join('') +
    '<p>No hardware validation or XYZ solve. Differences do not establish causation. Hashes are integrity references, not signatures.</p><h2>Results</h2><table><tr><th>Run / estimator / sweep</th><th>RMSE m</th><th>Median m</th><th>P95 m</th><th>Max m</th><th>Fixes / attempts</th><th>Availability</th><th>Median runtime ms</th></tr>' +
    rows
      .map(
        (r) =>
          '<tr><td>' +
          escape(r.runId + ' / ' + r.estimator + ' / ' + r.sweepValue) +
          '</td><td>' +
          escape(r.rmseM ?? 'unavailable') +
          '</td><td>' +
          escape(r.medianErrorM ?? 'unavailable') +
          '</td><td>' +
          escape(r.p95ErrorM ?? 'unavailable') +
          '</td><td>' +
          escape(r.maxErrorM ?? 'unavailable') +
          '</td><td>' +
          r.fixes +
          '/' +
          r.attempted +
          '</td><td>' +
          escape(r.availability ?? 'unavailable') +
          '</td><td>' +
          escape(r.medianRuntimeMs ?? 'unavailable') +
          '</td></tr>',
      )
      .join('') +
    '</table><h2>Reproduction</h2><p>Import a source experiment JSON and rerun its frozen configuration as a new record. Include the companion comparison manifest and complete JSON when sharing.</p>' +
    runs
      .map(
        (r) =>
          '<section><h3>' +
          escape(r.id) +
          '</h3><p>Model ' +
          escape(r.softwareVersion) +
          '; seed ' +
          r.request.config.seed +
          '; ' +
          escape(r.createdAt) +
          '; status ' +
          escape(r.status) +
          '</p><pre>' +
          escape(JSON.stringify(r.request, null, 2)) +
          '</pre><p>Failure reasons: ' +
          escape(
            JSON.stringify(
              r.summaries.map((s) => ({
                estimator: s.estimator,
                sweep: s.sweepValue,
                reasons: s.failureReasons,
              })),
            ),
          ) +
          '</p></section>',
      )
      .join('') +
    '</html>'
  );
}

export function sampledTrajectory<T extends { position: number[] | null }>(
  records: T[],
  limit = 2000,
): (T & { breakEstimate: boolean })[] {
  const step = Math.max(1, Math.ceil(records.length / Math.max(1, limit - 1))),
    result: (T & { breakEstimate: boolean })[] = [];
  let previous = -1;
  for (let i = 0; i < records.length; i++) {
    if (i % step !== 0 && i !== records.length - 1) continue;
    result.push({
      ...records[i],
      breakEstimate: records.slice(previous + 1, i).some((r) => !r.position),
    });
    previous = i;
  }
  return result;
}
