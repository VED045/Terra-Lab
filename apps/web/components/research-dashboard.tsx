'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FlaskConical,
  MoreHorizontal,
  Plus,
  Star,
} from 'lucide-react';
import { ResearchDashboardShell } from './research-dashboard-shell';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  templates,
  createTemplate,
  createBlankProject,
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
  revisionProject,
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
import { RenameProject } from './rename-project';
import { ProjectActivity } from './project-activity';
import { RunComparison } from './run-comparison';
const views = [
  'My Projects',
  'Recent Projects',
  'Shared With Me',
  'Team Projects',
  'Starred Projects',
  'Archived Projects',
  'Recent Experiments',
  'Saved Network Templates',
  'Teams',
] as const;
export type View = (typeof views)[number] | 'Home';
export function ResearchDashboard({
  open,
  onOpenChange,
  auth,
  embedded = false,
  onRunDemo,
  onAccount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  auth: AuthState;
  embedded?: boolean;
  onRunDemo?: () => void;
  onAccount?: () => void;
}) {
  const qc = useQueryClient(),
    { project, load } = useStudio();
  const query = useQuery({
    queryKey: ['projects', auth.email],
    queryFn: workspaceIndex,
    enabled: open,
    retry: 0,
    staleTime: 15000,
  });
  const [view, setView] = useState<View>(embedded ? 'Home' : 'My Projects'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('recent'),
    [ownerFilter, setOwnerFilter] = useState(''),
    [teamFilter, setTeamFilter] = useState(''),
    [typeFilter, setTypeFilter] = useState(''),
    [sinceFilter, setSinceFilter] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [selected, setSelected] = useState<ProjectRow | null>(null),
    [revisions, setRevisions] = useState<Awaited<ReturnType<typeof revisionHistory>>>([]);
  const [invitation, setInvitation] = useState('');
  const [runs, setRuns] = useState<ExperimentResult[]>([]),
    [compare, setCompare] = useState<string[]>([]);
  const data = query.data;
  const importInput = useRef<HTMLInputElement>(null);
  const selectedDetails = useRef<HTMLElement>(null);
  useEffect(() => {
    if (embedded && selected?.id) {
      selectedDetails.current?.focus({ preventScroll: true });
      selectedDetails.current?.scrollIntoView({ block: 'start' });
    }
  }, [embedded, selected?.id]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('Untitled research project');
  const [newTemplate, setNewTemplate] = useState('blank');
  function chooseView(next: View) {
    setView(next);
    setSelected(null);
    if (next === 'My Projects' || next === 'Home') {
      setSearch('');
      setOwnerFilter('');
      setTeamFilter('');
      setTypeFilter('');
      setSinceFilter('');
      setStatusFilter('');
    }
  }
  function exportProject() {
    downloadFile(
      new File([serializeProject(project)], 'terralab-project.json', { type: 'application/json' }),
    );
  }
  function startProject(template = 'blank') {
    setError('');
    setNewTemplate(template);
    setNewName(
      template === 'square'
        ? 'Untitled research project'
        : templates.find((t) => t.id === template)?.name || 'Untitled research project',
    );
    setCreateOpen(true);
  }
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
    const before = qc.getQueryState(['projects', auth.email])?.dataUpdatedAt;
    try {
      await work();
      if (qc.getQueryState(['projects', auth.email])?.dataUpdatedAt === before)
        await qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
      await qc.fetchQuery({
        queryKey: ['projects', auth.email],
        queryFn: workspaceIndex,
        staleTime: 15000,
      });
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
    setRevisions([]);
    if (data?.userId) {
      const r = await revisionHistory(row.id);
      setRevisions(r);
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
    // Share the refetch with the dashboard instead of independently fetching all eight tables.
    await qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
    const index = await qc.fetchQuery({
      queryKey: ['projects', auth.email],
      queryFn: workspaceIndex,
      staleTime: 15000,
    });
    const p = index.projects.find((p) => p.id === id);
    if (p) await inspect(p);
  }
  const recent = workspaceMeta().recent;
  const projects = (data?.projects ?? [])
    .filter((p) => {
      if (!p.config.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter && p.owner_id !== ownerFilter) return false;
      if (teamFilter && p.team_id !== teamFilter) return false;
      if (sinceFilter && p.updated_at.slice(0, 10) < sinceFilter) return false;
      if (
        typeFilter &&
        !p.config.objects.some(
          (o) =>
            o.kind === 'receiver' &&
            (typeFilter === 'moving' ? o.mobility !== 'stationary' : o.mobility === 'stationary'),
        )
      )
        return false;
      if (
        statusFilter &&
        !data?.runs.some((r) => r.project_id === p.id && r.status === statusFilter)
      )
        return false;
      if (view === 'Archived Projects') return p.config.archived;
      if (p.config.archived) return false;
      if (view === 'Team Projects') return p.team_id !== null;
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
  const allProjects = data?.projects ?? [];
  const owned = allProjects.filter(
    (p) => !p.config.archived && (p.owner_id === data?.userId || p.owner_id === 'local'),
  );
  const projectCounts: Partial<Record<View, number>> = {
    'My Projects': owned.length,
    'Recent Projects': allProjects.filter((p) => !p.config.archived && recent.includes(p.id))
      .length,
    'Starred Projects': allProjects.filter((p) => !p.config.archived && data?.stars.includes(p.id))
      .length,
    'Archived Projects': allProjects.filter((p) => p.config.archived).length,
  };
  const content = (
    <>
      {!embedded && onRunDemo && (
        <div className="research-demo">
          <div>
            <strong>A receiver in motion</strong>
            <p>
              Watch a live, synthetic rover simulation with position estimates. Your current
              workspace is preserved.
            </p>
          </div>
          <Button
            variant="default"
            help="Open a moving-receiver example and play the synthetic simulation. Your current workspace is preserved."
            onClick={onRunDemo}
          >
            Run demo
          </Button>
        </div>
      )}
      {!embedded && (
        <>
          <div className="library-heading">
            <span className="eyebrow">TERRALAB / WORKSPACE</span>
            <span className="local-badge">{cloudStatusText(auth)}</span>
          </div>
          <p className="field-caption">
            The dashboard loads up to 200 accessible rows per category; search and sorting apply to
            this loaded index.
          </p>
        </>
      )}
      <details className="research-detail">
        <summary>Project filters (loaded index)</summary>
        <div className="research-inline">
          <label>
            Owner
            <select
              aria-label="Filter owner"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="">All owners</option>
              {[...new Set(data?.projects.map((p) => p.owner_id))].map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label>
            Team
            <select
              aria-label="Filter team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {data?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter project type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All project types</option>
              <option value="moving">Moving receiver</option>
              <option value="stationary">Stationary receiver</option>
            </select>
          </label>
          <label>
            Updated since
            <input
              type="date"
              aria-label="Updated since"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
            />
          </label>
          <label>
            Run status
            <select
              aria-label="Filter experiment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Any status</option>
              {['completed', 'cancelled', 'failed', 'interrupted'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            onClick={() => {
              setOwnerFilter('');
              setTeamFilter('');
              setTypeFilter('');
              setSinceFilter('');
              setStatusFilter('');
            }}
          >
            Clear filters
          </Button>
        </div>
      </details>
      {embedded && (
        <div className="dashboard-panel-heading">
          <h2>{view === 'My Projects' || view === 'Home' ? 'Projects' : view}</h2>
          <Button variant="default" onClick={() => startProject()}>
            <Plus size={16} />
            New Project
          </Button>
        </div>
      )}
      <div className="research-tabs">
        {(embedded
          ? (['My Projects', 'Recent Projects', 'Starred Projects', 'Archived Projects'] as const)
          : views
        ).map((v) => (
          <button
            key={v}
            className={v === view || (v === 'My Projects' && view === 'Home') ? 'active' : ''}
            onClick={() => {
              setView(v);
              setSelected(null);
            }}
          >
            {embedded
              ? (
                  {
                    'My Projects': 'All Projects',
                    'Recent Projects': 'Recent',
                    'Starred Projects': 'Starred',
                    'Archived Projects': 'Archived',
                  } as Record<string, string>
                )[v]
              : v}
            {embedded && <span className="dashboard-tab-count"> ({projectCounts[v] ?? 0})</span>}
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
      {view !== 'Recent Experiments' && view !== 'Saved Network Templates' && view !== 'Teams' && (
        <>
          <div className="saved-project-list">
            {projects.map((p) => (
              <div className="research-project dashboard-project-row" key={p.id}>
                <button
                  aria-label={`${data?.stars.includes(p.id) ? 'Unstar' : 'Star'} ${p.config.name}`}
                  onClick={() =>
                    void action(() => toggleStar(p.id, Boolean(data?.stars.includes(p.id))))
                  }
                >
                  <Star size={17} fill={data?.stars.includes(p.id) ? 'currentColor' : 'none'} />
                </button>
                <button className="project-open" onClick={() => openProject(p.config)}>
                  <b>{p.config.name}</b>
                  {embedded && (
                    <>
                      <span className="dashboard-project-description">
                        {p.config.objects.some(
                          (o) => o.kind === 'receiver' && o.mobility !== 'stationary',
                        )
                          ? 'Follow a receiver along a repeatable simulation.'
                          : 'Explore network geometry and positioning estimates.'}
                      </span>
                      <span className="dashboard-tags">
                        <span>Simulation</span>
                        <span>
                          {p.config.objects.some(
                            (o) => o.kind === 'receiver' && o.mobility !== 'stationary',
                          )
                            ? 'Rover'
                            : 'Network'}
                        </span>
                        <span>{p.role}</span>
                      </span>
                    </>
                  )}
                  <small className={embedded ? 'sr-only' : undefined}>
                    {p.role} · {p.version ? `revision ${p.version}` : 'local'} ·{' '}
                    {p.config.objects.length} objects · {new Date(p.updated_at).toLocaleString()}
                  </small>
                </button>
                {embedded && (
                  <>
                    <span className="dashboard-row-meta">
                      <FlaskConical size={14} />
                      {p.config.objects.length} objects
                    </span>
                    <time className="dashboard-row-date" dateTime={p.updated_at}>
                      <CalendarDays size={14} />
                      {new Date(p.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </time>
                    <span className={`dashboard-status ${p.config.archived ? 'archived' : ''}`}>
                      <i />
                      {p.config.archived ? 'Archived' : 'Active'}
                    </span>
                  </>
                )}
                <ProjectActions compact={embedded} name={p.config.name}>
                  <Button size="sm" disabled={busy} onClick={() => void action(() => inspect(p))}>
                    Details
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (!confirm('Create a separate copy of ' + p.config.name + '?')) return;
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
                          if (
                            !confirm(
                              (p.config.archived ? 'Restore ' : 'Archive ') +
                                p.config.name +
                                '? Historical experiments will remain unchanged.',
                            )
                          )
                            return;
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
                </ProjectActions>
                {embedded && (
                  <button
                    className="dashboard-open-arrow"
                    aria-label={`Open ${p.config.name}`}
                    onClick={() => openProject(p.config)}
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!projects.length && !query.isPending && (
            <p className="small-copy">
              No projects in this view. Save a network or accept a research invitation.
            </p>
          )}
          <div className="research-inline library-utilities">
            <Button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (!confirm('Save the current draft as a separate private project copy?'))
                    return;
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
                ref={embedded ? undefined : importInput}
                aria-label="Import project JSON"
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
          {!embedded && (
            <>
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
        </>
      )}
      {view === 'Recent Experiments' && (
        <>
          <RunComparison
            onSelect={setCompare}
            ids={compare}
            load={async (id) => {
              const row = mergedRuns.find((r) => r.id === id);
              if (!row) throw Error('Run no longer in accessible index');
              return readRun(row);
            }}
          />
          <p className="small-copy">
            Completed records are immutable. Load a configuration into Laboratory to create a new
            run. Select two to four runs for metrics, scientific differences and reproducible
            reports.
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
                          ? [...compare.slice(-3), r.id]
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
          <p>Collaboration manages invitations, team membership and permissions.</p>
          <Button asChild>
            <Link href="/collaboration?section=Manage%20access">Open Collaboration</Link>
          </Button>
          {data?.teams.map((t) => (
            <div className="research-project" key={t.id}>
              <b className="project-open">{t.name}</b>
              <Link href={'/collaboration?section=Manage%20access&resource=' + t.id}>
                Manage access
              </Link>
            </div>
          ))}
        </section>
      )}
      {selected && (
        <section
          ref={selectedDetails}
          tabIndex={-1}
          aria-label="Project details"
          className="research-detail"
        >
          <h3>
            {selected.config.name} · {selected.role}
          </h3>
          <p>
            Owner {selected.owner_id} · {selected.id} · revision {selected.version}. Project access
            also permits reading/exporting its complete experiment history.
          </p>
          <p>
            Last recorded editor: {revisions[0]?.author_id ?? 'not available'} ·{' '}
            {selected.config.objects.filter((o) => o.kind === 'anchor').length} anchors ·{' '}
            {selected.config.objects.filter((o) => o.kind === 'receiver').length} receivers.
            Baseline: {selected.config.settings.engine}, {selected.config.settings.duration} s, seed{' '}
            {selected.config.settings.seed}. Laboratory:{' '}
            {selected.config.laboratory?.measurement ?? 'default TOA'}.
          </p>
          <details>
            <summary>Recent recorded experiments</summary>
            {data?.runs
              .filter((r) => r.project_id === selected.id)
              .slice(0, 5)
              .map((r) => (
                <p key={r.id}>
                  {r.id} · {r.status} · {r.created_at}
                </p>
              ))}
          </details>
          <ProjectActivity projectId={selected.id} cloud={Boolean(data?.userId)} />
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
            <RenameProject
              name={selected.config.name}
              disabled={busy || selected.role === 'viewer'}
              onRename={async (name) => {
                await saveMetadata(selected.config, { name });
                await refreshSelected(selected.id);
                // refreshSelected already refreshed the workspace index.
              }}
            />
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
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const config = await revisionProject(selected.id, r.version);
                    openProject(freshCopy(config, config.name + ' revision ' + r.version));
                  })
                }
              >
                Open copy
              </Button>
            </div>
          ))}
          {selected.role === 'owner' && data?.userId && (
            <>
              <h4>Sharing and ownership</h4>
              <p>Manage members, invitations and workspace assignment in Collaboration.</p>
              <Button asChild>
                <Link href={'/collaboration?section=Manage%20access&resource=' + selected.id}>
                  Manage access in Collaboration
                </Link>
              </Button>
            </>
          )}
        </section>
      )}
      {invitation && (
        <p>
          <Link href={'/collaboration#invite=' + encodeURIComponent(invitation)}>
            Review invitation in Collaboration
          </Link>
        </p>
      )}
    </>
  );
  const newProjectDialog = (
    <Dialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      title="New research project"
      description="Start with a blank canvas for full control, or choose an existing starter network."
    >
      <form
        className="dashboard-create-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          void action(async () => {
            if (
              useStudio.getState().dirty &&
              !confirm('Create a new project? Save or export the current unsaved edits first.')
            )
              return;
            const next =
              newTemplate === 'blank' ? createBlankProject() : createTemplate(newTemplate);
            next.name = newName.trim();
            next.canvas.theme = useStudio.getState().project.canvas.theme;
            const saved = await saveProject(next);
            setCreateOpen(false);
            recordRecent(saved.id);
            load(saved);
            useLabView.getState().clear();
            onOpenChange(false);
          });
        }}
      >
        <label>
          Project name
          <input
            autoFocus
            aria-label="New project name"
            required
            maxLength={80}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <label>
          Starting network
          <select
            aria-label="Starting network"
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
          >
            <option value="blank">Blank canvas — no starter network</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="research-inline">
          <Button type="button" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" disabled={busy || !newName.trim()} type="submit">
            {busy ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
  return embedded ? (
    <ResearchDashboardShell
      view={view}
      onView={chooseView}
      onAccount={onAccount}
      onStudio={() => onOpenChange(false)}
      authText={cloudStatusText(auth)}
      email={auth.email}
      onCreate={() => startProject()}
      onImport={() => importInput.current?.click()}
      onExport={exportProject}
      onTemplate={startProject}
      stats={{
        projects: owned.length,
        experiments: mergedRuns.length,
        running: mergedRuns.filter((r) => ['queued', 'running'].includes(r.status)).length,
        shared: allProjects.filter(
          (p) => !p.config.archived && p.owner_id !== data?.userId && p.owner_id !== 'local',
        ).length,
        team: allProjects.filter((p) => !p.config.archived && p.team_id).length,
      }}
      demo={
        onRunDemo && (
          <div className="research-demo">
            <div>
              <strong>
                <i />A receiver in motion <span className="dashboard-live">LIVE DEMO</span>
              </strong>
              <p>
                Watch a live, synthetic rover simulation with position estimates.
                <br />
                Your current workspace is preserved.
              </p>
            </div>
            <Button
              variant="default"
              help="Open a moving-receiver example and play the synthetic simulation. Your current workspace is preserved."
              onClick={onRunDemo}
            >
              Run demo <ArrowRight size={16} />
            </Button>
          </div>
        )
      }
    >
      <section className="dashboard-content" aria-label="Projects and research">
        {content}
      </section>
      <input
        ref={importInput}
        type="file"
        hidden
        aria-label="Import project file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void action(async () => {
              if (file.size > 2e6) throw Error('Project exceeds 2 MB');
              openProject(
                freshCopy(deserializeProject(await file.text()), file.name.replace(/\.json$/, '')),
              );
            });
          e.target.value = '';
        }}
      />
      {newProjectDialog}
    </ResearchDashboardShell>
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
function ProjectActions({
  compact,
  name,
  children,
}: {
  compact: boolean;
  name: string;
  children: ReactNode;
}) {
  if (!compact) return <>{children}</>;
  return (
    <details className="dashboard-project-actions">
      <summary aria-label={`Actions for ${name}`}>
        <MoreHorizontal size={18} />
      </summary>
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button'))
            e.currentTarget.closest('details')?.removeAttribute('open');
        }}
      >
        {children}
      </div>
    </details>
  );
}
