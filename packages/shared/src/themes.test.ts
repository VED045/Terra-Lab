import { describe, it, expect } from 'vitest';
import {
  workspaceThemes,
  themeIds,
  nextTheme,
  isLightTheme,
  createTemplate,
  serializeProject,
  deserializeProject,
  solveProject,
  type WorkspaceTheme,
} from './index';
describe('Workspace theme persistence', () => {
  it.each(workspaceThemes)('round-trips $name without changing the simulation', (theme) => {
    const project = createTemplate('outdoor');
    const receiver = project.objects.find((o) => o.kind === 'receiver')!;
    if (receiver.kind !== 'receiver') throw Error('Template has no receiver');
    const baseline = solveProject(project, receiver, 0);
    project.canvas.theme = theme.id;
    const restored = deserializeProject(serializeProject(project));
    expect(restored.canvas.theme).toBe(theme.id);
    expect(solveProject(restored, receiver, 0)).toEqual(baseline);
    expect(isLightTheme(theme.id)).toBe(theme.light);
  });
  it('cycles all palettes once and returns to the original', () => {
    let theme: WorkspaceTheme = themeIds[0];
    const visited = new Set<string>();
    for (const _ of themeIds) {
      visited.add(theme);
      theme = nextTheme(theme);
    }
    expect(visited.size).toBe(workspaceThemes.length);
    expect(theme).toBe('dark');
  });
  it('rejects unknown themes in imported setups', () => {
    const project = createTemplate('outdoor');
    expect(() =>
      deserializeProject(
        JSON.stringify({ ...project, canvas: { ...project.canvas, theme: 'missing' } }),
      ),
    ).toThrow();
  });
});
