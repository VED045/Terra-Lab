import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deserializeProject, serializeProject, type Project } from '@terralab/shared';
let client: SupabaseClient | null = null;
async function currentUser(db: SupabaseClient) {
  const { data: session, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  return data.user;
}
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key));
}
export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
const KEY = 'terralab.projects.v1';
function readIndex(storage: StorageLike): {
  raw: string | null;
  entries: unknown[];
  corrupt: boolean;
} {
  const raw = storage.getItem(KEY);
  if (!raw) return { raw, entries: [], corrupt: false };
  try {
    const entries: unknown = JSON.parse(raw);
    if (Array.isArray(entries)) return { raw, entries, corrupt: false };
  } catch {
    /* Keep the original bytes for recovery before writing a new index. */
  }
  return { raw, entries: [], corrupt: true };
}
function readProject(value: unknown): Project | null {
  try {
    return deserializeProject(JSON.stringify(value));
  } catch {
    return null;
  }
}
function writableEntries(storage: StorageLike): unknown[] {
  const index = readIndex(storage);
  if (index.corrupt && index.raw) {
    // A failed backup aborts the save, so an unreadable index is never silently lost.
    const recoveryKey = `${KEY}.recovery.${Date.now()}.${crypto.randomUUID()}`;
    storage.setItem(recoveryKey, index.raw);
  }
  return index.entries;
}
export function localList(storage: StorageLike): Project[] {
  return readIndex(storage).entries.flatMap((value) => {
    const project = readProject(value);
    return project ? [project] : [];
  });
}
export function localSave(storage: StorageLike, p: Project) {
  const clean = deserializeProject(JSON.stringify(p));
  const list = writableEntries(storage);
  const i = list.findIndex((x) => readProject(x)?.id === clean.id);
  if (i < 0) list.push(clean);
  else list[i] = clean;
  storage.setItem(KEY, JSON.stringify(list));
  return clean;
}
export function localDelete(storage: StorageLike, id: string) {
  storage.setItem(
    KEY,
    JSON.stringify(writableEntries(storage).filter((p) => readProject(p)?.id !== id)),
  );
}
export async function listProjects(): Promise<Project[]> {
  const db = supabase();
  if (!db || !(await currentUser(db))) return localList(localStorage);
  const { data, error } = await db
    .from('projects')
    .select('config')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => deserializeProject(JSON.stringify(r.config)));
}
export async function saveProject(p: Project): Promise<Project> {
  const saved = deserializeProject(JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
  const db = supabase();
  if (db) {
    const user = await currentUser(db);
    if (user) {
      const { error } = await db.from('projects').upsert({
        id: saved.id,
        owner_id: user.id,
        name: saved.name,
        archived: saved.archived,
        schema_version: 1,
        config: saved,
        updated_at: saved.updatedAt,
      });
      if (error) throw error;
      return saved;
    }
  }
  return localSave(localStorage, saved);
}
export async function deleteProject(id: string) {
  const db = supabase();
  if (db) {
    const user = await currentUser(db);
    if (user) {
      const { error } = await db.from('projects').delete().eq('id', id);
      if (error) throw error;
      return;
    }
  }
  localDelete(localStorage, id);
}
export async function uploadCloudSnapshot(p: Project) {
  const db = supabase();
  if (!db) throw Error('Configure Supabase before uploading');
  const user = await currentUser(db);
  if (!user) throw Error('Sign in before uploading a cloud snapshot');
  const { error } = await db.storage
    .from('project-exports')
    .upload(
      `${user.id}/${p.id}.json`,
      new Blob([serializeProject(p)], { type: 'application/json' }),
      { upsert: true, contentType: 'application/json' },
    );
  if (error) throw error;
  return p;
}
