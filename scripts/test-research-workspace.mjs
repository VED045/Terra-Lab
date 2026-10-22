import assert from 'node:assert/strict';
import { collaborationFixture } from './lib/collaboration-fixture.mjs';
const f = await collaborationFixture(),
  [owner, viewer, editor, outsider] = f.users.map((u) => u.id);
let checks = 0;
function passed(s) {
  checks++;
  console.log('PASS ' + s);
}
const denied = async (action) =>
  assert.rejects(
    action,
    /denied|required|permission|unavailable|member|Evidence|Invalid|must finish|VERSION_CONFLICT|Share the project|row-level security/i,
  );
try {
  await denied(() => f.rpc(null, 'research_workspace_index', { p_project: f.projectId }));
  passed('anonymous workspace access denied');
  await f.rpc(owner, 'manage_project_member', {
    p_id: f.projectId,
    p_user: viewer,
    p_role: 'viewer',
  });
  await f.rpc(owner, 'manage_project_member', {
    p_id: f.projectId,
    p_user: editor,
    p_role: 'editor',
  });
  const input = {
    id: '30000000-0000-4000-8000-000000000011',
    project_id: f.projectId,
    title: 'Research manuscript',
    authors: 'Team',
    source: 'Exact source $x^2$\n',
    evidence: [],
  };
  let d = await f.rpc(owner, 'save_research_document', { p_config: input, p_expected: null });
  assert.equal(d.version, 1);
  passed('owner creates faithful source and immutable first revision');
  assert.equal(
    (await f.rpc(editor, 'research_workspace_index', { p_project: f.projectId })).documents.length,
    0,
  );
  assert.equal((await f.sql(outsider, 'select * from public.research_documents')).length, 0);
  passed(
    'project membership alone does not expose a private manuscript; outsider direct reads empty',
  );
  await denied(() =>
    f.rpc(owner, 'share_research_document', { p_id: d.id, p_user: outsider, p_role: 'viewer' }),
  );
  passed('document sharing cannot grant project membership');
  await f.rpc(owner, 'share_research_document', { p_id: d.id, p_user: viewer, p_role: 'editor' });
  assert.equal(
    (await f.rpc(viewer, 'research_workspace_index', { p_project: f.projectId })).documents[0].role,
    'viewer',
  );
  await denied(() =>
    f.rpc(viewer, 'save_research_document', {
      p_config: { ...input, source: 'Forbidden' },
      p_expected: 1,
    }),
  );
  passed('project viewer remains read-only even with an editor document grant');
  await f.rpc(owner, 'share_research_document', { p_id: d.id, p_user: editor, p_role: 'editor' });
  d = await f.rpc(editor, 'save_research_document', {
    p_config: { ...input, source: 'Second revision' },
    p_expected: 1,
  });
  assert.equal(d.version, 2);
  await denied(() =>
    f.rpc(owner, 'save_research_document', {
      p_config: { ...input, source: 'Stale overwrite' },
      p_expected: 1,
    }),
  );
  passed('editor save succeeds; stale concurrent owner save conflicts');
  const before = (
    await f.sql(owner, 'select count(*)::int n from public.research_document_revisions')
  )[0].n;
  const same = await f.rpc(editor, 'save_research_document', {
    p_config: { ...input, source: 'Second revision' },
    p_expected: 2,
  });
  assert.equal(same.version, 2);
  assert.equal(
    (await f.sql(owner, 'select count(*)::int n from public.research_document_revisions'))[0].n,
    before,
  );
  passed('identical retry creates no duplicate revision');
  await denied(() =>
    f.sql(editor, 'update public.research_document_revisions set config=$1', [{}]),
  );
  passed('direct mutation of revisions is denied');
  d = await f.rpc(owner, 'save_research_document', { p_config: input, p_expected: 2 });
  assert.equal(d.version, 3);
  passed('restore writes a new revision without erasing history');
  await f.rpc(owner, 'share_research_document', { p_id: d.id, p_user: viewer, p_role: null });
  assert.equal(
    (await f.sql(viewer, 'select * from public.research_documents where id=$1', [d.id])).length,
    0,
  );
  passed('explicit document revocation blocks direct reads and history');
  await f.rpc(owner, 'manage_project_member', { p_id: f.projectId, p_user: editor, p_role: null });
  assert.equal(
    (await f.sql(editor, 'select * from public.research_documents where id=$1', [d.id])).length,
    0,
  );
  passed('project revocation overrides existing document grants');
  const asset = {
    id: '40000000-0000-4000-8000-000000000011',
    project_id: f.projectId,
    name: 'paper.pdf',
    collection: 'Sources',
    mime: 'application/pdf',
    bytes: 20,
    sha256: 'a'.repeat(64),
    path: `${owner}/${f.projectId}/40000000-0000-4000-8000-000000000011.pdf`,
    extraction: {
      status: 'ready',
      pages: [{ page: 1, text: 'Untrusted extracted source ' + '\u7814'.repeat(59973) }],
      truncated: false,
    },
    provenance: {},
  };
  await denied(() => f.rpc(owner, 'record_research_library_asset', { p_asset: asset }));
  passed('unfinished upload cannot publish metadata');
  await f.sql(owner, 'insert into storage.objects(bucket_id,name) values($1,$2)', [
    'research-library',
    asset.path,
  ]);
  const a = await f.rpc(owner, 'record_research_library_asset', { p_asset: asset });
  assert.equal(a.owner_id, owner);
  assert.equal(a.extraction.pages[0].text, asset.extraction.pages[0].text);
  passed('bounded multilingual PDF extraction survives UTF-8 metadata storage');
  assert.equal(
    (await f.sql(viewer, 'select * from storage.objects where name=$1', [asset.path])).length,
    1,
  );
  assert.equal(
    (await f.sql(outsider, 'select * from storage.objects where name=$1', [asset.path])).length,
    0,
  );
  passed('private library file visible only to current project members');
  assert.deepEqual(
    await f.rpc(viewer, 'search_research_assets', { p_project: f.projectId, p_query: 'source' }),
    [a.id],
  );
  assert.deepEqual(
    await f.rpc(viewer, 'search_research_assets', {
      p_project: f.projectId,
      p_query: 'not present',
    }),
    [],
  );
  await denied(() =>
    f.rpc(outsider, 'search_research_assets', { p_project: f.projectId, p_query: 'source' }),
  );
  passed('library search returns matching authorized assets and denies outsiders');
  await denied(() =>
    f.sql(viewer, 'insert into storage.objects(bucket_id,name) values($1,$2)', [
      'research-library',
      `${viewer}/${f.projectId}/40000000-0000-4000-8000-000000000012.pdf`,
    ]),
  );
  passed('viewer cannot upload through direct Storage API');
  await denied(() =>
    f.rpc(owner, 'save_research_document', {
      p_config: {
        ...input,
        evidence: [
          {
            type: 'run',
            runId: '90000000-0000-4000-8000-000000000099',
            caption: 'Invented metrics',
          },
        ],
      },
      p_expected: 3,
    }),
  );
  passed('invented experiment evidence rejected');
  d = await f.rpc(owner, 'save_research_document', {
    p_config: {
      ...input,
      evidence: [
        { type: 'asset', assetId: a.id, caption: 'Real source', snapshot: { sha256: 'forged' } },
      ],
    },
    p_expected: 3,
  });
  assert.equal(d.evidence[0].snapshot.sha256, asset.sha256);
  passed('evidence resolves actual asset metadata and ignores supplied snapshot');
  await denied(() =>
    f.rpc(owner, 'save_research_document', {
      p_config: {
        ...input,
        project_id: f.privateId,
        evidence: [{ type: 'asset', assetId: a.id, caption: 'Cross project' }],
      },
      p_expected: 4,
    }),
  );
  passed('document identity and asset project boundaries cannot change');
  await f.rpc(owner, 'update_research_asset', {
    p_id: a.id,
    p_expected: 1,
    p_name: 'Renamed source',
    p_collection: 'Papers',
    p_delete: true,
  });
  assert.equal(
    (await f.sql(viewer, 'select * from storage.objects where name=$1', [asset.path])).length,
    0,
  );
  await f.sql(owner, 'delete from storage.objects where name=$1', [asset.path]);
  passed('tombstone blocks viewer downloads; authorized owner can clean up blob');
  const acl = await f.db.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('research_workspace_index','save_research_document','share_research_document','record_research_library_asset','update_research_asset','search_research_assets') and (has_function_privilege('anon',p.oid,'execute') or not ('search_path=\"\"'=any(p.proconfig)))",
  );
  assert.deepEqual(acl.rows, []);
  passed('new public RPCs reject anonymous execution and pin search_path');
  const events = await f.sql(
    owner,
    'select action,actor_id from public.research_workspace_events where document_id=$1',
    [d.id],
  );
  assert.ok(events.some((e) => e.action === 'document_revoked' && e.actor_id === owner));
  assert.equal((await f.sql(outsider, 'select * from public.research_workspace_events')).length, 0);
  await denied(() =>
    f.sql(
      owner,
      "insert into public.research_workspace_events(project_id,actor_id,action) values($1,$2,'document_saved')",
      [f.projectId, outsider],
    ),
  );
  passed('audit records use server actors and cannot be forged or read cross-project');
  await f.sql(
    owner,
    "insert into storage.objects(bucket_id,name) select 'research-library',$1||'/'||$2||'/40000000-0000-4000-8000-'||lpad(to_hex(n),12,'0')||'.pdf' from generate_series(1,256) n",
    [owner, f.projectId],
  );
  await denied(() =>
    f.sql(owner, 'insert into storage.objects(bucket_id,name) values($1,$2)', [
      'research-library',
      `${owner}/${f.projectId}/50000000-0000-4000-8000-000000000001.pdf`,
    ]),
  );
  passed('256-file quota includes unpublished uploads and is enforced on direct Storage inserts');
  console.log(
    `Research workspace: ${checks} real PostgreSQL/RLS groups passed. Auth and Storage tables are local fixtures; this test does not access a hosted database.`,
  );
} finally {
  await f.close();
}
