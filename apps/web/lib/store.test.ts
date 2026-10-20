import { beforeEach, describe, it, expect } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { useStudio } from './store';
beforeEach(() => useStudio.getState().load(createTemplate('square')));
describe('Editor transactions', () => {
  it('updates the active project ID after a successful legacy save', () => {
    const id = crypto.randomUUID();
    useStudio.getState().markSaved('2026-10-20T00:00:00.000Z', id);
    expect(useStudio.getState().project.id).toBe(id);
    expect(useStudio.getState().dirty).toBe(false);
  });
  it('adds, updates, duplicates and deletes real objects', () => {
    let s = useStudio.getState();
    s.add('receiver', { x: 10, y: 20 });
    s = useStudio.getState();
    const id = s.selected[0];
    s.update(id, { x: 30 });
    expect(useStudio.getState().project.objects.find((o) => o.id === id)?.x).toBe(30);
    s.duplicate();
    expect(useStudio.getState().project.objects).toHaveLength(7);
    useStudio.getState().remove();
    expect(useStudio.getState().project.objects).toHaveLength(6);
  });
  it('restores configuration through undo and redo', () => {
    const before = useStudio.getState().project;
    useStudio.getState().add('anchor', { x: 50, y: 80 });
    const after = useStudio.getState().project;
    useStudio.getState().undo();
    expect(useStudio.getState().project).toEqual(before);
    useStudio.getState().redo();
    expect(useStudio.getState().project).toEqual(after);
  });
  it('rejects invalid changes with a log entry', () => {
    useStudio.getState().update('tx-1', { noise: -2 });
    const s = useStudio.getState();
    const a = s.project.objects[0];
    expect(a.kind === 'anchor' && a.noise).toBe(0.15);
    expect(s.logs.at(-1)?.level).toBe('warn');
  });
  it('clears removed trajectory references', () => {
    useStudio.getState().load(createTemplate('moving'));
    useStudio.getState().select(['path-1']);
    useStudio.getState().remove();
    const rx = useStudio.getState().project.objects.find((o) => o.kind === 'receiver');
    expect(rx?.kind === 'receiver' && rx.trajectoryId).toBe(null);
  });
  it('new edits after undo clear the redo branch', () => {
    useStudio.getState().add('anchor', { x: 5, y: 5 });
    useStudio.getState().undo();
    useStudio.getState().add('receiver', { x: 9, y: 9 });
    expect(useStudio.getState().future).toEqual([]);
  });
});
