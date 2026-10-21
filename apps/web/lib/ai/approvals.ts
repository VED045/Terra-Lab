import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { projectSchema, type Project } from '@terralab/shared';
import type { AIIdentity } from './access';
import { AIError } from './contracts';
import {
  activeProject,
  fingerprint,
  requireEditor,
  experimentConfiguration,
  type ActiveProject,
} from './domain';
import { submitExperiment, authorizedRun, scientificCall } from './scientific';
import type { ApprovalView } from './agent-contracts';
import type { contextInputSchema } from './contracts';

const approvalGlobal = globalThis as typeof globalThis & {
  __terralabAIApprovals?: { key: Buffer; consumed: Map<string, number> };
};
const approvalState = (approvalGlobal.__terralabAIApprovals ??= {
  key: randomBytes(32),
  consumed: new Map(),
});
const localSigningKey = approvalState.key;
const consumed = approvalState.consumed;
const approvalSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string(),
    projectId: z.string().uuid(),
    baseHash: z.string().length(64),
    expires: z.number(),
    kind: z.enum(['network', 'copy', 'experiment', 'cancel', 'restore']),
    nextProject: projectSchema.optional(),
    config: z.record(z.string(), z.json()).optional(),
    runId: z.string().uuid().optional(),
  })
  .strict();
