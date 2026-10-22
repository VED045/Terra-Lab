import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemplate, defaultLabConfig } from '@terralab/shared';
import {
  canSaveCredentials,
  credentialCookie,
  credentialLifetime,
  openCredential,
  redact,
  sealCredential,
  streamRedactor,
} from './credentials';
import { chatSchema, keySchema, modelSchema, safeError } from './contracts';
import { identify, localDevelopment, sameOrigin } from './access';
import { summarizeProject, readContext } from './context';
import { lines, ollamaBase, textProviders } from './providers';
import { POST as chat } from '../../app/api/ai/chat/route';
import { GET as settings, POST as save, DELETE as forget } from '../../app/api/ai/settings/route';
import { POST as connection } from '../../app/api/ai/connection/route';
import { POST as contextRoute } from '../../app/api/ai/context/route';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const secret = 'test-only-secret-never-a-real-key';
const project = createTemplate('outdoor');
project.laboratory = defaultLabConfig();
const origin = 'http://127.0.0.1:3000';
const fetcher = vi.fn<typeof fetch>();
function req(path: string, value?: unknown, token = alice, cookie?: string, method = 'POST') {
  const requestOrigin =
    process.env.NODE_ENV === 'production' ? origin.replace('http:', 'https:') : origin;
  return new Request(requestOrigin + '/api/ai/' + path, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: `${credentialCookie}=${cookie}` } : {}),
      'Content-Type': 'application/json',
    },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(value ?? {}),
  });
}
function streamResponse(text = 'Anchor geometry affects dilution of precision.') {
  return new Response(
    'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\ndata: [DONE]\n\n',
  );
}
function mockCloud(url: string | URL | Request, init?: RequestInit) {
  const address = String(url);
  const headers = new Headers(init?.headers);
  if (address.includes('/auth/v1/user')) {
    const token = headers.get('authorization')?.slice(7);
    return new Response(
      JSON.stringify(
        [alice, bob].includes(token || '')
          ? { id: token, aud: 'authenticated', email: 'not-forwarded@example.invalid' }
          : { message: secret },
      ),
      { status: [alice, bob].includes(token || '') ? 200 : 401 },
    );
  }
  if (address.includes('/rest/v1/projects')) {
    const query = new URL(address).searchParams;
    expect(query.get('select')).toBe('config,version');
    expect(headers.get('authorization')).toBe('Bearer ' + alice);
    return new Response(
      JSON.stringify(
        query.get('id') === 'eq.' + project.id ? { config: project, version: 7 } : null,
      ),
    );
  }
  if (address.endsWith('/models'))
    return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }));
  if (address.endsWith('/chat/completions')) return streamResponse();
  throw Error('Unexpected request');
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TERRALAB_AI_COOKIE_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-public-key');
  vi.stubEnv('TERRALAB_AI_DEV_DEEPSEEK_KEY', secret);
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockImplementation(async (url, init) => mockCloud(url, init));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetcher.mockReset();
});

