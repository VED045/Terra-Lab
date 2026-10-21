import { z } from 'zod';
import type { AIIdentity } from './access';
import type { Project, LabConfig } from '@terralab/shared';
import { AIError } from './contracts';
import type { ExperimentResult } from '../laboratory';
import { boundedText } from '../request-body';

export async function scientificCall(
  request: Request,
  path: string,
  method = 'GET',
  value?: unknown,
  idempotency?: string,
): Promise<unknown> {
  const base = new URL(process.env.SIMULATION_API_URL || 'http://127.0.0.1:8000');
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new AIError(
      'scientific_configuration',
      'Scientific service configuration is invalid.',
      503,
    );
  let response: Response;
  try {
    response = await fetch(base.toString().replace(/\/$/, '') + path, {
      method,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization')! }
          : {}),
        ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
      },
      body: value ? JSON.stringify(value) : undefined,
    });
  } catch {
    throw new AIError(
      'scientific_unavailable',
      'The scientific service is unavailable or the request was cancelled. No success is assumed.',
      503,
    );
  }
  const text = await boundedText(
    new Request('http://internal.invalid', {
      method: 'POST',
      body: response.body,
      duplex: 'half',
    } as RequestInit),
    25_000_000,
  );
  if (!response.ok) {
    // Numerical validation errors can contain user-controlled IDs; do not forward raw bodies.
    throw new AIError(
      response.status === 429 ? 'run_limit' : 'scientific_failure',
      response.status === 429
        ? 'The concurrent-run limit was reached. Wait for or cancel an existing run.'
        : 'The scientific operation was rejected. Inspect the scenario and actual job state before retrying.',
      response.status >= 500 ? 503 : response.status,
    );
  }
  return JSON.parse(text);
}
export async function listProjectRuns(request: Request, identity: AIIdentity, project: Project) {
  if (identity.local)
    return z
      .array(
        z.object({
          id: z.string().uuid(),
          projectId: z.string().uuid(),
          status: z.string(),
          createdAt: z.string(),
          completed: z.number(),
          planned: z.number(),
        }),
      )
      .max(50)
      .parse(await scientificCall(request, '/experiments?project_id=' + project.id));
  const result = await identity
    .db!.from('research_jobs')
    .select('id,status,created_at,completed,planned')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (result.error) throw new AIError('runs_unavailable', 'Project runs could not be read.', 503);
  return result.data.map((r) => ({
    id: r.id as string,
    projectId: project.id,
    status: r.status as string,
    createdAt: r.created_at as string,
    completed: r.completed as number,
    planned: r.planned as number,
  }));
}
export async function authorizedRun(
  request: Request,
  identity: AIIdentity,
  project: Project,
  runId: string,
): Promise<ExperimentResult> {
  z.string().uuid().parse(runId);
  if (!identity.local) {
    const row = await identity
      .db!.from('research_jobs')
      .select('id')
      .eq('id', runId)
      .eq('project_id', project.id)
      .maybeSingle();
    if (row.error || !row.data)
      throw new AIError('run_denied', 'Run unavailable or outside the active project.', 403);
  }
  const raw = (await scientificCall(
    request,
    '/experiments/' + runId + '?detail=true',
  )) as ExperimentResult & { manifest?: unknown };
  if (raw.id !== runId || raw.request?.project?.id !== project.id)
    throw new AIError('run_denied', 'Run does not belong to the active project.', 403);
  if (raw.manifest) {
    const { downloadResearchResult } = await import('../research');
    return downloadResearchResult(raw.manifest, runId, identity.db!);
  }
  const envelope = z.object({
    id: z.string().uuid(),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
    completed: z.number().int().nonnegative(),
    planned: z.number().int().nonnegative(),
    summaries: z.array(z.unknown()).max(200),
    records: z.array(z.unknown()).max(100000),
    frames: z.record(z.string(), z.unknown()),
  });
  envelope.parse(raw);
  return raw;
}
export async function submitExperiment(
  request: Request,
  project: Project,
  config: LabConfig,
  actionId: string,
) {
  return z
    .object({ id: z.string().uuid() })
    .parse(await scientificCall(request, '/experiments', 'POST', { project, config }, actionId));
}
export function runSummary(run: ExperimentResult) {
  const logValue = (run as ExperimentResult & { logs?: unknown }).logs;
  const logs = Array.isArray(logValue)
    ? logValue.slice(-12).flatMap((value) => {
        const parsed = z
          .object({
            event: z.string().max(80),
            at: z.string().max(80).optional(),
            completed: z.number().optional(),
            planned: z.number().optional(),
            attempt: z.number().optional(),
          })
          .safeParse(value);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const measurements = Object.values(run.frames)
    .slice(0, 2)
    .map((frame) => ({
      time: frame.time,
      model: frame.model,
      observationHash: frame.observationHash,
      observations: frame.observations
        .slice(0, 12)
        .map((o) => ({
          kind: o.kind,
          value: o.value,
          sigma: o.sigma,
          blocked: o.blocked,
          nlos: o.nlos,
          available: o.available,
        })),
    }));
  return {
    id: run.id,
    status: run.status,
    completed: run.completed,
    planned: run.planned,
    unattempted: run.unattempted ?? Math.max(0, run.planned - run.completed),
    error: run.error?.slice(0, 500) ?? null,
    logs,
    logAvailability: logs.length
      ? 'Authorized structured worker events'
      : 'No structured worker events are available in this snapshot; do not invent logs.',
    metricGroupsTotal: run.summaries.length,
    metrics: run.summaries.slice(0, 20),
    samples: run.records
      .slice(0, 12)
      .map((r) => ({
        estimator: r.estimator,
        errorM: r.errorM,
        residualRms: r.residualRms,
        normalizedResiduals: r.normalizedResiduals?.slice(0, 12),
        condition: r.condition,
        failure: r.failure?.slice(0, 200),
        observationHash: r.observationHash,
      })),
    measurementSamples: measurements,
    configuration: run.request.config,
    source:
      'actual scientific job/result; measurements are synthetic observations from TerraLab, not hardware data',
    href: '/ai?project=' + run.request.project.id + '&experiment=' + run.id,
  };
}
