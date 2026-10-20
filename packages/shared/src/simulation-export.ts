import { deserializeProject, type Project, type Receiver } from './model';
import { solveProject } from './solver';
import { distance } from './geometry';
export type SimulationSample = {
  time: number;
  x: number;
  y: number;
  estimateX: number | null;
  estimateY: number | null;
  error: number | null;
};
export function simulationSamples(
  project: Project,
  receiver: Receiver,
  time: number,
): SimulationSample[] {
  const step = Math.max(project.settings.step, 0.5),
    count = Math.floor(time / step + 1e-8),
    start = Math.max(0, count - 399);
  return Array.from({ length: count - start + 1 }, (_, index) => {
    const time = Number(((start + index) * step).toFixed(6)),
      result = solveProject(project, receiver, time);
    return {
      time,
      x: result.truth.x,
      y: result.truth.y,
      estimateX: result.solution?.position.x ?? null,
      estimateY: result.solution?.position.y ?? null,
      error: result.solution ? distance(result.truth, result.solution.position) : null,
    };
  });
}
export function simulationSnapshot(input: Project, time: number, selected: string[] = []) {
  const project = deserializeProject(JSON.stringify(input));
  const timestamp = Math.max(0, Math.min(project.settings.duration, time));
  const receivers = project.objects.filter(
    (object): object is Receiver => object.kind === 'receiver' && object.enabled,
  );
  const receiver = receivers.find((object) => selected.includes(object.id)) ?? receivers[0] ?? null;
  const result = receiver ? solveProject(project, receiver, timestamp) : null;
  const samples = receiver ? simulationSamples(project, receiver, timestamp) : [];
  const valid = samples.flatMap((sample) => (sample.error === null ? [] : [sample.error]));
  return {
    project,
    time: timestamp,
    receiver,
    result,
    samples,
    rmse: valid.length ? Math.hypot(...valid) / Math.sqrt(valid.length) : null,
  };
}
export type SimulationSnapshot = ReturnType<typeof simulationSnapshot>;
export function samplesCsv(samples: SimulationSample[]): string {
  return (
    'time_s,truth_x_m,truth_y_m,estimate_x_m,estimate_y_m,error_m\r\n' +
    samples
      .map((s) => [s.time, s.x, s.y, s.estimateX ?? '', s.estimateY ?? '', s.error ?? ''].join(','))
      .join('\r\n')
  );
}
