import { describe, it, expect } from 'vitest';
import {
  createTemplate,
  simulationSnapshot,
  simulationSamples,
  samplesCsv,
  type Receiver,
} from './index';
describe('Simulation sharing data', () => {
  it('captures the selected receiver at a deterministic timestamp without modifying the editor project', () => {
    const project = createTemplate('moving');
    const before = JSON.stringify(project);
    const snapshot = simulationSnapshot(project, 12.5, ['rx-1']);
    expect(snapshot.time).toBe(12.5);
    expect(snapshot.receiver?.id).toBe('rx-1');
    expect(snapshot.result?.truth).toEqual({ x: 50, y: 25 });
    expect(snapshot.samples.at(-1)?.time).toBe(12.5);
    expect(JSON.stringify(project)).toBe(before);
    expect(simulationSnapshot(project, 12.5, ['rx-1'])).toEqual(snapshot);
  });
  it('keeps snapshot configuration frozen when the editor changes afterwards', () => {
    const project = createTemplate();
    const snapshot = simulationSnapshot(project, 5);
    project.name = 'Changed';
    project.objects[0].x = 999;
    expect(snapshot.project.name).not.toBe('Changed');
    expect(snapshot.project.objects[0].x).not.toBe(999);
  });
  it('handles no receiver and degenerate fixes without inventing zero error', () => {
    const project = createTemplate('poor');
    let snapshot = simulationSnapshot(project, 4);
    expect(snapshot.result?.solution).toBeNull();
    expect(snapshot.rmse).toBeNull();
    expect(snapshot.samples.every((sample) => sample.error === null)).toBe(true);
    project.objects = project.objects.filter((object) => object.kind !== 'receiver');
    snapshot = simulationSnapshot(project, 4);
    expect(snapshot.receiver).toBeNull();
    expect(snapshot.samples).toEqual([]);
  });
  it('bounds sampled results to the last 400 timestamps and clamps export time', () => {
    const project = createTemplate();
    project.settings.duration = 3600;
    const snapshot = simulationSnapshot(project, 5000);
    expect(snapshot.time).toBe(3600);
    expect(snapshot.samples).toHaveLength(400);
    expect(snapshot.samples.at(-1)?.time).toBe(3600);
    expect(simulationSnapshot(project, -1).time).toBe(0);
  });
  it('CSV preserves zero and missing estimates distinctly with explicit units', () => {
    expect(
      samplesCsv([
        { time: 0, x: 0, y: 3, estimateX: 0, estimateY: 0, error: 0 },
        { time: 1, x: 1, y: 4, estimateX: null, estimateY: null, error: null },
      ]),
    ).toContain('0,0,3,0,0,0\r\n1,1,4,,,');
    expect(samplesCsv([])).toMatch(/^time_s,truth_x_m/);
  });
  it('the export sampling function matches the snapshot history', () => {
    const project = createTemplate('moving');
    const receiver = project.objects.find((o) => o.kind === 'receiver') as Receiver;
    expect(simulationSamples(project, receiver, 9)).toEqual(simulationSnapshot(project, 9).samples);
  });
});
