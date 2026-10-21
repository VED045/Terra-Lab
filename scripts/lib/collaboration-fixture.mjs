// TEST ONLY. Real PostgreSQL/RLS, simulated Supabase Auth transport; no hosted access.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
export const users = ['owner', 'viewer', 'editor', 'outsider'].map((name, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  email: `${name}@example.test`,
  name,
}));
export async function collaborationFixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(await readFile('scripts/fixtures/auth-storage.sql', 'utf8'));
  await db.exec(
    'alter table auth.users add column email text; alter table auth.users add column email_confirmed_at timestamptz',
  );
  for (const u of users)
    await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2', [
      u.email,
      u.id,
    ]);
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
  let queue = Promise.resolve();
  function sql(user, sql, args = []) {
    const job = queue.then(async () => {
      await db.exec('begin');
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']);
        await db.exec('set local role ' + (user ? 'authenticated' : 'anon'));
        const result = await db.query(sql, args);
        await db.exec('commit');
        return result.rows;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    });
    queue = job.catch(() => {});
    return job;
  }
  function rpc(user, name, params = {}) {
    if (!/^[a-z_]+$/.test(name) || Object.keys(params).some((k) => !/^p_[a-z_]+$/.test(k)))
      throw Error('Invalid fixture RPC');
    return sql(
      user,
      `select public.${name}(${Object.keys(params)
        .map((k, i) => `${k}=>$${i + 1}`)
        .join(',')}) as value`,
      Object.values(params),
    ).then((r) => r[0]?.value);
  }
  const owner = users[0].id;
  const team = await rpc(owner, 'create_research_team', { p_name: 'Positioning studio' });
  for (const u of users)
    await rpc(u.id, 'save_peer_profile', {
      p_username: u.name + '_lab',
      p_name: u.name[0].toUpperCase() + u.name.slice(1) + ' Researcher',
      p_discoverable: u.name !== 'outsider',
      p_email_lookup: true,
      p_studio: u.id === owner ? team : null,
    });
  const config = JSON.parse(
    await readFile('docs/examples/timing-clean.request.json', 'utf8'),
  ).project;
  const projectId = '20000000-0000-4000-8000-000000000011',
    privateId = '20000000-0000-4000-8000-000000000012';
  await rpc(owner, 'save_research_project', {
    p_config: { ...config, id: projectId, name: 'Assigned studio project' },
    p_expected: null,
  });
  await rpc(owner, 'save_research_project', {
    p_config: { ...config, id: privateId, name: 'Confidential receiver study' },
    p_expected: null,
  });
  await rpc(owner, 'assign_project_team', { p_id: projectId, p_team: team, p_expected: 1 });
  return { db, sql, rpc, team, projectId, privateId, users, close: () => db.close() };
}
