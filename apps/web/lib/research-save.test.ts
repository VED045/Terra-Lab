import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTemplate } from '@terralab/shared';
const { rpc, getSession, getUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc, auth: { getSession, getUser } }),
}));
import { saveProject } from './persistence';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-public');
  getSession.mockResolvedValue({ data: { session: {} }, error: null });
  getUser.mockResolvedValue({
    data: { user: { id: '10000000-0000-4000-8000-000000000001' } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it('retains a plain PostgREST conflict as a useful UI Error, with the expected version', async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: '40001', message: 'VERSION_CONFLICT: reload or save a copy' },
  });
  await expect(saveProject({ ...createTemplate(), cloudVersion: 4 })).rejects.toThrow(
    'VERSION_CONFLICT',
  );
  expect(rpc.mock.calls[0][0]).toBe('save_research_project');
  expect(rpc.mock.calls[0][1].p_expected).toBe(4);
});
it('returns the server-authoritative owner/version for the editor to accept', async () => {
  const p = createTemplate(),
    owner = crypto.randomUUID();
  rpc.mockResolvedValue({ data: { ...p, cloudVersion: 5, cloudOwnerId: owner }, error: null });
  const saved = await saveProject({ ...p, cloudVersion: 4 });
  expect(saved.cloudVersion).toBe(5);
  expect(saved.cloudOwnerId).toBe(owner);
});
