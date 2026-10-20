import { describe, it, expect } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { localList, localSave, localDelete, type StorageLike } from './persistence';
function memory(): StorageLike & { entries: Map<string, string> } {
  const a = new Map<string, string>();
  return {
    entries: a,
    getItem: (k) => a.get(k) ?? null,
    setItem: (k, v) => {
      a.set(k, v);
    },
  };
}
describe('Local project persistence', () => {
  it('creates, updates, reloads, archives and deletes full configurations', () => {
    const s = memory();
    expect(localList(s)).toEqual([]);
    const p = createTemplate('moving');
    localSave(s, p);
    expect(localList(s)[0]).toEqual(p);
    const renamed = { ...p, name: 'Field study', archived: true };
    localSave(s, renamed);
    expect(localList(s)).toEqual([renamed]);
    localDelete(s, p.id);
    expect(localList(s)).toEqual([]);
  });
  it('duplicates without overwriting the original', () => {
    const s = memory(),
      p = createTemplate();
    localSave(s, p);
    localSave(s, { ...p, id: crypto.randomUUID() });
    expect(localList(s)).toHaveLength(2);
  });
  it('backs up a corrupt index before saving a fresh project', () => {
    const s = memory();
    s.setItem('terralab.projects.v1', '{"broken":true}');
    const project = createTemplate();
    localSave(s, project);
    expect(localList(s)).toEqual([project]);
    const backup = [...s.entries].find(([key]) => key.startsWith('terralab.projects.v1.recovery.'));
    expect(backup?.[1]).toBe('{"broken":true}');
  });
  it('migrates early text IDs without changing the network', () => {
    const s = memory();
    const legacy = { ...createTemplate('moving'), id: 'starter-outdoor' };
    s.setItem('terralab.projects.v1', JSON.stringify([legacy]));
    const restored = localList(s)[0];
    expect(restored.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(restored.objects).toEqual(legacy.objects);
    expect(localList(s)[0].id).toBe(restored.id);
    expect(localSave(s, legacy)).toEqual(restored);
    expect(localList(s)).toHaveLength(1);
  });
  it('keeps unreadable individual records without blocking valid project saves or deletes', () => {
    const s = memory(),
      broken = { schemaVersion: 99, id: 'future-project', research: 'preserve me' };
    s.setItem('terralab.projects.v1', JSON.stringify([broken]));
    const p = createTemplate();
    localSave(s, p);
    expect(localList(s)).toEqual([p]);
    expect(JSON.parse(s.getItem('terralab.projects.v1')!)).toContainEqual(broken);
    localDelete(s, p.id);
    expect(JSON.parse(s.getItem('terralab.projects.v1')!)).toEqual([broken]);
  });
  it('does not overwrite an unreadable index if its recovery backup fails', () => {
    const s = memory();
    s.setItem('terralab.projects.v1', 'broken json');
    const failing: StorageLike = {
      getItem: s.getItem,
      setItem: (key, value) => {
        if (key.includes('.recovery.')) throw Error('QuotaExceeded');
        s.setItem(key, value);
      },
    };
    expect(() => localSave(failing, createTemplate())).toThrow('QuotaExceeded');
    expect(s.getItem('terralab.projects.v1')).toBe('broken json');
  });
  it('propagates quota failures', () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw Error('QuotaExceeded');
      },
    };
    expect(() => localSave(s, createTemplate())).toThrow('QuotaExceeded');
  });
});
