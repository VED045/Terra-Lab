// Explicit opt-in, isolated STAGING projects/accounts only. Never prints credentials.
// This is real Supabase Auth/PostgREST acceptance, separate from protocol fixtures.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.TERRALAB_ACCEPTANCE_URL;
const key = process.env.TERRALAB_ACCEPTANCE_PUBLIC_KEY;
const staging = process.env.TERRALAB_ACCEPTANCE_STAGING_REF;
const roles = ['OWNER', 'EDITOR', 'VIEWER', 'OUTSIDER'];
const required = [
  url,
  key,
  staging,
  ...roles.flatMap((role) => [
    process.env[`TERRALAB_ACCEPTANCE_${role}_EMAIL`],
    process.env[`TERRALAB_ACCEPTANCE_${role}_PASSWORD`],
  ]),
];
if (process.env.TERRALAB_ACCEPTANCE_ALLOW_MUTATIONS !== '1' || required.some((v) => !v)) {
  console.error(
    'PENDING: provide isolated staging URL/public key/ref and four test-account credentials through environment variables; explicitly set TERRALAB_ACCEPTANCE_ALLOW_MUTATIONS=1. See docs/acceptance/COLLABORATION_TEST_PLAN.md.',
  );
  process.exit(2);
}
assert.equal(url, `https://${staging}.supabase.co`, 'Staging reference must match target URL');
assert.notEqual(
  staging,
  'rkhtwvsryzldikzfwrbj',
  'Existing user project is excluded from automated mutation tests',
);
assert.ok(!key.startsWith('sb_secret_'), 'Use public key only');
if (key.split('.').length === 3) {
  assert.equal(
    JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role,
    'anon',
    'Use public anon key only',
  );
}
let checks = 0;
const clients = {},
  identities = {};
const createdProjects = [];
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Error(`${name} failed (${error.code || 'unknown'})`);
  return data;
}
async function cannot(client, name, args, code) {
  const { error } = await client.rpc(name, args);
  assert.ok(error, `${name} unexpectedly permitted`);
  if (code) assert.equal(error.code, code);
}
async function count(client, table, id) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(table === 'projects' ? 'id' : 'project_id', id);
  if (error) throw Error(`${table} read failed (${error.code || 'unknown'})`);
  return data.length;
}
function pass(label) {
  checks++;
  console.log('PASS ' + label);
}
try {
  for (const role of roles) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: process.env[`TERRALAB_ACCEPTANCE_${role}_EMAIL`],
      password: process.env[`TERRALAB_ACCEPTANCE_${role}_PASSWORD`],
    });
    if (error || !data.user) throw Error('Isolated ' + role + ' account sign-in failed');
    clients[role] = client;
    identities[role] = data.user.id;
  }
  assert.equal(
    new Set(Object.values(identities)).size,
    4,
    'Use four distinct isolated test identities',
  );
  pass('four independent real Auth sessions');
  const fixture = JSON.parse(
    await readFile('docs/examples/timing-clean.request.json', 'utf8'),
  ).project;
  const id = crypto.randomUUID();
  const config = {
    ...fixture,
    id,
    name: 'Phase 4A isolated acceptance ' + id.slice(0, 8),
    archived: false,
  };
  delete config.cloudVersion;
  delete config.cloudOwnerId;
  let saved = await rpc(clients.OWNER, 'save_research_project', {
    p_config: config,
    p_expected: null,
  });
  createdProjects.push(id);
  assert.equal(saved.cloudVersion, 1);
  assert.equal(await count(clients.OWNER, 'project_revisions', id), 1);
  pass('owner save/reload/revision');
  for (const role of ['EDITOR', 'VIEWER']) {
    const token = await rpc(clients.OWNER, 'create_research_share', {
      p_id: id,
      p_role: role.toLowerCase(),
      p_kind: 'project',
      p_target: null,
    });
    const redemption = await rpc(clients[role], 'redeem_research_share', { p_token: token });
    assert.equal(redemption.role, role.toLowerCase());
    assert.equal(await count(clients[role], 'projects', id), 1);
    if (role === 'VIEWER') {
      await rpc(clients.VIEWER, 'redeem_research_share', { p_token: token });
      pass('repeat redemption follows reusable-link contract');
    }
  }
  pass('real authenticated viewer/editor invitation redemption');
  assert.equal(await count(clients.OUTSIDER, 'projects', id), 0);
  assert.equal(await count(clients.OUTSIDER, 'project_revisions', id), 0);
  await cannot(
    clients.OUTSIDER,
    'save_research_project',
    { p_config: saved, p_expected: 1 },
    '42501',
  );
  await cannot(
    clients.VIEWER,
    'save_research_project',
    { p_config: saved, p_expected: 1 },
    '42501',
  );
  for (const role of ['EDITOR', 'VIEWER', 'OUTSIDER']) {
    await cannot(clients[role], 'delete_research_project', { p_id: id }, '42501');
    await cannot(
      clients[role],
      'manage_project_member',
      { p_id: id, p_user: identities.OUTSIDER, p_role: 'editor' },
      '42501',
    );
  }
  pass('outsider isolation, viewer denial and owner-only actions');
  const stale = saved;
  saved = await rpc(clients.EDITOR, 'save_research_project', {
    p_config: { ...saved, name: config.name + ' editor' },
    p_expected: 1,
  });
  assert.equal(saved.cloudVersion, 2);
  await cannot(clients.OWNER, 'save_research_project', { p_config: stale, p_expected: 1 }, '40001');
  assert.equal(await count(clients.OWNER, 'project_revisions', id), 2);
  pass('editor save and stale-owner conflict preserve immutable revisions');
  const copy = { ...stale, id: crypto.randomUUID(), name: config.name + ' copy' };
  delete copy.cloudVersion;
  delete copy.cloudOwnerId;
  await rpc(clients.OWNER, 'save_research_project', { p_config: copy, p_expected: null });
  createdProjects.push(copy.id);
  assert.equal(await count(clients.OUTSIDER, 'projects', copy.id), 0);
  pass('save-copy creates an independent private project');
  await rpc(clients.OWNER, 'manage_project_member', {
    p_id: id,
    p_user: identities.VIEWER,
    p_role: null,
  });
  assert.equal(await count(clients.VIEWER, 'projects', id), 0);
  assert.equal(await count(clients.VIEWER, 'project_revisions', id), 0);
  pass('already-authenticated viewer loses server reads after grant removal');
  // Storage probes use a unique never-existing object in our own isolated project.
  // Actual published chunks require the separately authorized staging API/worker checklist.
  const { error: storageError } = await clients.OUTSIDER.storage
    .from('research-results')
    .download(`${id}/${crypto.randomUUID()}/part-0.json`);
  assert.ok(storageError);
  pass(
    'outsider cannot download isolated nonexistent chunk (positive published-object test remains PENDING)',
  );
  console.log(
    `Hosted Auth/PostgREST subset: ${checks} checks passed. Actual shared run/Storage, browser account lifecycle, team and worker-restart acceptance remain PENDING until checklist execution.`,
  );
} catch (error) {
  console.error('FAIL ' + (error instanceof Error ? error.message : 'Hosted acceptance failed'));
  process.exitCode = 1;
} finally {
  for (const id of createdProjects.reverse()) {
    try {
      await rpc(clients.OWNER, 'delete_research_project', { p_id: id });
    } catch {
      console.error('PENDING cleanup of isolated acceptance project ' + id);
      process.exitCode = 1;
    }
  }
  for (const client of Object.values(clients)) await client.auth.signOut({ scope: 'local' });
}
