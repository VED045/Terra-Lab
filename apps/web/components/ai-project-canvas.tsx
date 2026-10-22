'use client';
import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { Project } from '@terralab/shared';
import { createCanvasPreviewStore } from '@/lib/canvas-preview';
import NetworkCanvas from './network-canvas';
import { Button } from './ui/button';

export function AIProjectCanvas({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className={`ai-project-canvas theme-${project.canvas.theme}`}
      aria-label="Selected project canvas"
    >
      <div className="ai-canvas-heading">
        <button
          className="ai-canvas-toggle"
          aria-expanded={open}
          aria-controls="ai-saved-canvas"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> Project canvas{' '}
          <span className="ai-canvas-name">{project.name}</span>
        </button>
        <Button size="sm" onClick={onEdit}>
          Edit canvas
        </Button>
      </div>
      {open && (
        <div id="ai-saved-canvas">
          <div className="ai-canvas-stage">
            <Tooltip.Provider>
              <PreviewNetwork key={project.updatedAt} project={project} />
            </Tooltip.Provider>
          </div>
          <p>
            {project.name} · {project.objects.length} saved objects · The same Network studio
            renderer and calibrated-range baseline at t = 0 s. Pan, zoom, select and view controls
            stay in this preview. Edit canvas opens this project in Network studio.
          </p>
        </div>
      )}
    </section>
  );
}
function PreviewNetwork({ project }: { project: Project }) {
  const [store] = useState(() => createCanvasPreviewStore(project));
  return <NetworkCanvas canvasStore={store} readOnly fitOnLoad />;
}
