import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTemplate, defaultLabConfig } from '@terralab/shared';
import { POST, GET, DELETE } from './route';
afterEach(() => vi.unstubAllGlobals());
describe('Scientific API proxy', () => {
  it('forwards validated network snapshots, status queries, and cancellation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }), {
          status: 202,
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new Request('http://localhost/api/laboratory', {
        method: 'POST',
        body: JSON.stringify({ project: createTemplate('outdoor'), config: defaultLabConfig() }),
      }),
    );
    expect(response.status).toBe(202);
    expect(JSON.parse(fetch.mock.calls[0][1].body).config.seed).toBe(42);
    fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'running' })));
    await GET(
      new Request('http://localhost/api/laboratory?id=00000000-0000-4000-8000-000000000001'),
    );
    expect(fetch.mock.calls.at(-1)?.[1].method).toBe('GET');
    fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'running' })));
    await DELETE(
      new Request('http://localhost/api/laboratory?id=00000000-0000-4000-8000-000000000001', {
        method: 'DELETE',
      }),
    );
    expect(fetch.mock.calls.at(-1)?.[1].method).toBe('DELETE');
  });
  it('rejects incompatible configurations and invalid job IDs before calling Python', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new Request('http://localhost/api/laboratory', {
        method: 'POST',
        body: JSON.stringify({
          project: createTemplate(),
          config: { measurement: 'aoa', estimators: ['ls'] },
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect((await GET(new Request('http://localhost/api/laboratory?id=../../secret'))).status).toBe(
      422,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports an unavailable numerical service without returning fake results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('connection refused')));
    const response = await GET(
      new Request('http://localhost/api/laboratory?id=00000000-0000-4000-8000-000000000001'),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty('detail');
  });
});
