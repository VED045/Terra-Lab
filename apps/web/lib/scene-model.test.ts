import { beforeEach, afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createTemplate,
  deserializeProject,
  serializeProject,
  projectSchema,
  newObject,
} from '@terralab/shared';
import {
  fromScene,
  toScene,
  translatedObject,
  recordedScene,
  objectPosition,
  snapshotMatches,
} from './scene-model';
import { useSceneView } from './scene-view';
import { useStudio } from './store';
import type { ExperimentResult } from './laboratory';
beforeEach(() => {
  useSceneView.getState().set({ mode: '2d', editable: true });
  useStudio.getState().load(createTemplate('square'));
});
afterEach(() => useSceneView.getState().set({ mode: '2d', editable: true }));
it.each([0.01, 1, 1000])(
  'round-trips right-handed ENU coordinates at scale %s without modifying data',
  (scale) => {
    const point = { x: 123.25, y: -82.5, z: 15.125 };
    const scene = toScene(point, scale);
    expect(scene).toEqual([point.x / scale, point.z / scale, -point.y / scale]);
    expect(fromScene(scene, scale)).toEqual(point);
  },
);
it.each([0, -1, Infinity, NaN])('rejects invalid unit scale %s', (scale) =>
  expect(() => toScene({ x: 0, y: 0 }, scale)).toThrow(),
);
it('defaults to 2D and keeps all view controls out of canonical serialization', () => {
  expect(useSceneView.getState().mode).toBe('2d');
  const original = serializeProject(useStudio.getState().project),
    selection = ['tx-1'];
  useStudio.getState().select(selection);
  useSceneView.getState().set({
    mode: '3d',
    planes: true,
    extrusion: 10,
    elevation: true,
    gridStep: 100,
    projection: 'orthographic',
  });
  useSceneView.getState().camera('side');
  useSceneView.getState().toggle('links');
  expect(serializeProject(useStudio.getState().project)).toBe(original);
  expect(useStudio.getState().dirty).toBe(false);
  useSceneView.getState().set({ mode: '2d' });
  expect(useStudio.getState().selected).toEqual(selection);
});
it('loads old projects without Z and never inserts surveyed height into an anchor or waypoint', () => {
  const p = deserializeProject(serializeProject(createTemplate('moving'))),
    copy = structuredClone(p);
  for (const o of p.objects) {
    const pos = objectPosition(o, p, 0, false);
    expect(pos.z).toBe(0);
    expect(o).not.toHaveProperty('z');
  }
  const rx = p.objects.find((o) => o.kind === 'receiver')!;
  expect(objectPosition(rx, p, 0, true).z).toBe(rx.kind === 'receiver' ? rx.altitude : 0);
  expect(p).toEqual(copy);
});
it('moves/snaps an entire path in one shared transaction and undoes/redoes it', () => {
  const p = createTemplate('moving');
  useStudio.getState().load(p);
  const path = p.objects.find((o) => o.kind === 'trajectory')!;
  const target = { x: path.x + 7, y: path.y - 3, z: 0 };
  useStudio.getState().edit((p) => {
    const i = p.objects.findIndex((o) => o.id === path.id);
    p.objects[i] = translatedObject(p.objects[i], target, 5, 'xy');
  });
  const moved = useStudio.getState().project.objects.find((o) => o.id === path.id)!;
  expect(moved.x).toBe(Math.round(target.x / 5) * 5);
  expect(
    moved.kind === 'trajectory' &&
      path.kind === 'trajectory' &&
      moved.points[0].x - path.points[0].x,
  ).toBe(moved.x - path.x);
  useStudio.getState().undo();
  expect(useStudio.getState().project.objects).toEqual(p.objects);
  useStudio.getState().redo();
  expect(useStudio.getState().project.objects).toContainEqual(moved);
});
it('edits receiver Z metadata only; rejects Z for objects without a Z contract', () => {
  const rx = newObject('receiver', { x: 1, y: 2 }),
    a = newObject('anchor', { x: 1, y: 2 });
  const result = translatedObject(rx, { x: 77, y: 88, z: 5.2 }, 0.1, 'z');
  expect(result.x).toBe(1);
  expect(result.y).toBe(2);
  expect(result.kind === 'receiver' && result.altitude).toBe(5.2);
  expect(() => translatedObject(a, { x: 1, y: 2, z: 5 }, 1, 'z')).toThrow('no surveyed Z');
});
it.each(['viewer', 'editor', 'owner'])(
  'shares edit transactions without bypassing read-only access: %s',
  (role) => {
    useSceneView.getState().set({ mode: '3d', editable: role !== 'viewer' });
    const before = structuredClone(useStudio.getState().project);
    useStudio.getState().add('anchor', { x: 10, y: 15 });
    if (role === 'viewer') {
      useStudio.getState().select(['tx-1']);
      useStudio.getState().update('tx-1', { x: 999 });
      useStudio.getState().duplicate();
      useStudio.getState().remove();
      useStudio.getState().undo();
      expect(useStudio.getState().project).toEqual(before);
    } else expect(useStudio.getState().project.objects.length).toBe(before.objects.length + 1);
  },
);
it('uses exact stored scientific truth, estimate, status and residuals on an unestimated-Z plane', () => {
  const result = JSON.parse(
    readFileSync('docs/examples/timing-clean.result.json', 'utf8'),
  ) as ExperimentResult;
  const untouched = JSON.stringify(result),
    p = deserializeProject(JSON.stringify(result.request.project));
  const scene = recordedScene(p, result, 0)!;
  expect(scene.truth).toEqual({
    x: result.records[0].truth[0],
    y: result.records[0].truth[1],
    z: 0,
  });
  expect(scene.estimate).toEqual({
    x: result.records[0].position![0],
    y: result.records[0].position![1],
    z: 0,
  });
  expect(scene.links[0].value).toBe(scene.frame.observations[0].value);
  expect(scene.links[0].residual).toBe(result.records[0].residuals?.[0]);
  expect(JSON.stringify(result)).toBe(untouched);
  p.objects[0].x += 1;
  expect(snapshotMatches(p, result.request.project)).toBe(false);
  expect(recordedScene(p, result, 0)).toBeNull();
});
it('keeps failed estimates null and does not bridge trajectory gaps', () => {
  const result = JSON.parse(
    readFileSync('docs/examples/timing-clean.result.json', 'utf8'),
  ) as ExperimentResult;
  const row = result.records[0];
  row.position = null;
  row.errorM = null;
  row.failure = 'fixture missing observations';
  const scene = recordedScene(result.request.project, result, 0)!;
  expect(scene.estimate).toBeNull();
  expect(scene.path[0].estimate).toBeNull();
});
it('retains schema-v1 validity at the documented 500-object bound', () => {
  const p = createTemplate('square');
  p.objects = Array.from({ length: 500 }, (_, i) =>
    newObject('anchor', { x: (i % 25) * 10, y: Math.floor(i / 25) * 10 }, 'anchor-' + i),
  );
  expect(projectSchema.safeParse(p).success).toBe(true);
});

