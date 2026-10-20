import { distance } from './geometry';
import type { Point, Project, Receiver, Trajectory } from './model';
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(1664525, n) + 1013904223) >>> 0;
    return (n + 0.5) / 4294967296;
  };
}
export function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function alongPath(points: Point[], travel: number, loop: boolean): Point {
  if (!points.length) throw Error('A path requires a point');
  if (points.length === 1) return points[0];
  const route = loop ? [...points, points[0]] : points;
  const lengths = route.slice(1).map((p, i) => distance(p, route[i]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return points[0];
  let d = loop ? travel % total : Math.min(travel, total);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] && lengths[i] > 0) {
      const f = d / lengths[i];
      return {
        x: route[i].x + (route[i + 1].x - route[i].x) * f,
        y: route[i].y + (route[i + 1].y - route[i].y) * f,
      };
    }
    d -= lengths[i];
  }
  return route.at(-1)!;
}
export function positionAt(r: Receiver, t: number, project: Project): Point {
  const time = Math.floor((Math.max(0, t) + 1e-9) / r.updateInterval) * r.updateInterval;
  if (!r.enabled || r.mobility === 'stationary') return { x: r.x, y: r.y };
  if (r.mobility === 'velocity' || r.mobility === 'linear') {
    const angle = (r.heading * Math.PI) / 180;
    return { x: r.x + r.speed * time * Math.cos(angle), y: r.y + r.speed * time * Math.sin(angle) };
  }
  if (r.mobility === 'circular') {
    const a = (time * r.speed) / r.radius;
    return { x: r.x + r.radius * (Math.cos(a) - 1), y: r.y + r.radius * Math.sin(a) };
  }
  if (r.mobility === 'waypoints') {
    const path = project.objects.find((o) => o.id === r.trajectoryId && o.kind === 'trajectory') as
      Trajectory | undefined;
    return path?.enabled ? alongPath(path.points, time * path.speed, path.loop) : r;
  }
  const rng = random(project.settings.seed ^ hash(r.id));
  const pts: Point[] = [r];
  let length = 0;
  while (length < r.speed * time && pts.length < 100001) {
    const p = { x: r.x + (rng() - 0.5) * 100, y: r.y + (rng() - 0.5) * 80 };
    length += distance(pts.at(-1)!, p);
    pts.push(p);
  }
  return alongPath(pts, time * r.speed, false);
}
export function advanceClock(
  time: number,
  elapsed: number,
  speed: number,
  step: number,
  duration: number,
): { time: number; remainder: number } {
  const ticks = Math.floor((elapsed * speed + 1e-9) / step);
  return {
    time: Math.min(duration, Number((time + ticks * step).toFixed(9))),
    remainder: Math.max(0, elapsed * speed - ticks * step),
  };
}
