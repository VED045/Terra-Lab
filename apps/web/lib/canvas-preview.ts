import { create } from 'zustand';
import type { Project } from '@terralab/shared';
import { useStudio } from './store';
type State = ReturnType<typeof useStudio.getState>;
export function createCanvasPreviewStore(project: Project) {
  const noop = () => {};
  // All preview mutations are local view settings; the active editor remains untouched.
  return create<State>((set) => ({
    ...useStudio.getInitialState(),
    project: structuredClone(project),
    selected: [],
    tool: 'pan',
    time: 0,
    playing: false,
    past: [],
    future: [],
    dirty: false,
    logs: [],
    edit: (change) =>
      set((state) => {
        const draft = structuredClone(state.project);
        change(draft);
        return { project: { ...state.project, canvas: draft.canvas } };
      }),
    select: (selected) => set({ selected }),
    setTool: (tool) => {
      if (['select', 'pan', 'measure'].includes(tool)) set({ tool });
    },
    load: noop,
    add: noop,
    update: noop,
    remove: noop,
    duplicate: noop,
    undo: noop,
    redo: noop,
    setTime: noop,
    play: noop,
    setSpeed: noop,
    markSaved: noop,
    acceptSave: noop,
    log: noop,
  }));
}
