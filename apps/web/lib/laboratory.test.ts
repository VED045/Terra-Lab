import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { objects, upload, download, list, getUser } = vi.hoisted(() => ({
  objects: new Map<string, Blob>(),
  upload: vi.fn(),
  download: vi.fn(),
  list: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('./persistence', () => ({
  supabase: () => ({ auth: { getUser }, storage: { from: () => ({ upload, download, list }) } }),
}));
import { readExperiment, experimentCsv, syncExperiment, cloudExperiments } from './laboratory';
import { buildExperimentReport } from './lab-report';
const text = readFileSync(
  new URL('../../../docs/examples/timing-benchmark.result.json', import.meta.url),
  'utf8',
);
beforeEach(() => {
  objects.clear();
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'researcher' } }, error: null });
  upload.mockImplementation(async (path: string, blob: Blob) => {
    objects.set(path, blob);
    return { error: null };
  });
  download.mockImplementation(async (path: string) => ({
    data: objects.get(path) ?? null,
    error: null,
  }));
  list.mockImplementation(async () => ({
    data: [...objects.keys()]
      .filter((path) => /^researcher\/experiments\/[^/]+\.json$/.test(path))
      .map((path) => ({ name: path.split('/').at(-1) })),
    error: null,
  }));
});
describe('Actual experiment output and immutable exports', () => {
  it('creates a scientific report from actual experiment metrics and escapes configuration text', () => {
    const result = readExperiment(text);
    result.request.project.name = '<script>unsafe()</script>';
    const html = buildExperimentReport(result, '<svg></svg>', 0);
    expect(html).toContain('3600/3600');
    expect(html).toContain('Weighted nonlinear LS');
    expect(html).toContain('conditional on successful fixes');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('0.2.0');
  });
  it('imports the executed benchmark with all paired epochs and observation hashes', () => {
    const result = readExperiment(text);
    expect(result.records).toHaveLength(3600);
    expect(Object.keys(result.frames)).toHaveLength(1200);
    expect(result.summaries.every((s) => s.attempted === 300)).toBe(true);
    const original = result.request.project.objects[0].x;
    const copy = structuredClone(result.request.project);
    copy.objects[0].x = 999;
    expect(result.request.project.objects[0].x).toBe(original);
  });
  it('exports failures explicitly as rows with empty estimates, never zero error', () => {
    const result = readExperiment(text);
    const row = result.records[0];
    result.records = [
      { ...row, position: null, errorM: null, failure: 'No fix, insufficient observations' },
    ];
    const csv = experimentCsv(result);
    expect(csv).toContain('"No fix, insufficient observations"');
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"","","","No fix');
  });
  it('rejects missing frames, wrong counts and incompatible saved configurations', () => {
    const result = JSON.parse(text);
    result.frames = {};
    expect(() => readExperiment(JSON.stringify(result))).toThrow('frame');
    const count = JSON.parse(text);
    count.completed = 0;
    expect(() => readExperiment(JSON.stringify(count))).toThrow('counts');
    const bad = JSON.parse(text);
    bad.request.config.measurement = 'aoa';
    expect(() => readExperiment(JSON.stringify(bad))).toThrow('Incompatible');
  });
  it('chunks large cloud snapshots under 2 MB and round-trips the exact output', async () => {
    const result = readExperiment(text);
    await syncExperiment(result);
    expect(objects.size).toBeGreaterThan(2);
    for (const blob of objects.values()) expect(blob.size).toBeLessThan(2097152);
    expect(upload.mock.calls.every((call) => call[2].upsert === false)).toBe(true);
    expect((await cloudExperiments())[0]).toEqual(result);
  });
  it('does not publish a complete manifest after a failed chunk upload', async () => {
    upload.mockResolvedValueOnce({ error: Error('Storage denied') });
    await expect(syncExperiment(readExperiment(text))).rejects.toThrow('Storage denied');
    expect(objects.size).toBe(0);
    expect(upload).toHaveBeenCalledOnce();
  });
  it('detects tampered or missing cloud chunks', async () => {
    await syncExperiment(readExperiment(text));
    const chunk = [...objects.keys()].find((path) => path.endsWith('part-0.json'))!;
    objects.set(chunk, new Blob([JSON.stringify({ data: 'changed' })]));
    await expect(cloudExperiments()).rejects.toThrow('checksum');
  });
});
