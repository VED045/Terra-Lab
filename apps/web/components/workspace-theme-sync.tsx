'use client';
import { useEffect } from 'react';
import { workspaceThemes, type WorkspaceTheme } from '@terralab/shared';
import { useStudio } from '@/lib/store';

export const workspaceThemeKey = 'terralab.workspace-theme.v1';
const valid = (value: unknown): value is WorkspaceTheme =>
  workspaceThemes.some((theme) => theme.id === value);

// One visual preference across full-page loads, project navigation and browser tabs.
export function WorkspaceThemeSync() {
  useEffect(() => {
    const apply = (theme: WorkspaceTheme) => {
      const state = useStudio.getState();
      if (state.project.canvas.theme !== theme)
        useStudio.setState({
          project: { ...state.project, canvas: { ...state.project.canvas, theme } },
        });
    };
    try {
      const saved = localStorage.getItem(workspaceThemeKey);
      const active = JSON.parse(localStorage.getItem('terralab.active.v1') || 'null');
      const theme = valid(saved) ? saved : active?.canvas?.theme;
      if (valid(theme)) apply(theme);
    } catch {
      /* An invalid preference does not prevent application startup. */
    }
    const unsubscribe = useStudio.subscribe((state, previous) => {
      if (state.project.canvas.theme === previous.project.canvas.theme) return;
      try {
        localStorage.setItem(workspaceThemeKey, state.project.canvas.theme);
      } catch {}
    });
    const sync = (event: StorageEvent) => {
      if (event.key === workspaceThemeKey && valid(event.newValue)) apply(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', sync);
    };
  }, []);
  return null;
}
