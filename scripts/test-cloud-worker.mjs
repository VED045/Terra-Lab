// Real FastAPI + Python worker + actual PostgreSQL migrations, using a local
// PostgREST/Storage protocol fixture. No hosted Supabase JWT or production claim.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new PGlite({ extensions: { pgcrypto } }),
  owner = '10000000-0000-4000-8000-000000000001',
  stranger = '10000000-0000-4000-8000-000000000004',
  stored = new Map();
await db.exec(await readFile('scripts/fixtures/auth-storage.sql', 'utf8'));
for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
const allowed = new Set([
  'save_research_project',
  'enqueue_research_job',
  'cancel_research_job',
  'claim_research_job',
  'heartbeat_research_job',
  'finish_research_job',
]);
const server = createServer(async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const service = req.headers.apikey === 'fixture-service' && token === 'fixture-service';
    if (
      !service &&
      (![owner, stranger].includes(token) || req.headers.apikey !== 'fixture-public')
    ) {
      res.writeHead(401);
      res.end('{}');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks),
      url = new URL(req.url, 'http://fixture');
    const result = await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${service ? 'service_role' : 'authenticated'}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [service ? '' : token]);
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1);
        if (!allowed.has(name)) throw Error('RPC unavailable');
        const body = JSON.parse(bytes.toString() || '{}'),
          keys = Object.keys(body);
        if (!keys.every((k) => /^p_[a-z_]+$/.test(k))) throw Error('Invalid parameter');
        const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) as value`;
        const args = keys.map((k) =>
          body[k] && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k],
        );
        return (await tx.query(sql, args)).rows[0].value;
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.split('/').at(-1);
        if (!['research_jobs', 'experiment_runs'].includes(table)) throw Error('Table unavailable');
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return (await tx.query(`select * from public.${table} where id=$1`, [id])).rows;
      }
      if (
        url.pathname.startsWith('/storage/v1/object/research-results/') &&
        req.method === 'POST' &&
        service
      ) {
        const path = url.pathname.split('/research-results/')[1];
        if (stored.has(path)) throw Error('Immutable object already exists');
        await tx.query(
          "insert into storage.objects(bucket_id,name) values('research-results',$1)",
          [path],
        );
        stored.set(path, bytes);
        return { Key: path };
      }
      throw Error('Unknown fixture request');
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result ?? null));
  } catch (e) {
    res.writeHead(e.code === '42501' ? 403 : e.code === '40001' ? 409 : 400, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ message: String(e.message).slice(0, 300) }));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const cloudUrl = `http://127.0.0.1:${server.address().port}`;
const portProbe = createServer();
await new Promise((r) => portProbe.listen(0, '127.0.0.1', r));
const port = portProbe.address().port;
await new Promise((r) => portProbe.close(r));
const python = resolve(
    process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  ),
  env = {
    ...process.env,
    PYTHONPATH: resolve('services/api'),
    TERRALAB_ENV: 'production',
    TERRALAB_JOB_MODE: 'supabase',
    SUPABASE_URL: cloudUrl,
    SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    OPENBLAS_NUM_THREADS: '1',
  };
let api, worker;
let logs = '';
const collect = (p) => {
  p.stdout.on('data', (c) => (logs += c));
  p.stderr.on('data', (c) => (logs += c));
  return p;
};
try {
  api = collect(
    spawn(
      python,
      ['-m', 'uvicorn', 'terralab.main:app', '--host', '127.0.0.1', '--port', String(port)],
      { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (api.exitCode !== null) throw Error('API stopped: ' + logs);
    try {
      ready = (await fetch(base + '/health')).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(ready, 'API starts');
  const raw = JSON.parse(await readFile('docs/examples/timing-clean.request.json', 'utf8'));
  raw.project.id = randomUUID();
  for (const o of raw.project.objects)
    if (o.kind === 'anchor') {
      o.noise = 0;
      o.timingUncertainty = 0;
    }
  raw.config = {
    ...raw.config,
    trials: 2,
    duration: 2,
    sweep: 'none',
    timingNs: 0,
    estimators: ['ls', 'wls', 'huber'],
  };
  // Keep one receiver for 18 estimator epochs.
  let firstReceiver = true;
  raw.project.objects = raw.project.objects.filter(
    (o) => o.kind !== 'receiver' || (firstReceiver ? ((firstReceiver = false), true) : false),
  );
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${owner}`,
    'Idempotency-Key': randomUUID(),
  };
  const call = async (path, method = 'GET', body, who = owner) =>
    fetch(base + path, {
      method,
      headers: { ...headers, Authorization: `Bearer ${who}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  const save = await fetch(cloudUrl + '/rest/v1/rpc/save_research_project', {
    method: 'POST',
    headers: {
      apikey: 'fixture-public',
      Authorization: `Bearer ${owner}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_config: raw.project, p_expected: null }),
  });
  assert(save.ok, await save.text());
  const submitted = await call('/experiments', 'POST', raw);
  assert.equal(submitted.status, 202);
  const { id } = await submitted.json();
  assert.equal(
    (await (await call('/experiments', 'POST', raw)).json()).id,
    id,
    'duplicate submission deduplicated',
  );
  assert.equal(
    (await call('/experiments/' + id, 'GET', undefined, stranger)).status,
    404,
    'stranger cannot read job',
  );
  worker = collect(
    spawn(python, ['-m', 'terralab.worker'], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  let status;
  for (let i = 0; i < 200; i++) {
    status = await (await call('/experiments/' + id)).json();
    if (!['queued', 'running'].includes(status.status)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(status.status, 'completed', JSON.stringify(status) + '\n' + logs);
  assert.equal(status.completed, 18);
  const detail = await (await call('/experiments/' + id + '?detail=true')).json();
  assert(detail.manifest, 'atomic result publication');
  const payload = Buffer.concat(
    detail.manifest.paths.map((path) =>
      Buffer.from(JSON.parse(stored.get(path).toString()).base64, 'base64'),
    ),
  );
  assert.equal(payload.length, detail.manifest.bytes);
  assert.equal(createHash('sha256').update(payload).digest('hex'), detail.manifest.sha256);
  const result = JSON.parse(payload);
  assert.equal(result.records.length, 18);
  assert(result.records.every((r) => r.errorM !== null && r.errorM < 1e-6));
  assert.equal(result.id, id);
  console.log(
    'PASS durable HTTP flow: FastAPI → PostgreSQL/RLS/idempotent queue → real worker → immutable Storage envelopes → atomic manifest → exact 18 noiseless epochs; stranger denied. Auth/Storage HTTP are fixtures, not live Supabase validation.',
  );
} finally {
  for (const p of [worker, api])
    if (p && p.exitCode === null) {
      p.kill();
      await new Promise((r) => p.once('exit', r));
    }
  await new Promise((r) => server.close(r));
  await db.close();
}
