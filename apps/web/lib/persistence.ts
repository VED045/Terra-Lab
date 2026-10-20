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
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key));
}
export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
const KEY = 'terralab.projects.v1';
export function localList(storage: StorageLike): Project[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  const a: unknown = JSON.parse(raw);
  if (!Array.isArray(a)) throw Error('Saved project index is invalid');
  return a.map((p) => deserializeProject(JSON.stringify(p)));
}
export function localSave(storage: StorageLike, p: Project) {
  const clean = deserializeProject(serializeProject(p));
  const list = localList(storage);
  const i = list.findIndex((x) => x.id === p.id);
  if (i < 0) list.push(clean);
  else list[i] = clean;
  storage.setItem(KEY, JSON.stringify(list));
  return clean;
}
export function localDelete(storage: StorageLike, id: string) {
  storage.setItem(KEY, JSON.stringify(localList(storage).filter((p) => p.id !== id)));
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
  const saved = { ...p, updatedAt: new Date().toISOString() };
  serializeProject(saved);
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
