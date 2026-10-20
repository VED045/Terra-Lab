import { it, expect, vi, afterEach } from 'vitest';
import { POST as signal } from './signals/route';
import { POST as report } from './reports/route';
import { POST as experiment } from './laboratory/route';
import { createTemplate, defaultLabConfig } from '@terralab/shared';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('production scientific endpoints require a session before upstream work', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const route of [signal, report, experiment])
    expect(
      (await route(new Request('http://local/api', { method: 'POST', body: '{}' }))).status,
    ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it('forwards user authorization and duplicate-request identity, never service credentials', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 202 }));
  vi.stubGlobal('fetch', fetch);
  const key = crypto.randomUUID();
  await experiment(
    new Request('http://local/api', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-user-session', 'Idempotency-Key': key },
      body: JSON.stringify({ project: createTemplate(), config: defaultLabConfig() }),
    }),
  );
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-user-session');
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(key);
  expect(JSON.stringify(fetch.mock.calls[0][1].headers)).not.toContain('service_role');
});
it('rejects streamed oversized bodies before contacting upstream', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(
    (await signal(new Request('http://local/api', { method: 'POST', body: 'x'.repeat(32001) })))
      .status,
  ).toBe(413);
  expect(
    (await report(new Request('http://local/api', { method: 'POST', body: 'x'.repeat(2000001) })))
      .status,
  ).toBe(413);
  expect(
    (
      await experiment(
        new Request('http://local/api', { method: 'POST', body: 'x'.repeat(2000001) }),
      )
    ).status,
  ).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it('returns actual PDF bytes with no-store and attachment headers', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('%PDF-fixture', { headers: { 'Content-Type': 'application/pdf' } }),
      ),
  );
  const r = await report(new Request('http://local/api', { method: 'POST', body: '{}' }));
  expect(r.headers.get('Content-Type')).toBe('application/pdf');
  expect(r.headers.get('Cache-Control')).toBe('no-store');
  expect(await r.text()).toBe('%PDF-fixture');
});
it('reports malformed signal JSON rather than inventing a spectrum', async () => {
  vi.stubGlobal('fetch', vi.fn());
  const r = await signal(new Request('http://local/api', { method: 'POST', body: 'invalid' }));
  expect(r.status).toBe(400);
});
