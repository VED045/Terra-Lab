import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { executeTool } from './tools';
import { POST as approve } from '../../app/api/ai/approve/route';

const owner = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const project = { ...createTemplate('outdoor'), cloudVersion: 1 };
const origin = 'https://terralab.example';
let role: 'viewer' | 'editor' = 'viewer';
let access = true;
const writes = vi.fn();
function request(value?: unknown) {
  return new Request(origin + '/api/ai/approve', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer ' + user,
      'Content-Type': 'application/json',
    },
    body: value ? JSON.stringify(value) : undefined,
  });
}
beforeEach(() => {
  role = 'viewer';
  access = true;
  writes.mockReset();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-public');
  vi.stubEnv('TERRALAB_AI_COOKIE_KEY', Buffer.alloc(32, 9).toString('base64'));
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const address = String(url);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer ' + user);
      if (address.includes('/auth/v1/user'))
        return new Response(JSON.stringify({ id: user, aud: 'authenticated' }));
      if (address.includes('/rest/v1/projects')) {
        expect(new URL(address).searchParams.get('id')).toBe('eq.' + project.id);
        return new Response(
          JSON.stringify(
            access ? { config: project, version: 1, owner_id: owner, team_id: null } : null,
          ),
        );
      }
      if (address.includes('/rest/v1/project_members'))
        return new Response(JSON.stringify([{ user_id: user, role }]));
      if (address.includes('/rpc/save_research_project')) {
        const args = JSON.parse(String(init?.body));
        writes(args);
        return new Response(
          JSON.stringify({ ...args.p_config, cloudVersion: 2, cloudOwnerId: owner }),
        );
      }
      throw Error('Unexpected server request');
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('lets a shared viewer inspect real project authority but rejects mutation tools', async () => {
  const context = { projectId: project.id };
  expect(await executeTool(request(), context, 'inspect_project', {})).toMatchObject({
    ok: true,
    data: { role: 'viewer', shared: true },
  });
  expect(
    await executeTool(request(), context, 'propose_scenario_copy', {
      name: 'Cannot mutate as viewer',
    }),
  ).toMatchObject({ ok: false, code: 'read_only' });
  expect(writes).not.toHaveBeenCalled();
});
it('rechecks permission after preview and blocks an editor downgraded to viewer before approval', async () => {
  role = 'editor';
  const context = { projectId: project.id };
  const result = await executeTool(request(), context, 'propose_network_changes', {
    operations: [{ op: 'add', kind: 'anchor', x: 30, y: 40 }],
    reason: 'Reviewed shared edit',
  });
  expect(result.ok).toBe(true);
  expect(result.approval?.shared).toBe(true);
  role = 'viewer';
  const response = await approve(
    request({ context, token: result.approval!.token, decision: 'approve' }),
  );
  expect(response.status).toBe(403);
  expect(writes).not.toHaveBeenCalled();
});
it('commits an approved editor change only through the existing version-checked save RPC', async () => {
  role = 'editor';
  const context = { projectId: project.id };
  const result = await executeTool(request(), context, 'propose_network_changes', {
    operations: [{ op: 'add', kind: 'anchor', x: 30, y: 40 }],
    reason: 'Reviewed shared edit',
  });
  const response = await approve(
    request({ context, token: result.approval!.token, decision: 'approve' }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    state: 'completed',
    persistence: 'cloud',
    project: { cloudVersion: 2 },
  });
  expect(writes).toHaveBeenCalledWith(expect.objectContaining({ p_expected: 1 }));
});
it('denies revoked project access before context or tools can leak data', async () => {
  access = false;
  const result = await executeTool(request(), { projectId: project.id }, 'inspect_entities', {
    kind: 'all',
  });
  expect(result).toMatchObject({ ok: false, code: 'project_denied' });
  expect(JSON.stringify(result)).not.toContain(project.objects[0].id);
  expect(writes).not.toHaveBeenCalled();
});
