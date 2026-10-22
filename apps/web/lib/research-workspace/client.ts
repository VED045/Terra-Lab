import { z } from 'zod';
import { localList, supabase } from '../persistence';
import { savedExperiments } from '../laboratory';
import {
  CLOUD_MAX_FILE,
  assetInputSchema,
  documentInputSchema,
  manuscriptFields,
  sameManuscript,
  type ResearchDocument,
  type ResearchAsset,
  type DocumentInput,
  type DocumentRevision,
  type WorkspaceIndex,
} from './contracts';
import { validateResearchFile, extractResearchText } from './files';
export async function researchSession() {
  const db = supabase();
  if (!db) return { db: null, actor: 'local-development' };
  const session = await db.auth.getSession();
  if (session.error) throw Error('Account session unavailable.');
  if (!session.data.session) return { db: null, actor: 'local-development' };
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error('Sign in again before accessing research.');
  return { db, actor: data.user.id };
}
function localProject(projectId: string) {
  if (!localList(localStorage).some((p) => p.id === projectId))
    throw Error('Select an accessible saved local project.');
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('terralab-research-workspace', 1);
    request.onupgradeneeded = () => {
      for (const name of ['documents', 'assets', 'revisions', 'blobs'])
        request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Research storage unavailable.'));
  });
}
async function localRead<T>(store: string, id?: string): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store),
      r = id ? tx.objectStore(store).get(id) : tx.objectStore(store).getAll();
    let result: T;
    r.onsuccess = () => {
      result = r.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(Error('Research read failed.'));
    };
  });
}
async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { db } = await researchSession();
  if (!db) throw Error('Sign in for document sharing.');
  const { data, error } = await db.rpc(name, params);
  if (error)
    throw Error(
      error.message.includes('VERSION_CONFLICT')
        ? 'VERSION_CONFLICT: another revision was saved. Keep your draft and reload or save a copy.'
        : `${error.message}. Apply the research workspace migration if this feature is not configured.`,
    );
  return data as T;
}
export async function researchIndex(projectId: string): Promise<WorkspaceIndex> {
  const { db, actor } = await researchSession();
  if (!db) {
    localProject(projectId);
    return {
      actor,
      cloud: false,
      documents: (await localRead<ResearchDocument[]>('documents')).filter(
        (d) => d.project_id === projectId,
      ),
      assets: (await localRead<ResearchAsset[]>('assets')).filter(
        (a) => a.project_id === projectId,
      ),
    };
  }
  const data = await rpc<{ documents: ResearchDocument[]; assets: ResearchAsset[] }>(
    'research_workspace_index',
    { p_project: projectId },
  );
  return { ...data, actor, cloud: true };
}
export async function getResearchDocument(projectId: string, id: string) {
  const index = await researchIndex(projectId);
  const doc = index.documents.find((d) => d.id === id);
  if (!doc) throw Error('Document unavailable or access revoked.');
  return doc;
}
export async function saveResearchDocument(
  value: DocumentInput,
  expected: number | null,
): Promise<ResearchDocument> {
  const input = manuscriptFields(value),
    { db, actor } = await researchSession();
  if (db) return rpc('save_research_document', { p_config: input, p_expected: expected });
  localProject(input.project_id);
  const assets = await localRead<ResearchAsset[]>('assets'),
    runs = await savedExperiments();
  input.evidence = input.evidence.map((e) => {
    if (e.type === 'asset') {
      const asset = assets.find((a) => a.id === e.assetId && a.project_id === input.project_id);
      if (!asset) throw Error('Evidence asset unavailable in this project.');
      return {
        ...e,
        snapshot: { mime: asset.mime, sha256: asset.sha256, provenance: asset.provenance },
      };
    }
    const run = runs.find((r) => r.id === e.runId && r.request.project.id === input.project_id);
    if (!run) throw Error('Choose an actual saved experiment from this project.');
    return {
      ...e,
      snapshot: {
        status: run.status,
        configuration: run.request.config,
        metrics: run.summaries.slice(0, 20),
        createdAt: run.createdAt,
        softwareVersion: run.softwareVersion,
        revision: `${run.request.project.cloudVersion ?? 'local'}:${run.request.project.updatedAt}`,
      },
    };
  });
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['documents', 'revisions'], 'readwrite'),
      docs = tx.objectStore('documents');
    let result: ResearchDocument;
    let failure: Error | null = null;
    const request = docs.get(input.id);
    request.onsuccess = () => {
      try {
        const old = request.result as ResearchDocument | undefined;
        if (old && (old.project_id !== input.project_id || old.owner_id !== actor))
          throw Error('Document access denied.');
        if ((old?.version ?? null) !== expected)
          throw Error('VERSION_CONFLICT: another revision was saved. Your draft is preserved.');
        if (old && sameManuscript(old, input)) {
          result = old;
          return;
        }
        if ((old?.version ?? 0) >= 128)
          throw Error('Revision limit reached. Export or save a copy; history is preserved.');
        const now = new Date().toISOString();
        result = {
          ...input,
          owner_id: actor,
          version: (old?.version ?? 0) + 1,
          created_at: old?.created_at ?? now,
          updated_at: now,
          role: 'owner',
        };
        docs.put(result);
        tx.objectStore('revisions').put({
          ...manuscriptFields(result),
          id: result.id + ':' + result.version,
          document_id: result.id,
          version: result.version,
          author_id: actor,
          created_at: now,
        });
      } catch (e) {
        failure = e as Error;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      database.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      database.close();
      reject(failure ?? Error('Document save interrupted; the draft is retained.'));
    };
  });
}
export async function researchHistory(projectId: string, id: string): Promise<DocumentRevision[]> {
  const { db } = await researchSession();
  await getResearchDocument(projectId, id);
  if (db) {
    const { data, error } = await db
      .from('research_document_revisions')
      .select('config,version,author_id,created_at')
      .eq('document_id', id)
      .order('version', { ascending: false })
      .limit(128);
    if (error) throw Error('Revision history unavailable.');
    return data.map((row) => ({
      ...row.config,
      version: row.version,
      author_id: row.author_id,
      created_at: row.created_at,
    }));
  }
  const rows = await localRead<(DocumentRevision & { document_id: string })[]>('revisions');
  return rows
    .filter((r) => r.document_id === id)
    .map((r) => ({ ...r, id }))
    .sort((a, b) => b.version - a.version);
}
export async function shareResearchDocument(
  id: string,
  userId: string,
  role: 'editor' | 'viewer' | null,
) {
  z.string().uuid().parse(userId);
  return rpc('share_research_document', { p_id: id, p_user: userId, p_role: role });
}
export async function researchDocumentMembers(id: string) {
  const { db } = await researchSession();
  if (!db) return [];
  const { data, error } = await db
    .from('research_document_members')
    .select('user_id,role')
    .eq('document_id', id);
  if (error) throw Error('Document permissions unavailable.');
  return data as { user_id: string; role: 'editor' | 'viewer' }[];
}
export async function uploadResearchAsset(
  projectId: string,
  file: File,
  collection = '',
  provenance: Record<string, unknown> = {},
): Promise<ResearchAsset> {
  if (file.size > CLOUD_MAX_FILE && (await researchSession()).db)
    throw Error('Cloud uploads through TerraLab are limited to 4 MiB. Local mode supports 10 MiB.');
  const checked = await validateResearchFile(file),
    extraction = await extractResearchText(file, checked.mime).catch(() => ({
      status: 'failed' as const,
      pages: [],
      truncated: false,
      message: 'Text extraction could not start. The original file is retained.',
    })),
    { db, actor } = await researchSession();
  const existing = (await researchIndex(projectId)).assets.find((a) => a.sha256 === checked.sha256);
  if (existing) return existing;
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const value = assetInputSchema.parse({
    id,
    project_id: projectId,
    name: file.name.slice(0, 180),
    collection,
    mime: checked.mime,
    bytes: file.size,
    sha256: checked.sha256,
    path: `${actor}/${projectId}/${id}.${checked.extension}`,
    extraction,
    provenance,
  });
  if (db) {
    const session = await db.auth.getSession(),
      form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify(value));
    const response = await fetch('/api/research/assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.data.session!.access_token },
      body: form,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw Error(error?.message || 'Upload failed; no complete asset was published.');
    }
    return response.json();
  }
  localProject(projectId);
  const asset = { ...value, owner_id: actor, created_at: now, updated_at: now, version: 1 };
  const database = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['assets', 'blobs'], 'readwrite');
    tx.objectStore('assets').add(asset);
    tx.objectStore('blobs').add({ id, blob: file });
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(Error('Upload interrupted; file was not published.'));
  });
  database.close();
  return asset;
}
export async function readResearchAsset(projectId: string, id: string) {
  const { db } = await researchSession();
  const index = await researchIndex(projectId);
  let asset = index.assets.find((a) => a.id === id);
  if (!asset) throw Error('Asset unavailable or access revoked.');
  let blob: Blob;
  if (db) {
    const detail = await db
      .from('research_library_assets')
      .select('*')
      .eq('id', id)
      .eq('project_id', projectId)
      .maybeSingle();
    if (detail.error || !detail.data) throw Error('Asset access denied.');
    asset = detail.data as ResearchAsset;
    const { data, error } = await db.storage.from('research-library').download(asset.path);
    if (error || !data) throw Error('Asset download unavailable.');
    blob = data;
  } else {
    const row = await localRead<{ blob: Blob }>('blobs', id);
    if (!row?.blob) throw Error('Original file is missing.');
    blob = row.blob;
  }
  if (blob.size !== asset.bytes) throw Error('Asset size mismatch; do not trust this download.');
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== asset.sha256) throw Error('Asset checksum mismatch; do not trust this download.');
  return { asset, blob: new Blob([blob], { type: asset.mime }) };
}
export async function renameResearchAsset(asset: ResearchAsset, name: string, collection: string) {
  const next = assetInputSchema.parse({
      ...assetInputSchema.strip().parse(asset),
      name,
      collection,
    }),
    { db } = await researchSession();
  if (db)
    return rpc('update_research_asset', {
      p_id: asset.id,
      p_expected: asset.version,
      p_name: name,
      p_collection: collection,
      p_delete: false,
    });
  localProject(asset.project_id);
  const database = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('assets', 'readwrite'),
      store = tx.objectStore('assets'),
      r = store.get(asset.id);
    r.onsuccess = () => {
      if (r.result?.version !== asset.version) {
        tx.abort();
        return;
      }
      store.put({
        ...r.result,
        ...next,
        version: asset.version + 1,
        updated_at: new Date().toISOString(),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(Error('Asset changed; refresh before renaming.'));
  });
  database.close();
}
export async function deleteResearchAsset(asset: ResearchAsset) {
  const { db } = await researchSession();
  if (db) {
    await rpc('update_research_asset', {
      p_id: asset.id,
      p_expected: asset.version,
      p_name: asset.name,
      p_collection: asset.collection,
      p_delete: true,
    });
    const { error } = await db.storage.from('research-library').remove([asset.path]);
    if (error)
      throw Error(
        'Asset access revoked; storage cleanup failed. Ask the owner to clean the tombstoned file.',
      );
    return;
  }
  localProject(asset.project_id);
  const database = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['assets', 'blobs'], 'readwrite');
    tx.objectStore('assets').delete(asset.id);
    tx.objectStore('blobs').delete(asset.id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(Error('Delete failed.'));
  });
  database.close();
}

export async function researchSourceAsset(projectId: string, id: string): Promise<ResearchAsset> {
  const { db } = await researchSession();
  if (db) {
    const { data, error } = await db
      .from('research_library_assets')
      .select('*')
      .eq('project_id', projectId)
      .eq('id', id)
      .eq('deleted', false)
      .maybeSingle();
    if (error || !data) throw Error('Source unavailable or access revoked.');
    assetInputSchema.strip().parse(data);
    return data as ResearchAsset;
  }
  const index = await researchIndex(projectId),
    asset = index.assets.find((a) => a.id === id);
  if (!asset) throw Error('Source unavailable.');
  return asset;
}

export async function searchResearchAssets(projectId: string, query: string): Promise<string[]> {
  return rpc('search_research_assets', { p_project: projectId, p_query: query.slice(0, 120) });
}
