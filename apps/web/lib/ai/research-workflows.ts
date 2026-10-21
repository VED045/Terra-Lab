import { z } from 'zod';
import { defaultLabConfig, type Project } from '@terralab/shared';
import { experimentConfiguration, diagnostics } from './domain';

export const studySchema = z
  .object({
    metric: z.enum(['rmseM', 'p95ErrorM', 'availability', 'medianRuntimeMs']),
    parameter: z.enum(['timingNs', 'nlosProbability', 'anchorCount', 'speed']),
    values: z.array(z.number().finite()).min(2).max(5),
    trials: z.number().int().min(1).max(50),
    seed: z.number().int().min(0).max(2147483647),
  })
  .strict();
export function parameterStudy(project: Project, input: z.infer<typeof studySchema>) {
  const { config, workload } = experimentConfiguration(project, {
    ...(project.laboratory ?? defaultLabConfig()),
    sweep: input.parameter,
    sweepValues: input.values,
    trials: input.trials,
    seed: input.seed,
  });
  return {
    config,
    workload,
    plan: [
      'Inspect actual saved parameters and geometry.',
      `Vary only ${input.parameter} over ${input.values.join(', ')}; target ${input.metric}.`,
      'Review the complete configuration and work budget before submitting one existing queued sweep.',
      'Retrieve terminal results, sample counts and each sweep/estimator metric; export the actual data.',
    ],
    method:
      'One existing scientific queue job contains the bounded matrix. Other inputs and the selected seed stay fixed. The engine keys random streams by sweep index; cross-sweep observations are not proven paired. Estimators within a frame share observations.',
    interpretation:
      'Report empirical differences and Monte Carlo uncertainty; do not infer general causal improvement or treat failed fixes as zero error.',
    diagnostics: diagnostics(project),
  };
}

export function regressionPlan(changedFiles: string[]) {
  const ids = new Set<string>(['typecheck']);
  for (const path of changedFiles) {
    if (/^(apps\/web|packages\/shared)/.test(path)) ids.add('frontend-unit');
    if (/^apps\/web\/(components|app)/.test(path)) ids.add('browser-regression');
    if (/^(services\/api|packages\/shared)/.test(path)) ids.add('scientific-unit');
    if (/^(supabase|apps\/web\/lib\/(research|persistence|collaboration))/.test(path)) {
      ids.add('database');
      ids.add('collaboration');
    }
    if (/^apps\/web\/lib\/ai/.test(path)) {
      ids.add('ai-unit');
      ids.add('ai-workflows');
    }
    if (/^(services\/api\/terralab\/(cloud|worker)|scripts\/worker)/.test(path))
      ids.add('worker-integration');
  }
  return {
    changedFiles,
    commandIds: [...ids],
    limitation: changedFiles.length
      ? 'Heuristic dependency selection. Review the exact approved commands; this is not proof that unselected areas are unaffected.'
      : 'No uncommitted source changes were found. Typecheck is a minimal check; choose a broader command if needed.',
    patchPolicy:
      'The agent has no source edit tool. Propose a minimal fix with source references; obtain user approval before an operator applies it, then approve and rerun tests on the new source hash.',
  };
}
