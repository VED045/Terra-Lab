import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTemplate } from '@terralab/shared';
const { rpc, getSession, getUser, latest } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  latest: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc,
    auth: { getSession, getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: latest }) }) }),
  }),
}));
import { saveProject, observeSaveConflicts } from './persistence';
beforeEach(() => {
  vi.resetAllMocks();
  latest.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-public');
  getSession.mockResolvedValue({ data: { session: {} }, error: null });
  getUser.mockResolvedValue({
    data: { user: { id: '10000000-0000-4000-8000-000000000001' } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it.each(['PT409', '40001'])(
  'retains a %s conflict as a useful UI Error, with the expected version',
  async (code) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'VERSION_CONFLICT: reload or save a copy' },
    });
    await expect(saveProject({ ...createTemplate(), cloudVersion: 4 })).rejects.toThrow(
      'VERSION_CONFLICT',
    );
    expect(rpc.mock.calls[0][0]).toBe('save_research_project');
    expect(rpc.mock.calls[0][1].p_expected).toBe(4);
  },
);
it('returns the server-authoritative owner/version for the editor to accept', async () => {
  const p = createTemplate(),
    owner = crypto.randomUUID();
  rpc.mockResolvedValue({ data: { ...p, cloudVersion: 5, cloudOwnerId: owner }, error: null });
  const saved = await saveProject({ ...p, cloudVersion: 4 });
  expect(saved.cloudVersion).toBe(5);
  expect(saved.cloudOwnerId).toBe(owner);
});

it('explains missing migration 005 when the v1 server rejects a schema-2 save', async () => {
  const p = createTemplate();
  p.schemaVersion = 2;
  rpc.mockResolvedValue({ data: null, error: { message: 'Invalid project configuration' } });
  await expect(saveProject(p)).rejects.toThrow('migration 005');
  expect(p.schemaVersion).toBe(2);
});

it('deduplicates overlapping identical saves without creating a second revision', async () => {
  const p = { ...createTemplate(), cloudVersion: 1 };
  let resolve!: (value: unknown) => void;
  rpc.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const a = saveProject(p),
    b = saveProject(structuredClone(p));
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  resolve({ data: { ...p, cloudVersion: 2 }, error: null });
  expect(await a).toEqual(await b);
  expect(rpc).toHaveBeenCalledOnce();
});
it('reconciles an identical stale draft without another write or a conflict dialog', async () => {
  const p = { ...createTemplate(), cloudVersion: 1 };
  const listener = vi.fn(),
    stop = observeSaveConflicts(listener);
  rpc.mockResolvedValue({ error: { message: 'VERSION_CONFLICT' } });
  latest.mockResolvedValue({ data: { config: { ...p, cloudVersion: 3 } }, error: null });
  try {
    expect((await saveProject(p)).cloudVersion).toBe(3);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    stop();
  }
  expect(rpc).toHaveBeenCalledOnce();
});
it('notifies recovery for divergent drafts and never retries with a forced latest version', async () => {
  const p = { ...createTemplate(), cloudVersion: 1 };
  const listener = vi.fn(),
    stop = observeSaveConflicts(listener);
  rpc.mockResolvedValue({ error: { message: 'VERSION_CONFLICT' } });
  latest.mockResolvedValue({
    data: { config: { ...p, name: 'Remote edit', cloudVersion: 3 } },
    error: null,
  });
  try {
    await expect(saveProject(p)).rejects.toThrow('VERSION_CONFLICT');
    expect(listener).toHaveBeenCalledWith(p);
  } finally {
    stop();
  }
  expect(rpc).toHaveBeenCalledOnce();
  expect(p.cloudVersion).toBe(1);
});
it('keeps overlapping different drafts separate and retains the stale version guard', async () => {
  const p = { ...createTemplate(), cloudVersion: 1 };
  rpc.mockImplementation(async (_name, body) =>
    body.p_config.name === p.name
      ? { data: { ...p, cloudVersion: 2 }, error: null }
      : { error: { message: 'VERSION_CONFLICT' } },
  );
  const results = await Promise.allSettled([
    saveProject(p),
    saveProject({ ...p, name: 'Other edit' }),
  ]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.every(([, body]) => body.p_expected === 1)).toBe(true);
});
