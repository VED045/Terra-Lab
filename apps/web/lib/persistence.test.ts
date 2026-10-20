import { describe, it, expect } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { localList, localSave, localDelete, type StorageLike } from './persistence';
function memory(): StorageLike {
  const a = new Map<string, string>();
  return {
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
  it('surfaces corrupt storage without overwriting it', () => {
    const s = memory();
    s.setItem('terralab.projects.v1', '{"broken":true}');
    expect(() => localSave(s, createTemplate())).toThrow();
    expect(s.getItem('terralab.projects.v1')).toBe('{"broken":true}');
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
