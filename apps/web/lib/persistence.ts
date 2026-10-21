import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deserializeProject, serializeProject, type Project } from '@terralab/shared';
import { projectContent } from './project-content';
let client: SupabaseClient | null = null;
const pendingSaves = new Map<string, Promise<Project>>();
const conflictListeners = new Set<(project: Project) => void>();
export function observeSaveConflicts(listener: (project: Project) => void) {
  conflictListeners.add(listener);
  return () => {
    conflictListeners.delete(listener);
  };
}
async function currentUser(db: SupabaseClient) {
  const { data: session, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;
  const { data, error } = await db.auth.getUser();
  if (error) throw Error(error.message);
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
  if (error) throw Error(error.message);
  return (data ?? []).map((r) => deserializeProject(JSON.stringify(r.config)));
}
export async function saveProject(p: Project): Promise<Project> {
  const saved = deserializeProject(JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
  const db = supabase();
  if (db) {
    const user = await currentUser(db);
    if (user) {
      // Autosave, laboratory submission and explicit Save can submit the same draft together.
      // Share only identical, versioned submissions within this account; never rebase different drafts.
      const key = JSON.stringify([user.id, saved.id, saved.cloudVersion, projectContent(saved)]);
      const existing = pendingSaves.get(key);
      if (existing) return existing;
      const pending = (async () => {
        const { data, error } = await db.rpc('save_research_project', {
          p_config: saved,
          p_expected: saved.cloudVersion ?? null,
        });
        if (error) {
          if (error.message.includes('VERSION_CONFLICT')) {
            // Compatible with servers before migration 007. A byte-equivalent user
            // configuration can safely accept the latest metadata without overwriting anything.
            try {
              const latest = await db.from('projects').select('config').eq('id', saved.id).single();
              if (!latest.error) {
                const cloud = deserializeProject(JSON.stringify(latest.data.config));
                if (projectContent(cloud) === projectContent(saved)) return cloud;
              }
            } catch {
              /* Preserve the original conflict if reconciliation is unavailable. */
            }
            for (const listener of conflictListeners) listener(p);
          }
          throw Error(
            saved.schemaVersion === 2 &&
              /structure|schema|Invalid project configuration/i.test(error.message)
              ? error.message +
                  '. Physical dimensions require migration 005 on the server; your draft is preserved. Export JSON before leaving.'
              : error.message,
          );
        }
        return deserializeProject(JSON.stringify(data));
      })();
      pendingSaves.set(key, pending);
      try {
        return await pending;
      } finally {
        if (pendingSaves.get(key) === pending) pendingSaves.delete(key);
      }
    }
  }
  return localSave(localStorage, saved);
}
export async function deleteProject(id: string) {
  const db = supabase();
  if (db) {
    const user = await currentUser(db);
    if (user) {
      const { error } = await db.rpc('delete_research_project', { p_id: id });
      if (error) throw Error(error.message);
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
  if (error) throw Error(error.message);
  return p;
}
