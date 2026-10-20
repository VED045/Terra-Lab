import type { SimulationSnapshot } from '@terralab/shared';
import { distance } from '@terralab/shared';
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const number = (value: number | null | undefined, digits = 4) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
export function exportStem(name: string, time: number) {
  return `${
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'terralab'
  }-t${time.toFixed(1)}s`;
}
function errorChart(snapshot: SimulationSnapshot) {
  const width = 850,
    height = 190,
    pad = 38,
    valid = snapshot.samples.filter((sample) => sample.error !== null);
  if (!valid.length) return '<p>No valid sampled fixes are available for a chart.</p>';
  const start = snapshot.samples[0].time,
    end = Math.max(start + 1, snapshot.samples.at(-1)!.time),
    max = Math.max(0.001, ...valid.map((s) => s.error!)) * 1.1;
  const x = (time: number) => pad + ((time - start) / (end - start)) * (width - 2 * pad),
    y = (error: number) => height - pad - (error / max) * (height - 2 * pad);
  const paths: string[] = [];
  let path = '';
  for (const sample of snapshot.samples) {
    if (sample.error === null) {
      if (path) paths.push(path);
      path = '';
    } else {
      path += `${path ? 'L' : 'M'}${x(sample.time).toFixed(2)} ${y(sample.error).toFixed(2)} `;
    }
  }
  if (path) paths.push(path);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sampled position error over simulation time"><path d="M${pad} ${pad}V${height - pad}H${width - pad}" fill="none" stroke="#a1b4c3"/>${paths.map((d) => `<path d="${d}" fill="none" stroke="#168c96" stroke-width="2"/>`).join('')}${valid.length === 1 ? `<circle cx="${x(valid[0].time)}" cy="${y(valid[0].error!)}" r="3" fill="#168c96"/>` : ''}<g fill="#5a7084" font-size="10" font-family="monospace"><text x="${pad}" y="${height - 10}">${number(start, 1)} s</text><text text-anchor="end" x="${width - pad}" y="${height - 10}">${number(end, 1)} s</text><text x="5" y="${pad}">${number(max, 3)}</text><text x="7" y="${height - pad}">0 m</text></g></svg>`;
}
export function buildSimulationReport(snapshot: SimulationSnapshot, networkSvg = ''): string {
  const { project, result, receiver } = snapshot;
  const anchors = project.objects.filter((object) => object.kind === 'anchor');
  const tableRows =
    result?.set.measurements
      .map((measurement) => {
        const used = result.usable.findIndex((value) => value.anchorId === measurement.anchorId);
        const name =
          project.objects.find((object) => object.id === measurement.anchorId)?.name ??
          measurement.anchorId;
        return `<tr><td>${escapeHtml(name)}</td><td>${number(measurement.range)}</td><td>${number(result.solution ? distance(result.solution.position, measurement.anchor) : null)}</td><td>${number(result.solution && used >= 0 ? result.solution.residuals[used] : null)}</td><td>${measurement.blocked ? 'Obstructed' : 'LOS'}</td><td>${used >= 0 ? 'Yes' : 'No'}</td></tr>`;
      })
      .join('') ?? '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.name)} · TerraLab report</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef3f7;color:#233647;font:14px/1.6 Arial,sans-serif}main{max-width:1000px;margin:35px auto;padding:40px;background:white;border:1px solid #d6e1e9}header{border-bottom:2px solid #188c96;padding-bottom:24px;margin-bottom:28px}.brand{font-size:11px;letter-spacing:2px;color:#168c96}h1{font-size:30px;line-height:1.2;font-weight:500;letter-spacing:-1px;margin:14px 0}h2{font-size:17px;margin:30px 0 12px}p{color:#607487;margin:8px 0}.meta,.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.metrics>div{padding:16px;border:1px solid #d8e3eb}.metrics small{display:block;color:#6e8293;font-size:10px}.metrics strong{display:block;font:23px monospace;margin-top:8px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{text-align:left;padding:9px;border-bottom:1px solid #dce5ec}th{font-size:9px;letter-spacing:.5px;background:#f4f7fa}td:not(:first-child){font-family:monospace}code{font-size:11px;overflow-wrap:anywhere}.note{background:#f0f7f8;border-left:3px solid #168c96;padding:14px}.diagram{background:#0c1621;overflow:hidden}.diagram>svg{display:block;width:100%;height:auto;max-height:580px}.chart>svg{display:block;width:100%;height:auto}button{padding:9px 15px;border:1px solid #188c96;color:#126b73;background:#e6f4f4;border-radius:3px;cursor:pointer}footer{font-size:10px;color:#738697;border-top:1px solid #dce5ec;margin-top:32px;padding-top:16px}.print-action{float:right}section{break-inside:avoid}pre{white-space:pre-wrap;font-size:10px;background:#f4f7fa;padding:15px;max-height:none}summary{cursor:pointer;color:#168c96}@media(max-width:650px){main{margin:0;padding:22px}.metrics,.meta{grid-template-columns:1fr 1fr}table{font-size:9px}th,td{padding:6px}}@media print{body{background:white}main{border:0;margin:0;padding:0;max-width:none}.print-action{display:none}h2{break-after:avoid}a{color:inherit}details{display:none}@page{size:A4;margin:16mm}}
  </style></head><body><main><header><button class="print-action" onclick="window.print()">Print / Save as PDF</button><div class="brand">TERRALAB · PHASE 1 RESEARCH REPORT</div><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description)}</p><p>Simulation timestamp: <b>${number(snapshot.time, 1)} s</b> · Model: calibrated horizontal ranges · Solver: browser Householder QR</p></header>
  <section><div class="metrics"><div><small>CURRENT POSITION ERROR</small><strong>${number(result?.solution ? distance(result.truth, result.solution.position) : null, 3)} m</strong></div><div><small>SAMPLED RMSE</small><strong>${number(snapshot.rmse, 3)} m</strong></div><div><small>USABLE ANCHORS</small><strong>${result?.usable.length ?? 0} / ${result?.set.measurements.length ?? 0}</strong></div><div><small>GEOMETRY CONDITION</small><strong>${number(result?.solution?.condition, 2)}</strong></div></div><p>Receiver: ${escapeHtml(receiver?.name ?? 'None enabled')} · Status: ${escapeHtml(result?.error ?? (result?.solution ? 'Valid rank-2 fix' : 'No fix'))}</p><p>Truth: (${number(result?.truth.x)}, ${number(result?.truth.y)}) m · Estimate: (${number(result?.solution?.position.x)}, ${number(result?.solution?.position.y)}) m · Residual RMS: ${number(result?.solution?.rms)} m.</p></section>
  ${networkSvg ? `<section><h2>Network setup at ${number(snapshot.time, 1)} s</h2><div class="diagram">${networkSvg}</div><p>Captured network viewport. Ground truth is green; the estimate is purple; amber links indicate geometric obstruction.</p></section>` : ''}
  <section><h2>Position error over time</h2><div class="chart">${errorChart(snapshot)}</div><p>${snapshot.samples.length} deterministic timestamps; up to the latest 400 samples at ${number(Math.max(0.5, project.settings.step), 1)} s intervals. Failed fixes are gaps, not zero error.</p></section>
  <section><h2>Current range observations</h2><table><thead><tr><th>TRANSMITTER</th><th>RANGE (m)</th><th>FIT (m)</th><th>RESIDUAL (m)</th><th>PATH</th><th>USED</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6">No range observations available.</td></tr>'}</tbody></table></section>
  <section><h2>Surveyed transmitter configuration</h2><table><thead><tr><th>NAME</th><th>X (m)</th><th>Y (m)</th><th>NOISE σ (m)</th><th>ENABLED</th></tr></thead><tbody>${anchors.map((anchor) => `<tr><td>${escapeHtml(anchor.name)}</td><td>${number(anchor.x)}</td><td>${number(anchor.y)}</td><td>${number(anchor.noise)}</td><td>${anchor.enabled ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></section>
  <section><h2>Reproducibility and assumptions</h2><p>Seed ${project.settings.seed} · Time step ${project.settings.step} s · Duration ${project.settings.duration} s · Obstructed observations ${project.settings.excludeBlocked ? 'excluded' : 'retained as ideal synthetic ranges'} · Receiver motion ${escapeHtml(receiver?.mobility ?? 'none')}.</p><p class="note">This is a simulated calibrated-range 2D baseline. Unknown clock bias is not estimated. RF, timing, clock and altitude fields are stored metadata. Geometric obstruction does not simulate attenuation or multipath. Condition number is not GDOP. These are simulated results, not measured hardware accuracy.</p><details><summary>Complete reproducible project configuration</summary><pre>${escapeHtml(JSON.stringify(project, null, 2))}</pre></details></section>
  <footer>TerraLab schema v${project.schemaVersion} · Project ${escapeHtml(project.id)} · Saved configuration timestamp ${escapeHtml(project.updatedAt)}. No account email, access token or cloud credential is included in this report.</footer></main></body></html>`;
}
