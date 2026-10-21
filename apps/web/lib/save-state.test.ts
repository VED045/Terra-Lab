import { it, expect } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { useStudio } from './store';
it('accepting the same save twice does not mark a clean draft dirty again', () => {
  const original = { ...createTemplate(), cloudVersion: 1 };
  const saved = { ...original, cloudVersion: 2, updatedAt: '2026-10-21T00:00:00Z' };
  useStudio.getState().load(original);
  useStudio.getState().acceptSave(original, saved);
  useStudio.getState().acceptSave(original, saved);
  expect(useStudio.getState().dirty).toBe(false);
});
it('an older response never rolls back the accepted version or loses newer edits', () => {
  const original = { ...createTemplate(), cloudVersion: 1 };
  useStudio.getState().load({ ...original, cloudVersion: 3 });
  useStudio.getState().edit((p) => {
    p.name = 'Newer edit';
  });
  useStudio.getState().acceptSave(original, { ...original, cloudVersion: 2 });
  expect(useStudio.getState().project.cloudVersion).toBe(3);
  expect(useStudio.getState().project.name).toBe('Newer edit');
  expect(useStudio.getState().dirty).toBe(true);
});
