'use client';
import { useMemo } from 'react';
import {
  worldToCanvas,
  deserializeProject,
  type Project,
  type Viewport,
  type LabFrame,
  type LabRecord,
} from '@terralab/shared';
import { useLabView } from '@/lib/lab-view';
function contour(frame: LabFrame, observation: LabFrame['observations'][number], bounds: number[]) {
  if (!frame.reference) return '';
  const [xmin, ymin, xmax, ymax] = bounds,
    n = 35;
  const value = (x: number, y: number) =>
    Math.hypot(x - observation.anchor[0], y - observation.anchor[1]) -
    Math.hypot(x - frame.reference!.anchor[0], y - frame.reference!.anchor[1]) -
    observation.value;
  const segments: number[][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = xmin + ((xmax - xmin) * i) / n,
        y = ymin + ((ymax - ymin) * j) / n,
        dx = (xmax - xmin) / n,
        dy = (ymax - ymin) / n;
      const corners = [
        [x, y],
        [x + dx, y],
        [x + dx, y + dy],
        [x, y + dy],
      ];
      const crossings: number[][] = [];
      corners.forEach((p, k) => {
        const q = corners[(k + 1) % 4],
          a = value(...(p as [number, number])),
          b = value(...(q as [number, number]));
        if (a <= 0 !== b <= 0) {
          const t = a / (a - b);
          crossings.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      });
      for (let k = 0; k + 1 < crossings.length; k += 2)
        segments.push([...crossings[k], ...crossings[k + 1]]);
    }
  return segments.map((s) => `M${s[0]} ${-s[1]}L${s[2]} ${-s[3]}`).join('');
}
export function LaboratoryOverlay({ project, view }: { project: Project; view: Viewport }) {
  const { result, index, layers } = useLabView();
  const showTdoa = layers.includes('tdoa');
  const record = result?.records[index];
  const frame = record && result?.frames[record.frameId];
  const matches = useMemo(() => {
    if (!result) return false;
    try {
      // Compare both networks through the schema: cloud/legacy property order and
      // materialized defaults must not make an unchanged snapshot look edited.
      const snapshot = deserializeProject(JSON.stringify(result.request.project));
      return JSON.stringify(project.objects) === JSON.stringify(snapshot.objects);
    } catch {
      return false;
    }
  }, [project.objects, result]);
  const geometry = useMemo(() => {
    if (!result || !record || !frame) return null;
    const anchors = frame.anchors;
    const xs = anchors.map((o) => o.anchor[0]),
      ys = anchors.map((o) => o.anchor[1]);
    const bounds = [
      Math.min(...xs) - 30,
      Math.min(...ys) - 30,
      Math.max(...xs) + 30,
      Math.max(...ys) + 30,
    ];
    const trajectory = result.records.filter(
      (r) =>
        r.estimator === record.estimator &&
        r.locationId === record.locationId &&
        r.trial === record.trial &&
        r.sweepValue === record.sweepValue,
    );
    const paths = frame.observations.map((o) =>
      showTdoa && o.kind === 'tdoa' ? contour(frame, o, bounds) : '',
    );
    const bins = new Map<string, { x: number; y: number; n: number; fix: number; error: number }>();
    const matching = result.records.filter(
      (r) => r.estimator === record.estimator && r.sweepValue === record.sweepValue,
    );
    const extent = [...bounds];
    for (const r of matching) {
      extent[0] = Math.min(extent[0], r.truth[0]);
      extent[1] = Math.min(extent[1], r.truth[1]);
      extent[2] = Math.max(extent[2], r.truth[0]);
      extent[3] = Math.max(extent[3], r.truth[1]);
    }
    const dx = Math.max((extent[2] - extent[0]) / 16, 1),
      dy = Math.max((extent[3] - extent[1]) / 16, 1);
    for (const r of matching) {
      const x = Math.floor((r.truth[0] - extent[0]) / dx),
        y = Math.floor((r.truth[1] - extent[1]) / dy),
        key = `${x}:${y}`;
      const bin = bins.get(key) ?? {
        x: extent[0] + x * dx,
        y: extent[1] + y * dy,
        n: 0,
        fix: 0,
        error: 0,
      };
      bin.n++;
      if (r.errorM !== null) {
        bin.fix++;
        bin.error += r.errorM;
      }
      bins.set(key, bin);
    }
    const maxError = Math.max(
      ...[...bins.values()].map((b) => (b.fix ? b.error / b.fix : 0)),
      1e-9,
    );
    return { trajectory, paths, bins: [...bins.values()], dx, dy, maxError };
  }, [result, record, frame, showTdoa]);
  if (!result || !record || !frame || !geometry) return null;
  if (!matches)
    return (
      <text x="25" y="165" className="lab-overlay-label">
        Laboratory snapshot hidden: network has changed. Restore its network to preview.
      </text>
    );
  const has = (layer: (typeof layers)[number]) => layers.includes(layer);
  const screen = (p: number[]) => worldToCanvas({ x: p[0], y: p[1] }, view);
  const path = (rows: LabRecord[], estimated: boolean) => {
    let started = false;
    return rows
      .map((r) => {
        const p = estimated ? r.position : r.truth;
        if (!p) {
          started = false;
          return '';
        }
        const q = screen(p),
          cmd = started ? 'L' : 'M';
        started = true;
        return `${cmd}${q.x} ${q.y}`;
      })
      .join('');
  };
  const truth = screen(record.truth),
    estimate = record.position ? screen(record.position) : null;
  const rejected = record.rejected ?? [];
  return (
    <g className="laboratory-overlay" pointerEvents="none">
      {(has('heatmap') || has('coverage')) &&
        geometry.bins.map((b, i) => {
          const p = screen([b.x, b.y + geometry.dy]),
            intensity = has('heatmap')
              ? b.fix
                ? b.error / b.fix / geometry.maxError
                : 0
              : b.fix / b.n;
          return (
            <rect
              key={i}
              x={p.x}
              y={p.y}
              width={geometry.dx * view.zoom}
              height={geometry.dy * view.zoom}
              fill={b.fix ? 'var(--cyan)' : 'var(--danger)'}
              opacity={0.1 + 0.45 * intensity}
            >
              <title>{`${b.n} attempted; ${b.fix} fixes; availability ${((100 * b.fix) / b.n).toFixed(1)}%; mean error ${b.fix ? (b.error / b.fix).toFixed(3) + ' m' : 'unavailable'}`}</title>
            </rect>
          );
        })}
      {has('truth') && (
        <>
          <path
            d={path(geometry.trajectory, false)}
            fill="none"
            stroke="var(--green)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <circle
            cx={truth.x}
            cy={truth.y}
            r="7"
            fill="var(--canvas)"
            stroke="var(--green)"
            strokeWidth="2"
          />
        </>
      )}
      {has('estimate') && (
        <path
          d={path(geometry.trajectory, true)}
          fill="none"
          stroke="var(--purple)"
          strokeWidth="2"
        />
      )}
      {frame.observations.map((o, i) => {
        const a = screen(o.anchor),
          isRejected = rejected.includes(i),
          color = isRejected ? 'var(--danger)' : o.nlos ? 'var(--amber)' : 'var(--cyan)';
        const range =
          o.kind === 'rss'
            ? 10 ** ((o.power - o.loss - o.value) / (10 * result.request.config.pathLossExponent))
            : o.value - (frame.model === 'pseudorange' ? (record.clockBiasM ?? 0) : 0);
        return (
          <g key={i}>
            {((has('links') && !isRejected) || (has('rejected') && isRejected)) && (
              <line
                x1={a.x}
                y1={a.y}
                x2={truth.x}
                y2={truth.y}
                stroke={color}
                opacity=".65"
                strokeDasharray={isRejected ? '2 5' : o.nlos ? '7 4' : undefined}
              />
            )}
            {has('ranges') &&
              ['toa', 'pseudorange', 'rtt', 'rss'].includes(o.kind) &&
              Number.isFinite(range) &&
              range > 0 &&
              range < 1e5 && (
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={range * view.zoom}
                  fill="none"
                  stroke={color}
                  opacity=".3"
                />
              )}
            {has('bearings') && o.kind === 'aoa' && (
              <line
                x1={a.x}
                y1={a.y}
                x2={a.x + 200 * view.zoom * Math.cos(o.value)}
                y2={a.y - 200 * view.zoom * Math.sin(o.value)}
                stroke={color}
                strokeDasharray="8 3"
              />
            )}
            {has('tdoa') && o.kind === 'tdoa' && (
              <path
                d={geometry.paths[i]}
                transform={`translate(${view.width / 2 + view.pan.x} ${view.height / 2 + view.pan.y}) scale(${view.zoom})`}
                fill="none"
                stroke={color}
                strokeWidth={1 / view.zoom}
                opacity=".5"
              />
            )}
          </g>
        );
      })}
      {has('links') &&
        frame.anchors
          .filter((o) => !o.available)
          .map((o) => {
            const a = screen(o.anchor);
            return (
              <g key={o.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={truth.x}
                  y2={truth.y}
                  stroke="var(--muted)"
                  strokeDasharray="1 7"
                  opacity=".4"
                />
                <title>{`${o.id}: unavailable (${o.reason})`}</title>
              </g>
            );
          })}
      {estimate && (
        <>
          {has('errors') && (
            <line
              x1={truth.x}
              y1={truth.y}
              x2={estimate.x}
              y2={estimate.y}
              stroke="var(--danger)"
              strokeWidth="2"
            />
          )}
          {has('estimate') && (
            <path
              d={`M${estimate.x - 6} ${estimate.y}h12M${estimate.x} ${estimate.y - 6}v12`}
              stroke="var(--purple)"
              strokeWidth="2"
            />
          )}
          {has('uncertainty') && record.ellipse && (
            <ellipse
              cx={estimate.x}
              cy={estimate.y}
              rx={Math.min(record.ellipse.major * view.zoom, 1e6)}
              ry={Math.min(record.ellipse.minor * view.zoom, 1e6)}
              transform={`rotate(${(-record.ellipse.angle * 180) / Math.PI} ${estimate.x} ${estimate.y})`}
              fill="var(--selection)"
              stroke="var(--purple)"
            />
          )}
        </>
      )}
      <text
        x="25"
        y="165"
        className="lab-overlay-label"
      >{`Laboratory snapshot · ${record.estimator} · ${record.time.toFixed(1)} s · trial ${record.trial + 1} · ${record.locationId}`}</text>
      {has('geometry') && (
        <text x="25" y="184" className="lab-overlay-label">
          {record.failure ??
            `Jacobian condition ${record.condition?.toFixed(2) ?? '—'} · error ${record.errorM?.toFixed(3) ?? '—'} m · ${rejected.length} rejected`}
        </text>
      )}
    </g>
  );
}
