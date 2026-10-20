import { describe, it, expect } from 'vitest';
import {
  worldToCanvas,
  canvasToWorld,
  distance,
  segmentsIntersect,
  blocked,
  createTemplate,
  newObject,
  solveRanges,
  solveProject,
  measurementsAt,
  positionAt,
  alongPath,
  advanceClock,
  serializeProject,
  deserializeProject,
  projectSchema,
  type MeasurementSet,
  type Receiver,
  type Point,
} from './index';
function observations(anchors: Point[], p = { x: 37, y: 28 }): MeasurementSet {
  return {
    type: 'calibrated_range',
    units: 'm',
    time: 0,
    measurements: anchors.map((a, i) => ({
      anchorId: String(i),
      anchor: a,
      range: distance(a, p),
      truth: distance(a, p),
      blocked: false,
      sigma: 0,
    })),
  };
}
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 80 },
  { x: 0, y: 80 },
];
describe('Coordinate system', () => {
  it.each([0.2, 1, 4.5, 12])('round-trips at zoom %s', (zoom) => {
    const v = { width: 913, height: 617, zoom, pan: { x: -113, y: 29 } },
      p = { x: 45.25, y: -23.6 };
    const recovered = canvasToWorld(worldToCanvas(p, v), v);
    expect(recovered.x).toBeCloseTo(p.x, 10);
    expect(recovered.y).toBeCloseTo(p.y, 10);
  });
  it('uses positive world Y upwards', () => {
    const v = { width: 100, height: 100, zoom: 2, pan: { x: 0, y: 0 } };
    expect(worldToCanvas({ x: 10, y: 10 }, v)).toEqual({ x: 70, y: 30 });
  });
  it('distance is Euclidean in metres', () =>
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5));
  it('zoom never changes ranges', () => {
    const p = createTemplate('square');
    const rx = p.objects.find((o) => o.kind === 'receiver') as Receiver;
    const a = measurementsAt(p, rx, 0);
    p.canvas.zoom = 12;
    expect(measurementsAt(p, rx, 0)).toEqual(a);
  });
});
describe('QR baseline', () => {
  it('rejects duplicate anchor observations', () => {
    const set = observations(square);
    set.measurements[1].anchorId = set.measurements[0].anchorId;
    expect(() => solveRanges(set)).toThrow(/unique/);
  });
  it.each([
    { x: 37, y: 28 },
    { x: 0, y: 0 },
    { x: 100, y: 80 },
    { x: -10, y: 145 },
  ])('recovers noiseless position %o', (p) => {
    const s = solveRanges(observations(square, p));
    expect(distance(p, s.position)).toBeLessThan(1e-10);
    expect(s.rank).toBe(2);
    expect(s.rms).toBeLessThan(1e-10);
  });
  it('supports the three-anchor minimum', () =>
    expect(solveRanges(observations(square.slice(0, 3))).rms).toBeLessThan(1e-10));
  it('uses redundant six-anchor observations', () =>
    expect(
      solveRanges(observations([...square, { x: 50, y: -20 }, { x: 50, y: 110 }])).rms,
    ).toBeLessThan(1e-10));
  it('is stable at a large translated origin', () => {
    const offset = { x: 900000, y: -900000 };
    const p = { x: offset.x + 37, y: offset.y + 28 };
    expect(
      distance(
        solveRanges(
          observations(
            square.map((a) => ({ x: a.x + offset.x, y: a.y + offset.y })),
            p,
          ),
        ).position,
        p,
      ),
    ).toBeLessThan(1e-8);
  });
  it('rejects collinear anchors', () =>
    expect(() =>
      solveRanges(
        observations([
          { x: 0, y: 0 },
          { x: 30, y: 0 },
          { x: 60, y: 0 },
        ]),
      ),
    ).toThrow(/Degenerate/));
  it('rejects coincident anchors', () =>
    expect(() =>
      solveRanges(
        observations([
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ]),
      ),
    ).toThrow(/Degenerate/));
  it('rejects near-collinear geometry', () =>
    expect(() =>
      solveRanges(
        observations([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 1e-7 },
        ]),
      ),
    ).toThrow(/condition/));
  it('rejects insufficient observations', () =>
    expect(() => solveRanges(observations(square.slice(0, 2)))).toThrow(/At least 3/));
  it('rejects negative and nonfinite observations', () => {
    for (const bad of [-1, NaN, Infinity]) {
      const set = observations(square);
      set.measurements[0].range = bad;
      expect(() => solveRanges(set)).toThrow(/Invalid/);
    }
  });
  it('does not accept pseudoranges', () => {
    const set = { ...observations(square), type: 'pseudorange' };
    expect(() => solveRanges(set as MeasurementSet)).toThrow(/Only calibrated/);
  });
  it('is deterministic and seed-dependent', () => {
    const p = createTemplate('square');
    const r = p.objects.find((o) => o.kind === 'receiver') as Receiver;
    const first = measurementsAt(p, r, 2);
    expect(measurementsAt(p, r, 2)).toEqual(first);
    p.settings.seed++;
    expect(measurementsAt(p, r, 2)).not.toEqual(first);
  });
  it('reports solver failure as a usable diagnostic', () => {
    const p = createTemplate('poor');
    expect(
      solveProject(p, p.objects.find((o) => o.kind === 'receiver') as Receiver, 0).error,
    ).toMatch(/Degenerate/);
  });
});
describe('LOS geometry', () => {
  it('detects crossing, endpoint and collinear intersections', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true);
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }),
    ).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 })).toBe(
      true,
    );
  });
  it('handles rays starting inside buildings', () => {
    const o = newObject('obstacle', { x: 2, y: 2 });
    o.width = 5;
    o.height = 5;
    expect(blocked({ x: 3, y: 3 }, { x: 30, y: 30 }, [o])).toBe(true);
    expect(blocked({ x: -5, y: 0 }, { x: 30, y: 0 }, [o])).toBe(false);
  });
  it('supports polygonal buildings', () => {
    const o = newObject('obstacle', { x: 0, y: 0 });
    o.shape = 'polygon';
    o.vertices = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(blocked({ x: -5, y: 5 }, { x: 10, y: 5 }, [o])).toBe(true);
    expect(blocked({ x: 8, y: 8 }, { x: 12, y: 12 }, [o])).toBe(false);
  });
});
describe('Deterministic mobility', () => {
  const p = createTemplate('moving');
  const r = p.objects.find((o) => o.kind === 'receiver') as Receiver;
  it('stationary stays fixed', () =>
    expect(positionAt({ ...r, mobility: 'stationary' }, 60, p)).toEqual({ x: r.x, y: r.y }));
  it('constant velocity uses metres per second', () => {
    const pos = positionAt({ ...r, mobility: 'velocity', speed: 2, heading: 90 }, 10, p);
    expect(pos.x).toBeCloseTo(r.x);
    expect(pos.y).toBeCloseTo(r.y + 20);
  });
  it('linear trajectory follows heading', () =>
    expect(positionAt({ ...r, mobility: 'linear', speed: 3, heading: 0 }, 2, p).x).toBeCloseTo(
      r.x + 6,
    ));
  it('circular starts continuously and returns after one lap', () => {
    const rx = { ...r, mobility: 'circular' as const, radius: 10, speed: 10, updateInterval: 0.1 };
    expect(positionAt(rx, 0, p)).toEqual({ x: r.x, y: r.y });
    const at = positionAt(rx, Math.PI, p);
    expect(distance(rx, at)).toBeGreaterThan(19.9);
  });
  it('waypoint trajectory uses path speed', () =>
    expect(positionAt(r, 5, p)).toEqual({ x: 35, y: 25 }));
  it('random waypoints reproduce independent of query order', () => {
    const rx = { ...r, mobility: 'random' as const };
    const a = positionAt(rx, 20, p);
    positionAt(rx, 55, p);
    expect(positionAt(rx, 20, p)).toEqual(a);
    expect(distance(rx, a)).toBeLessThanOrEqual(rx.speed * 20 + 1e-8);
  });
  it('clamps nonlooped paths and closes looped ones', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(alongPath(pts, 30, false)).toEqual(pts[1]);
    expect(alongPath(pts, 15, true)).toEqual({ x: 5, y: 0 });
  });
  it('handles zero-length path segments', () =>
    expect(
      alongPath(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        5,
        false,
      ),
    ).toEqual({ x: 5, y: 0 }));
  it('quantizes the receiver update interval', () =>
    expect(
      positionAt({ ...r, mobility: 'velocity', speed: 2, heading: 0, updateInterval: 1 }, 0.9, p).x,
    ).toBe(r.x));
  it('clock advances with elapsed time, not frame count', () => {
    let t = 0,
      carry = 0;
    for (const elapsed of [0.016, 0.034, 0.15, 0.2, 0.6]) {
      const a = advanceClock(t, elapsed + carry, 1, 0.1, 60);
      t = a.time;
      carry = a.remainder;
    }
    expect(t).toBeCloseTo(1);
    expect(advanceClock(0, 1, 1, 0.1, 60).time).toBeCloseTo(t);
  });
  it('clock supports speed multiplier and duration cap', () => {
    expect(advanceClock(0, 1, 4, 0.1, 60).time).toBe(4);
    expect(advanceClock(59.9, 2, 1, 0.1, 60).time).toBe(60);
  });
});
describe('Project serialization and validation', () => {
  it.each(['square', 'outdoor', 'poor', 'moving'])('round-trips complete %s template', (key) => {
    const p = createTemplate(key);
    expect(deserializeProject(serializeProject(p))).toEqual(p);
  });
  it('rejects unknown schema versions', () => {
    const p = createTemplate();
    expect(() => deserializeProject(JSON.stringify({ ...p, schemaVersion: 2 }))).toThrow();
  });
  it('rejects invalid parameters and broken trajectory references', () => {
    const p = createTemplate();
    const a = p.objects.find((o) => o.kind === 'anchor')!;
    if (a.kind === 'anchor') a.noise = -1;
    expect(projectSchema.safeParse(p).success).toBe(false);
    const q = createTemplate();
    const r = q.objects.find((o) => o.kind === 'receiver')!;
    if (r.kind === 'receiver') r.trajectoryId = 'missing';
    expect(projectSchema.safeParse(q).success).toBe(false);
  });
  it('rejects duplicate object IDs and zero update intervals', () => {
    const p = createTemplate();
    p.objects.push(p.objects[0]);
    expect(projectSchema.safeParse(p).success).toBe(false);
    const q = createTemplate();
    const r = q.objects.find((o) => o.kind === 'receiver')!;
    if (r.kind === 'receiver') r.updateInterval = 0;
    expect(projectSchema.safeParse(q).success).toBe(false);
  });
});
