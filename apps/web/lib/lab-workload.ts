import type { Project, LabConfig } from '@terralab/shared';
export function laboratoryWorkload(project: Project, config: LabConfig) {
  const receivers = project.objects.filter((o) => o.kind === 'receiver' && o.enabled).length,
    anchors = project.objects.filter((o) => o.kind === 'anchor' && o.enabled).length,
    locations = receivers + config.gridSize ** 2,
    steps = Math.floor(config.duration / config.sampleStep + 1e-9) + 1,
    sweeps = config.sweep === 'none' ? 1 : config.sweepValues.length,
    epochs = locations * steps * sweeps * config.trials * config.estimators.length,
    observations = locations * steps * sweeps * config.trials * anchors;
  return { epochs, observations, overBudget: epochs > 100000 || observations > 500000 };
}
