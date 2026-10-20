'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  templates,
  createTemplate,
  deserializeProject,
  serializeProject,
  type Project,
} from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { saveProject, deleteProject, supabase } from '@/lib/persistence';
import {
  workspaceIndex,
  workspaceMeta,
  recordRecent,
  toggleStar,
  freshCopy,
  revisionHistory,
  projectAccess,
  researchRpc,
  downloadResearchResult,
  configurationDiff,
  localRuns,
  type ProjectRow,
  type RunRow,
} from '@/lib/research';
import { type ExperimentResult } from '@/lib/laboratory';
import { useLabView } from '@/lib/lab-view';
import { downloadFile } from '@/lib/downloads';
import { cloudStatusText, type AuthState } from '@/lib/auth-session';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
const views = [
  'My Projects',
  'Recent Projects',
  'Shared With Me',
  'Starred Projects',
  'Archived Projects',
  'Recent Experiments',
  'Saved Network Templates',
  'Teams',
] as const;
type View = (typeof views)[number];
export function ResearchDashboard({
  open,
  onOpenChange,
  auth,
  embedded = false,
  onRunDemo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  auth: AuthState;
  embedded?: boolean;
  onRunDemo?: () => void;
}) {
  const qc = useQueryClient(),
    { project, load } = useStudio();
  const query = useQuery({
    queryKey: ['projects', auth.email],
    queryFn: workspaceIndex,
    enabled: open,
    retry: 0,
  });
  const [view, setView] = useState<View>('My Projects'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('recent'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [selected, setSelected] = useState<ProjectRow | null>(null),
    [revisions, setRevisions] = useState<Awaited<ReturnType<typeof revisionHistory>>>([]),
    [access, setAccess] = useState<Awaited<ReturnType<typeof projectAccess>> | null>(null);
  const [userId, setUserId] = useState(''),
    [role, setRole] = useState('viewer'),
    [teamId, setTeamId] = useState(''),
    [teamName, setTeamName] = useState('');
  const [shareKind, setShareKind] = useState('project'),
    [shareTarget, setShareTarget] = useState(''),
    [shareUrl, setShareUrl] = useState(''),
    [invitation, setInvitation] = useState('');
  const [runs, setRuns] = useState<ExperimentResult[]>([]),
    [compare, setCompare] = useState<string[]>([]);
  const data = query.data;
  useEffect(() => {
    if (open)
      void localRuns()
        .then(setRuns)
        .catch((e) => setError(String(e)));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const hash = new URLSearchParams(location.hash.slice(1));
    const token = hash.get('invite');
    if (token) {
      setInvitation(token);
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, [open]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function openProject(p: Project) {
    if (
      useStudio.getState().dirty &&
      !window.confirm('Open another project? Export or save the current unsaved edits first.')
    )
      return;
    recordRecent(p.id);
    load(p);
    useLabView.getState().clear();
    onOpenChange(false);
  }
  async function inspect(row: ProjectRow) {
    setSelected(row);
    setTeamId(row.team_id || '');
    setRevisions([]);
    setAccess(null);
    setShareUrl('');
    if (data?.userId) {
      const [r, a] = await Promise.all([revisionHistory(row.id), projectAccess(row.id)]);
      setRevisions(r);
      setAccess(a);
    }
  }
  async function saveMetadata(config: Project, patch: Partial<Pick<Project, 'name' | 'archived'>>) {
    const state = useStudio.getState();
    const original = state.project.id === config.id ? state.project : config;
    const submitted = { ...original, ...patch };
    const saved = await saveProject(submitted);
    if (useStudio.getState().project.id === original.id) {
      // Keep live geometry and undo history, including edits made while saving.
      useStudio.getState().edit((p) => Object.assign(p, patch), false);
      useStudio.getState().acceptSave(submitted, saved);
    }
    return saved;
  }
  async function refreshSelected(id: string) {
    const index = await workspaceIndex();
    const p = index.projects.find((p) => p.id === id);
    if (p) await inspect(p);
  }
  const recent = workspaceMeta().recent;
  const projects = (data?.projects ?? [])
    .filter((p) => {
      if (!p.config.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (view === 'Archived Projects') return p.config.archived;
      if (p.config.archived) return false;
      if (view === 'Shared With Me') return p.owner_id !== data?.userId && p.owner_id !== 'local';
      if (view === 'Starred Projects') return data?.stars.includes(p.id);
      if (view === 'Recent Projects') return recent.includes(p.id);
      return p.owner_id === data?.userId || p.owner_id === 'local';
    })
    .sort((a, b) =>
      sort === 'name'
        ? a.config.name.localeCompare(b.config.name)
        : sort === 'oldest'
          ? a.updated_at.localeCompare(b.updated_at)
          : view === 'Recent Projects'
            ? recent.indexOf(a.id) - recent.indexOf(b.id)
            : b.updated_at.localeCompare(a.updated_at),
    );
  const mergedRuns: RunRow[] = [
    ...runs
      .filter((r) => !data?.runs.some((c) => c.id === r.id))
      .map((r) => ({
        id: r.id,
        project_id: r.request.project.id,
        created_at: r.createdAt,
        software_version: r.softwareVersion,
        status: r.status,
        metrics: r.summaries,
        request: r.request,
        manifest: null,
      })),
    ...(data?.runs ?? []),
  ].sort((a, b) =>
    sort === 'name'
      ? a.request.project.name.localeCompare(b.request.project.name)
      : sort === 'oldest'
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at),
  );
  async function readRun(row: RunRow) {
    return runs.find((r) => r.id === row.id) ?? downloadResearchResult(row.manifest, row.id);
  }
  const differences =
    compare.length === 2
      ? configurationDiff(
          mergedRuns.find((r) => r.id === compare[0])?.request,
          mergedRuns.find((r) => r.id === compare[1])?.request,
        )
      : [];
  const content = (
    <>
      {onRunDemo && (
        <div className="research-demo">
          <div>
            <strong>A receiver in motion</strong>
            <p>
              Watch a live, synthetic rover simulation with position estimates. Your current
              workspace is preserved.
            </p>
          </div>
          <Button variant="default" onClick={onRunDemo}>
            Run demo
          </Button>
        </div>
      )}
      <div className="library-heading">
        <span className="eyebrow">TERRALAB / WORKSPACE</span>
        <span className="local-badge">{cloudStatusText(auth)}</span>
      </div>
      <p className="field-caption">
        The dashboard loads up to 200 accessible rows per category; search and sorting apply to this
        loaded index.
      </p>
      <div className="research-tabs">
        {views.map((v) => (
          <button
            key={v}
            className={v === view ? 'active' : ''}
            onClick={() => {
              setView(v);
              setSelected(null);
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="research-toolbar">
        <input
          aria-label="Search research workspace"
          placeholder="Search names or experiment IDs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Sort workspace" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
        <Button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const original = useStudio.getState().project;
              const saved = await saveProject(original);
              useStudio.getState().acceptSave(original, saved);
              if (selected?.id === saved.id) await refreshSelected(saved.id);
              setMessage('Current project saved.');
            })
          }
        >
          Save current
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
          {error.includes('VERSION_CONFLICT')
            ? ' Your edits are retained. Reload the cloud version below, or save a copy.'
            : ''}
        </p>
      )}
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      {query.isPending ? (
        <p>Loading workspace…</p>
      ) : query.error ? (
        <p role="alert" className="error-message">
          {query.error.message}
        </p>
      ) : null}
      {views.slice(0, 5).includes(view) && (
        <>
          <div className="saved-project-list">
            {projects.map((p) => (
              <div className="research-project" key={p.id}>
                <button
                  aria-label={`${data?.stars.includes(p.id) ? 'Unstar' : 'Star'} ${p.config.name}`}
                  onClick={() =>
                    void action(() => toggleStar(p.id, Boolean(data?.stars.includes(p.id))))
                  }
                >
                  {data?.stars.includes(p.id) ? '★' : '☆'}
                </button>
                <button className="project-open" onClick={() => openProject(p.config)}>
                  <b>{p.config.name}</b>
                  <small>
                    {p.role} · {p.version ? `revision ${p.version}` : 'local'} ·{' '}
                    {p.config.objects.length} objects · {new Date(p.updated_at).toLocaleString()}
                  </small>
                </button>
                <Button size="sm" disabled={busy} onClick={() => void action(() => inspect(p))}>
                  Details
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await saveProject(freshCopy(p.config));
                    })
                  }
                >
                  Duplicate
                </Button>
                {p.role !== 'viewer' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await saveMetadata(p.config, { archived: !p.config.archived });
                      })
                    }
                  >
                    {p.config.archived ? 'Restore' : 'Archive'}
                  </Button>
                )}
                {p.role === 'owner' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${p.config.name}? Projects with experiment history must be archived.`,
                        )
                      )
                        void action(async () => {
                          await deleteProject(p.id);
                          setSelected(null);
                        });
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!projects.length && !query.isPending && (
            <p className="small-copy">
              No projects in this view. Save a network or accept a research invitation.
            </p>
          )}
          <div className="research-inline">
            <Button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const saved = await saveProject(freshCopy(project));
                  load(saved);
                  setMessage('Saved your edits as a new project.');
                })
              }
            >
              Save current as copy
            </Button>
            <label className="button button-outline button-sm">
              Import project JSON
              <input
                type="file"
                className="sr-only"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void action(async () => {
                      if (file.size > 2e6) throw Error('Project exceeds 2 MB');
                      openProject(
                        freshCopy(
                          deserializeProject(await file.text()),
                          file.name.replace(/\.json$/, ''),
                        ),
                      );
                    });
                  e.target.value = '';
                }}
              />
            </label>
            <Button
              onClick={() =>
                downloadFile(
                  new File([serializeProject(project)], 'terralab-project.json', {
                    type: 'application/json',
                  }),
                )
              }
            >
              Export current JSON
            </Button>
          </div>
          <p className="eyebrow">STARTER NETWORKS</p>
          <div className="research-starters">
            {templates.map((t) => (
              <button key={t.id} onClick={() => openProject(createTemplate(t.id))}>
                <b>{t.name}</b>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {view === 'Recent Experiments' && (
        <>
          <p className="small-copy">
            Completed records are immutable. Load a configuration into Laboratory to create a new
            run. Select two runs for a full configuration difference.
          </p>
          <div className="saved-project-list">
            {mergedRuns
              .filter((r) =>
                `${r.request.project.name} ${r.id}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <div className="research-project" key={r.id}>
                  <input
                    type="checkbox"
                    aria-label={`Compare ${r.id}`}
                    checked={compare.includes(r.id)}
                    onChange={(e) =>
                      setCompare(
                        e.target.checked
                          ? [...compare.slice(-1), r.id]
                          : compare.filter((id) => id !== r.id),
                      )
                    }
                  />
                  <span className="project-open">
                    <b>{r.request.project.name}</b>
                    <small>
                      {r.id} · {r.status} · {new Date(r.created_at).toLocaleString()} · model{' '}
                      {r.software_version}
                      {r.error ? ' · ' + r.error : ''}
                    </small>
                  </span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (!r.manifest && !runs.some((local) => local.id === r.id))
                          throw Error(r.error || 'This job has no published result artifact yet.');
                        const result = await readRun(r);
                        load(result.request.project);
                        useLabView.getState().show(result, 0);
                        onOpenChange(false);
                      })
                    }
                  >
                    Open results
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      openProject(
                        freshCopy(
                          { ...r.request.project, laboratory: r.request.config },
                          `${r.request.project.name} rerun`,
                        ),
                      )
                    }
                  >
                    Rerun configuration
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(async () =>
                        downloadFile(
                          new File([JSON.stringify(await readRun(r))], `${r.id}.json`, {
                            type: 'application/json',
                          }),
                        ),
                      )
                    }
                  >
                    JSON
                  </Button>
                </div>
              ))}
          </div>
          {compare.length === 2 && (
            <section className="research-detail">
              <h3>Configuration differences ({differences.length})</h3>
              <p>
                Comparison includes network, mobility, environment, seed and estimator settings. No
                matching fields have been omitted from the calculation.
              </p>
              <div className="lab-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>First run</th>
                      <th>Second run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differences.slice(0, 500).map((d) => (
                      <tr key={d.path}>
                        <td>{d.path}</td>
                        <td>{d.before.slice(0, 800)}</td>
                        <td>{d.after.slice(0, 800)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {differences.length > 500 && (
                <p>
                  First 500 differences shown; export both JSON records for the complete comparison.
                </p>
              )}
              {!differences.length && <p>Identical saved configurations.</p>}
            </section>
          )}
        </>
      )}
      {view === 'Saved Network Templates' && (
        <>
          <p>
            Templates retain the structured network and experiment settings. Copies receive new
            project IDs.
          </p>
          {data?.templates
            .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) =>
              sort === 'name'
                ? a.name.localeCompare(b.name)
                : sort === 'oldest'
                  ? a.created_at.localeCompare(b.created_at)
                  : b.created_at.localeCompare(a.created_at),
            )
            .map((t) => (
              <div className="research-project" key={t.id}>
                <b className="project-open">{t.name}</b>
                <Button onClick={() => openProject(freshCopy(t.config, t.name))}>
                  Use template
                </Button>
                {t.owner_id === data.userId && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await researchRpc('delete_network_template', { p_id: t.id });
                      })
                    }
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          <p className="small-copy">
            Save a current cloud project as a template from its Details panel. Starter templates
            remain available in My Projects.
          </p>
        </>
      )}
      {view === 'Teams' && (
        <section className="research-detail">
          <h3>Team workspaces</h3>
          <p>
            Team owners manage membership. Editors can version and run team projects; viewers can
            inspect and export. Project ownership remains explicit.
          </p>
          <div className="research-inline">
            <input
              aria-label="New team name"
              maxLength={80}
              placeholder="New team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <Button
              disabled={busy || !teamName.trim()}
              onClick={() =>
                void action(async () => {
                  await researchRpc('create_research_team', { p_name: teamName });
                  setTeamName('');
                })
              }
            >
              Create team
            </Button>
          </div>
          {data?.teams.map((t) => (
            <div className="research-project" key={t.id}>
              <b className="project-open">
                {t.name}
                <small>
                  {t.id} · {t.owner_id === data.userId ? 'owner' : 'member'}
                </small>
              </b>
              <Button onClick={() => setTeamId(t.id)}>Manage</Button>
            </div>
          ))}
          <div className="research-inline">
            <select
              aria-label="Manage team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Select team</option>
              {data?.teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Member user ID"
              placeholder="Member user UUID (from their profile)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <select aria-label="Member role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option>viewer</option>
              <option>editor</option>
            </select>
            <Button
              disabled={busy || !teamId}
              onClick={() =>
                void action(async () => {
                  await researchRpc('manage_team_member', {
                    p_team: teamId,
                    p_user: userId,
                    p_role: role,
                  });
                  setMessage('Team member saved.');
                })
              }
            >
              Set member
            </Button>
            <Button
              disabled={busy || !teamId}
              onClick={() =>
                void action(async () => {
                  await researchRpc('manage_team_member', {
                    p_team: teamId,
                    p_user: userId,
                    p_role: null,
                  });
                  setMessage('Team member removed.');
                })
              }
            >
              Remove member
            </Button>
          </div>
          {teamId && <TeamMembers teamId={teamId} />}
        </section>
      )}
      {selected && (
        <section className="research-detail">
          <h3>
            {selected.config.name} · {selected.role}
          </h3>
          <p>
            Owner {selected.owner_id} · {selected.id} · revision {selected.version}. Project access
            also permits reading/exporting its complete experiment history.
          </p>
          <div className="research-inline">
            <Button onClick={() => openProject(selected.config)}>Reload cloud version</Button>
            <Button
              disabled={busy || !data?.userId}
              onClick={() =>
                void action(async () => {
                  await researchRpc('save_network_template', {
                    p_id: selected.id,
                    p_name: selected.config.name,
                  });
                  setMessage('Immutable template saved.');
                })
              }
            >
              Save as network template
            </Button>
            <Button
              disabled={busy || selected.role === 'viewer'}
              onClick={() => {
                const name = prompt('Project name', selected.config.name)?.trim();
                if (name)
                  void action(async () => {
                    await saveMetadata(selected.config, { name });
                    await refreshSelected(selected.id);
                  });
              }}
            >
              Rename
            </Button>
            <Button
              onClick={() =>
                downloadFile(
                  new File([serializeProject(selected.config)], `${selected.id}.json`, {
                    type: 'application/json',
                  }),
                )
              }
            >
              Export setup
            </Button>
          </div>
          <h4>Revision history</h4>
          {!data?.userId && (
            <p>
              Cloud revisions become available after sign-in and a cloud save. Local JSON backups
              remain available.
            </p>
          )}
          <p>
            Restore creates a new revision. Existing revisions and experiments retain their original
            configuration.
          </p>
          {revisions.map((r) => (
            <div className="research-project" key={r.version}>
              <span className="project-open">
                Revision {r.version} · {new Date(r.created_at).toLocaleString()}
              </span>
              <Button
                size="sm"
                disabled={busy || selected.role === 'viewer'}
                onClick={() =>
                  void action(async () => {
                    const current = useStudio.getState();
                    if (
                      current.project.id === selected.id &&
                      current.dirty &&
                      !window.confirm(
                        'Restore this revision and replace unsaved edits? Cancel to save or export your current edits first.',
                      )
                    )
                      return;
                    const p = await researchRpc<Project>('restore_project_revision', {
                      p_id: selected.id,
                      p_version: r.version,
                      p_expected: selected.version,
                    });
                    if (project.id === p.id) load(p);
                    await refreshSelected(p.id);
                  })
                }
              >
                Restore
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  openProject(freshCopy(r.config, `${r.config.name} revision ${r.version}`))
                }
              >
                Open copy
              </Button>
            </div>
          ))}
          {selected.role === 'owner' && data?.userId && (
            <>
              <h4>Sharing and ownership</h4>
              <p>
                Invitations expire after seven days and require sign-in. Revoking a link stops new
                acceptance; remove an existing member separately. Accepted invitations grant project
                access, including its experiments and exports. A read-only recipient can retain
                downloaded copies.
              </p>
              <div className="research-inline">
                <select
                  aria-label="Share kind"
                  value={shareKind}
                  onChange={(e) => {
                    setShareKind(e.target.value);
                    if (e.target.value !== 'project') setRole('viewer');
                    setShareTarget('');
                  }}
                >
                  {['project', 'template', 'configuration', 'experiment', 'report'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <select
                  aria-label="Share role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option>viewer</option>
                  {shareKind === 'project' && <option>editor</option>}
                </select>
                {['template', 'experiment', 'report'].includes(shareKind) && (
                  <select
                    aria-label="Shared resource"
                    value={shareTarget}
                    onChange={(e) => setShareTarget(e.target.value)}
                  >
                    <option value="">Choose saved resource</option>
                    {(shareKind === 'template'
                      ? data.templates
                          .filter((t) => t.project_id === selected.id)
                          .map((t) => ({ id: t.id, name: t.name }))
                      : data.runs
                          .filter((r) => r.project_id === selected.id)
                          .map((r) => ({ id: r.id, name: `${r.created_at} ${r.status}` }))
                    ).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const token = await researchRpc<string>('create_research_share', {
                        p_id: selected.id,
                        p_role: shareKind === 'project' ? role : 'viewer',
                        p_kind: shareKind,
                        p_target: shareTarget || null,
                      });
                      setShareUrl(`${location.origin}/#invite=${token}`);
                      await refreshSelected(selected.id);
                      setShareUrl(`${location.origin}/#invite=${token}`);
                    })
                  }
                >
                  Create invitation
                </Button>
              </div>
              {shareUrl && (
                <label className="research-link">
                  Copy invitation URL
                  <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                </label>
              )}
              {access?.links.map((l) => (
                <div className="research-project" key={l.id}>
                  <span className="project-open">
                    {l.kind} · {l.role} ·{' '}
                    {l.revoked
                      ? 'revoked'
                      : `expires ${new Date(l.expires_at).toLocaleDateString()}`}
                  </span>
                  <Button
                    disabled={busy || l.revoked}
                    onClick={() =>
                      void action(async () => {
                        await researchRpc('revoke_research_share', { p_id: l.id });
                        await refreshSelected(selected.id);
                      })
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ))}
              <div className="research-inline">
                <input
                  aria-label="Project member UUID"
                  placeholder="Research peer user UUID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
                <select
                  aria-label="Project member role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option>viewer</option>
                  <option>editor</option>
                </select>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await researchRpc('manage_project_member', {
                        p_id: selected.id,
                        p_user: userId,
                        p_role: role,
                      });
                      await refreshSelected(selected.id);
                    })
                  }
                >
                  Set access
                </Button>
              </div>
              {access?.members.map((m) => (
                <div className="research-project" key={m.user_id}>
                  <span className="project-open">
                    {m.user_id} · {m.role}
                  </span>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await researchRpc('manage_project_member', {
                          p_id: selected.id,
                          p_user: m.user_id,
                          p_role: null,
                        });
                        await refreshSelected(selected.id);
                      })
                    }
                  >
                    Remove access
                  </Button>
                </div>
              ))}
              <div className="research-inline">
                <select
                  aria-label="Project team workspace"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  <option value="">Private workspace (no team)</option>
                  {data.teams
                    .filter((t) => t.owner_id === data.userId)
                    .map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await researchRpc('assign_project_team', {
                        p_id: selected.id,
                        p_team: teamId || null,
                        p_expected: selected.version,
                      });
                      await refreshSelected(selected.id);
                      setMessage(
                        'Team assignment saved. Reload the project before editing its next revision.',
                      );
                    })
                  }
                >
                  Assign team
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      <section className="research-detail">
        <h3>Accept a research invitation</h3>
        <div className="research-inline">
          <input
            aria-label="Research invitation"
            placeholder="Paste invitation URL or token"
            value={invitation}
            onChange={(e) => setInvitation(e.target.value)}
          />
          <Button
            disabled={busy || !invitation}
            onClick={() =>
              void action(async () => {
                let token = invitation.trim();
                if (token.includes('#'))
                  token = new URLSearchParams(token.split('#')[1]).get('invite') || '';
                const accepted = await researchRpc<{
                  projectId: string;
                  kind: string;
                  targetId: string | null;
                }>('redeem_research_share', { p_token: token });
                setInvitation('');
                setView('Shared With Me');
                setMessage(
                  `Accepted ${accepted.kind} invitation. Open the shared project or its saved experiment in Recent Experiments.`,
                );
              })
            }
          >
            Accept invitation
          </Button>
        </div>
      </section>
    </>
  );
  return embedded ? (
    <section aria-label="Projects and research">{content}</section>
  ) : (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Research workspace"
      description="Your networks, immutable experiments, revisions and shared research."
      wide
    >
      {content}
    </Dialog>
  );
}
function TeamMembers({ teamId }: { teamId: string }) {
  const q = useQuery({
    queryKey: ['projects', 'team-members', teamId],
    queryFn: async () => {
      const { data, error } = await supabase()!
        .from('team_members')
        .select('user_id,role')
        .eq('team_id', teamId);
      if (error) throw Error(error.message);
      return data;
    },
  });
  return (
    <div>
      {q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        q.data?.map((m) => (
          <p key={m.user_id}>
            {m.user_id} · {m.role}
          </p>
        ))
      )}
    </div>
  );
}
