import type { Anchor, Point, Project, Receiver, Obstacle } from './model';
import { blocked, distance } from './geometry';
import { hash, random, positionAt } from './mobility';
export type Measurement = {
  anchorId: string;
  anchor: Point;
  range: number;
  truth: number;
  blocked: boolean;
  sigma: number;
};
export type Solution = {
  position: Point;
  condition: number;
  rank: number;
  residuals: number[];
  rms: number;
};
// Extension boundary: future pseudorange/TDOA methods require separate discriminants and solvers.
export type MeasurementSet = {
  type: 'calibrated_range';
  units: 'm';
  time: number;
  measurements: Measurement[];
};
export function measurementsAt(project: Project, receiver: Receiver, time: number): MeasurementSet {
  const p = positionAt(receiver, time, project);
  const obstacles = project.objects.filter(
    (o): o is Obstacle => o.kind === 'obstacle' && o.enabled,
  );
  const ms = project.objects
    .filter((o): o is Anchor => o.kind === 'anchor' && o.enabled)
    .map((a) => {
      const truth = distance(p, a);
      const rng = random(
        project.settings.seed ^
          hash(a.id) ^
          hash(receiver.id) ^
          Math.floor(time / project.settings.step + 1e-8),
      );
      const noise = Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()) * a.noise;
      return {
        anchorId: a.id,
        anchor: { x: a.x, y: a.y },
        range: Math.max(0, truth + noise),
        truth,
        blocked: blocked(a, p, obstacles),
        sigma: a.noise,
      };
    });
  return { type: 'calibrated_range', units: 'm', time, measurements: ms };
}
export function solveRanges(set: MeasurementSet): Solution {
  if (set.type !== 'calibrated_range' || set.units !== 'm')
    throw Error('Only calibrated ranges in metres are supported');
  const ms = set.measurements;
  if (ms.length < 3) throw Error('At least 3 enabled, usable anchors are required');
  if (new Set(ms.map((m) => m.anchorId)).size !== ms.length)
    throw Error('Anchor IDs must be unique');
  if (ms.some((m) => ![m.range, m.anchor.x, m.anchor.y].every(Number.isFinite) || m.range < 0))
    throw Error('Invalid range observation');
  // Translate around reference anchor to avoid subtracting large squared world coordinates.
  const ref = ms[0];
  const rows = ms.slice(1).map((m) => {
    const dx = m.anchor.x - ref.anchor.x,
      dy = m.anchor.y - ref.anchor.y;
    return [2 * dx, 2 * dy];
  });
  const b = ms
    .slice(1)
    .map(
      (m, i) =>
        rows[i][0] ** 2 / 4 + rows[i][1] ** 2 / 4 + (ref.range - m.range) * (ref.range + m.range),
    );
  // Householder QR: no inverse or normal-equation position solve.
  const a = rows.map((r) => [...r]);
  const qtb = [...b];
  const scale = Math.max(...a.flat().map(Math.abs));
  if (scale === 0) throw Error('Degenerate geometry: coincident anchors');
  for (let k = 0; k < 2; k++) {
    const norm = Math.hypot(...a.slice(k).map((r) => r[k]));
    if (norm <= scale * 1e-12) throw Error('Degenerate geometry: anchors must not be collinear');
    const alpha = a[k][k] >= 0 ? -norm : norm;
    const v = a.slice(k).map((r) => r[k]);
    v[0] -= alpha;
    const vn = Math.hypot(...v);
    for (let i = 0; i < v.length; i++) v[i] /= vn;
    for (let j = k; j < 2; j++) {
      const dot = v.reduce((s, x, i) => s + x * a[k + i][j], 0);
      v.forEach((x, i) => (a[k + i][j] -= 2 * x * dot));
    }
    const dot = v.reduce((s, x, i) => s + x * qtb[k + i], 0);
    v.forEach((x, i) => (qtb[k + i] -= 2 * x * dot));
  }
  const [r00, r01, r11] = [a[0][0], a[0][1], a[1][1]];
  const frob = Math.hypot(r00, r01, r11);
  const det = Math.abs(r00 * r11);
  const discriminant = Math.sqrt(Math.max(0, frob ** 4 - 4 * det ** 2));
  const condition = (frob * frob + discriminant) / (2 * det);
  if (!Number.isFinite(condition) || condition > 1e8)
    throw Error('Ill-conditioned anchor geometry (condition > 1e8)');
  const y = qtb[1] / r11,
    x = (qtb[0] - r01 * y) / r00;
  const position = { x: x + ref.anchor.x, y: y + ref.anchor.y };
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Numerical solution failed');
  const residuals = ms.map((m) => distance(position, m.anchor) - m.range);
  return {
    position,
    rank: 2,
    condition,
    residuals,
    rms: Math.hypot(...residuals) / Math.sqrt(ms.length),
  };
}
export function solveProject(project: Project, r: Receiver, time: number) {
  const set = measurementsAt(project, r, time);
  const usable = set.measurements.filter((m) => !project.settings.excludeBlocked || !m.blocked);
  try {
    const solution = solveRanges({ ...set, measurements: usable });
    return { set, usable, solution, error: null, truth: positionAt(r, time, project) };
  } catch (e) {
    return {
      set,
      usable,
      solution: null,
      error: e instanceof Error ? e.message : 'Solver failed',
      truth: positionAt(r, time, project),
    };
  }
}
