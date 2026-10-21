import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  projectSchema,
  newObject,
  objectSchema,
  defaultLabConfig,
  labConfigSchema,
  solveProject,
  type Project,
  type NetworkObject,
} from '@terralab/shared';
import { projectContent } from '../project-content';
import { laboratoryWorkload } from '../lab-workload';
import { AIError, type contextInputSchema } from './contracts';
import type { AIIdentity } from './access';
import type { NetworkOperation } from './agent-contracts';

export type ActiveProject = {
  project: Project;
  role: 'owner' | 'editor' | 'viewer';
  shared: boolean;
};
export function fingerprint(p: Project) {
  return createHash('sha256')
    .update(projectContent(p) + ':' + (p.cloudVersion ?? 0))
    .digest('hex');
}
export async function activeProject(
  identity: AIIdentity,
  input: z.infer<typeof contextInputSchema>,
): Promise<ActiveProject> {
  if (identity.local) {
    const project = projectSchema.parse(input.localProject);
    if (project.id !== input.projectId)
      throw new AIError('project_denied', 'Select the matching local project.', 403);
    return { project, role: 'owner', shared: false };
  }
  const db = identity.db!;
  const row = await db
    .from('projects')
    .select('config,owner_id,team_id,version')
    .eq('id', input.projectId)
    .maybeSingle();
  if (row.error || !row.data)
    throw new AIError('project_denied', 'Project access denied or revoked.', 403);
  const project = projectSchema.parse({ ...row.data.config, cloudVersion: row.data.version });
  if (project.id !== input.projectId)
    throw new AIError(
      'project_denied',
      'The stored project identity does not match the selected resource.',
      403,
    );
  const members = await db
    .from('project_members')
    .select('user_id,role')
    .eq('project_id', input.projectId);
  if (members.error)
    throw new AIError('permissions_unavailable', 'Project permissions could not be verified.', 503);
  let role: ActiveProject['role'] = row.data.owner_id === identity.userId ? 'owner' : 'viewer';
  if (
    role !== 'owner' &&
    members.data.some((m) => m.user_id === identity.userId && m.role === 'editor')
  )
    role = 'editor';
  if (row.data.team_id && role !== 'owner') {
    const [team, grant] = await Promise.all([
      db.from('teams').select('owner_id').eq('id', row.data.team_id).maybeSingle(),
      db
        .from('team_members')
        .select('role')
        .eq('team_id', row.data.team_id)
        .eq('user_id', identity.userId)
        .maybeSingle(),
    ]);
    if (team.error || grant.error)
      throw new AIError('permissions_unavailable', 'Team permissions could not be verified.', 503);
    if (team.data?.owner_id === identity.userId || grant.data?.role === 'editor') role = 'editor';
  }
  return {
    project,
    role,
    shared: Boolean(
      row.data.team_id || members.data.length || row.data.owner_id !== identity.userId,
    ),
  };
}
export function requireEditor(active: ActiveProject) {
  if (active.role === 'viewer')
    throw new AIError(
      'read_only',
      'Viewers can inspect and export; editing and experiment submission require an editor or owner.',
      403,
    );
}
function strictEntity(value: unknown): NetworkObject {
  const kind = (value as { kind?: string }).kind;
  const schema = objectSchema.options.find((option) => option.shape.kind.value === kind);
  if (!schema) throw new AIError('invalid_entity', 'Unsupported entity kind.', 422);
  return schema.strict().parse(value) as NetworkObject;
}
export function applyNetworkChanges(project: Project, operations: NetworkOperation[]): Project {
  const next = structuredClone(project);
  for (const operation of operations) {
    const properties = 'properties' in operation ? operation.properties || {} : {};
    if (
      Object.keys(properties).some((k) =>
        ['id', 'kind', '__proto__', 'constructor', 'prototype'].includes(k),
      )
    )
      throw new AIError('protected_property', 'Entity IDs and kinds cannot be changed.', 422);
    if (operation.op === 'add') {
      const entity = strictEntity({
        ...newObject(operation.kind, { x: operation.x, y: operation.y }),
        ...properties,
      });
      next.objects.push(entity);
    } else {
      const index = next.objects.findIndex((o) => o.id === operation.id);
      if (index < 0)
        throw new AIError(
          'missing_entity',
          'The target entity no longer exists. Refresh the project.',
          409,
        );
      if (operation.op === 'update')
        next.objects[index] = strictEntity({ ...next.objects[index], ...properties });
      else {
        next.objects.splice(index, 1);
        for (const object of next.objects)
          if (object.kind === 'receiver' && object.trajectoryId === operation.id) {
            object.trajectoryId = null;
            object.mobility = 'stationary';
          }
      }
    }
  }
  return projectSchema.parse(next); // Entire batch must satisfy entity, reference and 500-object constraints.
}
export function experimentConfiguration(project: Project, patch: Record<string, unknown>) {
  const base = project.laboratory ?? defaultLabConfig();
  if (Object.keys(patch).some((key) => !(key in base)))
    throw new AIError('invalid_parameter', 'An experiment parameter is not implemented.', 422);
  const config = labConfigSchema.parse({ ...base, ...patch });
  if (project.objects.length > 100)
    throw new AIError(
      'scientific_entity_limit',
      'The existing laboratory engine supports at most 100 network objects. Create a smaller scenario copy before running.',
      422,
    );
  const anchors = project.objects.filter((o) => o.kind === 'anchor' && o.enabled);
  if (config.referenceId !== 'auto' && !anchors.some((a) => a.id === config.referenceId))
    throw new AIError(
      'invalid_reference',
      'The TDOA reference must identify an enabled anchor.',
      422,
    );
  if (
    config.missingIds.some((id) => !project.objects.some((o) => o.id === id && o.kind === 'anchor'))
  )
    throw new AIError(
      'invalid_reference',
      'Missing observation IDs must identify actual anchors.',
      422,
    );
  if (config.sweep === 'anchorCount' && Math.max(...config.sweepValues) > anchors.length)
    throw new AIError('invalid_sweep', 'Anchor-count sweep exceeds the enabled network.', 422);
  if (
    config.sweep === 'speed' &&
    !project.objects.some((o) => o.kind === 'receiver' && o.enabled && o.mobility !== 'stationary')
  )
    throw new AIError('invalid_sweep', 'A speed sweep requires a moving receiver.', 422);
  const workload = laboratoryWorkload(project, config);
  if (workload.epochs > 20000 || workload.observations > 100000)
    throw new AIError(
      'work_limit',
      'AI runs are limited to 20,000 estimator epochs and 100,000 anchor observations. Reduce trials, duration, grid or sweep.',
      422,
    );
  if (!project.objects.some((o) => o.kind === 'receiver' && o.enabled))
    throw new AIError(
      'invalid_scenario',
      'The existing scientific API requires an enabled receiver even when a grid is configured.',
      422,
    );
  if (project.objects.filter((o) => o.kind === 'anchor' && o.enabled).length < 3)
    throw new AIError('invalid_geometry', 'At least three enabled anchors are required.', 422);
  if (
    project.objects.some(
      (o) =>
        o.kind === 'receiver' &&
        o.enabled &&
        o.mobility === 'waypoints' &&
        !project.objects.some(
          (t) => t.kind === 'trajectory' && t.id === o.trajectoryId && t.enabled && t.points.length,
        ),
    )
  )
    throw new AIError(
      'invalid_mobility',
      'A waypoint receiver requires an existing trajectory before an AI experiment can run.',
      422,
    );
  return { config, workload };
}
export function diagnostics(project: Project) {
  return project.objects.flatMap((o) =>
    o.kind === 'receiver' && o.enabled
      ? (() => {
          const result = solveProject(project, o, 0);
          return [
            {
              receiverId: o.id,
              source: 'existing calibrated-range baseline at t=0',
              usableAnchors: result.usable.length,
              blockedLinks: result.set.measurements.filter((m) => m.blocked).length,
              condition: result.solution?.condition ?? null,
              residualRmsM: result.solution?.rms ?? null,
              warning: result.error,
            },
          ];
        })()
      : [],
  );
}
export function publicEntities(project: Project) {
  return project.objects.map(({ name: _name, ...entity }) => entity);
}
