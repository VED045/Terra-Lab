import { beforeEach, describe, it, expect, vi } from 'vitest';
import { POST } from '../../app/api/research/assets/route';
import { validateResearchFile } from './files';
const auth = vi.hoisted(() => ({ guard: vi.fn(), active: vi.fn() }));
vi.mock('../ai/server', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  guard: auth.guard,
}));
vi.mock('../ai/domain', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  activeProject: auth.active,
}));
const owner = '10000000-0000-4000-8000-000000000001',
  project = '20000000-0000-4000-8000-000000000002',
  id = '30000000-0000-4000-8000-000000000003';
let upload: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>,
  rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  upload = vi.fn(async () => ({ error: null }));
  remove = vi.fn(async () => ({ error: null }));
  rpc = vi.fn(async () => ({ data: { id }, error: null }));
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  auth.guard.mockResolvedValue({
    local: false,
    userId: owner,
    db: { from: () => query, storage: { from: () => ({ upload, remove }) }, rpc },
  });
  auth.active.mockResolvedValue({ role: 'owner', project: { id: project }, shared: false });
});
async function request(
  file = new File(['Actual source'], 'source.txt', { type: 'text/plain' }),
  overrides: Record<string, unknown> = {},
) {
  const checked = await validateResearchFile(file),
    form = new FormData();
  form.set('file', file);
  form.set(
    'metadata',
    JSON.stringify({
      id,
      project_id: project,
      name: file.name,
      collection: 'Sources',
      mime: checked.mime,
      bytes: file.size,
      sha256: checked.sha256,
      path: 'ignored/client/path',
      extraction: {
        status: 'ready',
        pages: [{ page: 1, text: 'Actual source' }],
        truncated: false,
      },
      provenance: {},
      ...overrides,
    }),
  );
  return new Request('http://localhost/api/research/assets', { method: 'POST', body: form });
}
describe('private research upload boundary (mocked transport)', () => {
  it('checks fresh identity/role and publishes only verified bytes at a server-derived path', async () => {
    const response = await POST(await request());
    expect(response.status).toBe(200);
    expect(auth.guard).toHaveBeenCalled();
    expect(auth.active).toHaveBeenCalled();
    expect(upload.mock.calls[0][0]).toBe(`${owner}/${project}/${id}.txt`);
    expect(rpc.mock.calls[0][1].p_asset.path).toBe(`${owner}/${project}/${id}.txt`);
    expect(response.headers.get('cache-control')).toContain('private');
  });
  it('rejects mismatched hashes and project viewers before storage writes', async () => {
    expect((await POST(await request(undefined, { sha256: 'f'.repeat(64) }))).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    auth.active.mockResolvedValue({ role: 'viewer', project: { id: project }, shared: true });
    expect((await POST(await request())).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
  it('bounds uploads before reading them and never publishes unfinished metadata', async () => {
    const r = await request();
    r.headers.set('Content-Length', '6000000');
    expect((await POST(r)).status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: 'simulated metadata failure' } });
    expect((await POST(await request())).status).toBe(503);
    expect(remove).toHaveBeenCalledWith([`${owner}/${project}/${id}.txt`]);
  });
});
