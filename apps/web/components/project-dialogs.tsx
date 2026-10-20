'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  ArrowUpRight,
  FolderOpen,
  Copy,
  Archive,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import {
  templates,
  createTemplate,
  deserializeProject,
  serializeProject,
  type Project,
} from '@terralab/shared';
import { useStudio } from '@/lib/store';
import {
  listProjects,
  saveProject,
  deleteProject,
  supabase,
  uploadCloudSnapshot,
} from '@/lib/persistence';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function ProjectsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [archived, setArchived] = useState(false);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: open,
    retry: 1,
  });
  const { project, load, log } = useStudio();
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setFailure('');
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Project operation failed');
    } finally {
      setBusy(false);
    }
  }
  function openProject(p: Project) {
    load(p);
    onOpenChange(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Your research starts here."
      description="Open a saved network or explore a runnable starter project."
      wide
    >
      <div className="library-heading">
        <span className="eyebrow">START WITH A NETWORK</span>
        <span className="local-badge">
          {supabase()
            ? 'Cloud available · sign in to sync'
            : 'Local workspace · saved in this browser'}
        </span>
      </div>
      <div className="template-grid">
        {templates.map((t, i) => (
          <button
            className="template-card"
            key={t.id}
            onClick={() => {
              openProject(createTemplate(t.id));
              log(`Created ${t.name}`);
            }}
          >
            <div className={`template-preview preview-${t.id}`}>
              <svg viewBox="0 0 240 95" aria-hidden="true">
                {(t.id === 'poor'
                  ? [
                      [30, 65],
                      [85, 65],
                      [140, 65],
                      [205, 65],
                    ]
                  : t.id === 'outdoor'
                    ? [
                        [35, 25],
                        [120, 12],
                        [205, 25],
                        [205, 75],
                        [120, 88],
                        [35, 75],
                      ]
                    : [
                        [40, 20],
                        [200, 20],
                        [200, 75],
                        [40, 75],
                      ]
                ).map(([x, y], n) => (
                  <g key={n}>
                    <line x1={x} y1={y} x2="116" y2="49" stroke="currentColor" opacity=".23" />
                    <rect
                      x={x - 5}
                      y={y - 5}
                      width="10"
                      height="10"
                      rx="2"
                      fill="var(--canvas)"
                      stroke="currentColor"
                      transform={`rotate(45 ${x} ${y})`}
                    />
                  </g>
                ))}
                {t.id === 'moving' && (
                  <path
                    d="M65 64L160 64 170 35 80 33Z"
                    fill="none"
                    stroke="var(--purple)"
                    strokeDasharray="4 4"
                  />
                )}
                <circle cx="116" cy="49" r="5" fill="var(--green)" />
                <circle cx="116" cy="49" r="11" fill="none" stroke="var(--green)" opacity=".4" />
              </svg>
              <span className="template-number">0{i + 1}</span>
            </div>
            <span className="eyebrow">{t.tag}</span>
            <h3>
              {t.name}
              <ArrowUpRight size={16} />
            </h3>
            <p>{t.description}</p>
          </button>
        ))}
      </div>
      <div className="library-heading">
        <span className="eyebrow">SAVED PROJECTS</span>
        <label className="check-row">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      {failure && (
        <p role="alert" className="error-message">
          {failure}
        </p>
      )}
      {query.isPending ? (
        <p className="small-copy">Loading projects…</p>
      ) : query.isError ? (
        <p className="error-message">{query.error.message}</p>
      ) : query.data?.filter((p) => archived || !p.archived).length ? (
        <div className="saved-project-list">
          {query.data
            .filter((p) => archived || !p.archived)
            .map((p) => (
              <div className="saved-project" key={p.id}>
                <FolderOpen size={19} />
                <button className="project-open" onClick={() => openProject(p)}>
                  <b>
                    {p.name}
                    {p.archived ? ' · archived' : ''}
                  </b>
                  <span>
                    {p.objects.filter((o) => o.kind === 'anchor').length} transmitters ·{' '}
                    {new Date(p.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  aria-label={`Rename ${p.name}`}
                  disabled={busy}
                  onClick={() => {
                    const name = window.prompt('Project name', p.name)?.trim();
                    if (name) void action(() => saveProject({ ...p, name }));
                  }}
                >
                  Rename
                </button>
                <button
                  aria-label={`Duplicate ${p.name}`}
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      saveProject({
                        ...p,
                        id: crypto.randomUUID(),
                        name: `${p.name} copy`.slice(0, 80),
                      }),
                    )
                  }
                >
                  <Copy size={14} />
                </button>
                <button
                  aria-label={`${p.archived ? 'Unarchive' : 'Archive'} ${p.name}`}
                  disabled={busy}
                  onClick={() => void action(() => saveProject({ ...p, archived: !p.archived }))}
                >
                  <Archive size={14} />
                </button>
                <button
                  aria-label={`Delete ${p.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete “${p.name}” from saved projects?`))
                      void action(() => deleteProject(p.id));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      ) : (
        <div className="saved-empty">
          <Radio size={20} />
          <div>
            <b>A fresh workspace</b>
            <p>Save your first network to continue your research here.</p>
          </div>
        </div>
      )}
      <div className="dialog-footer">
        {supabase() && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void action(() => uploadCloudSnapshot(project))}
          >
            <Upload size={14} />
            Cloud snapshot
          </Button>
        )}
        <Button size="sm" onClick={() => downloadProject(project)}>
          <Download size={14} />
          Export current project
        </Button>
        <label className="button button-outline button-sm">
          <Upload size={14} />
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import project JSON"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 2e6) throw Error('Project file exceeds 2 MB');
                openProject(deserializeProject(await file.text()));
              } catch (err) {
                setFailure(err instanceof Error ? err.message : 'Invalid project');
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </Dialog>
  );
}
export function downloadProject(p: Project) {
  const url = URL.createObjectURL(new Blob([serializeProject(p)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^a-z0-9]+/gi, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
export { AccountDialog } from './account-dialog';
