import { describe, it, expect } from 'vitest';
import { createTemplate } from '@terralab/shared';
import { createCanvasPreviewStore } from './canvas-preview';
import { useStudio } from './store';
describe('shared canvas with isolated preview state', () => {
  it('allows local viewport changes but cannot edit source geometry, save, undo or alter the active studio', () => {
    const project = createTemplate(),
      original = JSON.stringify(project),
      active = useStudio.getState(),
      preview = createCanvasPreviewStore(project);
    preview.getState().edit((p) => {
      p.canvas.zoom = 2;
      p.objects = [];
      p.name = 'Attempted edit';
    });
    expect(preview.getState().project.canvas.zoom).toBe(2);
    expect(preview.getState().project.objects).toEqual(project.objects);
    expect(preview.getState().project.name).toBe(project.name);
    preview.getState().select(['rx-1']);
    preview.getState().setTool('anchor');
    preview.getState().remove();
    preview.getState().duplicate();
    preview.getState().undo();
    expect(preview.getState().tool).toBe('pan');
    expect(preview.getState().project.objects).toEqual(project.objects);
    expect(JSON.stringify(project)).toBe(original);
    expect(useStudio.getState()).toBe(active);
  });
});
