import {
  deserializeProject,
  obstacleVertices,
  positionAt,
  type NetworkObject,
  type Point,
  type Project,
} from '@terralab/shared';
import type { ExperimentResult } from './laboratory';

export type XYZ = Point & { z: number };
export type SceneVector = [number, number, number];
export function toScene(p: Point & { z?: number }, metresPerUnit = 1): SceneVector {
  if (!(metresPerUnit > 0) || !Number.isFinite(metresPerUnit))
    throw Error('Unit scale must be positive and finite');
  return [p.x / metresPerUnit, (p.z ?? 0) / metresPerUnit, -p.y / metresPerUnit];
}
export function fromScene(p: SceneVector, metresPerUnit = 1): XYZ {
  if (!(metresPerUnit > 0) || !Number.isFinite(metresPerUnit))
    throw Error('Unit scale must be positive and finite');
  return { x: p[0] * metresPerUnit, y: -p[2] * metresPerUnit, z: p[1] * metresPerUnit };
}
export function objectPosition(
  o: NetworkObject,
  project: Project,
  time: number,
  elevation: boolean,
): XYZ {
  const point = o.kind === 'receiver' ? positionAt(o, time, project) : o;
  return { x: point.x, y: point.y, z: o.kind === 'receiver' && elevation ? o.altitude : 0 };
}
export function translatedObject(
  o: NetworkObject,
  target: XYZ,
  snap: number,
  axis: 'xy' | 'x' | 'y' | 'z',
): NetworkObject {
  const quantize = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v);
  if (axis === 'z' && o.kind !== 'receiver')
    throw Error('This schema has no surveyed Z coordinate for this object');
  const x = axis === 'y' || axis === 'z' ? o.x : quantize(target.x);
  const y = axis === 'x' || axis === 'z' ? o.y : quantize(target.y);
  const next = { ...o, x, y };
  if (next.kind === 'trajectory' && o.kind === 'trajectory')
    next.points = o.points.map((p) => ({ x: p.x + x - o.x, y: p.y + y - o.y }));
  if (next.kind === 'receiver' && axis === 'z') next.altitude = quantize(target.z);
  return next;
}
export function sceneBounds(project: Project, elevation = false, time = 0, extra: XYZ[] = []) {
  const points = project.objects.flatMap((o): XYZ[] => {
    if (o.kind === 'obstacle') {
      const base = o.baseElevation ?? 0;
      return obstacleVertices(o).flatMap((p) => [
        { ...p, z: base },
        { ...p, z: base + (o.verticalHeight ?? 0) },
      ]);
    }
    if (o.kind === 'trajectory') return o.points.map((p) => ({ ...p, z: 0 }));
    return [objectPosition(o, project, time, elevation)];
  });
  points.push(...extra);
  if (!points.length) return { center: { x: 0, y: 0, z: 0 }, span: 60 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    zs = points.map((p) => p.z);
  return {
    center: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    },
    span: Math.max(
      20,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs),
    ),
  };
}
export function snapshotMatches(project: Project, snapshot: Project) {
  try {
    return (
      JSON.stringify(deserializeProject(JSON.stringify(project)).objects) ===
      JSON.stringify(deserializeProject(JSON.stringify(snapshot)).objects)
    );
  } catch {
    return false;
  }
}
export function recordedScene(project: Project, result: ExperimentResult, index: number) {
  if (!snapshotMatches(project, result.request.project)) return null;
  const record = result.records[index];
  const frame = record && result.frames[record.frameId];
  if (!record || !frame) return null;
  const truth: XYZ = { x: record.truth[0], y: record.truth[1], z: 0 };
  const estimate: XYZ | null = record.position
    ? { x: record.position[0], y: record.position[1], z: 0 }
    : null;
  const links: {
    id: string;
    kind: string;
    from: XYZ;
    to: XYZ;
    status: string;
    value: number | null;
    residual: number | undefined;
    reason: string | null;
  }[] = frame.observations.map((o, i) => ({
    id: o.id,
    kind: o.kind,
    from: { x: o.anchor[0], y: o.anchor[1], z: 0 },
    to: truth,
    status: !o.available
      ? 'missing'
      : record.rejected?.includes(i)
        ? 'rejected'
        : o.nlos
          ? 'NLOS'
          : o.blocked
            ? 'blocked'
            : 'used',
    value: o.value,
    residual: record.residuals?.[i],
    reason: o.reason,
  }));
  // Unavailable anchors may have no observation row at all. Show their status
  // without inventing a measurement value or shifting observation residual indices.
  for (const anchor of frame.anchors) {
    if (!anchor.available && !links.some((link) => link.id === anchor.id)) {
      links.push({
        id: anchor.id,
        kind: 'missing',
        from: { x: anchor.anchor[0], y: anchor.anchor[1], z: 0 },
        to: truth,
        status: 'missing',
        value: null,
        residual: undefined,
        reason: anchor.reason,
      });
    }
  }
  const trajectory = result.records.filter(
    (r) =>
      r.estimator === record.estimator &&
      r.locationId === record.locationId &&
      r.trial === record.trial &&
      r.sweepValue === record.sweepValue,
  );
  const stride = Math.max(1, Math.ceil(trajectory.length / 2000));
  // Keep null estimates as gaps; never bridge failed epochs with a fabricated fix.
  let previous = -1;
  const path = trajectory.flatMap((r, i) => {
    if (i % stride !== 0) return [];
    const breakEstimate = trajectory.slice(previous + 1, i).some((row) => !row.position);
    previous = i;
    return [
      {
        truth: { x: r.truth[0], y: r.truth[1], z: 0 },
        estimate: r.position ? { x: r.position[0], y: r.position[1], z: 0 } : null,
        breakEstimate,
      },
    ];
  });
  return { record, frame, truth, estimate, links, path };
}
