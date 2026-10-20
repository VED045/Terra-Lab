// Executes the unmodified migrations in PostgreSQL WASM. Auth/Storage service tables
// are minimal fixtures; this proves SQL grants/RLS/RPC behavior, not hosted Auth/Storage HTTP.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite({ extensions: { pgcrypto } });
let passed = 0;
const owner = '10000000-0000-4000-8000-000000000001',
  viewer = '10000000-0000-4000-8000-000000000002',
  editor = '10000000-0000-4000-8000-000000000003',
  stranger = '10000000-0000-4000-8000-000000000004';
const pid = '20000000-0000-4000-8000-000000000001';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(role, user) {
  await db.exec('RESET ROLE');
  await query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
  await db.exec('SET ROLE ' + role);
}
async function ok(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}
async function denied(sql, args = []) {
  await assert.rejects(() => query(sql, args));
}
try {
  await db.exec(await readFile('scripts/fixtures/auth-storage.sql', 'utf8'));
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
  await ok('all versioned migrations execute', async () =>
    assert.equal((await query('select count(*)::int as n from public.projects'))[0].n, 0),
  );
  const config = {
    ...JSON.parse(await readFile('docs/examples/timing-clean.request.json', 'utf8')).project,
    id: pid,
    name: 'Research',
  };
  await as('authenticated', owner);
  const save = async (c, v) =>
    (
      await query('select public.save_research_project($1::jsonb,$2) as config', [
        JSON.stringify(c),
        v,
      ])
    )[0].config;
  let saved = await save(config, null);
  await ok('incomplete and structurally invalid project payloads rejected by RPC', async () => {
    await denied('select public.save_research_project($1::jsonb,null)', [
      JSON.stringify({ schemaVersion: 1, id: crypto.randomUUID(), name: 'Broken', objects: [] }),
    ]);
    await denied('select public.save_research_project($1::jsonb,1)', [
      JSON.stringify({ ...saved, objects: [{ id: 'broken', kind: 'anchor', x: 'invalid', y: 0 }] }),
    ]);
  });
  await ok('owner creates structured revision 1', async () => assert.equal(saved.cloudVersion, 1));
  saved = await save({ ...saved, name: 'Research v2' }, 1);
  await ok('save increments version and preserves both revisions', async () =>
    assert.equal((await query('select count(*)::int as n from public.project_revisions'))[0].n, 2),
  );
  await ok('stale save conflicts without overwriting', async () => {
    await denied('select public.save_research_project($1::jsonb,1)', [JSON.stringify(config)]);
    assert.equal((await query('select version from public.projects'))[0].version, 2);
  });
  await ok('direct writes bypassing version RPC denied', () =>
    denied('update public.projects set name=$1 where id=$2', ['bypass', pid]),
  );
  await query("select public.manage_project_member($1,$2,'viewer')", [pid, viewer]);
  await query("select public.manage_project_member($1,$2,'editor')", [pid, editor]);
  await as('authenticated', stranger);
  await ok('stranger cannot read projects, revisions, jobs, exports or runs', async () => {
    for (const table of [
      'projects',
      'project_revisions',
      'research_jobs',
      'experiment_runs',
      'storage.objects',
    ])
      assert.equal((await query('select * from ' + table)).length, 0);
  });
  await ok('stranger cannot save, delete, restore, grant access or create shares', async () => {
    await denied('select public.save_research_project($1::jsonb,2)', [JSON.stringify(config)]);
    for (const sql of [
      'delete_research_project($1)',
      'restore_project_revision($1,1,2)',
      `manage_project_member($1,'${stranger}','editor')`,
      `create_research_share($1,'editor','project')`,
    ])
      await denied('select public.' + sql, [pid]);
  });
  await as('authenticated', viewer);
  await ok('viewer reads but cannot edit/delete/run/grant', async () => {
    assert.equal((await query('select * from public.projects')).length, 1);
    await denied('select public.save_research_project($1::jsonb,2)', [JSON.stringify(config)]);
    await denied('select public.delete_research_project($1)', [pid]);
    await denied('select public.enqueue_research_job($1::jsonb,gen_random_uuid())', [
      JSON.stringify({ project: config, config: {} }),
    ]);
    await denied('select public.manage_project_member($1,$2,$3)', [pid, stranger, 'editor']);
  });
  await as('authenticated', editor);
  saved = await save({ ...saved, name: 'Editor revision' }, 2);
  await ok('editor can version but cannot delete or share', async () => {
    assert.equal(saved.cloudVersion, 3);
    await denied('select public.delete_research_project($1)', [pid]);
    await denied("select public.create_research_share($1,'viewer','project')", [pid]);
  });
  await as('authenticated', owner);
  const token = (
    await query("select public.create_research_share($1,'viewer','configuration') as token", [pid])
  )[0].token;
  await ok('share token is 244 random bits, stored hashed only', async () => {
    assert.equal(token.length, 64);
    assert.notEqual(
      (await query('select token_hash from public.share_links'))[0].token_hash,
      token,
    );
  });
  await as('anon', null);
  await ok('anonymous reads and invitation redemption denied', async () => {
    await denied('select * from public.projects');
    await denied('select public.redeem_research_share($1)', [token]);
  });
  await as('authenticated', stranger);
  await ok('invalid invitation denied', () =>
    denied('select public.redeem_research_share($1)', ['0'.repeat(64)]),
  );
  await query('select public.redeem_research_share($1)', [token]);
  await ok('valid invitation grants viewer access', async () =>
    assert.equal((await query('select * from public.projects')).length, 1),
  );
  await as('authenticated', owner);
  const link = (await query('select id from public.share_links'))[0].id;
  await query('select public.revoke_research_share($1)', [link]);
  await query('select public.manage_project_member($1,$2,null)', [pid, stranger]);
  await as('authenticated', stranger);
  await ok('revocation prevents redemption and member removal removes data access', async () => {
    await denied('select public.redeem_research_share($1)', [token]);
    assert.equal((await query('select * from public.projects')).length, 0);
  });
  await as('authenticated', owner);
  const team = (await query("select public.create_research_team('Research team') as id"))[0].id;
  await query("select public.manage_team_member($1,$2,'viewer')", [team, stranger]);
  await query('select public.assign_project_team($1,$2,3)', [pid, team]);
  await as('authenticated', stranger);
  await ok('team viewer reads project but cannot promote self', async () => {
    assert.equal((await query('select * from public.projects')).length, 1);
    await denied("select public.manage_team_member($1,$2,'editor')", [team, stranger]);
    await denied('select public.save_research_project($1::jsonb,4)', [JSON.stringify(config)]);
  });
  await as('authenticated', owner);
  await query('select public.manage_team_member($1,$2,null)', [team, stranger]);
  await ok('restore creates a new revision rather than mutating history', async () => {
    const r = (await query('select public.restore_project_revision($1,1,4) as r', [pid]))[0].r;
    assert.equal(r.cloudVersion, 5);
    assert.equal((await query('select count(*)::int as n from public.project_revisions'))[0].n, 5);
  });
  const key = '30000000-0000-4000-8000-000000000001';
  const request = { project: config, config: { seed: 123 } };
  const job = (
    await query('select public.enqueue_research_job($1::jsonb,$2) as id', [
      JSON.stringify(request),
      key,
    ])
  )[0].id;
  await ok(
    'duplicate submission returns same job; changed request with same key conflicts',
    async () => {
      assert.equal(
        (
          await query('select public.enqueue_research_job($1::jsonb,$2) as id', [
            JSON.stringify(request),
            key,
          ])
        )[0].id,
        job,
      );
      await denied('select public.enqueue_research_job($1::jsonb,$2)', [
        JSON.stringify({ ...request, config: { seed: 456 } }),
        key,
      ]);
    },
  );
  await ok(
    'users cannot claim, heartbeat, finalize, mutate runs, or upload worker results',
    async () => {
      await denied('select public.claim_research_job()');
      await denied('update public.research_jobs set status=$1 where id=$2', ['completed', job]);
      await denied("insert into storage.objects(bucket_id,name) values('research-results',$1)", [
        job + '/fake.json',
      ]);
      await denied('delete from public.experiment_runs');
    },
  );
  await as('service_role', null);
  let claimed = (await query('select public.claim_research_job() as job'))[0].job;
  await ok('worker claims one lease, second claim returns no job', async () => {
    assert.equal(claimed.id, job);
    assert.equal((await query('select public.claim_research_job() as job'))[0].job, null);
  });
  await ok('stale worker cannot publish', () =>
    denied(
      "select public.finish_research_job($1,gen_random_uuid(),'completed','{}','[]','[]','0.2.0',1,1,null)",
      [job],
    ),
  );
  await as('authenticated', owner);
  await query('select public.cancel_research_job($1)', [job]);
  await as('service_role', null);
  await ok('cancellation survives database roundtrip and reaches heartbeat', async () =>
    assert.equal(
      (
        await query('select public.heartbeat_research_job($1,$2,1,2) as cancel', [
          job,
          claimed.lease_token,
        ])
      )[0].cancel,
      true,
    ),
  );
  await query(
    "select public.finish_research_job($1,$2,'cancelled','{}','[]','[]','0.2.0',1,2,null)",
    [job, claimed.lease_token],
  );
  await query("insert into storage.objects(bucket_id,name) values('research-results',$1)", [
    job + '/part-0.json',
  ]);
  await as('authenticated', viewer);
  await ok(
    'viewer can read result manifest and result storage through project permission',
    async () => {
      assert.equal((await query('select * from public.experiment_runs')).length, 1);
      assert.equal(
        (await query("select * from storage.objects where bucket_id='research-results'")).length,
        1,
      );
    },
  );
  const artifactPath = `${viewer}/${job}/40000000-0000-4000-8000-000000000001.svg`;
  await query("insert into storage.objects(bucket_id,name) values('research-artifacts',$1)", [
    artifactPath,
  ]);
  await query("select public.record_research_artifact($1,'svg',$2,$3,100)", [
    job,
    artifactPath,
    'a'.repeat(64),
  ]);
  await ok(
    'authorized exports are append-only records with immutable storage objects',
    async () => {
      assert.equal((await query('select * from public.research_artifacts')).length, 1);
      await denied('update public.research_artifacts set bytes=1');
      assert.equal(
        (
          await query(
            "update storage.objects set name='changed' where bucket_id='research-artifacts' returning id",
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await query(
            "delete from storage.objects where bucket_id='research-artifacts' returning id",
          )
        ).length,
        0,
      );
    },
  );
  await as('authenticated', stranger);
  await ok('unauthorized export artifacts cannot be read, inserted or published', async () => {
    assert.equal((await query('select * from public.research_artifacts')).length, 0);
    await denied("insert into storage.objects(bucket_id,name) values('research-artifacts',$1)", [
      `${stranger}/${job}/40000000-0000-4000-8000-000000000002.pdf`,
    ]);
    await denied("select public.record_research_artifact($1,'pdf',$2,$3,100)", [
      job,
      artifactPath,
      'a'.repeat(64),
    ]);
  });
  await as('authenticated', owner);
  const retryJob = (
    await query('select public.enqueue_research_job($1::jsonb,gen_random_uuid()) as id', [
      JSON.stringify(request),
    ])
  )[0].id;
  await as('service_role', null);
  const first = (await query('select public.claim_research_job() as j'))[0].j;
  await query("update public.research_jobs set lease_until=now()-interval '1 minute' where id=$1", [
    retryJob,
  ]);
  const second = (await query('select public.claim_research_job() as j'))[0].j;
  await ok('expired worker restarts from request under a new fenced lease', async () => {
    assert.equal(second.id, retryJob);
    assert.equal(second.attempts, 2);
    assert.notEqual(first.lease_token, second.lease_token);
    await denied('select public.heartbeat_research_job($1,$2,1,2)', [retryJob, first.lease_token]);
  });
  await query("update public.research_jobs set lease_until=now()-interval '1 minute' where id=$1", [
    retryJob,
  ]);
  await query('select public.claim_research_job()');
  await ok('exhausted retries become interrupted instead of remaining abandoned', async () =>
    assert.equal(
      (await query('select status from public.research_jobs where id=$1', [retryJob]))[0].status,
      'interrupted',
    ),
  );
  await as('authenticated', owner);
  const abandoned = (
    await query('select public.enqueue_research_job($1::jsonb,gen_random_uuid()) as id', [
      JSON.stringify(request),
    ])
  )[0].id;
  await as('service_role', null);
  await query("update public.research_jobs set created_at=now()-interval '2 days' where id=$1", [
    abandoned,
  ]);
  await query('select public.claim_research_job()');
  await ok('unclaimed jobs expire after 24 hours', async () =>
    assert.equal(
      (await query('select status from public.research_jobs where id=$1', [abandoned]))[0].status,
      'failed',
    ),
  );
  await as('authenticated', owner);
  for (let i = 0; i < 4; i++)
    await query('select public.enqueue_research_job($1::jsonb,gen_random_uuid())', [
      JSON.stringify(request),
    ]);
  await ok('per-user queue resource cap enforced even for direct RPC callers', () =>
    denied('select public.enqueue_research_job($1::jsonb,gen_random_uuid())', [
      JSON.stringify(request),
    ]),
  );
  await ok('history cannot be mutated or deleted by owner or viewer', async () => {
    await denied('update public.experiment_runs set metrics=$1', ['[]']);
    await denied('delete from public.project_revisions');
    await as('authenticated', owner);
    await denied('delete from public.experiment_runs');
    await denied('select public.delete_research_project($1)', [pid]);
  });
  await as('authenticated', stranger);
  await ok(
    'unauthorized user cannot read or export shared project results or raw chunks',
    async () => {
      assert.equal((await query('select * from public.experiment_runs')).length, 0);
      assert.equal((await query('select * from public.research_jobs')).length, 0);
      assert.equal((await query('select * from storage.objects')).length, 0);
    },
  );
  console.log(
    `Database: ${passed} checks passed (actual PostgreSQL SQL/RLS; Auth/Storage fixture tables).`,
  );
} finally {
  await db.close();
}
