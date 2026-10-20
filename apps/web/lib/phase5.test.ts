import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createTemplate,
  newObject,
  serializeProject,
  deserializeProject,
  solveProject,
  advanceClock,
  type Receiver,
} from '@terralab/shared';
import { sceneBounds } from './scene-model';
import { conflictChoices, reapplyDraft } from './conflict';
import {
  comparisonWarnings,
  comparisonRows,
  empiricalCdf,
  comparisonCsv,
  comparisonManifest,
  reportHtml,
} from './run-comparison';
import type { ExperimentResult } from './laboratory';
import { viewPresetSchema, readViewPresets } from './view-presets';
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../../../docs/examples/timing-benchmark.result.json', import.meta.url),
      'utf8',
    ),
  ) as ExperimentResult;
it('keeps legacy footprint semantics and absent vertical metadata on round trip', () => {
  const p = createTemplate('outdoor'),
    before = serializeProject(p),
    after = deserializeProject(before);
  expect(serializeProject(after)).toBe(before);
  for (const o of after.objects)
    if (o.kind === 'obstacle') {
      expect(o).not.toHaveProperty('verticalHeight');
      expect(o).not.toHaveProperty('baseElevation');
    }
});
it('requires schema 2 and finite bounded dimensions, preserves independent heights and camera top bounds', () => {
  const p = createTemplate('square'),
    o = newObject('obstacle', { x: 0, y: 0 });
  o.height = 7;
  o.verticalHeight = 800;
  o.baseElevation = 25;
  p.objects.push(o);
  expect(() => deserializeProject(JSON.stringify(p))).toThrow();
  p.schemaVersion = 2;
  const next = deserializeProject(serializeProject(p));
  expect(next.objects.at(-1)).toMatchObject({ height: 7, verticalHeight: 800, baseElevation: 25 });
  const bounds = sceneBounds(next);
  expect(bounds.span).toBeGreaterThanOrEqual(800);
  for (const height of [0, -1, 10001, Infinity]) {
    o.verticalHeight = height;
    expect(() => serializeProject(p)).toThrow();
  }
});
it('physical dimensions do not alter the approved horizontal solver', () => {
  const p = createTemplate('outdoor'),
    rx = p.objects.find((o) => o.kind === 'receiver') as Receiver,
    a = solveProject(p, rx, 0);
  p.schemaVersion = 2;
  for (const o of p.objects)
    if (o.kind === 'obstacle') {
      o.verticalHeight = 50;
      o.baseElevation = 100;
    }
  expect(solveProject(p, rx, 0)).toEqual(a);
});
it('baseline playback crosses a minute and supports 120 seconds after serialization', () => {
  const p = createTemplate('moving');
  p.settings.duration = 120;
  const q = deserializeProject(serializeProject(p));
  expect(advanceClock(59.9, 0.2, 1, 0.1, 120).time).toBeGreaterThan(60);
  expect(q.settings.duration).toBe(120);
});
it('conflict choices match object IDs despite reordering and reapply only checked changes', () => {
  const latest = createTemplate('square'),
    local = structuredClone(latest);
  latest.cloudVersion = 4;
  latest.name = 'Other editor';
  latest.objects.reverse();
  local.objects[0].x += 5;
  const id = local.objects[0].id,
    copy = JSON.stringify([local, latest]);
  expect(conflictChoices(local, latest).filter((x) => x.key.startsWith('object:'))).toHaveLength(1);
  const merged = reapplyDraft(local, latest, ['object:' + id]);
  expect(merged.name).toBe('Other editor');
  expect(merged.cloudVersion).toBe(4);
  expect(merged.objects.find((o) => o.id === id)?.x).toBe(local.objects[0].x);
  expect(JSON.stringify([local, latest])).toBe(copy);
  expect(() => reapplyDraft(local, { ...latest, id: crypto.randomUUID() }, [])).toThrow();
});
it('conflict deletions are explicit and invalid trajectory references cannot be saved', () => {
  const a = createTemplate('moving'),
    b = structuredClone(a),
    trajectory = b.objects.find((o) => o.kind === 'trajectory')!;
  b.objects = b.objects.filter((o) => o.id !== trajectory.id);
  expect(conflictChoices(b, a).some((c) => c.key === 'object:' + trajectory.id)).toBe(true);
  expect(() => reapplyDraft(b, a, ['object:' + trajectory.id])).toThrow();
});
it('CDF uses full-data empirical ranks and empty failures remain empty', () => {
  expect(empiricalCdf([])).toEqual([]);
  const values = Array.from({ length: 10001 }, (_, i) => i),
    cdf = empiricalCdf(values);
  expect(cdf.length).toBeLessThanOrEqual(601);
  expect(cdf.at(-1)).toEqual({ x: 10000, y: 1 });
  expect(cdf[0].y).toBe(1 / 10001);
});
it('comparison flags model, seed, multi-variable and unmatched-data differences', () => {
  const a = fixture(),
    b = structuredClone(a);
  b.id = crypto.randomUUID();
  b.request.config.seed++;
  b.request.config.noiseM++;
  b.request.config.measurement = 'rtt';
  b.status = 'cancelled';
  b.frames = {};
  const warnings = comparisonWarnings([a, b]).join(' ');
  expect(warnings).toMatch(/Seeds differ/);
  expect(warnings).toMatch(/Multiple scientific/);
  expect(warnings).toMatch(/unmatched/);
  expect(warnings).toMatch(/Partial/);
  expect(warnings).toMatch(/Different measurement/);
});
it('exports full precision, explicit unavailable metrics and safely escaped reports without mutating runs', async () => {
  const a = fixture(),
    before = JSON.stringify(a);
  expect(comparisonRows([a])[0].rmseM).toBe(a.summaries[0].rmseM);
  expect(comparisonCsv([a])).toContain(String(a.summaries[0].rmseM));
  const manifest = await comparisonManifest([a]);
  expect(manifest.sources[0].parsedSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  expect((await comparisonManifest([a])).sources).toEqual(manifest.sources);
  expect(reportHtml([a], '<script>bad</script>')).not.toContain('<script>bad');
  const b = structuredClone(a);
  b.summaries[0].rmseM = null;
  expect(reportHtml([b], 'Failures')).toContain('unavailable');
  expect(JSON.stringify(a)).toBe(before);
});
it('view preferences are versioned and strip mode/edit permissions/project data', () => {
  const p = viewPresetSchema.parse({
    format: 'terralab-view-1',
    name: 'Top',
    unit: 1,
    project: 'secret',
    view: {
      projection: 'orthographic',
      preset: 'top',
      grid: true,
      ground: true,
      planes: false,
      elevation: false,
      gridStep: 10,
      extrusion: 0,
      snap: 5,
      axis: 'xy',
      layers: ['anchors'],
      mode: '3d',
      editable: true,
    },
  });
  expect(p).not.toHaveProperty('project');
  expect(p.view).not.toHaveProperty('editable');
  expect(readViewPresets(JSON.stringify([p]))).toEqual([p]);
  expect(() => readViewPresets('[{"format":"wrong"}]')).toThrow();
});

import { laboratoryWorkload } from './lab-workload';
import { defaultLabConfig } from '@terralab/shared';
it('workload preview matches duration/sample/trial/estimator and observation budgets', () => {
  const p = createTemplate('square'),
    c = {
      ...defaultLabConfig(),
      duration: 120,
      sampleStep: 10,
      trials: 1,
      sweep: 'none' as const,
      estimators: ['wls' as const],
    };
  expect(laboratoryWorkload(p, c)).toMatchObject({
    epochs: 13,
    observations: 52,
    overBudget: false,
  });
  c.trials = 1000;
  c.sampleStep = 0.1;
  expect(laboratoryWorkload(p, c).overBudget).toBe(true);
});

import { sampledTrajectory } from './run-comparison';
it('bounds large trajectory views while retaining hidden failure gaps and the final sample', () => {
  const rows = Array.from({ length: 100001 }, (_, i) => ({
    position: i === 1 ? null : [i, i],
    time: i,
  }));
  const sampled = sampledTrajectory(rows);
  expect(sampled.length).toBeLessThanOrEqual(2000);
  expect(sampled[1].breakEstimate).toBe(true);
  expect(sampled.at(-1)?.time).toBe(100000);
  expect(rows).toHaveLength(100001);
});
