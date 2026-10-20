import { labParameters, type LabSummary } from '@terralab/shared';
import type { ExperimentResult } from './laboratory';
import { sha256 } from './research';
export type PlotOptions = {
  title: string;
  xLabel: string;
  yLabel: string;
  legend: boolean;
  width: number;
  height: number;
};
export const defaultPlotOptions: PlotOptions = {
  title: 'Position error distribution',
  xLabel: 'Position error (m)',
  yLabel: 'Cumulative probability',
  legend: true,
  width: 1200,
  height: 750,
};
export function escapeXml(v: unknown) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export async function reproducibilityManifest(result: ExperimentResult) {
  return {
    format: 'terralab-reproducibility-1',
    experimentId: result.id,
    createdAt: result.createdAt,
    scientificVersion: result.softwareVersion,
    configurationSha256: await sha256(
      new TextEncoder().encode(JSON.stringify(stable(result.request))),
    ),
    configuration: result.request,
    recordedEpochs: result.completed,
    plannedEpochs: result.planned,
    status: result.status,
    metrics: result.summaries,
    artifacts: [
      'complete experiment JSON (observations, residuals and paired hashes)',
      'CSV estimator epochs',
      'publication SVG / PNG',
      'PDF research report',
    ],
    hashConvention: 'SHA-256 of recursively key-sorted UTF-8 JSON request; arrays retain order',
    limitations: [
      'Synthetic horizontal geometry; see PHASE_2_METHODS.md',
      'Error statistics conditional on numerical fixes; failures are retained',
      'Machine/runtime/timestamps may differ on rerun',
    ],
    environment: (result as unknown as { environment?: unknown }).environment ?? null,
  };
}
export function publicationSvg(result: ExperimentResult, options: PlotOptions): string {
  const o = {
    ...options,
    width: Math.max(600, Math.min(2400, options.width)),
    height: Math.max(450, Math.min(1600, options.height)),
  };
  const groups = new Map<string, number[]>();
  for (const row of result.records) {
    if (row.errorM !== null) {
      const key = row.estimator;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row.errorM);
    }
  }
  const left = 95,
    top = 90,
    bottom = o.height - 90,
    right = o.width - (o.legend ? 230 : 50),
    w = right - left,
    h = bottom - top;
  const max = Math.max(
    1e-9,
    ...[...groups.values()].map((values) => values.reduce((a, b) => Math.max(a, b), 0)),
  );
  const colors = [
    '#164e63',
    '#a21caf',
    '#166534',
    '#b45309',
    '#1d4ed8',
    '#be123c',
    '#6d28d9',
    '#3f6212',
  ];
  const fit = (text: string, pixels: number, font: number) =>
    text.length * font * 0.65 > pixels
      ? ` textLength="${pixels}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const subtitle = `${result.request.project.name} · model ${result.softwareVersion} · seed ${result.request.config.seed}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#111827"><text x="${left}" y="35" font-size="23"${fit(o.title, o.width - left - 30, 23)}>${escapeXml(o.title.slice(0, 150))}</text><text x="${left}" y="60" font-size="12"${fit(subtitle, o.width - left - 30, 12)}>${escapeXml(subtitle)}</text>`;
  for (let i = 0; i <= 5; i++) {
    const x = left + (w * i) / 5,
      y = bottom - (h * i) / 5;
    svg += `<path d="M${x},${top}V${bottom}M${left},${y}H${right}" stroke="#e5e7eb" fill="none"/><text x="${x}" y="${bottom + 24}" text-anchor="middle" font-size="12">${((max * i) / 5).toPrecision(3)}</text><text x="${left - 14}" y="${y + 4}" text-anchor="end" font-size="12">${(i / 5).toFixed(1)}</text>`;
  }
  let i = 0;
  for (const [key, values] of groups) {
    values.sort((a, b) => a - b);
    const color = colors[i % colors.length];
    let path = `M${left},${bottom}`;
    const stride = Math.max(1, Math.ceil(values.length / 2000));
    for (let j = 0; j < values.length; j += stride)
      path += `L${(left + (values[j] / max) * w).toFixed(2)},${(bottom - ((j + 1) / values.length) * h).toFixed(2)}`;
    path += `L${(left + (values.at(-1)! / max) * w).toFixed(2)},${top}`;
    svg += `<path d="${path}" stroke="${color}" stroke-width="2" fill="none"/>`;
    if (o.legend)
      svg += `<path d="M${right + 20},${top + i * 22}h18" stroke="${color}" stroke-width="3"/><text x="${right + 46}" y="${top + i * 22 + 4}" font-size="11">${escapeXml(key)} (n=${values.length})</text>`;
    i++;
  }
  const failures = result.records.filter((r) => r.errorM === null).length;
  return (
    svg +
    `<path d="M${left},${top}V${bottom}H${right}" stroke="#111827" fill="none"/><text x="${(left + right) / 2}" y="${o.height - 38}" text-anchor="middle" font-size="15"${fit(o.xLabel, w, 15)}>${escapeXml(o.xLabel.slice(0, 100))}</text><text transform="translate(25,${(top + bottom) / 2}) rotate(-90)" text-anchor="middle" font-size="15"${fit(o.yLabel, h, 15)}>${escapeXml(o.yLabel.slice(0, 100))}</text><text x="${left}" y="${o.height - 13}" font-size="10" textLength="${o.width - left - 30}" lengthAdjust="spacingAndGlyphs">Conditional on fixes · ${failures}/${result.records.length} failed · pooled sweeps/trials/locations · ≤2,000 display points/trace</text></g></svg>`
  );
}
export async function svgPng(svg: string, scale = 2) {
  const canvas = document.createElement('canvas'),
    root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  canvas.width = Number(root.getAttribute('width')) * scale;
  canvas.height = Number(root.getAttribute('height')) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas unavailable');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error('Image rendering failed'));
      image.src = url;
    });
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function reportPayload(result: ExperimentResult, options: PlotOptions) {
  const stride = Math.max(1, Math.ceil(result.records.length / 2000));
  return {
    id: result.id,
    createdAt: result.createdAt,
    softwareVersion: result.softwareVersion,
    status: result.status,
    request: result.request,
    completed: result.completed,
    planned: result.planned,
    summaries: result.summaries,
    records: result.records
      .filter((_, i) => i % stride === 0)
      .map((r) => ({
        estimator: r.estimator,
        time: r.time,
        truth: r.truth,
        position: r.position,
        errorM: r.errorM,
        sweepValue: r.sweepValue,
        locationId: r.locationId,
        trial: r.trial,
      })),
    options,
    parameters: Object.entries(labParameters).map(([key, p]) => ({
      key,
      label: p.label,
      unit: p.unit,
      value: result.request.config[key as keyof typeof result.request.config],
    })),
    samplingNote: `Report trajectories use every ${stride}th stored epoch (max 2,000). Summary metrics use the complete stored run. The PDF CDF is labelled as a sampled visual; full-data SVG/JSON are available.`,
    failureCounts: result.summaries.map((s: LabSummary) => ({
      estimator: s.estimator,
      sweep: s.sweepValue,
      failures: s.failures,
      reasons: s.failureReasons,
    })),
  };
}
