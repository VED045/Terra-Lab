import type { Point, Obstacle } from './model';
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export type Viewport = { width: number; height: number; zoom: number; pan: Point };
export function worldToCanvas(p: Point, v: Viewport): Point {
  return { x: v.width / 2 + v.pan.x + p.x * v.zoom, y: v.height / 2 + v.pan.y - p.y * v.zoom };
}
export function canvasToWorld(p: Point, v: Viewport): Point {
  return { x: (p.x - v.width / 2 - v.pan.x) / v.zoom, y: -(p.y - v.height / 2 - v.pan.y) / v.zoom };
}
export function obstacleVertices(o: Obstacle): Point[] {
  const pts =
    o.shape === 'polygon'
      ? o.vertices
      : [
          { x: 0, y: 0 },
          { x: o.width, y: 0 },
          { x: o.width, y: o.height },
          { x: 0, y: o.height },
        ];
  return pts.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
}
function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function on(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-9 &&
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const a1 = cross(a, b, c),
    a2 = cross(a, b, d),
    b1 = cross(c, d, a),
    b2 = cross(c, d, b);
  return (a1 * a2 < 0 && b1 * b2 < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
export function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (on(a, b, p)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
export function blocked(a: Point, b: Point, obstacles: Obstacle[]): boolean {
  return obstacles.some((o) => {
    const poly = obstacleVertices(o);
    return (
      insidePolygon(a, poly) ||
      insidePolygon(b, poly) ||
      poly.some((p, i) => segmentsIntersect(a, b, p, poly[(i + 1) % poly.length]))
    );
  });
}
