import { z } from 'zod';
import { projectSchema, type Project } from '@terralab/shared';
import { AIError, safeError, type contextInputSchema } from './contracts';
import { identify, type AIIdentity } from './access';
import {
  activeProject,
  applyNetworkChanges,
  diagnostics,
  publicEntities,
  experimentConfiguration,
  requireEditor,
} from './domain';
import {
  toolSchemas,
  toolDescriptions,
  type ToolName,
  type ApprovalView,
  type ToolSpec,
} from './agent-contracts';
import { prepareApproval } from './approvals';
import { parameterReference, parameterIndex } from './parameters';
import { authorizedRun, listProjectRuns, runSummary } from './scientific';
import { comparisonWarnings, comparisonRows } from '../run-comparison';

const calls = new Map<string, { count: number; until: number }>();
export function toolRateLimit(user: string) {
  const now = Date.now();
  for (const [key, value] of calls) if (value.until <= now) calls.delete(key);
  const current = calls.get(user) ?? { count: 0, until: now + 60000 };
  if (current.count >= 60 || calls.size >= 1000)
    throw new AIError(
      'tool_rate_limit',
      'AI tool request limit reached. Wait a minute and retry.',
      429,
    );
  current.count++;
  calls.set(user, current);
}
export function auditTool(
  identity: AIIdentity,
  projectId: string,
  name: string,
  state: string,
  summary: string,
) {
  // Trusted metadata only: never arguments, prompts, raw provider errors, credentials or project prose.
  console.info(
    JSON.stringify({
      event: 'terralab_ai_tool',
      userId: identity.userId,
      projectId,
      tool: name,
      state,
      summary: summary.slice(0, 180),
      at: new Date().toISOString(),
    }),
  );
}
export function toolSpecs(role: 'owner' | 'editor' | 'viewer'): ToolSpec[] {
  return (Object.keys(toolSchemas) as ToolName[])
    .filter((name) => role !== 'viewer' || !name.startsWith('propose_'))
    .map((name) => ({
      type: 'function',
      function: {
        name,
        description: toolDescriptions[name],
        parameters: z.toJSONSchema(toolSchemas[name]),
      },
    }));
}
export async function executeTool(
  request: Request,
  context: z.infer<typeof contextInputSchema>,
  name: string,
  args: unknown,
): Promise<{
  ok: boolean;
  data?: unknown;
  approval?: ApprovalView;
  code?: string;
  message?: string;
}> {
  const identity = await identify(request); // Fresh auth and RLS on every call, including after a proposal.
  if (!(name in toolSchemas) || !Object.hasOwn(toolSchemas, name))
    throw new AIError('tool_not_allowed', 'This tool is not allowlisted.', 403);
  const toolName = name as ToolName;
  let summary = 'Validation pending';
  try {
    toolRateLimit(identity.userId);
    const input = toolSchemas[toolName].parse(args);
    const active = await activeProject(identity, context);
    const p = active.project;
    if (toolName.startsWith('propose_')) requireEditor(active);
    let data: unknown, approval: ApprovalView | undefined;
    switch (toolName) {
      case 'inspect_project': {
        const points = p.objects.map((o) => ({ x: o.x, y: o.y }));
        data = {
          projectId: p.id,
          revision: p.cloudVersion ?? 'local',
          role: active.role,
          shared: active.shared,
          objects: p.objects.length,
          counts: Object.fromEntries(
            ['anchor', 'receiver', 'obstacle', 'trajectory'].map((kind) => [
              kind,
              p.objects.filter((o) => o.kind === kind).length,
            ]),
          ),
          coordinateBounds: [-1000000, 1000000],
          currentExtent: points.length
            ? {
                minX: Math.min(...points.map((q) => q.x)),
                maxX: Math.max(...points.map((q) => q.x)),
                minY: Math.min(...points.map((q) => q.y)),
                maxY: Math.max(...points.map((q) => q.y)),
              }
            : null,
          maximumEntities: 500,
          simulation: p.settings,
          experiment:
            p.laboratory ??
            'No saved configuration; existing defaultLabConfig is available via inspect_parameters.',
        };
        break;
      }
      case 'inspect_entities': {
        const value = toolSchemas.inspect_entities.parse(input);
        const entities = publicEntities(p).filter(
          (o) =>
            (value.kind === 'all' || value.kind === o.kind) &&
            (!value.ids || value.ids.includes(o.id)),
        );
        data = {
          total: entities.length,
          entities: entities.slice(0, 50),
          truncated: entities.length > 50,
        };
        break;
      }
      case 'inspect_parameters': {
        const parameter = toolSchemas.inspect_parameters.parse(input).parameter;
        data = parameter ? parameterReference(p, parameter) : parameterIndex(p);
        break;
      }
      case 'diagnose_geometry':
        data = {
          diagnostics: diagnostics(p),
          limitation:
            'Baseline calibrated-range diagnostic. Use actual laboratory runs for the selected measurement model and estimators.',
        };
        break;
      case 'list_runs':
        data = { runs: await listProjectRuns(request, identity, p) };
        break;
      case 'inspect_run': {
        const runId =
          toolSchemas.inspect_run.parse(input).runId ??
          (await listProjectRuns(request, identity, p))[0]?.id;
        if (!runId)
          throw new AIError(
            'no_runs',
            'There are no actual runs in this project. Propose a validated experiment first.',
            404,
          );
        data = runSummary(await authorizedRun(request, identity, p, runId));
        break;
      }
      case 'compare_runs': {
        const value = toolSchemas.compare_runs.parse(input);
        const runs = await Promise.all(
          value.runIds.map((runId) => authorizedRun(request, identity, p, runId)),
        );
        data = {
          metrics: comparisonRows(runs)
            .slice(0, 40)
            .map((r) => ({
              runId: r.runId,
              estimator: r.estimator,
              sweepValue: r.sweepValue,
              status: r.status,
              seed: r.seed,
              attempted: r.attempted,
              fixes: r.fixes,
              planned: r.planned,
              completed: r.completed,
              rmseM: r.rmseM,
              p95ErrorM: r.p95ErrorM,
              residualMean: r.residualMean,
              availability: r.availability,
            })),
          warnings:
            runs.length > 1
              ? comparisonWarnings(runs)
              : [
                  'Within-run estimators share each generated frame; compare matching sweep values and sample counts.',
                ],
          pairing: runs.map((r) => ({
            id: r.id,
            observationHashes: [...new Set(r.records.map((row) => row.observationHash))].slice(
              0,
              12,
            ),
            frames: Object.keys(r.frames).length,
          })),
          limitation:
            'Metrics are actual recorded values. Matching seeds alone do not prove matching observations, and conditional accuracy excludes failed fixes.',
        };
        break;
      }
      case 'list_revisions': {
        if (identity.local)
          data = {
            revisions: [],
            limitation:
              'Browser projects have no cloud revision history. Reviewed operations expose expiring undo/redo receipts.',
          };
        else {
          const result = await identity
            .db!.from('project_revisions')
            .select('version,created_at')
            .eq('project_id', p.id)
            .order('version', { ascending: false })
            .limit(30);
          if (result.error)
            throw new AIError('revisions_unavailable', 'Revisions could not be read.', 503);
          data = { revisions: result.data };
        }
        break;
      }
      case 'propose_network_changes': {
        const value = toolSchemas.propose_network_changes.parse(input);
        const next = applyNetworkChanges(p, value.operations);
        const changed = next.objects.filter(
          (o) => JSON.stringify(o) !== JSON.stringify(p.objects.find((old) => old.id === o.id)),
        );
        const deleted = p.objects
          .filter((o) => !next.objects.some((n) => n.id === o.id))
          .map((o) => ({ id: o.id, kind: o.kind }));
        approval = prepareApproval(
          identity,
          active,
          'network',
          'Review network changes',
          {
            operations: value.operations.map((o) => ({
              op: o.op,
              ...('id' in o ? { id: o.id } : { kind: o.kind, x: o.x, y: o.y }),
            })),
            changedEntities: publicEntities({ ...next, objects: changed }),
            deleted,
            consequences: deleted.some((o) => o.kind === 'trajectory')
              ? 'Dependent receivers become stationary and lose the deleted path reference.'
              : 'All changes are validated and saved together; undo creates a new revision.',
          },
          { nextProject: next },
        );
        data = { state: 'proposed', changes: value.operations.length, confirmationRequired: true };
        break;
      }
      case 'propose_parameter_change': {
        const value = toolSchemas.propose_parameter_change.parse(input);
        const next = structuredClone(p);
        if (value.target === 'laboratory')
          next.laboratory = experimentConfiguration(p, value.values).config;
        else {
          if (Object.keys(value.values).some((k) => !(k in p.settings)))
            throw new AIError(
              'invalid_parameter',
              'The simulation parameter is not implemented.',
              422,
            );
          next.settings = projectSchema.parse({
            ...p,
            settings: { ...p.settings, ...value.values },
          }).settings;
        }
        approval = prepareApproval(
          identity,
          active,
          'network',
          'Review parameter changes',
          {
            target: value.target,
            before:
              value.target === 'laboratory' ? (p.laboratory ?? 'Application defaults') : p.settings,
            after: value.target === 'laboratory' ? next.laboratory : next.settings,
            note: 'Proposed effects are uncertain until a controlled experiment completes.',
          },
          { nextProject: next },
        );
        data = { state: 'proposed', confirmationRequired: true };
        break;
      }
      case 'propose_scenario_copy': {
        const value = toolSchemas.propose_scenario_copy.parse(input);
        const next: Project = {
          ...structuredClone(p),
          id: crypto.randomUUID(),
          name: value.name,
          archived: false,
          updatedAt: new Date().toISOString(),
        };
        delete next.cloudVersion;
        delete next.cloudOwnerId;
        approval = prepareApproval(
          identity,
          active,
          'copy',
          'Review private scenario copy',
          {
            newProjectId: next.id,
            objects: next.objects.length,
            consequence:
              'Create a new private project with this configuration. The source and its collaboration grants remain unchanged.',
          },
          { nextProject: next },
        );
        data = { state: 'proposed', confirmationRequired: true };
        break;
      }
      case 'propose_experiment': {
        const value = toolSchemas.propose_experiment.parse(input);
        const { config, workload } = experimentConfiguration(p, value.config);
        const current = await listProjectRuns(request, identity, p);
        if (current.filter((r) => ['queued', 'running'].includes(r.status)).length >= 4)
          throw new AIError(
            'run_limit',
            'Four project runs are already active. Wait or cancel one.',
            429,
          );
        approval = prepareApproval(
          identity,
          active,
          'experiment',
          'Review experiment submission',
          {
            configuration: config,
            workload,
            diagnostics: diagnostics(p),
            expensive: workload.epochs > 2000 || workload.observations > 10000,
            note: 'One run uses shared generated observations across its estimators. Submission does not guarantee success.',
          },
          { config },
        );
        data = { state: 'proposed', confirmationRequired: true };
        break;
      }
      case 'propose_cancel_run': {
        const run = await authorizedRun(
          request,
          identity,
          p,
          toolSchemas.propose_cancel_run.parse(input).runId,
        );
        if (!['queued', 'running'].includes(run.status))
          throw new AIError(
            'run_terminal',
            'The run is already terminal; inspect its actual result.',
            409,
          );
        approval = prepareApproval(
          identity,
          active,
          'cancel',
          'Cancel active experiment',
          {
            runId: run.id,
            status: run.status,
            completed: run.completed,
            planned: run.planned,
            consequence: 'Stop future computation where supported; partial results may remain.',
          },
          { runId: run.id },
        );
        data = { state: 'proposed', confirmationRequired: true };
        break;
      }
      case 'export_run': {
        const value = toolSchemas.export_run.parse(input);
        const run = await authorizedRun(request, identity, p, value.runId);
        if (['queued', 'running'].includes(run.status))
          throw new AIError('run_active', 'Wait for a terminal snapshot before exporting.', 409);
        data = {
          runId: run.id,
          format: value.format,
          href: '/api/ai/export',
          action:
            'Use the authenticated AI Studio download control for the real JSON/CSV snapshot.',
          status: run.status,
        };
        break;
      }
    }
    summary = approval
      ? 'Validated proposal requires human review; no mutation executed'
      : 'Authorized domain read completed';
    auditTool(identity, p.id, toolName, 'completed', summary);
    return { ok: true, data, ...(approval ? { approval } : {}) };
  } catch (error) {
    const safe = safeError(error);
    auditTool(
      identity,
      context.projectId,
      toolName,
      'failed',
      'Validation, authorization or domain operation rejected',
    );
    return { ok: false, code: safe.code, message: safe.message };
  }
}
