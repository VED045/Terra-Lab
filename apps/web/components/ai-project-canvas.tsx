'use client';
import { useEffect, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { Project } from '@terralab/shared';
import { createCanvasPreviewStore } from '@/lib/canvas-preview';
import NetworkCanvas from './network-canvas';
import { Button } from './ui/button';
export type CanvasView = { selected: string[]; canvas: Project['canvas'] };
export function AIProjectCanvas({
  project,
  onEdit,
  onView,
  theme,
}: {
  project: Project;
  theme?: Project['canvas']['theme'];
  onEdit: () => void;
  onView?: (view: CanvasView) => void;
}) {
  const [mode, setMode] = useState<'split' | 'compact' | 'hidden'>('split');
  const [open, setOpen] = useState(true);
  const [store] = useState(() => createCanvasPreviewStore(project));
  const mountedOnce = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('terralab.ai.canvas-layout.v1');
      if (saved === 'split' || saved === 'compact' || saved === 'hidden') setMode(saved);
    } catch {}
  }, []);
  useEffect(() => {
    store.setState((state) => ({
      project: {
        ...structuredClone(project),
        canvas: { ...state.project.canvas, theme: theme ?? project.canvas.theme },
      },
      selected: state.selected.filter((id) => project.objects.some((o) => o.id === id)),
    }));
  }, [project, store, theme]);
  useEffect(() => {
    const send = () => {
      const s = store.getState();
      onView?.({ selected: s.selected, canvas: s.project.canvas });
    };
    send();
    return store.subscribe(send);
  }, [store, onView]);
  function changeMode(value: typeof mode) {
    setMode(value);
    setOpen(true);
    try {
      localStorage.setItem('terralab.ai.canvas-layout.v1', value);
    } catch {}
  }
  return (
    <section
      className={`ai-project-canvas theme-${theme ?? project.canvas.theme}`}
      data-layout={mode}
      aria-label="Selected project canvas"
    >
      <div className="ai-canvas-heading">
        <button
          className="ai-canvas-toggle"
          aria-expanded={open && mode !== 'hidden'}
          aria-controls="ai-saved-canvas"
          onClick={() => (mode === 'hidden' ? changeMode('split') : setOpen((v) => !v))}
        >
          <span aria-hidden="true">{open && mode !== 'hidden' ? '▾' : '▸'}</span> Project canvas{' '}
          <span className="ai-canvas-name">{project.name}</span>
        </button>
        <select
          aria-label="Canvas layout"
          value={mode}
          onChange={(e) => changeMode(e.target.value as typeof mode)}
        >
          <option value="split">Expanded canvas</option>
          <option value="compact">Compact canvas</option>
          <option value="hidden">Hide canvas</option>
        </select>
        <Button size="sm" onClick={onEdit}>
          Edit canvas
        </Button>
      </div>
      {open && mode !== 'hidden' && (
        <div id="ai-saved-canvas">
          <div className="ai-canvas-stage">
            <Tooltip.Provider>
              <NetworkCanvas
                canvasStore={store}
                readOnly
                fitOnLoad={!mountedOnce.current}
                onInitialFit={() => {
                  mountedOnce.current = true;
                }}
              />
            </Tooltip.Provider>
          </div>
          <p>
            {project.name} · {project.objects.length} saved objects · The same Network studio
            renderer at t = 0 s. Pan, zoom and selection stay in this view. Edit canvas opens this
            project in Network studio.
          </p>
        </div>
      )}
    </section>
  );
}
