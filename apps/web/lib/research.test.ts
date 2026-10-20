import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTemplate } from '@terralab/shared';
const { download, getUser } = vi.hoisted(() => ({ download: vi.fn(), getUser: vi.fn() }));
vi.mock('./persistence', () => ({
  supabase: () => ({ auth: { getUser }, storage: { from: () => ({ download }) } }),
  localList: () => [],
}));
import { configurationDiff, freshCopy, downloadResearchResult, sha256 } from './research';
import {
  publicationSvg,
  defaultPlotOptions,
  reproducibilityManifest,
  reportPayload,
} from './publication';
import { readExperiment,experimentCsv } from './laboratory';
import { useStudio } from './store';
const result = readExperiment(
  readFileSync(new URL('../../../docs/examples/timing-clean.result.json', import.meta.url), 'utf8'),
);
beforeEach(() => vi.clearAllMocks());
describe('Research history and publication exports', () => {
  it('reconstructs the complete actual worker-format output through checked byte envelopes',async()=>{
    const bytes=new TextEncoder().encode(JSON.stringify(result)),id=result.id,lease=crypto.randomUUID(),parts=new Map<string,Blob>();
    for(let offset=0,i=0;offset<bytes.length;offset+=750000,i++)parts.set(`${id}/${lease}/part-${i}.json`,new Blob([JSON.stringify({base64:Buffer.from(bytes.slice(offset,offset+750000)).toString('base64')})]));
    download.mockImplementation(async(path:string)=>({data:parts.get(path),error:null}));
    const restored=await downloadResearchResult({format:'terralab-result-1',bucket:'research-results',paths:[...parts.keys()],bytes:bytes.length,sha256:await sha256(bytes)},id);
    expect(restored).toEqual(result);expect(restored.completed).toBe(3600);
  });
  it('neutralizes spreadsheet formulas in text fields while preserving numerical values',()=>{const copy=structuredClone(result);copy.records=[{...copy.records[0],locationId:'=HYPERLINK("unsafe")',failure:'@formula'}];const csv=experimentCsv(copy);expect(csv).toContain("\"'=HYPERLINK");expect(csv).toContain("\"'@formula\"");});
  it('copies a network into a new ownership/version namespace', () => {
    const p = { ...createTemplate(), cloudVersion: 7, cloudOwnerId: crypto.randomUUID() };
    const c = freshCopy(p);
    expect(c.id).not.toBe(p.id);
    expect(c.cloudVersion).toBeUndefined();
    expect(c.objects).toEqual(p.objects);
    expect(p.cloudVersion).toBe(7);
  });
  it('compares nested mobility, measurement and missing fields without mutating runs', () => {
    const a = { project: { objects: [{ speed: 1 }] }, config: { seed: 1 } },
      b = { project: { objects: [{ speed: 2 }] }, config: { seed: 2, dropout: 0.5 } };
    const d = configurationDiff(a, b);
    expect(d.map((x) => x.path)).toEqual([
      '$.config.dropout',
      '$.config.seed',
      '$.project.objects[0].speed',
    ]);
    expect(configurationDiff(a, a)).toEqual([]);
    expect(a.config.seed).toBe(1);
  });
  it('retains edits made during a save while advancing the accepted cloud version', () => {
    const original = { ...createTemplate(), cloudVersion: 1 };
    useStudio.getState().load(original);
    useStudio.getState().edit((p) => {
      p.name = 'Changed during save';
    });
    useStudio.getState().acceptSave(original, { ...original, cloudVersion: 2 });
    expect(useStudio.getState().dirty).toBe(true);
    expect(useStudio.getState().project.cloudVersion).toBe(2);
    expect(useStudio.getState().project.name).toBe('Changed during save');
  });
  it('does not apply a completed save to a different opened project', () => {
    const original = createTemplate();
    useStudio.getState().load(createTemplate());
    const id = useStudio.getState().project.id;
    useStudio.getState().acceptSave(original, { ...original, cloudVersion: 4 });
    expect(useStudio.getState().project.id).toBe(id);
    expect(useStudio.getState().project.cloudVersion).toBeUndefined();
  });
  it('undo and redo keep the latest accepted cloud version', () => {
    const p = { ...createTemplate(), cloudVersion: 1 };
    useStudio.getState().load(p);
    useStudio.getState().edit((p) => {
      p.name = 'Revised';
    });
    const edited = useStudio.getState().project;
    useStudio.getState().acceptSave(edited, { ...edited, cloudVersion: 2 });
    useStudio.getState().undo();
    expect(useStudio.getState().project.name).toBe(p.name);
    expect(useStudio.getState().project.cloudVersion).toBe(2);
    useStudio.getState().redo();
    expect(useStudio.getState().project.cloudVersion).toBe(2);
    expect(useStudio.getState().project.name).toBe('Revised');
  });
  it('exports real CDF samples with escaped labels and explicit failure conditioning', () => {
    const svg = publicationSvg(result, {
      ...defaultPlotOptions,
      title: '<script>alert(1)</script>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('n=1200');
    expect(svg).toContain('pooled sweeps');
    expect(svg).toContain('0/3600 failed');
    expect(svg).toContain('<path');
  });
  it('manifest hashes are stable across object-key order and change with the seed', async () => {
    const a = await reproducibilityManifest(result);
    const b = await reproducibilityManifest({
      ...result,
      request: { config: result.request.config, project: result.request.project },
    });
    expect(a.configurationSha256).toBe(b.configurationSha256);
    const c = await reproducibilityManifest({
      ...result,
      request: { ...result.request, config: { ...result.request.config, seed: 43 } },
    });
    expect(a.configurationSha256).not.toBe(c.configurationSha256);
    expect(a.metrics).toEqual(result.summaries);
  });
  it('PDF requests retain full actual metrics but bound displayed trajectory samples', () => {
    const p = reportPayload(result, defaultPlotOptions);
    expect(p.summaries).toEqual(result.summaries);
    expect(p.records.length).toBeLessThanOrEqual(2000);
    expect(p.samplingNote).toContain('complete stored run');
    expect(p.request).toEqual(result.request);
  });
  it('rejects malicious artifact paths before contacting storage', async () => {
    await expect(
      downloadResearchResult(
        {
          format: 'terralab-result-1',
          bucket: 'research-results',
          paths: ['../other-user/result.json'],
          bytes: 1,
          sha256: '0'.repeat(64),
        },
        result.id,
      ),
    ).rejects.toThrow('path');
    expect(download).not.toHaveBeenCalled();
  });
  it('rejects a correct-sized chunk with a corrupt digest', async () => {
    const raw = new TextEncoder().encode('{}');
    download.mockResolvedValue({
      data: new Blob([JSON.stringify({ base64: btoa('{}') })]),
      error: null,
    });
    await expect(
      downloadResearchResult(
        {
          format: 'terralab-result-1',
          bucket: 'research-results',
          paths: [`${result.id}/${crypto.randomUUID()}/part-0.json`],
          bytes: 2,
          sha256: '0'.repeat(64),
        },
        result.id,
      ),
    ).rejects.toThrow('checksum');
    expect(await sha256(raw)).not.toBe('0'.repeat(64));
  });
});
