import assert from 'node:assert/strict';
import { collaborationFixture } from './lib/collaboration-fixture.mjs';
const f = await collaborationFixture(),
  [owner, viewer, editor, outsider] = f.users.map((u) => u.id);
let checks = 0;
const rpc = f.rpc,
  state = (u) => rpc(u, 'collaboration_state'),
  denied = (u, name, args) => assert.rejects(() => rpc(u, name, args));
async function check(name, fn) {
  await fn();
  checks++;
  console.log('PASS ' + name);
}
try {
  await check('anonymous cannot access any collaboration RPC', async () => {
    for (const [name, args] of [
      ['collaboration_state', {}],
      ['find_collaboration_peer', { p_query: 'owner_lab' }],
      ['request_studio_access', { p_peer: owner, p_role: 'viewer' }],
      [
        'save_peer_profile',
        { p_username: 'anon_lab', p_name: 'Anon', p_discoverable: true, p_email_lookup: true },
      ],
      ['mark_collaboration_read', {}],
    ])
      await denied(null, name, args);
  });
  await check('no directory listing, partial or private email lookup', async () => {
    assert.equal((await rpc(viewer, 'find_collaboration_peer', { p_query: 'own' })).peer, null);
    assert.equal(
      (await rpc(viewer, 'find_collaboration_peer', { p_query: 'outsider@example.test' })).peer,
      null,
    );
    assert.equal(
      (await rpc(viewer, 'find_collaboration_peer', { p_query: 'viewer_lab' })).peer,
      null,
    );
    await denied(viewer, 'find_collaboration_peer', { p_query: 'owner%' });
    const found = await rpc(viewer, 'find_collaboration_peer', { p_query: ' OWNER@EXAMPLE.TEST ' });
    assert.equal(found.peer.id, owner);
    assert.equal(found.peer.email, undefined);
    assert.equal((await f.sql(viewer, 'select * from public.peer_profiles')).length, 1);
    await denied(viewer, 'save_peer_profile', {
      p_username: 'owner_lab',
      p_name: 'Fake',
      p_discoverable: true,
      p_email_lookup: true,
    });
    await denied(viewer, 'save_peer_profile', {
      p_username: 'viewer_lab',
      p_name: 'Viewer',
      p_discoverable: true,
      p_email_lookup: true,
      p_studio: f.team,
    });
  });
  await check('lookup rate cap persists on no-match searches', async () => {
    for (let i = 0; i < 61; i++)
      await rpc(outsider, 'find_collaboration_peer', { p_query: 'absent_lab' });
    assert.equal(
      (await rpc(outsider, 'find_collaboration_peer', { p_query: 'owner_lab' })).limited,
      true,
    );
  });
  let request;
  await check(
    'self/invalid requests denied; duplicate retries create one pending request and one notification',
    async () => {
      await denied(owner, 'request_studio_access', { p_peer: owner, p_role: 'viewer' });
      await denied(viewer, 'request_studio_access', { p_peer: owner, p_role: 'owner' });
      request = await rpc(viewer, 'request_studio_access', {
        p_peer: owner,
        p_role: 'viewer',
        p_message: 'Research access',
      });
      assert.equal(
        await rpc(viewer, 'request_studio_access', { p_peer: owner, p_role: 'viewer' }),
        request,
      );
      assert.equal((await state(viewer)).resources.length, 0);
      assert.equal((await state(owner)).requests.length, 1);
      assert.equal(
        (await state(owner)).notifications.filter((n) => n.item_id === request).length,
        1,
      );
      assert.equal((await state(outsider)).requests.length, 0);
      await denied(outsider, 'decide_access_request', { p_id: request, p_action: 'accepted' });
      await denied(viewer, 'decide_access_request', { p_id: request, p_action: 'accepted' });
    },
  );
  await check(
    'acceptance grants selected studio role only, explicit override; retry does not duplicate events',
    async () => {
      await rpc(owner, 'decide_access_request', {
        p_id: request,
        p_action: 'accepted',
        p_role: 'editor',
      });
      const before = (await state(viewer)).notifications.length;
      await rpc(owner, 'decide_access_request', {
        p_id: request,
        p_action: 'accepted',
        p_role: 'viewer',
      });
      const s = await state(viewer);
      assert.equal(s.notifications.length, before);
      assert.equal(s.requests[0].granted_role, 'editor');
      assert.equal(s.resources.find((r) => r.id === f.projectId).role, 'editor');
      assert.equal(
        s.resources.some((r) => r.id === f.privateId),
        false,
      );
      await denied(owner, 'decide_access_request', { p_id: request, p_action: 'rejected' });
    },
  );
  await check('owner guards and unauthorized role escalation denied', async () => {
    await denied(owner, 'manage_team_member', { p_team: f.team, p_user: owner, p_role: 'viewer' });
    await denied(owner, 'manage_project_member', {
      p_id: f.projectId,
      p_user: owner,
      p_role: null,
    });
    await denied(viewer, 'manage_team_member', {
      p_team: f.team,
      p_user: viewer,
      p_role: 'editor',
    });
    await denied(viewer, 'invite_collaboration_peers', {
      p_scope: 'studio',
      p_resource: f.team,
      p_peers: [editor],
      p_role: 'editor',
    });
  });
  await check(
    'membership revocation blocks subsequent reads; accepted-request replay cannot restore it',
    async () => {
      await rpc(owner, 'manage_team_member', { p_team: f.team, p_user: viewer, p_role: null });
      await rpc(owner, 'decide_access_request', { p_id: request, p_action: 'accepted' });
      assert.equal((await state(viewer)).resources.length, 0);
      assert.equal((await f.sql(viewer, 'select * from public.projects')).length, 0);
      assert.equal((await f.sql(viewer, 'select * from public.project_activity')).length, 0);
    },
  );
  await check(
    'rejection/withdrawal grant nothing; opposing decisions cannot change result',
    async () => {
      const r = await rpc(editor, 'request_studio_access', { p_peer: owner, p_role: 'editor' });
      await rpc(owner, 'decide_access_request', { p_id: r, p_action: 'rejected' });
      assert.equal((await state(editor)).resources.length, 0);
      await denied(owner, 'decide_access_request', { p_id: r, p_action: 'accepted' });
      const w = await rpc(editor, 'request_studio_access', { p_peer: owner, p_role: 'viewer' });
      await denied(owner, 'decide_access_request', { p_id: w, p_action: 'withdrawn' });
      await rpc(editor, 'decide_access_request', { p_id: w, p_action: 'withdrawn' });
      await denied(owner, 'decide_access_request', { p_id: w, p_action: 'accepted' });
    },
  );
  let invitation;
  await check(
    'targeted invitations reuse share_links, dedupe and reveal no private resource names or hashes',
    async () => {
      const args = {
        p_scope: 'project',
        p_resource: f.privateId,
        p_peers: [viewer],
        p_role: 'viewer',
        p_message: 'Project-only offer',
      };
      await rpc(owner, 'invite_collaboration_peers', args);
      await rpc(owner, 'invite_collaboration_peers', args);
      const v = await state(viewer);
      assert.equal(v.invitations.length, 1);
      invitation = v.invitations[0].id;
      assert.equal(v.invitations[0].resource, 'Private project');
      assert.equal(v.invitations[0].token_hash, undefined);
      assert.equal(v.resources.length, 0);
      assert.equal((await f.sql(viewer, 'select * from public.share_links')).length, 0);
      assert.equal((await state(outsider)).invitations.length, 0);
      await denied(outsider, 'decide_collaboration_invitation', {
        p_id: invitation,
        p_action: 'accept',
      });
      await denied(owner, 'decide_collaboration_invitation', {
        p_id: invitation,
        p_action: 'accept',
      });
    },
  );
  await check(
    'conflicting duplicate offers fail without changing the reviewed pending role',
    async () => {
      await denied(owner, 'invite_collaboration_peers', {
        p_scope: 'project',
        p_resource: f.privateId,
        p_peers: [viewer],
        p_role: 'editor',
        p_message: 'Changed offer',
      });
      const pending = (await state(viewer)).invitations.find((i) => i.id === invitation);
      assert.equal(pending.role, 'viewer');
      assert.equal(pending.message, 'Project-only offer');
    },
  );
  await check(
    'project invitation grants project only; replay after revocation cannot grant again',
    async () => {
      await rpc(viewer, 'decide_collaboration_invitation', {
        p_id: invitation,
        p_action: 'accept',
      });
      let s = await state(viewer);
      assert.equal(s.resources.length, 1);
      assert.equal(s.resources[0].id, f.privateId);
      assert.equal(s.resources[0].role, 'viewer');
      assert.ok(s.resources[0].source.includes('accepted invitation'));
      await denied(viewer, 'manage_project_member', {
        p_id: f.privateId,
        p_user: editor,
        p_role: 'editor',
      });
      await rpc(owner, 'manage_project_member', {
        p_id: f.privateId,
        p_user: viewer,
        p_role: null,
      });
      await rpc(viewer, 'decide_collaboration_invitation', {
        p_id: invitation,
        p_action: 'accept',
      });
      assert.equal((await state(viewer)).resources.length, 0);
    },
  );
  await check(
    'notification reads and writes are recipient-only; retries preserve read state',
    async () => {
      const n = (await state(owner)).notifications[0];
      assert.ok(n);
      await rpc(viewer, 'mark_collaboration_read', { p_id: n.id });
      assert.equal((await state(owner)).notifications.find((x) => x.id === n.id).read_at, null);
      assert.equal(
        (
          await f.sql(viewer, 'select * from public.collaboration_notifications where id=$1', [
            n.id,
          ])
        ).length,
        0,
      );
      await rpc(owner, 'mark_collaboration_read', { p_id: n.id });
      const read = (await state(owner)).notifications.find((x) => x.id === n.id).read_at;
      await rpc(owner, 'mark_collaboration_read', { p_id: n.id });
      assert.equal((await state(owner)).notifications.find((x) => x.id === n.id).read_at, read);
      await assert.rejects(() =>
        f.sql(viewer, 'update public.collaboration_notifications set recipient_id=$1', [viewer]),
      );
    },
  );
  await check(
    'expired/rejected/revoked invitation decisions deny access; renew is owner only',
    async () => {
      await rpc(owner, 'invite_collaboration_peers', {
        p_scope: 'studio',
        p_resource: f.team,
        p_peers: [editor],
        p_role: 'viewer',
      });
      const i = (await state(editor)).invitations[0].id;
      await f.db.query(
        "update public.share_links set expires_at=now()-interval '1 second' where id=$1",
        [i],
      );
      await denied(editor, 'decide_collaboration_invitation', { p_id: i, p_action: 'accept' });
      await denied(editor, 'decide_collaboration_invitation', { p_id: i, p_action: 'renew' });
      await rpc(owner, 'decide_collaboration_invitation', { p_id: i, p_action: 'renew' });
      await rpc(editor, 'decide_collaboration_invitation', { p_id: i, p_action: 'reject' });
      await denied(editor, 'decide_collaboration_invitation', { p_id: i, p_action: 'accept' });
      await rpc(owner, 'invite_collaboration_peers', {
        p_scope: 'studio',
        p_resource: f.team,
        p_peers: [editor],
        p_role: 'viewer',
      });
      const j = (await state(editor)).invitations.find((x) => x.status === 'pending').id;
      await rpc(owner, 'decide_collaboration_invitation', { p_id: j, p_action: 'revoke' });
      await denied(editor, 'decide_collaboration_invitation', { p_id: j, p_action: 'accept' });
      assert.equal((await state(editor)).resources.length, 0);
    },
  );
  await check(
    'team invitation accepts correct inherited role and preserves stronger independent project access',
    async () => {
      await rpc(owner, 'manage_project_member', {
        p_id: f.projectId,
        p_user: editor,
        p_role: 'editor',
      });
      await rpc(owner, 'invite_collaboration_peers', {
        p_scope: 'studio',
        p_resource: f.team,
        p_peers: [editor],
        p_role: 'viewer',
      });
      const i = (await state(editor)).invitations.find((x) => x.status === 'pending').id;
      await rpc(editor, 'decide_collaboration_invitation', { p_id: i, p_action: 'accept' });
      assert.equal(
        (await state(editor)).resources.find((r) => r.id === f.projectId).role,
        'editor',
      );
      await rpc(owner, 'manage_project_member', {
        p_id: f.projectId,
        p_user: editor,
        p_role: null,
      });
      assert.equal(
        (await state(editor)).resources.find((r) => r.id === f.projectId).role,
        'viewer',
      );
      await rpc(owner, 'manage_team_member', { p_team: f.team, p_user: editor, p_role: null });
      assert.equal((await state(editor)).resources.length, 0);
    },
  );
  await check('batch invitations are atomic on an ineligible recipient', async () => {
    await denied(owner, 'invite_collaboration_peers', {
      p_scope: 'project',
      p_resource: f.privateId,
      p_peers: [editor, outsider],
      p_role: 'viewer',
    });
    assert.equal(
      (await state(editor)).invitations.filter((i) => i.resource_id === f.privateId).length,
      0,
    );
  });
  await check(
    'overlapping decision submissions resolve exactly once (serialized local connection)',
    async () => {
      const id = await rpc(viewer, 'request_studio_access', { p_peer: owner, p_role: 'viewer' });
      const results = await Promise.allSettled([
        rpc(owner, 'decide_access_request', { p_id: id, p_action: 'accepted' }),
        rpc(owner, 'decide_access_request', { p_id: id, p_action: 'rejected' }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'PT409');
      assert.equal((await state(viewer)).requests.find((r) => r.id === id).status, 'accepted');
      await rpc(owner, 'manage_team_member', { p_team: f.team, p_user: viewer, p_role: null });
    },
  );
  await check(
    'recipient-bound token redemption rejects outsiders and cannot replay a removed grant',
    async () => {
      await rpc(owner, 'invite_collaboration_peers', {
        p_scope: 'project',
        p_resource: f.privateId,
        p_peers: [editor],
        p_role: 'viewer',
      });
      const id = (await state(editor)).invitations.find(
        (i) => i.status === 'pending' && i.resource_id === f.privateId,
      ).id;
      const token = 'f'.repeat(64);
      await f.db.query(
        "update public.share_links set token_hash=encode(sha256(convert_to($1,'UTF8')),'hex') where id=$2",
        [token, id],
      );
      await denied(outsider, 'redeem_research_share', { p_token: token });
      await rpc(editor, 'redeem_research_share', { p_token: token });
      assert.equal(
        (await state(editor)).resources.find((r) => r.id === f.privateId).role,
        'viewer',
      );
      await rpc(owner, 'manage_project_member', {
        p_id: f.privateId,
        p_user: editor,
        p_role: null,
      });
      await rpc(editor, 'redeem_research_share', { p_token: token });
      assert.equal(
        (await state(editor)).resources.some((r) => r.id === f.privateId),
        false,
      );
    },
  );
  await check(
    'shared-project updates notify current grantees privately and identical-save retries do not duplicate',
    async () => {
      await rpc(owner, 'manage_project_member', {
        p_id: f.projectId,
        p_user: viewer,
        p_role: 'viewer',
      });
      const row = (
        await f.sql(owner, 'select config,version from public.projects where id=$1', [f.projectId])
      )[0];
      const changed = { ...row.config, name: 'Shared revision update' };
      await rpc(owner, 'save_research_project', { p_config: changed, p_expected: row.version });
      const before = (await state(viewer)).notifications.filter(
        (n) => n.event === 'shared_project_updated' && n.item_id === f.projectId,
      ).length;
      assert.equal(before, 1);
      assert.equal(
        (await state(outsider)).notifications.filter((n) => n.item_id === f.projectId).length,
        0,
      );
      await rpc(owner, 'save_research_project', { p_config: changed, p_expected: row.version });
      assert.equal(
        (await state(viewer)).notifications.filter(
          (n) => n.event === 'shared_project_updated' && n.item_id === f.projectId,
        ).length,
        before,
      );
      await rpc(owner, 'manage_project_member', {
        p_id: f.projectId,
        p_user: viewer,
        p_role: null,
      });
      const fresh = (
        await f.sql(owner, 'select config,version from public.projects where id=$1', [f.projectId])
      )[0];
      await rpc(owner, 'save_research_project', {
        p_config: { ...fresh.config, name: 'After revoke' },
        p_expected: fresh.version,
      });
      assert.equal(
        (await state(viewer)).notifications.filter(
          (n) => n.event === 'shared_project_updated' && n.item_id === f.projectId,
        ).length,
        before,
      );
    },
  );
  await check(
    'new RPCs have explicit ACLs, all definer functions pin their search path',
    async () => {
      const functions = await f.db.query(
        "select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_peer_profile','find_collaboration_peer','request_studio_access','decide_access_request','invite_collaboration_peers','decide_collaboration_invitation','mark_collaboration_read','collaboration_state')",
      );
      assert.equal(functions.rows.length, 8);
      for (const fn of functions.rows) {
        assert.equal(fn.anonymous, false);
        assert.ok(fn.proconfig.includes('search_path=""'));
      }
    },
  );
  console.log(
    `Collaboration: ${checks} security/lifecycle groups passed (real local PostgreSQL; hosted acceptance pending).`,
  );
} finally {
  await f.close();
}
