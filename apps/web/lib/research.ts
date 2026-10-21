import { z } from 'zod';
import { deserializeProject, type Project } from '@terralab/shared';
import { supabase, localList } from './persistence';
import { readExperiment, savedExperiments, type ExperimentResult } from './laboratory';
export type ProjectRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  version: number;
  config: Project;
  updated_at: string;
  role: 'owner' | 'editor' | 'viewer';
};
export type RunRow = {
  id: string;
  project_id: string;
  created_at: string;
  software_version: string;
  status: string;
  metrics: ExperimentResult['summaries'];
  manifest: unknown;
  request: ExperimentResult['request'];
  error?: string | null;
};
export type TeamRow = { id: string; name: string; owner_id: string };
export type TemplateRow = {
  id: string;
  name: string;
  owner_id: string;
  project_id: string | null;
  config: Project;
  created_at: string;
};
export type ShareRow = {
  id: string;
  kind: string;
  role: string;
  expires_at: string;
  revoked: boolean;
};
export async function researchRpc<T = unknown>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const db = supabase();
  if (!db) throw Error('Configure Supabase and apply the Phase 3 migration first.');
  const { data, error } = await db.rpc(name, params);
  if (error) throw Error(error.message);
  return data as T;
}
const localMeta = 'terralab.workspace.meta.v1';
export function workspaceMeta(): { stars: string[]; recent: string[] } {
  try {
    return z
      .object({ stars: z.array(z.string()), recent: z.array(z.string()) })
      .parse(JSON.parse(localStorage.getItem(localMeta) || '{}'));
  } catch {
    return { stars: [], recent: [] };
  }
}
export function recordRecent(id: string) {
  const m = workspaceMeta();
  m.recent = [id, ...m.recent.filter((x) => x !== id)].slice(0, 50);
  localStorage.setItem(localMeta, JSON.stringify(m));
}
export async function toggleStar(id: string, starred: boolean) {
  const m = workspaceMeta();
  m.stars = starred ? m.stars.filter((x) => x !== id) : [...m.stars, id];
  const db = supabase();
  const user = db ? await db.auth.getUser() : null;
  if (user?.data.user) {
    const q = starred
      ? db!.from('project_stars').delete().eq('project_id', id).eq('user_id', user.data.user.id)
      : db!.from('project_stars').insert({ project_id: id, user_id: user.data.user.id });
    const { error } = await q;
    if (error) throw Error(error.message);
  }
  localStorage.setItem(localMeta, JSON.stringify(m));
}
export function freshCopy(p: Project, name = `${p.name} copy`): Project {
  const c = structuredClone(p);
  c.id = crypto.randomUUID();
  c.name = name.slice(0, 80);
  c.updatedAt = new Date().toISOString();
  c.archived = false;
  delete c.cloudVersion;
  delete c.cloudOwnerId;
  return c;
}
export async function workspaceIndex() {
  const db = supabase();
  const session = db ? await db.auth.getSession() : null;
  if (session?.error) throw Error(session.error.message);
  const user = session?.data.session ? await db!.auth.getUser() : null;
  if (user?.error) throw Error(user.error.message);
  if (!user?.data.user)
    return {
      userId: null,
      projects: localList(localStorage).map((config) => ({
        id: config.id,
        owner_id: 'local',
        team_id: null,
        version: 0,
        config,
        updated_at: config.updatedAt,
        role: 'owner' as const,
      })),
      teams: [] as TeamRow[],
      runs: [] as RunRow[],
      templates: [] as TemplateRow[],
      stars: workspaceMeta().stars,
    };
  const tables = [
    'projects',
    'teams',
    'team_members',
    'project_members',
    'experiment_runs',
    'network_templates',
    'project_stars',
    'research_jobs',
  ] as const;
  const results = await Promise.all(
    tables.map((table) => {
      let q = db!
        .from(table)
        .select(
          table === 'experiment_runs'
            ? 'id,project_id,created_at,software_version,status,metrics,manifest,request'
            : table === 'research_jobs'
              ? 'id,project_id,created_at,status,request,error'
              : '*',
        );
      if (['projects', 'experiment_runs', 'research_jobs', 'network_templates'].includes(table))
        q = q.order('created_at', { ascending: false });
      return q.limit(200);
    }),
  );
  for (const r of results)
    if (r.error)
      throw Error(
        `${r.error.message}. Apply the Phase 3 database migration if it has not been installed.`,
      );
  const records = results.map((r) => (r.data ?? []) as unknown as Record<string, unknown>[]);
  const uid = user.data.user.id,
    teams = results[1].data as unknown as TeamRow[];
  const projects = records[0].map((raw) => {
    const p = raw as unknown as ProjectRow;
    let role: ProjectRow['role'] = 'viewer';
    if (p.owner_id === uid) role = 'owner';
    else if (
      records[3].some((m) => m.project_id === p.id && m.user_id === uid && m.role === 'editor') ||
      teams.some((t) => t.id === p.team_id && t.owner_id === uid) ||
      records[2].some((m) => m.team_id === p.team_id && m.user_id === uid && m.role === 'editor')
    )
      role = 'editor';
    return { ...p, role, config: deserializeProject(JSON.stringify(p.config)) };
  });
  const runs = results[4].data as unknown as RunRow[];
  for (const j of records[7])
    if (!runs.some((r) => r.id === j.id))
      runs.push({
        id: String(j.id),
        project_id: String(j.project_id),
        created_at: String(j.created_at),
        status: String(j.status),
        request: j.request as RunRow['request'],
        manifest: null,
        metrics: [],
        software_version: '0.2.0',
        error: j.error as string | null,
      });
  return {
    userId: uid,
    projects,
    teams,
    runs,
    templates: results[5].data as unknown as TemplateRow[],
    stars: records[6].map((s) => String(s.project_id)),
  };
}
export async function revisionHistory(id: string) {
  const db = supabase();
  if (!db) throw Error('Cloud revisions require sign-in');
  const { data, error } = await db
    .from('project_revisions')
    .select('version,created_at,author_id')
    .eq('project_id', id)
    .order('version', { ascending: false })
    .limit(100);
  if (error) throw Error(error.message);
  return (data ?? []) as {
    version: number;
    created_at: string;
    author_id: string;
  }[];
}
export async function revisionProject(id: string, version: number): Promise<Project> {
  const db = supabase();
  if (!db) throw Error('Cloud revisions require sign-in');
  const { data, error } = await db
    .from('project_revisions')
    .select('config')
    .eq('project_id', id)
    .eq('version', version)
    .single();
  if (error) throw Error(error.message);
  return deserializeProject(JSON.stringify(data.config));
}
export async function projectAccess(id: string) {
  const db = supabase();
  if (!db) throw Error('Sign in to manage access');
  const [members, links] = await Promise.all([
    db.from('project_members').select('user_id,role').eq('project_id', id),
    db.from('share_links').select('id,kind,role,expires_at,revoked').eq('project_id', id),
  ]);
  if (members.error) throw Error(members.error.message);
  if (links.error) throw Error(links.error.message);
  return {
    members: (members.data ?? []) as { user_id: string; role: string }[],
    links: (links.data ?? []) as ShareRow[],
  };
}
const manifestSchema = z.object({
  format: z.literal('terralab-result-1'),
  bucket: z.literal('research-results'),
  paths: z.array(z.string().max(160)).min(1).max(32),
  bytes: z.number().int().min(1).max(20_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function sha256(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
}
export async function downloadResearchResult(
  value: unknown,
  id: string,
): Promise<ExperimentResult> {
  z.string().uuid().parse(id);
  const m = manifestSchema.parse(value),
    db = supabase();
  if (!db) throw Error('Sign in to read the saved cloud experiment');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let i = 0; i < m.paths.length; i++) {
    const path = m.paths[i];
    if (!new RegExp(`^${id}/[a-f0-9-]{36}/part-${i}\\.json$`).test(path))
      throw Error('Invalid artifact path');
    const { data, error } = await db.storage.from(m.bucket).download(path);
    if (error || !data) throw Error('Experiment artifact unavailable');
    if (data.size > 1_100_000) throw Error('Oversized artifact chunk');
    const chunk = z
      .object({ base64: z.string().max(1_000_000) })
      .parse(JSON.parse(await data.text()));
    const bytes = Uint8Array.from(atob(chunk.base64), (c) => c.charCodeAt(0));
    size += bytes.length;
    if (size > 20_000_000) throw Error('Artifact exceeds size limit');
    chunks.push(bytes);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const bytes of chunks) {
    all.set(bytes, offset);
    offset += bytes.length;
  }
  if (size !== m.bytes || (await sha256(all)) !== m.sha256)
    throw Error('Experiment artifact checksum mismatch');
  const result = readExperiment(new TextDecoder('utf-8', { fatal: true }).decode(all));
  if (result.id !== id) throw Error('Experiment identity mismatch');
  return result;
}
export type Difference = { path: string; before: string; after: string };
export function configurationDiff(a: unknown, b: unknown, path = '$'): Difference[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b))
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
      configurationDiff(a[i], b[i], `${path}[${i}]`),
    ).flat();
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aa = a as Record<string, unknown>,
      bb = b as Record<string, unknown>;
    return [...new Set([...Object.keys(aa), ...Object.keys(bb)])]
      .sort()
      .flatMap((k) => configurationDiff(aa[k], bb[k], `${path}.${k}`));
  }
  return [{ path, before: JSON.stringify(a) ?? 'absent', after: JSON.stringify(b) ?? 'absent' }];
}
export async function localRuns() {
  return savedExperiments();
}
export async function saveResearchArtifact(runId: string, kind: string, file: File) {
  const db = supabase();
  if (!db) throw Error('Sign in to save artifacts');
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error('Sign in to save artifacts');
  if (file.size > 2097152)
    throw Error('Artifact exceeds 2 MB; the downloaded file remains available');
  const path = `${data.user.id}/${runId}/${crypto.randomUUID()}.${kind === 'manifest' ? 'manifest.json' : kind}`;
  const upload = await db.storage
    .from('research-artifacts')
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upload.error) throw Error(upload.error.message);
  await researchRpc('record_research_artifact', {
    p_run: runId,
    p_kind: kind,
    p_path: path,
    p_sha: await sha256(new Uint8Array(await file.arrayBuffer())),
    p_bytes: file.size,
  });
}
export type ArtifactRow = {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  bytes: number;
  created_at: string;
  creator_id: string;
};
export async function researchArtifacts(runId: string): Promise<ArtifactRow[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from('research_artifacts')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(128);
  if (error) throw Error(error.message);
  return data as ArtifactRow[];
}
export async function readResearchArtifact(artifact: ArtifactRow) {
  const db = supabase();
  if (!db) throw Error('Sign in to download artifacts');
  const { data, error } = await db.storage.from('research-artifacts').download(artifact.path);
  if (error || !data) throw Error('Artifact unavailable');
  if (
    data.size !== artifact.bytes ||
    (await sha256(new Uint8Array(await data.arrayBuffer()))) !== artifact.sha256
  )
    throw Error('Artifact checksum mismatch');
  return data;
}
