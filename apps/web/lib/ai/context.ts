import { projectSchema, labConfigSchema } from '@terralab/shared';
import { z } from 'zod';
import type { AIIdentity } from './access';
import { AIError, contextInputSchema } from './contracts';

export function summarizeProject(value: unknown, source: 'cloud-saved' | 'local-development') {
  const p = projectSchema.parse(value);
  const counts = (kind: string) => ({
    total: p.objects.filter((o) => o.kind === kind).length,
    enabled: p.objects.filter((o) => o.kind === kind && o.enabled).length,
  });
  const lab = p.laboratory;
  return {
    source, // Names, descriptions, IDs, coordinates and collaboration records are deliberately excluded.
    schemaVersion: p.schemaVersion,
    objects: {
      anchors: counts('anchor'),
      receivers: counts('receiver'),
      obstacles: counts('obstacle'),
      trajectories: counts('trajectory'),
    },
    mobility: [...new Set(p.objects.flatMap((o) => (o.kind === 'receiver' ? [o.mobility] : [])))],
    simulation: {
      durationSeconds: p.settings.duration,
      stepSeconds: p.settings.step,
      engine: p.settings.engine,
      measurement: p.settings.measurement,
    },
    experiment: lab ? summarizeExperiment(lab) : null,
  };
}
function summarizeExperiment(value: unknown) {
  const c = labConfigSchema.parse(value);
  return {
    measurement: c.measurement,
    estimators: c.estimators,
    trials: c.trials,
    durationSeconds: c.duration,
    sampleStepSeconds: c.sampleStep,
    seed: c.seed,
  };
}
export async function readContext(identity: AIIdentity, input: z.infer<typeof contextInputSchema>) {
  let project: unknown;
  if (identity.local) {
    project = projectSchema.parse(input.localProject);
    if ((project as { id: string }).id !== input.projectId)
      throw new AIError('project_denied', 'Select the matching local project.', 403);
  } else {
    // The JWT-scoped client invokes the existing project SELECT policy. No service credential.
    const result = await identity
      .db!.from('projects')
      .select('config')
      .eq('id', input.projectId)
      .maybeSingle();
    if (result.error || !result.data)
      throw new AIError(
        'project_denied',
        'Project unavailable or access denied. Select an accessible project.',
        403,
      );
    project = result.data.config;
  }
  const summary = summarizeProject(project, identity.local ? 'local-development' : 'cloud-saved');
  let run: { status: string; experiment: ReturnType<typeof summarizeExperiment> } | null = null;
  if (input.experimentId) {
    if (identity.local)
      throw new AIError(
        'experiment_unavailable',
        'Local AI context includes the saved experiment configuration, not a cloud run.',
      );
    const result = await identity
      .db!.from('research_jobs')
      .select('status,request')
      .eq('project_id', input.projectId)
      .eq('id', input.experimentId)
      .maybeSingle();
    if (result.error || !result.data)
      throw new AIError('experiment_denied', 'Experiment unavailable or access denied.', 403);
    const status = z
      .enum(['queued', 'running', 'completed', 'cancelled', 'failed', 'interrupted'])
      .parse(result.data.status);
    run = { status, experiment: summarizeExperiment(result.data.request.config) };
  }
  return { ...summary, run };
}