describe('credentials and contracts', () => {
  it('authenticates encryption, binds it to the current user, and expires it', () => {
    const sealed = sealCredential(secret, alice, 1000);
    expect(sealed).not.toContain(secret);
    expect(openCredential(sealed, alice, 1001)).toBe(secret);
    expect(openCredential(sealed, bob, 1001)).toBeNull();
    expect(openCredential(sealed, alice, 1000 + credentialLifetime * 1000)).toBeNull();
    expect(openCredential(sealed.slice(0, -10) + 'tampered', alice, 1001)).toBeNull();
    vi.stubEnv('TERRALAB_AI_COOKIE_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(openCredential(sealed, alice, 1001)).toBeNull();
  });
  it('fails closed without an encryption key and validates credentials and model IDs', () => {
    vi.stubEnv('TERRALAB_AI_COOKIE_KEY', '');
    expect(canSaveCredentials()).toBe(false);
    expect(() => sealCredential(secret, alice)).toThrow();
    expect(keySchema.safeParse('key\nheader: injection').success).toBe(false);
    expect(modelSchema.safeParse('https://arbitrary.invalid?key=secret').success).toBe(false);
    expect(chatSchema.safeParse({ messages: [{ role: 'system', content: secret }] }).success).toBe(
      false,
    );
  });
  it('redacts every split of a credential including consecutive occurrences', () => {
    for (let split = 1; split < secret.length; split++) {
      const scrub = streamRedactor(secret);
      const output =
        scrub('hello ' + secret.slice(0, split)) +
        scrub(secret.slice(split) + secret + ' world') +
        scrub('', true);
      expect(output).toBe('hello [redacted][redacted] world');
    }
    expect(redact(secret + secret, [secret])).toBe('[redacted][redacted]');
    expect(safeError(Error(secret)).message).not.toContain(secret);
  });
  it('saves a verified write-only credential and returns only a descriptor', async () => {
    const response = await save(req('settings', { provider: 'deepseek', key: secret }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(secret);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain(secret);
    const value = cookie.split(';')[0].split('=')[1];
    const descriptor = await settings(req('settings', undefined, alice, value, 'GET'));
    expect(await descriptor.json()).toMatchObject({ configured: true, canSave: true });
    const other = await settings(req('settings', undefined, bob, value, 'GET'));
    expect(await other.json()).toMatchObject({ configured: false });
    expect((await connection(req('connection', { provider: 'deepseek' }, bob, value))).status).toBe(
      409,
    );
    expect(
      (await forget(req('settings', undefined, alice, value, 'DELETE'))).headers.get('set-cookie'),
    ).toContain('Max-Age=0');
  });
  it('uses secure host-only cookies in production and never falls back to the development key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await save(req('settings', { provider: 'deepseek', key: secret }));
    expect(response.headers.get('set-cookie')).toContain('; Secure');
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
    const missing = await connection(req('connection', { provider: 'deepseek' }));
    expect(missing.status).toBe(409);
  });
});
describe('authentication and context', () => {
  it('rejects missing, fabricated and expired authentication', async () => {
    for (const token of ['', 'fabricated'])
      expect((await contextRoute(req('context', { projectId: project.id }, token))).status).toBe(
        401,
      );
    expect(() =>
      sameOrigin(
        new Request(origin, { method: 'POST', headers: { Origin: 'https://evil.invalid' } }),
      ),
    ).toThrow();
    expect(() => sameOrigin(new Request(origin, { method: 'POST' }))).toThrow();
    expect(() =>
      sameOrigin(
        new Request('http://localhost:3000', {
          method: 'POST',
          headers: { Host: '127.0.0.1:3000', Origin: origin },
        }),
      ),
    ).not.toThrow();
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      sameOrigin(new Request(origin, { method: 'POST', headers: { Origin: origin } })),
    ).toThrow();
  });
  it('only enables the explicit loopback development path and rejects invalid supplied tokens', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TERRALAB_AI_LOCAL_DEV', '1');
    expect(localDevelopment(req('settings'))).toBe(true);
    expect(localDevelopment(new Request('https://terralab.example/api/ai/settings'))).toBe(false);
    expect((await identify(req('settings', undefined, ''))).local).toBe(true);
    await expect(identify(req('settings', undefined, 'bad'))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('minimizes validated project context without names, coordinates, secrets or collaboration data', async () => {
    const raw = {
      ...project,
      name: secret,
      description: secret,
      members: [{ email: secret }],
      apiKey: secret,
    };
    const summary = summarizeProject(raw, 'cloud-saved');
    const text = JSON.stringify(summary);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(project.id);
    expect(text).not.toContain('cloudOwnerId');
    expect(text).not.toContain('trajectoryId');
    expect(summary.experiment?.measurement).toBe(project.laboratory!.measurement);
    expect(() =>
      summarizeProject({ ...project, objects: [{ kind: 'arbitrary' }] }, 'cloud-saved'),
    ).toThrow();
    const response = await contextRoute(
      req('context', { projectId: project.id, localProject: raw }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(secret);
  });
  it('denies missing/revoked project access and scopes experiments to the selected project', async () => {
    expect((await contextRoute(req('context', { projectId: bob }))).status).toBe(403);
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('/research_jobs')) {
        expect(new URL(String(url)).searchParams.get('project_id')).toBe('eq.' + project.id);
        expect(new URL(String(url)).searchParams.get('id')).toBe('eq.' + bob);
        return new Response('null');
      }
      return mockCloud(url, init);
    });
    expect(
      (await contextRoute(req('context', { projectId: project.id, experimentId: bob }))).status,
    ).toBe(403);
    expect(
      fetcher.mock.calls.every(
        ([, init]) => !JSON.stringify(init?.headers).includes('service_role'),
      ),
    ).toBe(true);
  });
  it('does not trust a client-supplied local snapshot in an authenticated cloud request', async () => {
    const response = await contextRoute(
      req('context', { projectId: project.id, localProject: { ...project, objects: [] } }),
    );
    const context = await response.json();
    expect(context.objects.anchors.total).toBeGreaterThan(0);
    expect(context.savedRevision).toBe('7:' + project.updatedAt);
    expect(context.canvas.revision).toBe(context.savedRevision);
    await expect(
      readContext(
        { local: true, db: null, userId: 'local-development' },
        { projectId: bob, localProject: project },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
describe('providers and streaming', () => {
  it.each([
    [401, 'invalid_key'],
    [402, 'quota'],
    [429, 'rate_limit'],
    [503, 'provider_unavailable'],
    [404, 'unsupported_model'],
  ])('maps upstream %s to a redacted actionable error', async (status, code) => {
    fetcher.mockImplementation(async (url, init) =>
      String(url).endsWith('/models')
        ? new Response(secret, { status: status as number })
        : mockCloud(url, init),
    );
    const response = await connection(
      req('connection', { provider: 'deepseek' }, alice, sealCredential(secret, alice)),
    );
    const payload = await response.text();
    expect(JSON.parse(payload).code).toBe(code);
    expect(payload).not.toContain(secret);
  });
  it('handles missing credentials, timeout and connection refusal without exposing exceptions', async () => {
    expect((await connection(req('connection', { provider: 'deepseek' }))).status).toBe(409);
    fetcher.mockRejectedValue(Error(secret));
    await expect(
      textProviders.deepseek.models({ key: secret, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      textProviders.deepseek.models({ key: secret, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
  it('streams real adapter text through the chat route, redacts split credentials and includes verified activity', async () => {
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/chat/completions')) {
        const payload = JSON.parse(String(init?.body));
        expect(payload.tools).toBeUndefined();
        expect(payload.messages[0].role).toBe('system');
        expect(JSON.stringify(payload)).not.toContain(secret);
        return new Response(
          [secret.slice(0, 5), secret.slice(5), ' Geometry matters.']
            .map(
              (content) =>
                'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n',
            )
            .join('') + 'data: [DONE]\n\n',
        );
      }
      return mockCloud(url, init);
    });
    const response = await chat(
      req(
        'chat',
        {
          provider: 'deepseek',
          model: 'test-model',
          context: { projectId: project.id },
          messages: [{ role: 'user', content: 'Explain ' + secret }],
        },
        alice,
        sealCredential(secret, alice),
      ),
    );
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events[0].type).toBe('activity');
    expect(events.at(-1).type).toBe('done');
    const text = events
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .join('');
    expect(text).toBe('[redacted] Geometry matters.');
  });
  it('rejects unlisted models, missing context and oversized input without generation', async () => {
    const input = {
      provider: 'deepseek',
      model: 'not-listed',
      context: { projectId: project.id },
      messages: [{ role: 'user', content: 'Explain' }],
    };
    expect((await chat(req('chat', input, alice, sealCredential(secret, alice)))).status).toBe(422);
    expect(
      (await chat(req('chat', { ...input, context: {} }, alice, sealCredential(secret, alice))))
        .status,
    ).toBe(400);
    expect((await chat(req('chat', { ...input, padding: 'x'.repeat(200001) }))).status).toBe(413);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/chat/completions'))).toBe(
      false,
    );
  });
  it('bounds parsing and detects truncated streams', async () => {
    await expect(
      (async () => {
        for await (const _ of lines(new Response('x'.repeat(70000)))) {
          void _;
        }
      })(),
    ).rejects.toBeInstanceOf(RangeError);
    fetcher.mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
    );
    await expect(
      (async () => {
        for await (const _ of textProviders.deepseek.stream('test', [], {
          key: secret,
          signal: new AbortController().signal,
        })) {
          void _;
        }
      })(),
    ).rejects.toMatchObject({ code: 'incomplete_response' });
  });
  it('keeps Ollama opt-in and loopback-only, lists installed models, and rejects embeddings-only models', async () => {
    expect(() => ollamaBase()).toThrow();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TERRALAB_AI_LOCAL_DEV', '1');
    vi.stubEnv('TERRALAB_AI_OLLAMA_ENABLED', '1');
    vi.stubEnv('TERRALAB_AI_OLLAMA_URL', 'http://169.254.169.254');
    expect(() => ollamaBase()).toThrow();
    vi.stubEnv('TERRALAB_AI_OLLAMA_URL', 'http://127.0.0.1:11434');
    fetcher.mockRejectedValue(Error(secret));
    await expect(
      textProviders.ollama.models({ key: '', signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
    fetcher.mockResolvedValue(new Response('{"models":[]}'));
    await expect(
      textProviders.ollama.models({ key: '', signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'unsupported_model' });
    fetcher.mockResolvedValue(new Response('{"capabilities":["embedding"]}'));
    await expect(
      (async () => {
        for await (const _ of textProviders.ollama.stream('embedding', [], {
          key: '',
          signal: new AbortController().signal,
        })) {
          void _;
        }
      })(),
    ).rejects.toMatchObject({ code: 'unsupported_model' });
  });
});
