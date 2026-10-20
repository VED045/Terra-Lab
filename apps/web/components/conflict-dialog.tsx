'use client';
import { useState } from 'react';
import { deserializeProject, serializeProject, type Project } from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { supabase, saveProject } from '@/lib/persistence';
import { freshCopy } from '@/lib/research';
import { conflictChoices, reapplyDraft } from '@/lib/conflict';
import { downloadFile } from '@/lib/downloads';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function ConflictDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [local, setLocal] = useState<Project | null>(null),
    [latest, setLatest] = useState<Project | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const draft = structuredClone(useStudio.getState().project),
        db = supabase();
      if (!db) throw Error('Sign in to compare cloud revisions');
      const { data, error } = await db
        .from('projects')
        .select('config')
        .eq('id', draft.id)
        .single();
      if (error) throw Error(error.message);
      setLocal(draft);
      setLatest(deserializeProject(JSON.stringify(data.config)));
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve revision conflict"
      description="Your unsaved draft is preserved. Compare it with the latest saved revision, then copy it or deliberately reapply selected changes."
    >
      <Button disabled={busy} onClick={() => void refresh()}>
        Compare with latest revision
      </Button>
      {error && <p role="alert">{error}</p>}
      {local && latest && (
        <>
          <p>
            Local revision {local.cloudVersion ?? 'unsaved'}; latest {latest.cloudVersion}. Object
            changes are matched by ID. This is a two-way comparison; it cannot identify who
            originally changed a field.
          </p>
          <Button
            onClick={() =>
              downloadFile(
                new File([serializeProject(local)], local.id + '-conflict-draft.json', {
                  type: 'application/json',
                }),
              )
            }
          >
            Export preserved draft
          </Button>
          <Button
            onClick={() => {
              useStudio.getState().load(freshCopy(local));
              onOpenChange(false);
            }}
          >
            Open draft as a new copy
          </Button>
          <div className="lab-table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Reapply local</th>
                  <th>Resource</th>
                  <th>Latest / local</th>
                </tr>
              </thead>
              <tbody>
                {conflictChoices(local, latest).map((c) => (
                  <tr key={c.key}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={'Reapply ' + c.label}
                        checked={selected.includes(c.key)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, c.key] : s.filter((k) => k !== c.key),
                          )
                        }
                      />
                    </td>
                    <td>{c.label}</td>
                    <td>
                      <details>
                        <summary>Compare values</summary>
                        <pre>
                          {JSON.stringify(
                            c.key.startsWith('object:')
                              ? latest.objects.find((o) => o.id === c.key.slice(7))
                              : (latest as unknown as Record<string, unknown>)[c.key],
                            null,
                            2,
                          ) ?? '(absent)'}
                        </pre>
                        <pre>
                          {JSON.stringify(
                            c.key.startsWith('object:')
                              ? local.objects.find((o) => o.id === c.key.slice(7))
                              : (local as unknown as Record<string, unknown>)[c.key],
                            null,
                            2,
                          ) ?? '(absent)'}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={busy || !selected.length}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                if (serializeProject(useStudio.getState().project) !== serializeProject(local))
                  throw Error('Draft changed. Compare again before applying.');
                const merged = reapplyDraft(local, latest, selected);
                localStorage.setItem('terralab.conflict-recovery.v1', serializeProject(local));
                const saved = await saveProject(merged);
                if (serializeProject(useStudio.getState().project) !== serializeProject(local))
                  throw Error(
                    'Saved selected changes, but a newer local draft exists. It was preserved; compare again.',
                  );
                useStudio.getState().load(saved);
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save selected changes against latest revision
          </Button>
        </>
      )}
    </Dialog>
  );
}
