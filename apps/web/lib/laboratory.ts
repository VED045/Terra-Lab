import type { LabConfig, LabRecord, LabFrame, LabSummary, Project } from '@terralab/shared';
import { labConfigSchema, projectSchema } from '@terralab/shared';
import { z } from 'zod';
import { supabase } from './persistence';
export type ExperimentResult = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  softwareVersion: string;
  createdAt: string;
  request: { project: Project; config: LabConfig };
  planned: number;
  completed: number;
  unattempted?: number;
  elapsedSeconds?: number;
  error: string | null;
  records: LabRecord[];
  frames: Record<string, LabFrame>;
  summaries: LabSummary[];
  artifactUnavailable?: boolean;
};
export async function laboratoryRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  idempotencyKey?: string,
): Promise<ExperimentResult & { id: string }> {
  const db = supabase();
  const session = db ? await db.auth.getSession() : null;
  const token = session?.data.session?.access_token;
  const response = await fetch(`/api/laboratory${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method === 'POST' ? { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail));
  if (result.manifest) {
    const { downloadResearchResult } = await import('./research');
    return downloadResearchResult(result.manifest, result.id);
  }
  return result;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('terralab-laboratory', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('experiments', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? Error('Could not open experiment storage'));
  });
}
export async function saveExperiment(result: ExperimentResult): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('experiments', 'readwrite');
    transaction.objectStore('experiments').add(structuredClone(result));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? Error('Experiment save failed'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? Error('Experiment save aborted'));
    };
  });
}
export async function savedExperiments(): Promise<ExperimentResult[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const query = db.transaction('experiments').objectStore('experiments').getAll();
    query.onsuccess = () => {
      db.close();
      resolve(
        (query.result as ExperimentResult[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    };
    query.onerror = () => {
      db.close();
      reject(query.error);
    };
  });
}
async function cloudUser() {
  const db = supabase();
  if (!db)
    throw Error('Supabase is not configured. Local results and JSON exports remain available.');
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  if (!data.user) throw Error('Sign in to store an experiment snapshot in the cloud.');
  return { db, user: data.user };
}
async function digest(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}
export async function syncExperiment(result: ExperimentResult) {
  const { db, user } = await cloudUser();
  const identity = crypto.randomUUID(),
    prefix = `${user.id}/experiments`;
  const text = JSON.stringify(result),
    parts = Math.ceil(text.length / 500000);
  for (let part = 0; part < parts; part++) {
    const blob = new Blob(
      [JSON.stringify({ data: text.slice(part * 500000, (part + 1) * 500000) })],
      { type: 'application/json' },
    );
    const { error } = await db.storage
      .from('project-exports')
      .upload(`${prefix}/${identity}/part-${part}.json`, blob, {
        upsert: false,
        contentType: 'application/json',
      });
    if (error) throw error;
  }
  const manifest = { format: 'terralab-chunked-1', parts, sha256: await digest(text) };
  // Publish the manifest last: incomplete uploads cannot appear as complete snapshots.
  const { error } = await db.storage
    .from('project-exports')
    .upload(
      `${prefix}/${identity}.json`,
      new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
      { upsert: false, contentType: 'application/json' },
    );
  if (error) throw error;
}
const pair = z.tuple([z.number().finite(), z.number().finite()]);
const nullable = z.number().finite().nullable();
const anchorSchema = z
  .object({
    id: z.string(),
    anchor: pair,
    available: z.boolean(),
    reason: z.string().nullable(),
    blocked: z.boolean(),
    nlos: z.boolean(),
    power: z.number().finite(),
    loss: z.number().finite(),
    signalDbm: z.number().finite(),
  })
  .passthrough();
const observationSchema = anchorSchema.extend({
  kind: z.string(),
  value: z.number().finite(),
  sigma: z.number().finite().nonnegative(),
});
const recordSchema = z
  .object({
    frameId: z.string(),
    estimator: z.enum([
      'ls',
      'wls',
      'nls',
      'huber',
      'soft_l1',
      'reject',
      'ransac',
      'mle',
      'ekf',
      'ukf',
    ]),
    trial: z.number().int().nonnegative(),
    locationId: z.string(),
    time: z.number().finite().nonnegative(),
    sweepValue: z.number().finite(),
    truth: pair,
    position: pair.nullable(),
    errorM: z.number().finite().nonnegative().nullable(),
    failure: z.string().nullable(),
    runtimeMs: z.number().finite().nonnegative(),
    condition: nullable,
    residualRms: nullable,
    observationHash: z.string(),
    residuals: z.array(z.number().finite()).optional(),
    normalizedResiduals: z.array(z.number().finite()).optional(),
    rejected: z.array(z.number().int().nonnegative()).optional(),
    ellipse: z
      .object({
        major: z.number().finite().nonnegative(),
        minor: z.number().finite().nonnegative(),
        angle: z.number().finite(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();
const summarySchema = z
  .object({
    estimator: recordSchema.shape.estimator,
    sweepValue: z.number().finite(),
    attempted: z.number().int().nonnegative(),
    fixes: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    availability: nullable,
    failureRate: nullable,
    meanErrorM: nullable,
    medianErrorM: nullable,
    rmseM: nullable,
    p95ErrorM: nullable,
    maxErrorM: nullable,
    medianRuntimeMs: nullable,
    p95RuntimeMs: nullable,
    meanNormalizedResidualRms: nullable,
    residualMean: nullable,
    residualStd: nullable,
    residualAbsP95: nullable,
    medianCondition: nullable,
    p95Condition: nullable,
    failureReasons: z.record(z.string(), z.number().int().nonnegative()),
  })
  .passthrough();
const importedSchema = z
  .object({
    id: z.string().uuid(),
    softwareVersion: z.string(),
    createdAt: z.string(),
    status: z.enum(['completed', 'cancelled', 'failed', 'interrupted']),
    request: z.object({ project: projectSchema, config: labConfigSchema }),
    records: z.array(recordSchema).max(100000),
    frames: z.record(
      z.string(),
      z
        .object({
          time: z.number().finite(),
          truth: pair,
          values: z.array(z.number().finite()),
          covariance: z.array(z.array(z.number().finite())),
          observations: z.array(observationSchema),
          anchors: z.array(anchorSchema),
          reference: observationSchema.nullable(),
          model: z.enum(['toa', 'pseudorange', 'tdoa', 'rtt', 'aoa', 'rss', 'hybrid']),
          observationHash: z.string(),
        })
        .passthrough(),
    ),
    summaries: z.array(summarySchema),
    planned: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    error: z.string().nullable(),
  })
  .passthrough()
  .superRefine((result, ctx) => {
    if (result.completed !== result.records.length || result.completed > result.planned)
      ctx.addIssue({ code: 'custom', message: 'Experiment counts are inconsistent' });
    for (const row of result.records)
      if (
        !result.frames[row.frameId] ||
        result.frames[row.frameId].observationHash !== row.observationHash
      )
        ctx.addIssue({ code: 'custom', message: 'Missing or mismatched observation frame' });
  });
export function readExperiment(text: string): ExperimentResult {
  if (text.length > 150000000) throw Error('Experiment exceeds the 150 MB import limit');
  return importedSchema.parse(JSON.parse(text)) as unknown as ExperimentResult;
}
export async function cloudExperiments(): Promise<ExperimentResult[]> {
  const { db, user } = await cloudUser();
  const prefix = `${user.id}/experiments`;
  const { data, error } = await db.storage
    .from('project-exports')
    .list(prefix, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  const results: ExperimentResult[] = [];
  async function download(path: string) {
    const { data, error } = await db.storage.from('project-exports').download(path);
    if (error) throw error;
    if (!data) throw Error('Snapshot part is missing');
    return data.text();
  }
  for (const item of data ?? []) {
    if (!/^[\da-f-]{36}\.json$/i.test(item.name)) continue;
    const text = await download(`${prefix}/${item.name}`),
      manifest = JSON.parse(text);
    if (manifest.format === 'terralab-chunked-1') {
      const clean = z
        .object({
          parts: z.number().int().min(1).max(300),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(manifest);
      const chunks: string[] = [];
      for (let part = 0; part < clean.parts; part++)
        chunks.push(
          z
            .object({ data: z.string().max(500000) })
            .parse(
              JSON.parse(await download(`${prefix}/${item.name.slice(0, -5)}/part-${part}.json`)),
            ).data,
        );
      const combined = chunks.join('');
      if ((await digest(combined)) !== clean.sha256)
        throw Error('Cloud snapshot checksum mismatch');
      results.push(readExperiment(combined));
    } else results.push(readExperiment(text));
  }
  return results;
}
export function experimentCsv(result: ExperimentResult): string {
  const header = [
    'estimator',
    'sweep_value',
    'trial',
    'location_id',
    'time_s',
    'truth_x_m',
    'truth_y_m',
    'estimate_x_m',
    'estimate_y_m',
    'error_m',
    'failure',
    'runtime_ms',
    'condition',
    'normalized_residual_rms',
    'observation_hash',
  ];
  const cell = (v: unknown) => {
    const text = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    header.join(','),
    ...result.records.map((r) =>
      [
        r.estimator,
        r.sweepValue,
        r.trial,
        r.locationId,
        r.time,
        ...r.truth,
        ...(r.position ?? ['', '']),
        r.errorM,
        r.failure,
        r.runtimeMs,
        r.condition,
        r.residualRms,
        r.observationHash,
      ]
        .map(cell)
        .join(','),
    ),
  ].join('\n');
}
