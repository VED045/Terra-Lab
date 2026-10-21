'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Activity,
  FlaskConical,
  Radio,
  Crosshair,
  Square,
  Route,
  Layers,
  FolderOpen,
  BookOpen,
  Settings2,
  PanelRight,
  PanelLeftClose,
  PanelLeftOpen,
  HelpCircle,
  Sun,
  Moon,
  ChevronRight,
  ChevronDown,
  Check,
  Undo2,
  Redo2,
  Save,
  Play,
  Pause,
  Square as StopIcon,
  SkipForward,
  RotateCcw,
  Download,
  Share2,
  Plus,
  PanelBottomClose,
  PanelBottomOpen,
  Terminal,
  Table2,
  ChartNoAxesCombined,
  Search,
  UserRound,
  ArrowUpRight,
  Network,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import {
  advanceClock,
  createTemplate,
  deserializeProject,
  solveProject,
  distance,
  simulationSamples,
  nextTheme,
  isLightTheme,
  measurementNames,
  estimatorNames,
  type Receiver,
  type Solution,
} from '@terralab/shared';
import { useStudio, formatTime, type ToolMode } from '@/lib/store';
import { saveProject, supabase, observeSaveConflicts } from '@/lib/persistence';
import { observeAuthSession, type AuthState } from '@/lib/auth-session';
import NetworkCanvas from './network-canvas';
import Inspector from './inspector';
import { SettingsDialog } from './settings-dialog';
import { AccountDialog } from './project-dialogs';
import { ResearchDashboard } from './research-dashboard';
import { NetworkLogo } from './network-logo';
import { useSceneView } from '@/lib/scene-view';
import { workspaceIndex } from '@/lib/research';
import { projectContent } from '@/lib/project-content';
import { SignalDialog } from './signal-dialog';
import { ShareDialog } from './share-dialog';
import { LaboratoryDialog } from './laboratory-dialog';
import { LaboratoryPreviewFacts } from './laboratory-preview';
import { useLabView } from '@/lib/lab-view';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { CollaborationLink } from './collaboration-link';
import { Tool } from './ui/tool';
import { RenameProject } from './rename-project';
import { ConflictDialog } from './conflict-dialog';
const ScientificChart = dynamic(() => import('./scientific-chart'), {
  ssr: false,
  loading: () => <div className="chart-loading">Loading scientific chart…</div>,
});
const Network3D = dynamic(() => import('./network-3d'), {
  ssr: false,
  loading: () => (
    <div className="scene-state" role="status">
      Loading 3D workspace…
    </div>
  ),
});
type WorkspacePage = 'auto' | 'studio' | 'projects';
export default function Studio({ workspace = 'auto' }: { workspace?: WorkspacePage }) {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delayDuration={300}>
        <Workspace workspace={workspace} />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
function Workspace({ workspace }: { workspace: WorkspacePage }) {
  const router = useRouter();
  const [demoMode, setDemoMode] = useState(false);
  const signedInBefore = useRef(false);
  const s = useStudio();
  const sceneView = useSceneView();
  const { project, selected, time, playing, dirty, logs, edit, log } = s;
  const speed = project.settings.speedMultiplier;
  const [objectsCollapsed, setObjectsCollapsed] = useState(false);
  useEffect(() => {
    try {
      setObjectsCollapsed(localStorage.getItem('terralab.objects-collapsed') === 'true');
    } catch {
      /* Optional view preference. */
    }
  }, []);
  function toggleObjects() {
    const collapsed = !objectsCollapsed;
    setObjectsCollapsed(collapsed);
    try {
      localStorage.setItem('terralab.objects-collapsed', String(collapsed));
    } catch {
      /* Keep the control usable without storage. */
    }
  }
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(workspace === 'projects');
  const [accountOpen, setAccountOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [laboratoryOpen, setLaboratoryOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const labView = useLabView();
  const labRecord = labView.result?.records[labView.index];
  const [helpOpen, setHelpOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<'overview' | 'measurements' | 'logs'>('overview');
  const [search, setSearch] = useState('');
  const [auth, setAuth] = useState<AuthState>({ status: 'checking', email: null });
  const email = auth.email;
  const [notice, setNotice] = useState('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [blockedRevision, setBlockedRevision] = useState<string | null>(null);
  const revisionKey = project.id + ':' + (project.cloudVersion ?? 'local');
  const conflictBlocked = blockedRevision === revisionKey;
  useEffect(
    () =>
      observeSaveConflicts((draft) => {
        const current = useStudio.getState().project;
        if (current.id !== draft.id || current.cloudVersion !== draft.cloudVersion) return;
        setBlockedRevision(current.id + ':' + (current.cloudVersion ?? 'local'));
        setLaboratoryOpen(false);
        if (workspace !== 'projects') setProjectsOpen(false);
        setConflictOpen(true);
      }),
    [workspace],
  );
  const [apiResult, setApiResult] = useState<Solution | null>(null);
  const baselineContent = useMemo(() => projectContent(project), [project]);
  const baselineSelection = JSON.stringify(selected);
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(false);
  const qc = useQueryClient();
  const sceneAccess = useQuery({
    queryKey: ['projects', auth.email],
    queryFn: workspaceIndex,
    enabled:
      sceneView.mode === '3d' && Boolean(project.cloudVersion) && auth.status === 'signed-in',
    staleTime: 0,
  });
  const sceneRole = sceneAccess.data?.projects.find((p) => p.id === project.id)?.role;
  const sceneEditable =
    !project.cloudVersion ||
    (auth.status === 'signed-in' &&
      !sceneAccess.isError &&
      (sceneRole === 'owner' || sceneRole === 'editor'));
  useEffect(() => {
    if (sceneView.mode === '3d') useSceneView.getState().set({ editable: sceneEditable });
  }, [sceneEditable, sceneView.mode, project.id, project.cloudVersion]);
  const saveRef = useRef(false);
  const save = useMutation({
    mutationFn: saveProject,
    onSuccess: (p, original) => {
      const state = useStudio.getState();
      state.acceptSave(original, p);
      void qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
    },
    onError: (e) => {
      log(`Save failed: ${e.message}`, 'warn');
      setNotice(`Save failed: ${e.message}`);
    },
  });
  const saveAsync = save.mutateAsync;
  const saveCurrent = useCallback(
    async (manual = false) => {
      if (useSceneView.getState().mode === '3d' && !useSceneView.getState().editable) return;
      if (conflictBlocked) {
        if (manual) setConflictOpen(true);
        return;
      }
      if (saveRef.current) return;
      saveRef.current = true;
      try {
        await saveAsync(useStudio.getState().project);
        if (manual) {
          setNotice('Project saved');
          log('Complete project configuration saved.');
        }
      } catch {
      } finally {
        saveRef.current = false;
      }
    },
    [saveAsync, log, conflictBlocked],
  );
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setHydrated(true);
      if (new URLSearchParams(location.hash.slice(1)).has('invite')) setProjectsOpen(true);
      try {
        const demo =
          workspace !== 'projects' && new URLSearchParams(location.search).get('demo') === 'moving';
        setDemoMode(demo);
        const last = localStorage.getItem('terralab.active.v1');
        if (demo) {
          useStudio.getState().load(createTemplate('moving'));
          useStudio.getState().select(['rx-1']);
          useLabView.getState().clear();
          useStudio.getState().play(true);
        } else if (last) {
          useStudio.getState().load(deserializeProject(last));
        } else {
          // The static SSR seed has a provisional ID; each browser starts with its own project UUID.
          useStudio.getState().load(createTemplate('outdoor'));
          useStudio.getState().select(['rx-1']);
        }
      } catch {
        useStudio.getState().load(createTemplate('outdoor'));
        useStudio.getState().select(['rx-1']);
        log('Could not restore last workspace.', 'warn');
      }
    }
    return observeAuthSession(supabase(), (state) => {
      setAuth(state);
      if (state.status === 'signed-in') {
        signedInBefore.current = true;
        if (workspace === 'auto' && !new URLSearchParams(location.search).has('demo'))
          router.replace('/projects' + location.hash);
      } else if (
        state.status === 'signed-out' &&
        signedInBefore.current &&
        workspace === 'projects'
      ) {
        router.replace('/studio');
      }
      void qc.invalidateQueries({ queryKey: ['projects'] });
    });
  }, [log, qc, router, workspace]);
  useEffect(() => {
    if (!hydrated || demoMode) return;
    try {
      localStorage.setItem('terralab.active.v1', JSON.stringify(project));
    } catch {
      setNotice('Browser storage is full. Export your project JSON.');
    }
    if (!dirty || laboratoryOpen || projectsOpen || conflictBlocked || conflictOpen) return;
    const id = setTimeout(() => void saveCurrent(), 1500);
    return () => clearTimeout(id);
  }, [
    project,
    dirty,
    hydrated,
    demoMode,
    saveCurrent,
    laboratoryOpen,
    projectsOpen,
    conflictBlocked,
    conflictOpen,
  ]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    setApiResult(null);
  }, [baselineContent, time, baselineSelection]);
  useEffect(() => {
    if (playing) useLabView.getState().clear();
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(),
      carry = 0;
    const interval = setInterval(() => {
      const current = performance.now(),
        elapsed = (current - last) / 1000;
      last = current;
      const state = useStudio.getState();
      const advanced = advanceClock(
        state.time,
        elapsed + carry / state.project.settings.speedMultiplier,
        state.project.settings.speedMultiplier,
        state.project.settings.step,
        state.project.settings.duration,
      );
      carry = advanced.remainder;
      if (advanced.time !== state.time) state.setTime(advanced.time);
      if (advanced.time >= state.project.settings.duration) {
        state.play(false);
        state.log('Simulation reached the end of the timeline.');
      }
    }, 30);
    return () => clearInterval(interval);
  }, [playing, speed]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches('input,textarea,select,[contenteditable]') ||
        projectsOpen ||
        accountOpen ||
        shareOpen ||
        settingsOpen ||
        laboratoryOpen ||
        signalOpen ||
        helpOpen
      )
        return;
      const state = useStudio.getState();
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          void saveCurrent(true);
        }
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? state.redo() : state.undo();
        }
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          state.redo();
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          state.duplicate();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        state.remove();
      }
      if (e.key === ' ') {
        e.preventDefault();
        state.play(!state.playing);
      }
      if (e.key === 'Escape') {
        state.select([]);
        state.setTool('select');
      }
      if (e.key === '?') setHelpOpen(true);
      if (e.key === '/') {
        e.preventDefault();
        setObjectsCollapsed(false);
        try {
          localStorage.setItem('terralab.objects-collapsed', 'false');
        } catch {
          /* Optional view preference. */
        }
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Find network objects"]')?.focus(),
        );
      }
      const keyMap: Record<string, ToolMode> = {
        v: 'select',
        h: 'pan',
        a: 'anchor',
        r: 'receiver',
        b: 'obstacle',
        m: 'measure',
      };
      if (keyMap[e.key.toLowerCase()]) state.setTool(keyMap[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [
    projectsOpen,
    accountOpen,
    shareOpen,
    settingsOpen,
    laboratoryOpen,
    signalOpen,
    helpOpen,
    saveCurrent,
  ]);
  const receivers = project.objects.filter(
    (o): o is Receiver => o.kind === 'receiver' && o.enabled,
  );
  const receiver = receivers.find((r) => selected.includes(r.id)) ?? receivers[0];
  const result = useMemo(() => {
    if (!receiver) return null;
    const live = solveProject(project, receiver, time);
    return apiResult ? { ...live, solution: apiResult, error: null } : live;
  }, [project, receiver, time, apiResult]);
  const runSnapshot = useRef<{ content: string; time: number; selection: string } | null>(null);
  // Recompute from deterministic timestamps; scrubbing yields exactly the same samples.
  const samples = useMemo(() => {
    return receiver ? simulationSamples(project, receiver, time) : [];
  }, [project, receiver, time]);
  const run = useMutation({
    mutationFn: async () => {
      const state = useStudio.getState();
      runSnapshot.current = {
        content: projectContent(state.project),
        time: state.time,
        selection: JSON.stringify(state.selected),
      };
      if (!result) throw Error('Add an enabled receiver first');
      if (result.error) throw Error(result.error);
      if (state.project.settings.engine === 'browser') return result.solution!;
      const resp = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result.set, measurements: result.usable }),
      });
      const data = await resp.json();
      if (!resp.ok)
        throw Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      return data as Solution;
    },
    onSuccess: (r) => {
      const state = useStudio.getState();
      if (
        runSnapshot.current?.content !== projectContent(state.project) ||
        runSnapshot.current?.selection !== JSON.stringify(state.selected) ||
        runSnapshot.current?.time !== state.time
      ) {
        log(
          'Baseline response received for an earlier configuration; run again for the current state.',
        );
        return;
      }
      setApiResult(r);
      log(
        `Baseline solved via ${project.settings.engine === 'python' ? 'Python SVD' : 'Browser QR'} · rank ${r.rank} · residual RMS ${r.rms.toFixed(4)} m`,
      );
      setNotice('Baseline solution validated');
    },
    onError: (e) => {
      log(e.message, 'warn');
      setNotice(e.message);
    },
  });
  const errors = samples.flatMap((x) => (x.error === null ? [] : [x.error]));
  const rmse = errors.length ? Math.hypot(...errors) / Math.sqrt(errors.length) : null;
  const anchors = project.objects.filter((o) => o.kind === 'anchor');
  const obstacles = project.objects.filter((o) => o.kind === 'obstacle');
  function openProjects() {
    if (auth.status === 'signed-in' || demoMode) {
      if (!demoMode)
        localStorage.setItem('terralab.active.v1', JSON.stringify(useStudio.getState().project));
      router.push('/projects');
    } else setProjectsOpen(true);
  }
  function openStudio() {
    localStorage.setItem('terralab.active.v1', JSON.stringify(useStudio.getState().project));
    router.push('/studio');
  }
  function runDemo() {
    if (!demoMode)
      localStorage.setItem('terralab.active.v1', JSON.stringify(useStudio.getState().project));
    window.location.assign('/studio?demo=moving');
  }
  function exportSamples() {
    const header = 'time_s,truth_x_m,truth_y_m,estimate_x_m,estimate_y_m,error_m\n';
    const data = samples
      .map((s) => [s.time, s.x, s.y, s.estimateX ?? '', s.estimateY ?? '', s.error ?? ''].join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([header + data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'terralab-ground-truth.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  if (workspace === 'projects')
    return (
      <main className={`research-page theme-${project.canvas.theme}`}>
        <ResearchDashboard
          embedded
          onAccount={() => setAccountOpen(true)}
          open
          auth={auth}
          onRunDemo={runDemo}
          onOpenChange={(open) => {
            if (!open) openStudio();
          }}
        />
        {conflictBlocked && !conflictOpen && (
          <Button onClick={() => setConflictOpen(true)}>Resolve save conflict</Button>
        )}
        <ConflictDialog
          key={revisionKey + ':' + conflictOpen}
          open={conflictOpen}
          onOpenChange={setConflictOpen}
        />
        <AccountDialog
          open={accountOpen}
          onOpenChange={setAccountOpen}
          onSession={() => void qc.invalidateQueries({ queryKey: ['projects'] })}
        />
      </main>
    );
  if (workspace === 'auto' && auth.status === 'checking')
    return (
      <main className="workspace-loading" role="status">
        Opening your workspace…
      </main>
    );
  return (
    <main
      className={`studio theme-${project.canvas.theme} ${inspectorOpen ? 'inspector-open' : ''} ${inspectorCollapsed ? 'inspector-collapsed' : ''}`}
    >
      <nav className="navigation-rail" aria-label="Main navigation">
        <button className="brand-mark" aria-label="TerraLab home" onClick={openProjects}>
          <NetworkLogo size={32} />
        </button>
        <div className="rail-top">
          <CollaborationLink compact />
          <Tool label="Network studio" active onClick={() => setProjectsOpen(false)}>
            <Network size={21} />
          </Tool>
          <Tool label="Project library" onClick={openProjects}>
            <FolderOpen size={21} />
          </Tool>
          <Tool
            label="Simulation results"
            active={bottomOpen && bottomTab === 'overview'}
            onClick={() => {
              setBottomOpen(true);
              setBottomTab('overview');
            }}
          >
            <ChartNoAxesCombined size={21} />
          </Tool>
          <Tool label="Research & methodology" onClick={() => setHelpOpen(true)}>
            <BookOpen size={20} />
          </Tool>
        </div>
        <div className="rail-bottom">
          <Tool
            label="Cycle workspace theme"
            onClick={() =>
              edit((p) => {
                p.canvas.theme = nextTheme(p.canvas.theme);
              })
            }
          >
            {isLightTheme(project.canvas.theme) ? <Moon size={19} /> : <Sun size={19} />}
          </Tool>
          <Tool label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={20} />
          </Tool>
          <Tool
            label={email ? `Profile · ${email}` : 'Account & cloud sync'}
            onClick={() => setAccountOpen(true)}
          >
            <UserRound size={20} />
          </Tool>
        </div>
      </nav>
      <header className="topbar">
        <div className="wordmark">
          terra<span>lab</span>
          <small>RESEARCH STUDIO</small>
        </div>
        <div className="topbar-divider" />
        <button className="project-switcher" onClick={openProjects}>
          <FolderOpen size={15} />
          <span>{project.name}</span>
          <ChevronDown size={13} />
        </button>
        <RenameProject
          name={project.name}
          disabled={sceneView.mode === '3d' && !sceneView.editable}
          onRename={(name) =>
            edit((p) => {
              p.name = name;
            })
          }
        />
        <span className="phase-badge">{demoMode ? 'LIVE DEMO' : 'RESEARCH'}</span>
        {demoMode && (
          <Link className="demo-exit" href="/projects">
            Exit demo
          </Link>
        )}
        <div className="topbar-spacer" />
        <span className="save-state">
          {demoMode ? (
            <>Demo · autosave off</>
          ) : save.isPending ? (
            <>
              <span className="status-dot saving" />
              Saving…
            </>
          ) : conflictBlocked ? (
            <>Cloud sync paused · resolve conflict</>
          ) : dirty ? (
            <>
              <span className="unsaved-dot" />
              Unsaved changes
            </>
          ) : (
            <>
              <Check size={13} />
              {email ? 'Saved to cloud' : 'Saved locally'}
            </>
          )}
        </span>
        <Button
          size="sm"
          onClick={() => void saveCurrent(true)}
          disabled={save.isPending || (sceneView.mode === '3d' && !sceneEditable)}
        >
          <Save size={14} />
          Save project
        </Button>
        <button
          className="avatar"
          aria-label={email ? 'Open profile' : 'Open account'}
          title={email ?? 'Your account'}
          onClick={() => setAccountOpen(true)}
        >
          {email?.[0]?.toUpperCase() ?? 'VL'}
        </button>
      </header>
      <div className="workspace-command">
        <div className="workspace-view-switch" role="group" aria-label="Workspace dimension">
          <button
            aria-pressed={sceneView.mode === '2d'}
            onClick={() => sceneView.set({ mode: '2d' })}
          >
            2D
          </button>
          <button
            aria-pressed={sceneView.mode === '3d'}
            onClick={() => sceneView.set({ mode: '3d', editable: sceneEditable })}
          >
            3D
          </button>
        </div>
        <div className="breadcrumbs">
          <span>Workspace</span>
          <ChevronRight size={12} />
          <b>Network studio</b>
        </div>
        <span className="method-chip">
          <span className="tiny-dot" />
          {labView.result && labRecord ? (
            <>
              {measurementNames[labView.result.request.config.measurement]} <span>·</span>{' '}
              {estimatorNames[labRecord.estimator]}
            </>
          ) : (
            <>
              Calibrated ranges <span>·</span> Linear least squares
            </>
          )}
        </span>
        <div className="command-actions">
          <Button
            size="sm"
            aria-label="Multiband signal laboratory"
            onClick={() => {
              s.play(false);
              setSignalOpen(true);
            }}
          >
            CSI lab
          </Button>
          <Button
            size="sm"
            help="Configure measurement models, estimators, noise and repeatable experiments. Laboratory settings are separate from the live baseline."
            aria-label="Scientific laboratory"
            onClick={() => {
              s.play(false);
              setLaboratoryOpen(true);
            }}
          >
            <FlaskConical size={15} />
            <span className="hide-small">Laboratory</span>
          </Button>
          {labView.result && (
            <Button size="sm" onClick={labView.clear}>
              Clear lab overlay
            </Button>
          )}
          <Tool label="Undo (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}>
            <Undo2 size={16} />
          </Tool>
          <Tool label="Redo (Ctrl+Shift+Z)" disabled={!s.future.length} onClick={s.redo}>
            <Redo2 size={16} />
          </Tool>
          <Tool
            label="Workspace settings"
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={16} />
          </Tool>
          <Tool
            label="Toggle properties inspector"
            onClick={() => {
              if (window.matchMedia('(max-width:699px)').matches) setInspectorOpen(!inspectorOpen);
              else setInspectorCollapsed(!inspectorCollapsed);
            }}
          >
            <PanelRight size={16} />
          </Tool>
          <span className="vertical-rule" />
          <Button size="sm" aria-label="Share and export" onClick={() => setShareOpen(true)}>
            <Share2 size={14} />
            <span className="hide-small">Share / export</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              labView.clear();
              run.mutate();
            }}
            help="Solve the selected receiver at the current time using synthetic calibrated 2D ranges. This does not start a laboratory experiment."
            disabled={run.isPending}
          >
            <Play size={13} fill="currentColor" />
            {run.isPending ? 'Solving…' : 'Run baseline'}
          </Button>
        </div>
      </div>
      <div className="workspace-body">
        <aside
          className={`object-panel ${objectsCollapsed ? 'objects-collapsed' : ''}`}
          aria-label="Network objects"
        >
          <div className="objects-header">
            {!objectsCollapsed && (
              <>
                <span>Network objects</span>
                <b>{project.objects.length}</b>
                <button
                  aria-label="Add transmitter at origin"
                  onClick={() => s.add('anchor', { x: 0, y: 0 })}
                >
                  <Plus size={16} />
                </button>
              </>
            )}
            <button
              className="objects-toggle"
              aria-label={objectsCollapsed ? 'Expand Network objects' : 'Collapse Network objects'}
              aria-expanded={!objectsCollapsed}
              aria-controls="network-objects-content"
              onClick={toggleObjects}
            >
              {objectsCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          <div
            id="network-objects-content"
            className="object-panel-content"
            hidden={objectsCollapsed}
          >
            <label className="object-search">
              <Search size={14} />
              <input
                aria-label="Find network objects"
                placeholder="Find an object…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <div className="objects-list">
              {(['anchor', 'receiver', 'obstacle', 'trajectory'] as const).map((kind) => {
                const list = project.objects.filter(
                  (o) => o.kind === kind && o.name.toLowerCase().includes(search.toLowerCase()),
                );
                const Icon = {
                  anchor: Radio,
                  receiver: Crosshair,
                  obstacle: Square,
                  trajectory: Route,
                }[kind];
                return (
                  <section key={kind}>
                    <div className="object-group-title">
                      <ChevronDown size={11} />
                      {kind === 'anchor'
                        ? 'TRANSMITTERS'
                        : kind === 'receiver'
                          ? 'RECEIVERS'
                          : kind === 'obstacle'
                            ? 'OBSTACLES'
                            : 'TRAJECTORIES'}
                      <span>{list.length}</span>
                    </div>
                    {list.length ? (
                      list.map((o) => (
                        <div
                          key={o.id}
                          className={`object-list-row ${selected.includes(o.id) ? 'selected' : ''}`}
                        >
                          <button
                            className={`object-select ${kind}`}
                            onClick={(e) =>
                              s.select(e.shiftKey ? [...new Set([...selected, o.id])] : [o.id])
                            }
                          >
                            <Icon size={15} />
                            <span>{o.name}</span>
                          </button>
                          <button
                            className="object-enable"
                            aria-label={`${o.enabled ? 'Disable' : 'Enable'} ${o.name}`}
                            onClick={() => s.update(o.id, { enabled: !o.enabled })}
                          >
                            {o.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="no-objects">{search ? 'No matches' : 'None added'}</div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="object-panel-footer">
              <span className="eyebrow">PROJECT REFERENCE</span>
              <p>
                GNSS-independent
                <br />
                terrestrial positioning
              </p>
              <button onClick={() => setHelpOpen(true)}>
                Methodology notes <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </aside>
        <div className="center-workspace">
          {sceneView.mode === '2d' ? (
            <NetworkCanvas verifiedSolution={apiResult} fitOnLoad={demoMode} />
          ) : (
            <Network3D verifiedSolution={apiResult} />
          )}
          <section
            className={`simulation-panel ${bottomOpen ? '' : 'collapsed'}`}
            aria-label="Simulation and log panel"
          >
            <div className="simulation-header">
              <div className="simulation-tabs">
                {labView.result ? (
                  <>
                    <button className="active">Recorded result</button>
                    <button onClick={() => setLaboratoryOpen(true)}>
                      All analytics & observations
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={bottomTab === 'overview' ? 'active' : ''}
                      onClick={() => {
                        setBottomTab('overview');
                        setBottomOpen(true);
                      }}
                    >
                      <Activity size={14} />
                      Simulation
                    </button>
                    <button
                      className={bottomTab === 'measurements' ? 'active' : ''}
                      onClick={() => {
                        setBottomTab('measurements');
                        setBottomOpen(true);
                      }}
                    >
                      <Table2 size={14} />
                      Measurements
                    </button>
                    <button
                      className={bottomTab === 'logs' ? 'active' : ''}
                      onClick={() => {
                        setBottomTab('logs');
                        setBottomOpen(true);
                      }}
                    >
                      <Terminal size={14} />
                      Log <span>{logs.length}</span>
                    </button>
                  </>
                )}
              </div>
              <span className="simulation-engine">
                {labView.result ? (
                  'Stored scientific result · Python'
                ) : (
                  <>
                    {apiResult ? 'Last run verified' : 'Live preview'} ·{' '}
                    {apiResult && project.settings.engine === 'python'
                      ? 'Python SVD'
                      : 'Browser QR'}
                  </>
                )}
              </span>
              <Tool
                label={bottomOpen ? 'Collapse simulation panel' : 'Expand simulation panel'}
                onClick={() => setBottomOpen(!bottomOpen)}
              >
                {bottomOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
              </Tool>
            </div>
            {bottomOpen &&
              (labView.result ? (
                <LaboratoryPreviewFacts onOpen={() => setLaboratoryOpen(true)} />
              ) : (
                <>
                  <div className="transport">
                    <div className="transport-buttons">
                      <Tool
                        label="Restart simulation"
                        onClick={() => {
                          s.setTime(0);
                          s.play(true);
                          log('Simulation restarted.');
                        }}
                      >
                        <RotateCcw size={15} />
                      </Tool>
                      <Button
                        size="icon"
                        className="play-control"
                        variant="default"
                        aria-label={playing ? 'Pause simulation' : 'Play simulation'}
                        onClick={() => {
                          if (time >= project.settings.duration) s.setTime(0);
                          s.play(!playing);
                        }}
                      >
                        {playing ? (
                          <Pause size={15} fill="currentColor" />
                        ) : (
                          <Play size={15} fill="currentColor" />
                        )}
                      </Button>
                      <Tool
                        label="Stop simulation"
                        onClick={() => {
                          s.play(false);
                          s.setTime(0);
                          log('Simulation stopped and reset.');
                        }}
                      >
                        <StopIcon size={13} />
                      </Tool>
                      <Tool
                        label="Single simulation step"
                        onClick={() => {
                          s.play(false);
                          s.setTime(Number((time + project.settings.step).toFixed(9)));
                        }}
                      >
                        <SkipForward size={15} />
                      </Tool>
                    </div>
                    <span className="simulation-time mono" data-testid="simulation-time">
                      {formatTime(time)}
                      <span> / {formatTime(project.settings.duration)}</span>
                    </span>
                    <input
                      className="timeline"
                      aria-label="Simulation timeline"
                      type="range"
                      min="0"
                      max={project.settings.duration}
                      step={project.settings.step}
                      value={time}
                      onChange={(e) => {
                        s.play(false);
                        s.setTime(Number(e.target.value));
                      }}
                    />
                    <select
                      className="speed-select"
                      aria-label="Playback speed"
                      value={speed}
                      onChange={(e) => s.setSpeed(Number(e.target.value))}
                    >
                      {[0.25, 0.5, 1, 2, 4].map((v) => (
                        <option value={v} key={v}>
                          {v}×
                        </option>
                      ))}
                    </select>
                    <span className="running-state">
                      <span className={`status-dot ${playing ? '' : 'idle'}`} />
                      {playing ? 'Running' : 'Paused'}
                    </span>
                  </div>
                  {bottomTab === 'overview' ? (
                    <div className="simulation-overview">
                      <div className="metric-grid">
                        <div className="metric">
                          <span>POSITION ERROR</span>
                          <strong>
                            {result?.solution
                              ? distance(result.truth, result.solution.position).toFixed(3)
                              : '—'}
                            <small>m</small>
                          </strong>
                          <p>Current horizontal fix</p>
                        </div>
                        <div className="metric">
                          <span>SAMPLED RMSE</span>
                          <strong>
                            {rmse?.toFixed(3) ?? '—'}
                            <small>m</small>
                          </strong>
                          <p>{samples.length} deterministic samples</p>
                        </div>
                        <div className="metric">
                          <span>USABLE ANCHORS</span>
                          <strong>
                            {result?.usable.length ?? 0}
                            <small>/ {anchors.filter((o) => o.enabled).length}</small>
                          </strong>
                          <p>
                            {result?.set.measurements.filter((m) => m.blocked).length ?? 0}{' '}
                            obstructed links
                          </p>
                        </div>
                        <div className="metric">
                          <span>GEOMETRY CONDITION</span>
                          <strong>
                            {result?.solution?.condition.toFixed(2) ?? '—'}
                            <small>κ</small>
                          </strong>
                          <p>{result?.solution ? 'Rank 2 · solution available' : 'No valid fix'}</p>
                        </div>
                      </div>
                      <div className="chart-container">
                        <div className="chart-title">
                          <span>Position error over time</span>
                          <button onClick={exportSamples} aria-label="Export ground truth samples">
                            <Download size={12} />
                            CSV
                          </button>
                        </div>
                        <ScientificChart samples={samples} theme={project.canvas.theme} />
                      </div>
                    </div>
                  ) : bottomTab === 'measurements' ? (
                    <div className="measurements-table-wrap">
                      <table className="measurements-table">
                        <thead>
                          <tr>
                            <th>TRANSMITTER</th>
                            <th>RANGE (m)</th>
                            <th>FIT DISTANCE (m)</th>
                            <th>RESIDUAL (m)</th>
                            <th>PATH</th>
                            <th>USED</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result?.set.measurements.map((m) => {
                            const idx = result.usable.findIndex((x) => x.anchorId === m.anchorId);
                            return (
                              <tr key={m.anchorId}>
                                <td>{project.objects.find((o) => o.id === m.anchorId)?.name}</td>
                                <td>{m.range.toFixed(4)}</td>
                                <td>
                                  {result.solution
                                    ? distance(result.solution.position, m.anchor).toFixed(4)
                                    : '—'}
                                </td>
                                <td>
                                  {result.solution && idx >= 0
                                    ? result.solution.residuals[idx].toFixed(4)
                                    : '—'}
                                </td>
                                <td className={m.blocked ? 'warning' : 'good'}>
                                  {m.blocked ? 'Obstructed' : 'LOS'}
                                </td>
                                <td>{idx >= 0 ? 'Yes' : 'No'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {!receiver && (
                        <p className="small-copy">Add a receiver to see range observations.</p>
                      )}
                    </div>
                  ) : (
                    <div className="log-list" role="log">
                      {logs.map((entry, i) => (
                        <div key={i} className={entry.level === 'warn' ? 'warning' : ''}>
                          <time>{entry.time}</time>
                          <span className="log-level">{entry.level.toUpperCase()}</span>
                          <span>{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ))}
          </section>
        </div>
        {sceneView.mode === '3d' && !sceneEditable ? (
          <fieldset disabled className="inspector-readonly">
            <Inspector verifiedSolution={apiResult} />
          </fieldset>
        ) : (
          <Inspector verifiedSolution={apiResult} />
        )}
      </div>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          All systems local
          <span className="statusbar-divider" />
          Schema v1
        </span>
        <span>
          {anchors.length} transmitters<span>·</span>
          {receivers.length} receivers<span>·</span>
          {obstacles.length} obstacles
        </span>
        <span>
          {labView.result
            ? `2D ${measurementNames[labView.result.request.config.measurement]} · recorded`
            : '2D calibrated-range model'}{' '}
          <span className="statusbar-divider" />
          <kbd>?</kbd> Help
        </span>
      </footer>
      <ResearchDashboard
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        auth={auth}
        onRunDemo={runDemo}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <ConflictDialog
        key={revisionKey + ':' + conflictOpen}
        open={conflictOpen}
        onOpenChange={setConflictOpen}
      />
      <LaboratoryDialog open={laboratoryOpen} onOpenChange={setLaboratoryOpen} />
      <SignalDialog open={signalOpen} onOpenChange={setSignalOpen} />
      <SettingsDialog
        auth={auth}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onAccount={() => setAccountOpen(true)}
      />
      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        onSession={() => void qc.invalidateQueries({ queryKey: ['projects'] })}
      />
      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="A precise starting point."
        description="TerraLab Phase 2 · Network editor, calibrated baseline and scientific laboratory"
        wide
      >
        <div className="help-grid">
          <section>
            <h3>The measurement contract</h3>
            <p>
              Ranges are synthetic, calibrated horizontal distances in metres. A seeded Gaussian
              noise term is configurable per transmitter. One-way pseudoranges require an additional
              clock-bias state and are outside this baseline.
            </p>
            <h3>The baseline solver</h3>
            <p>
              Squared-range differences produce a linear system. The browser uses Householder QR;
              Python uses LAPACK SVD through SciPy. Both check rank and conditioning. At least three
              non-collinear usable anchors are required; four or more give redundancy.
            </p>
            <h3>Geometric obstructions</h3>
            <p>
              Amber links intersect an enabled obstacle. Choose “Exclude obstructed links” in
              Simulation to remove them. With exclusion off they remain ideal synthetic ranges; no
              RF propagation effect is simulated.
            </p>
            <p>
              Research basis: Widdison & Long (2024), Li et al. (2016), and Koelemeij et al. (2022).
              Source-specific decisions and limits are recorded in{' '}
              <code>docs/research/methodology-matrix.md</code>.
            </p>
          </section>
          <section>
            <h3>Keyboard reference</h3>
            <div className="shortcut-list">
              {[
                ['V', 'Select'],
                ['Shift + click', 'Multi-select'],
                ['H / middle drag', 'Pan'],
                ['A / R / B', 'Add transmitter / receiver / building'],
                ['M', 'Measure distance'],
                ['F', 'Fit network'],
                ['Enter', 'Finish path or polygon'],
                ['Esc', 'Cancel drawing / clear selection'],
                ['Space', 'Play / pause'],
                ['Ctrl + S', 'Save project'],
                ['Ctrl + D', 'Duplicate selection'],
                ['Ctrl + Z', 'Undo'],
                ['Ctrl + Shift + Z', 'Redo'],
                ['Delete', 'Delete selection'],
              ].map(([key, value]) => (
                <div key={key}>
                  <span>{value}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <div className="info-note">
              Try “Geometry matters” in the project library to see a degenerate solution, or “A
              receiver in motion” for waypoint playback.
            </div>
          </section>
        </div>
      </Dialog>
      {notice && (
        <div className="toast" role="status">
          <Activity size={15} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