it('does not bridge failed epochs hidden between downsampled trajectory points', () => {
  const r = JSON.parse(
    readFileSync('docs/examples/timing-clean.result.json', 'utf8'),
  ) as ExperimentResult;
  const base = r.records[0];
  r.records = Array.from({ length: 4001 }, (_, i) => ({
    ...base,
    time: i,
    position: i === 1 ? null : base.position,
    failure: i === 1 ? 'missing' : null,
  }));
  const data = recordedScene(r.request.project, r, 0)!;
  expect(data.path.length).toBeLessThanOrEqual(2000);
  expect(data.path[1].breakEstimate).toBe(true);
  expect(data.path[1].estimate).not.toBeNull();
});

it('shows unavailable frame anchors with no invented observation or residual', () => {
  const r = JSON.parse(
    readFileSync('docs/examples/timing-clean.result.json', 'utf8'),
  ) as ExperimentResult;
  const frame = r.frames[r.records[0].frameId],
    missing = frame.anchors[0];
  missing.available = false;
  missing.reason = 'fixture dropout';
  frame.observations = frame.observations.filter((o) => o.id !== missing.id);
  const data = recordedScene(r.request.project, r, 0)!;
  const link = data.links.find((l) => l.id === missing.id)!;
  expect(link.status).toBe('missing');
  expect(link.value).toBeNull();
  expect(link.residual).toBeUndefined();
  expect(link.reason).toBe('fixture dropout');
});