type Approval = z.infer<typeof approvalSchema>;
function signingKey(identity: AIIdentity) {
  if (identity.local) return localSigningKey;
  const key = Buffer.from(process.env.TERRALAB_AI_COOKIE_KEY || '', 'base64');
  if (key.length !== 32)
    throw new AIError(
      'approval_unavailable',
      'AI approval signing is unavailable. Configure the server encryption key.',
      503,
    );
  return key;
}
function sign(identity: AIIdentity, payload: Approval) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return (
    encoded +
    '.' +
    createHmac('sha256', signingKey(identity))
      .update('terralab-ai-approval-v1:' + encoded)
      .digest('base64url')
  );
}
export function prepareApproval(
  identity: AIIdentity,
  active: ActiveProject,
  kind: Approval['kind'],
  title: string,
  preview: unknown,
  extra: Partial<Pick<Approval, 'nextProject' | 'config' | 'runId'>> = {},
): ApprovalView {
  requireEditor(active);
  const payload = approvalSchema.parse({
    id: crypto.randomUUID(),
    userId: identity.userId,
    projectId: active.project.id,
    baseHash: fingerprint(active.project),
    expires: Date.now() + 600000,
    kind,
    ...extra,
  });
  return {
    token: sign(identity, payload),
    title,
    kind,
    preview: {
      details: preview,
      recovery:
        identity.local && ['network', 'restore'].includes(kind)
          ? 'A private before-change recovery copy is saved through the existing browser project store before replacing the saved project.'
          : 'Cloud edits retain existing revision history; the source of a copy is unchanged.',
    },
    destructive:
      kind === 'cancel' ||
      kind === 'restore' ||
      (kind === 'network' &&
        active.project.objects.some(
          (old) => !extra.nextProject?.objects.some((next) => next.id === old.id),
        )),
    shared: active.shared,
    projectId: active.project.id,
    expiresAt: new Date(payload.expires).toISOString(),
  };
}
function verify(identity: AIIdentity, token: string) {
  const [encoded, signature, surplus] = token.split('.');
  if (!encoded || !signature || surplus)
    throw new AIError('invalid_approval', 'The approval token is invalid.', 403);
  const expected = createHmac('sha256', signingKey(identity))
    .update('terralab-ai-approval-v1:' + encoded)
    .digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new AIError(
      'invalid_approval',
      'The approval token was altered or issued for another server.',
      403,
    );
  const payload = approvalSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString()));
  if (payload.userId !== identity.userId || payload.expires <= Date.now())
    throw new AIError(
      'approval_expired',
      'The approval expired or belongs to another user. Request a fresh preview.',
      403,
    );
  return payload;
}
export async function applyApproval(
  request: Request,
  identity: AIIdentity,
  context: z.infer<typeof contextInputSchema>,
  token: string,
  decision: 'approve' | 'cancel',
) {
  const payload = verify(identity, token);
  if (payload.projectId !== context.projectId)
    throw new AIError('project_denied', 'The approval belongs to a different project.', 403);
  const active = await activeProject(identity, context);
  requireEditor(active);
  if (fingerprint(active.project) !== payload.baseHash)
    throw new AIError(
      'stale_revision',
      'The project changed after this preview. Refresh and request a new proposal; nothing was overwritten.',
      409,
    );
  for (const [id, expiry] of consumed) if (expiry <= Date.now()) consumed.delete(id);
  if (consumed.has(payload.id))
    throw new AIError(
      'already_reviewed',
      'This proposal has already been reviewed. Inspect the actual project/run before retrying.',
      409,
    );
  if (consumed.size >= 2000)
    throw new AIError('approval_limit', 'The approval service is busy. Retry shortly.', 429);
  consumed.set(payload.id, payload.expires);
  if (decision === 'cancel')
    return {
      state: 'cancelled',
      actionId: payload.id,
      message: 'Proposal cancelled. No domain operation was executed.',
    };
  if (request.signal.aborted)
    throw new AIError('cancelled', 'Approval cancelled before execution.', 499);
  if (payload.kind === 'experiment') {
    const { config, workload } = experimentConfiguration(active.project, payload.config || {});
    const result = await submitExperiment(request, active.project, config, payload.id);
    return {
      state: 'submitted',
      actionId: payload.id,
      runId: result.id,
      workload,
      message: 'Experiment submitted. Submission is not completion.',
      href: '/ai?project=' + active.project.id + '&experiment=' + result.id,
    };
  }
  if (payload.kind === 'cancel') {
    const run = await authorizedRun(request, identity, active.project, payload.runId!);
    if (!['queued', 'running'].includes(run.status))
      return {
        state: 'completed',
        actionId: payload.id,
        runId: run.id,
        status: run.status,
        message: 'Run is already terminal; no cancellation was needed.',
      };
    await scientificCall(request, '/experiments/' + run.id, 'DELETE');
    return {
      state: 'cancellation_requested',
      actionId: payload.id,
      runId: run.id,
      message:
        'Cancellation requested from the real worker. Poll for the terminal status; partial results may be retained.',
    };
  }
  let next = projectSchema.parse(payload.nextProject);
  const before = active.project;
  if (payload.kind !== 'copy' && next.id !== before.id)
    throw new AIError('project_denied', 'Only a scenario copy can change the project ID.', 403);
  next.updatedAt = new Date().toISOString();
  if (payload.kind !== 'copy') {
    next.cloudVersion = before.cloudVersion;
    next.cloudOwnerId = before.cloudOwnerId;
  }
  if (!identity.local) {
    // Existing checked RPC is the final authority for viewer/editor/team role and optimistic revision.
    const result = await identity.db!.rpc('save_research_project', {
      p_config: next,
      p_expected: payload.kind === 'copy' ? null : (before.cloudVersion ?? null),
    });
    if (result.error)
      throw new AIError(
        'save_conflict',
        'Save failed or permissions/revision changed. Refresh the actual project before retrying.',
        409,
      );
    next = projectSchema.parse(result.data);
  }
  const undo =
    payload.kind === 'copy'
      ? null
      : prepareApproval(
          identity,
          { ...active, project: next },
          'restore',
          payload.kind === 'restore' ? 'Redo reviewed change' : 'Undo reviewed change',
          {
            consequence:
              'Restore the previous validated network and experiment configuration as a new saved revision.',
            objects: before.objects.length,
          },
          { nextProject: before },
        );
  return {
    state: identity.local ? 'local_save_required' : 'completed',
    actionId: payload.id,
    project: next,
    persistence: identity.local ? 'browser' : 'cloud',
    undo,
    message: identity.local
      ? 'Validated change ready for the browser domain save. It is not completed until that save succeeds.'
      : 'The existing project save RPC committed the actual revision.',
    entityIds: next.objects
      .filter((o) => !before.objects.some((b) => b.id === o.id))
      .map((o) => o.id),
  };
}
