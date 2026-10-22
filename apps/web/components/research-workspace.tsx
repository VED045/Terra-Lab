'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@terralab/shared';
import { listProjects, supabase } from '@/lib/persistence';
import { workspaceIndex } from '@/lib/research';
import { collaborationState, type Member } from '@/lib/collaboration';
import { useStudio } from '@/lib/store';
import { downloadFile } from '@/lib/downloads';
import {
  laboratoryRequest,
  saveExperiment,
  savedExperiments,
  type ExperimentResult,
} from '@/lib/laboratory';
import {
  blankPaper,
  evidenceLatex,
  manuscriptFields,
  sameManuscript,
  type ResearchDocument,
  type ResearchAsset,
  type DocumentRevision,
  type WorkspaceIndex,
} from '@/lib/research-workspace/contracts';
import {
  researchIndex,
  searchResearchAssets,
  saveResearchDocument,
  researchHistory,
  researchDocumentMembers,
  shareResearchDocument,
  uploadResearchAsset,
  readResearchAsset,
  renameResearchAsset,
  deleteResearchAsset,
  getResearchDocument,
} from '@/lib/research-workspace/client';
import {
  readManuscriptProposal,
  proposalKey,
  type ManuscriptProposal,
} from '@/lib/research-workspace/proposals';
import { Button } from './ui/button';
const Preview = dynamic(
  () => import('./research-latex-preview').then((m) => m.ResearchLatexPreview),
  { ssr: false, loading: () => <p>Loading math preview…</p> },
);
type Draft = {
  baseVersion: number;
  title: string;
  authors: string;
  source: string;
  evidence: ResearchDocument['evidence'];
  updatedAt: string;
};
export default function ResearchWorkspace() {
  const router = useRouter();
  const fallbackTheme = useStudio((s) => s.project.canvas.theme);
  const [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(''),
    [projectRole, setProjectRole] = useState('viewer');
  const theme = projects.find((p) => p.id === projectId)?.canvas.theme ?? fallbackTheme;
  const [index, setIndex] = useState<WorkspaceIndex | null>(null),
    [document, setDocument] = useState<ResearchDocument | null>(null),
    [base, setBase] = useState<ResearchDocument | null>(null);
  const [proposal, setProposal] = useState<ManuscriptProposal | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]),
    [searchMatches, setSearchMatches] = useState<string[] | null>(null);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [mode, setMode] = useState('split');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [recovered, setRecovered] = useState<Draft | null>(null);
  const [history, setHistory] = useState<DocumentRevision[]>([]),
    [members, setMembers] = useState<{ user_id: string; role: 'editor' | 'viewer' }[]>([]),
    [peers, setPeers] = useState<Member[]>([]),
    [shareUser, setShareUser] = useState(''),
    [shareRole, setShareRole] = useState<'editor' | 'viewer'>('viewer');
  const [selectedAsset, setSelectedAsset] = useState<ResearchAsset | null>(null),
    [assetURL, setAssetURL] = useState(''),
    [showPDF, setShowPDF] = useState(false),
    [runs, setRuns] = useState<ExperimentResult[]>([]),
    [runId, setRunId] = useState('');
  const projectRef = useRef(projectId),
    actorRef = useRef<string | null>(null);
  projectRef.current = projectId;
  const epoch = useRef(0),
    saving = useRef(false),
    currentDoc = useRef(document),
    uploadInput = useRef<HTMLInputElement>(null);
  currentDoc.current = document;
  const editable = !!document && document.role !== 'viewer' && projectRole !== 'viewer';
  const dirty = !!document && !!base && !sameManuscript(document, base);
  const draftKey = (id: string) =>
    `terralab.manuscript.draft.v1:${index?.actor}:${projectId}:${id}`;
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const ps = await listProjects();
        if (!active) return;
        setProjects(ps);
        const q = new URLSearchParams(location.search),
          id = q.get('project');
        setProjectId(id && ps.some((p) => p.id === id) ? id : (ps[0]?.id ?? ''));
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    const sub = supabase()?.auth.onAuthStateChange((event) => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
      actorRef.current = null;
      setMembers([]);
      setPeers([]);
      setHistory([]);
      setProposal(null);
      setSourceIds([]);
      setRecovered(null);
      setProjects([]);
      epoch.current++;
      setDocument(null);
      setBase(null);
      setIndex(null);
      setSelectedAsset(null);
      setAssetURL('');
      setProjectId('');
      void load();
    });
    return () => {
      active = false;
      epoch.current++;
      sub?.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!projectId) return;
    const turn = ++epoch.current;
    setDocument(null);
    setBase(null);
    setSourceIds([]);
    setSearchMatches(null);
    setRecovered(null);
    setConflict(false);
    setHistory([]);
    setSelectedAsset(null);
    setError('');
    setAssetURL('');
    void (async () => {
      try {
        const data = await researchIndex(projectId),
          workspace = await workspaceIndex();
        if (turn !== epoch.current) return;
        actorRef.current = data.actor;
        setIndex(data);
        setProjectRole(workspace.projects.find((p) => p.id === projectId)?.role ?? 'viewer');
        if (data.cloud) {
          const state = await collaborationState();
          if (turn !== epoch.current) return;
          setPeers(
            state.members.filter((m) => m.resource_id === projectId && m.user_id !== data.actor),
          );
        } else setPeers([]);
        const localRuns = data.cloud
          ? []
          : (await savedExperiments()).filter((r) => r.request.project.id === projectId);
        if (turn !== epoch.current) return;
        setRuns(localRuns);
        const q = new URLSearchParams(location.search);
        setRunId(q.get('run') ?? '');
        const id = q.get('document'),
          d = data.documents.find((d) => d.id === id);
        if (d) openDocument(d, data.actor);
        const proposalId = q.get('proposal');
        if (proposalId)
          setProposal(readManuscriptProposal(sessionStorage, data.actor, projectId, proposalId));
        const asset = q.get('asset');
        if (asset) {
          const item = data.assets.find((a) => a.id === asset);
          if (item) void openAsset(item);
        }
      } catch (e) {
        if (turn === epoch.current) setError((e as Error).message);
      }
    })();
  }, [projectId]);
  useEffect(() => {
    return () => {
      if (assetURL) URL.revokeObjectURL(assetURL);
    };
  }, [assetURL]);
  useEffect(() => {
    if (!document || !base || !editable || !dirty) return;
    try {
      localStorage.setItem(
        draftKey(document.id),
        JSON.stringify({
          baseVersion: base.version,
          title: document.title,
          authors: document.authors,
          source: document.source,
          evidence: document.evidence,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      setError('Draft recovery storage is full. Export source before leaving this page.');
    }
    if (conflict || busy) return;
    const timer = setTimeout(() => void saveDocument(), 1800);
    return () => clearTimeout(timer);
  }, [document, base, editable, dirty, conflict, busy]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editable) void saveDocument();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
  useEffect(() => {
    let active = true;
    setSearchMatches(null);
    if (index?.cloud && search.length >= 2) {
      const timer = setTimeout(
        () =>
          void searchResearchAssets(projectId, search)
            .then((ids) => {
              if (active) setSearchMatches(ids);
            })
            .catch((e) => {
              if (active) setError(e.message);
            }),
        300,
      );
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [search, index?.cloud, projectId]);
  async function action(task: () => Promise<void>) {
    const turn = epoch.current;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      if (turn === epoch.current) setError((e as Error).message);
    } finally {
      if (turn === epoch.current) setBusy(false);
    }
  }
  async function openNetwork() {
    const selected = (await listProjects()).find((p) => p.id === projectId);
    if (!selected) throw Error('Project access unavailable.');
    if (
      useStudio.getState().dirty &&
      !confirm('Open the saved project and discard unsaved Network studio changes?')
    )
      return;
    useStudio.getState().load(selected);
    localStorage.setItem('terralab.active.v1', JSON.stringify(selected));
    router.push('/studio?project=' + projectId);
  }
  async function refresh() {
    const turn = epoch.current;
    let data: WorkspaceIndex;
    try {
      data = await researchIndex(projectId);
    } catch (e) {
      if (turn === epoch.current) {
        setDocument(null);
        setBase(null);
        setIndex(null);
      }
      throw e;
    }
    if (turn !== epoch.current) return;
    actorRef.current = data.actor;
    setIndex(data);
    if (currentDoc.current) {
      const fresh = data.documents.find((d) => d.id === currentDoc.current!.id);
      if (!fresh) {
        setDocument(null);
        setBase(null);
      } else setDocument((d) => (d ? { ...d, role: fresh.role } : d));
    }
    setNotice(
      'Library refreshed. Open documents keep their local drafts until explicitly reloaded.',
    );
  }
  function openDocument(d: ResearchDocument, actor = index?.actor) {
    if (d.project_id !== projectRef.current || !actorRef.current) return;
    setDocument(d);
    setBase(d);
    setConflict(false);
    setHistory([]);
    setSelectedAsset(null);
    setRecovered(null);
    try {
      const raw = localStorage.getItem(
        `terralab.manuscript.draft.v1:${actor}:${d.project_id}:${d.id}`,
      );
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        if (
          typeof draft.source === 'string' &&
          draft.source.length <= 120000 &&
          (draft.source !== d.source ||
            draft.title !== d.title ||
            draft.authors !== d.authors ||
            JSON.stringify(draft.evidence) !== JSON.stringify(d.evidence))
        )
          setRecovered(draft);
      }
    } catch {
      setError('A recovery draft could not be read. Saved source is intact.');
    }
  }
  async function createDocument(template: boolean, source?: string) {
    const turn = epoch.current;
    const d = await saveResearchDocument(
      {
        id: crypto.randomUUID(),
        project_id: projectId,
        title: template ? 'Untitled paper' : 'Untitled document',
        authors: '',
        source: source ?? (template ? blankPaper : ''),
        evidence: [],
      },
      null,
    );
    if (turn !== epoch.current) return;
    setIndex((i) => (i ? { ...i, documents: [d, ...i.documents] } : i));
    openDocument(d);
    setNotice('Document created. Changes autosave as checked revisions.');
  }
  async function saveDocument() {
    if (!document || !base || !editable || saving.current || conflict) return;
    const input = document,
      turn = epoch.current;
    saving.current = true;
    setNotice('Saving checked revision…');
    try {
      const saved = await saveResearchDocument(manuscriptFields(input), base.version);
      if (turn !== epoch.current || currentDoc.current?.id !== input.id) return;
      setBase(saved);
      setDocument((current) =>
        current?.id === saved.id
          ? {
              ...current,
              version: saved.version,
              updated_at: saved.updated_at,
              evidence:
                JSON.stringify(current.evidence) === JSON.stringify(input.evidence)
                  ? saved.evidence
                  : current.evidence,
            }
          : current,
      );
      setIndex((i) =>
        i ? { ...i, documents: i.documents.map((d) => (d.id === saved.id ? saved : d)) } : i,
      );
      setNotice(
        `Saved revision ${saved.version} · ${new Date(saved.updated_at).toLocaleTimeString()}`,
      );
      if (currentDoc.current && sameManuscript(currentDoc.current, input))
        localStorage.removeItem(draftKey(input.id));
    } catch (e) {
      if (turn === epoch.current) {
        const message = (e as Error).message;
        setError(message);
        if (message.includes('VERSION_CONFLICT')) setConflict(true);
        setNotice('Save not confirmed. Recovery draft retained.');
      }
    } finally {
      saving.current = false;
    }
  }
  async function reloadDocument() {
    if (!document) return;
    const turn = epoch.current,
      id = document.id;
    const latest = await getResearchDocument(projectId, id);
    if (turn !== epoch.current || currentDoc.current?.id !== id) return;
    openDocument(latest);
    setNotice('Latest saved revision loaded. Recovery draft remains available.');
  }
  async function openAsset(a: ResearchAsset) {
    const turn = epoch.current;
    const result = await readResearchAsset(projectId, a.id);
    if (turn !== epoch.current) return;
    setSelectedAsset(result.asset);
    setAssetURL(URL.createObjectURL(result.blob));
    setShowPDF(false);
  }
  async function downloadAsset(a: ResearchAsset) {
    const { blob, asset } = await readResearchAsset(projectId, a.id);
    downloadFile(new File([blob], asset.name, { type: asset.mime }));
  }
  async function addRun() {
    if (!document || !editable) return;
    const turn = epoch.current,
      target = document.id;
    const run =
      runs.find((r) => r.id === runId) ??
      (await laboratoryRequest('?id=' + encodeURIComponent(runId) + '&detail=true'));
    if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
      throw Error('Wait for an actual terminal run before attaching immutable evidence.');
    if (!index?.cloud && !runs.some((r) => r.id === run.id)) await saveExperiment(run);
    if (!run || run.request.project.id !== projectId)
      throw Error('Choose an accessible saved run from this project.');
    if (turn !== epoch.current || currentDoc.current?.id !== target) return;
    setDocument((d) =>
      d
        ? {
            ...d,
            evidence: [
              ...d.evidence,
              {
                type: 'run',
                runId: run.id,
                caption: `${run.status} run; ${run.completed}/${run.planned} samples`,
                snapshot: {
                  metrics: run.summaries.slice(0, 20),
                  configuration: run.request.config,
                  revision: `${run.request.project.cloudVersion ?? 'local'}:${run.request.project.updatedAt}`,
                  status: run.status,
                },
              },
            ],
          }
        : d,
    );
    setNotice('Evidence added from the actual saved run. Source configuration remains immutable.');
  }
  function attachAsset() {
    if (!document || !selectedAsset || !editable) return;
    setDocument((d) =>
      d
        ? {
            ...d,
            evidence: [
              ...d.evidence,
              {
                type: 'asset',
                assetId: selectedAsset.id,
                caption: selectedAsset.name,
                snapshot: {
                  mime: selectedAsset.mime,
                  sha256: selectedAsset.sha256,
                  provenance: selectedAsset.provenance,
                },
              },
            ],
          }
        : d,
    );
    setNotice('Asset reference added. Use Insert to add a captioned LaTeX figure.');
  }
  function aiURL(prompt: string) {
    const q = new URLSearchParams({ project: projectId, prompt });
    if (document) q.set('document', document.id);
    if (sourceIds.length) q.set('assets', sourceIds.join(','));
    else if (selectedAsset) q.set('asset', selectedAsset.id);
    return '/ai?' + q;
  }
  const documents =
    index?.documents.filter(
      (d) =>
        filter !== 'files' &&
        `${d.title} ${d.authors}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const assets =
    index?.assets.filter(
      (a) =>
        filter !== 'documents' &&
        (searchMatches
          ? searchMatches.includes(a.id)
          : `${a.name} ${a.collection} ${a.extraction.pages.map((p) => p.text).join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase())),
    ) ?? [];
  return (
    <main className={`research-workspace research-page theme-${theme}`}>
      <header className="research-workspace-header">
        <div>
          <h1>Research Workspace</h1>
          <p>Sources, manuscripts and reproducible evidence</p>
        </div>
        <nav>
          <Link href="/projects">Projects</Link>
          <Link
            href={'/studio?project=' + projectId}
            onClick={(e) => {
              e.preventDefault();
              void action(openNetwork);
            }}
          >
            Network studio
          </Link>
          <Link href={'/ai?project=' + projectId}>AI Studio</Link>
          <Link href="/collaboration">Collaboration</Link>
        </nav>
      </header>
      <div className="research-workspace-toolbar">
        <label>
          Project
          <select
            aria-label="Research project"
            disabled={busy || saving.current}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          {index?.cloud ? 'Private cloud workspace' : 'Local browser workspace'} · {projectRole}
        </span>
        <Button disabled={!projectId || busy} onClick={() => void action(refresh)}>
          Refresh library
        </Button>
        <Button
          disabled={!index || projectRole === 'viewer' || busy}
          onClick={() => void action(() => createDocument(true))}
        >
          New paper
        </Button>
        <Button
          disabled={!index || projectRole === 'viewer' || busy}
          onClick={() => void action(() => createDocument(false))}
        >
          Blank document
        </Button>
        <Button
          disabled={!index || projectRole === 'viewer' || busy}
          onClick={() => uploadInput.current?.click()}
        >
          Upload source or figure
        </Button>
        <input
          ref={uploadInput}
          hidden
          type="file"
          accept=".pdf,.txt,.md,.tex,.csv,.json,.png,.jpg,.jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file)
              void action(async () => {
                setNotice('Validating, extracting and storing the original…');
                const a = await uploadResearchAsset(projectId, file);
                await refresh();
                await openAsset(a);
                setNotice(
                  `Upload complete · ${a.extraction.status}${a.extraction.message ? ' · ' + a.extraction.message : ''}`,
                );
              });
          }}
        />
      </div>
      {error && (
        <p role="alert" className="research-workspace-error">
          {error}
        </p>
      )}
      <p role="status" className="research-workspace-status">
        {notice ||
          'Documents use versioned saves. Collaborators refresh to see changes; conflicts preserve local drafts.'}
      </p>
      {!index && (
        <p>
          Select an accessible project. Cloud research requires the additive research workspace
          migration; local documents stay in this browser.
        </p>
      )}
      {index && (
        <div className="research-workspace-layout">
          <aside className="research-library" aria-label="Research library">
            <h2>Project library</h2>
            {sourceIds.length > 0 && (
              <Link
                href={aiURL(
                  'Compare the selected sources’ stated assumptions. Cite only supplied source IDs and page/section excerpts, and identify missing information.',
                )}
              >
                Discuss {sourceIds.length} selected sources
              </Link>
            )}
            <label>
              Search library
              <input
                aria-label="Search research library"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Show
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All items</option>
                <option value="documents">Documents</option>
                <option value="files">Sources and figures</option>
              </select>
            </label>
            <table>
              <caption>{documents.length + assets.length} matching items</caption>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button
                        onClick={() => openDocument(d)}
                        aria-label={'Open document ' + d.title}
                      >
                        {d.title}
                      </button>
                      <small>
                        Manuscript · v{d.version} · {d.role}
                      </small>
                      <small>Owner {d.owner_id}</small>
                    </td>
                    <td>{new Date(d.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={'Use source ' + a.name}
                          checked={sourceIds.includes(a.id)}
                          onChange={(e) => {
                            if (e.target.checked && sourceIds.length >= 2) {
                              setNotice('Choose at most two sources for bounded AI context.');
                              return;
                            }
                            setSourceIds((ids) =>
                              e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                            );
                          }}
                        />
                        Use in AI
                      </label>
                      <button
                        onClick={() => void action(() => openAsset(a))}
                        aria-label={'Open asset ' + a.name}
                      >
                        {a.name}
                      </button>
                      <small>
                        {a.collection || 'Library'} · {(a.bytes / 1024).toFixed(1)} KiB ·{' '}
                        {a.extraction.status}
                      </small>
                      <small>Owner {a.owner_id}</small>
                    </td>
                    <td>{new Date(a.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!documents.length && !assets.length && (
              <p>Create a paper or upload a source. Nothing is public by default.</p>
            )}
            <details>
              <summary>Recent changes</summary>
              <ul>
                {index.documents.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    {d.title} · revision {d.version} · {new Date(d.updated_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
          </aside>
          <section className="research-writing" aria-label="Research writing">
            {selectedAsset && (
              <section className="research-asset" aria-label="Selected research asset">
                <h2>{selectedAsset.name}</h2>
                <p>
                  {selectedAsset.mime} · {(selectedAsset.bytes / 1024).toFixed(1)} KiB · SHA-256{' '}
                  {selectedAsset.sha256}
                </p>
                <div className="research-actions">
                  <Button onClick={() => void action(() => downloadAsset(selectedAsset))}>
                    Download original
                  </Button>
                  <Button
                    disabled={projectRole === 'viewer'}
                    onClick={() =>
                      void action(async () => {
                        const name = prompt('File name', selectedAsset.name);
                        if (!name) return;
                        const collection = prompt('Collection', selectedAsset.collection);
                        if (collection === null) return;
                        await renameResearchAsset(selectedAsset, name, collection);
                        await refresh();
                        setSelectedAsset(null);
                      })
                    }
                  >
                    Rename / organize
                  </Button>
                  <Button
                    disabled={projectRole === 'viewer'}
                    onClick={() => {
                      if (
                        confirm(
                          'Delete this asset and revoke access to its original file? Documents keep an unavailable evidence reference.',
                        )
                      )
                        void action(async () => {
                          await deleteResearchAsset(selectedAsset);
                          setSelectedAsset(null);
                          setAssetURL('');
                          await refresh();
                        });
                    }}
                  >
                    Delete asset
                  </Button>
                  <Button disabled={!editable} onClick={attachAsset}>
                    Attach to document
                  </Button>
                  {selectedAsset.mime.startsWith('text/') ||
                  selectedAsset.mime === 'application/x-tex' ? (
                    <Button
                      disabled={projectRole === 'viewer'}
                      onClick={() =>
                        void action(async () => {
                          const { blob } = await readResearchAsset(projectId, selectedAsset.id);
                          await createDocument(false, await blob.text());
                        })
                      }
                    >
                      Import as manuscript
                    </Button>
                  ) : null}
                </div>
                {selectedAsset.mime.startsWith('image/') && (
                  <img src={assetURL} alt={selectedAsset.name} className="research-figure" />
                )}
                <details>
                  <summary>Capture and source provenance</summary>
                  <pre>{JSON.stringify(selectedAsset.provenance, null, 2)}</pre>
                </details>
                {selectedAsset.mime === 'application/pdf' && (
                  <>
                    <Button onClick={() => setShowPDF((v) => !v)}>
                      {showPDF ? 'Hide PDF' : 'Preview original PDF'}
                    </Button>
                    {showPDF && (
                      <>
                        <iframe title="Original PDF preview" src={assetURL} sandbox="" />
                        <p>
                          Browser PDF preview support varies. Download the original if unavailable.
                        </p>
                      </>
                    )}
                  </>
                )}
                <p>
                  {selectedAsset.extraction.message}
                  {selectedAsset.extraction.truncated
                    ? ' · Extraction is truncated to bounded pages/text.'
                    : ''}
                </p>
                <details>
                  <summary>Extracted source text · {selectedAsset.extraction.status}</summary>
                  {selectedAsset.extraction.pages.map((p) => (
                    <details key={p.page}>
                      <summary>
                        {selectedAsset.mime === 'application/pdf' ? 'Page' : 'Text section'}{' '}
                        {p.page}
                      </summary>
                      <pre>{p.text}</pre>
                    </details>
                  ))}
                </details>
                <div className="research-actions">
                  <Link
                    href={aiURL(
                      'Summarize the selected source. Separate extracted facts from interpretation and cite only supplied page/section references.',
                    )}
                  >
                    Summarize selected paper
                  </Link>
                  <Link
                    href={aiURL(
                      'Draft a caption using only supplied snapshot metadata. Image pixels are not supplied; identify missing details.',
                    )}
                  >
                    Draft a snapshot caption
                  </Link>
                  <Link
                    href={aiURL(
                      'Compare the stated assumptions in the selected source and document. Flag missing evidence; do not invent citations.',
                    )}
                  >
                    Discuss source assumptions
                  </Link>
                </div>
                <p className="research-limit">
                  Only sources explicitly selected in AI Studio are sent to its chosen provider.
                  Review local/hosted disclosure before sending.
                </p>
              </section>
            )}
            {!document ? (
              <div className="research-writing-empty">
                <h2>Open a manuscript</h2>
                <p>
                  Choose a document from the library, create a paper, or start with a blank source.
                  Add evidence from saved experiments or capture the actual canvas in Network
                  studio.
                </p>
              </div>
            ) : (
              <>
                {proposal && proposal.documentId === document.id && (
                  <section className="research-recovery" aria-label="Review manuscript insertion">
                    <h2>Review AI draft insertion</h2>
                    <p>
                      Unverified proposed writing from {proposal.provider}. Check all claims and
                      references. This will append to manuscript revision {proposal.baseVersion};
                      your original revisions remain available.
                    </p>
                    <textarea
                      aria-label="Proposed manuscript text"
                      value={proposal.text}
                      maxLength={8000}
                      onChange={(e) => setProposal((p) => (p ? { ...p, text: e.target.value } : p))}
                    />
                    <Button
                      disabled={!editable || busy || dirty}
                      onClick={() =>
                        void action(async () => {
                          const turn = epoch.current;
                          const latest = await getResearchDocument(projectId, proposal.documentId);
                          if (latest.version !== proposal.baseVersion)
                            throw Error(
                              'VERSION_CONFLICT: manuscript changed since the AI context. Review a fresh draft; nothing was overwritten.',
                            );
                          const saved = await saveResearchDocument(
                            {
                              ...manuscriptFields(latest),
                              source:
                                latest.source +
                                '\n% Reviewed AI draft; verify all citations.\n' +
                                proposal.text,
                            },
                            latest.version,
                          );
                          if (turn !== epoch.current) return;
                          sessionStorage.removeItem(
                            proposalKey(index.actor, projectId, proposal.id),
                          );
                          setProposal(null);
                          openDocument(saved);
                          await refresh();
                          setNotice('Reviewed draft appended as a new checked revision.');
                        })
                      }
                    >
                      Approve insertion
                    </Button>
                    <Button
                      onClick={() => {
                        sessionStorage.removeItem(proposalKey(index.actor, projectId, proposal.id));
                        setProposal(null);
                      }}
                    >
                      Discard proposal
                    </Button>
                  </section>
                )}
                <div className="research-document-heading">
                  <label>
                    Document title
                    <input
                      aria-label="Document title"
                      value={document.title}
                      readOnly={!editable}
                      maxLength={160}
                      onChange={(e) =>
                        setDocument((d) => (d ? { ...d, title: e.target.value } : d))
                      }
                    />
                  </label>
                  <label>
                    Authors
                    <input
                      aria-label="Document authors"
                      value={document.authors}
                      readOnly={!editable}
                      maxLength={300}
                      onChange={(e) =>
                        setDocument((d) => (d ? { ...d, authors: e.target.value } : d))
                      }
                    />
                  </label>
                  <span>
                    Revision {base?.version} · {document.role} · {dirty ? 'Unsaved draft' : 'Saved'}
                  </span>
                </div>
                {recovered && (
                  <div className="research-recovery">
                    <p>
                      A recoverable draft from {new Date(recovered.updatedAt).toLocaleString()}{' '}
                      exists (base revision {recovered.baseVersion}).
                    </p>
                    <Button
                      disabled={!editable}
                      onClick={() => {
                        setDocument((d) =>
                          d
                            ? {
                                ...d,
                                title: recovered.title,
                                authors: recovered.authors,
                                source: recovered.source,
                                evidence: recovered.evidence,
                              }
                            : d,
                        );
                        setConflict(recovered.baseVersion !== base?.version);
                        setRecovered(null);
                      }}
                    >
                      Recover draft
                    </Button>
                  </div>
                )}
                {conflict && (
                  <div className="research-recovery" role="alert">
                    <p>
                      A newer revision exists. Your source is retained. Export it, reload the
                      latest, or save a separate copy.
                    </p>
                    <Button onClick={() => void action(reloadDocument)}>Reload latest</Button>
                    <Button
                      onClick={() =>
                        void action(async () => {
                          const copy = await saveResearchDocument(
                            {
                              ...manuscriptFields(document),
                              id: crypto.randomUUID(),
                              title: document.title + ' copy',
                            },
                            null,
                          );
                          await refresh();
                          openDocument(copy);
                        })
                      }
                    >
                      Save draft as copy
                    </Button>
                  </div>
                )}
                <div className="research-actions">
                  <Button
                    disabled={!editable || !dirty || busy || conflict}
                    onClick={() => void saveDocument()}
                  >
                    Save revision
                  </Button>
                  <select
                    aria-label="Editor layout"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="split">Source and math preview</option>
                    <option value="source">Source only</option>
                    <option value="preview">Preview only</option>
                  </select>
                  <Button
                    onClick={() =>
                      downloadFile(
                        new File([document.source], document.title + '.tex', {
                          type: 'application/x-tex',
                        }),
                      )
                    }
                  >
                    Export LaTeX source
                  </Button>
                  <Button
                    onClick={() =>
                      downloadFile(
                        new File(
                          [
                            JSON.stringify(
                              {
                                document: manuscriptFields(document),
                                version: base?.version,
                                evidence: document.evidence,
                              },
                              null,
                              2,
                            ),
                          ],
                          document.title + '-evidence.json',
                          { type: 'application/json' },
                        ),
                      )
                    }
                  >
                    Export evidence manifest
                  </Button>
                  <Button
                    onClick={() =>
                      void action(async () =>
                        setHistory(await researchHistory(projectId, document.id)),
                      )
                    }
                  >
                    Revision history
                  </Button>
                  <Button onClick={() => void action(reloadDocument)}>Check latest revision</Button>
                </div>
                <div className={'research-source-layout mode-' + mode}>
                  {mode !== 'preview' && (
                    <label className="research-source">
                      LaTeX source
                      <textarea
                        aria-label="LaTeX source"
                        spellCheck={false}
                        value={document.source}
                        readOnly={!editable}
                        maxLength={120000}
                        onChange={(e) =>
                          setDocument((d) => (d ? { ...d, source: e.target.value } : d))
                        }
                      />
                    </label>
                  )}
                  {mode !== 'source' && <Preview source={document.source} />}
                </div>
                <p className="research-limit">
                  Math preview uses KaTeX. Full paper layout, bibliography resolution and PDF
                  compilation are external: download .tex and original figures, then use Overleaf or
                  a trusted local TeX installation with shell escape disabled. TerraLab executes no
                  TeX commands.
                </p>
                {history.length > 0 && (
                  <section aria-label="Document revisions">
                    <h3>Revision history</h3>
                    <ul>
                      {history.map((h) => (
                        <li key={h.version}>
                          Revision {h.version} · {h.author_id} ·{' '}
                          {new Date(h.created_at).toLocaleString()}
                          <Button
                            disabled={!editable || busy || dirty}
                            onClick={() => {
                              if (confirm('Restore this source as a new checked revision?'))
                                void action(async () => {
                                  const saved = await saveResearchDocument(
                                    { ...manuscriptFields(h), id: document.id },
                                    document.version,
                                  );
                                  openDocument(saved);
                                  await refresh();
                                });
                            }}
                          >
                            Restore revision {h.version}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <details className="research-evidence">
                  <summary>Add evidence and captions</summary>
                  <label>
                    Saved experiment
                    <select
                      aria-label="Evidence run"
                      value={runId}
                      onChange={(e) => setRunId(e.target.value)}
                    >
                      <option value="">Choose saved local run or enter cloud run ID below</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {index.cloud && (
                    <input
                      aria-label="Cloud evidence run ID"
                      placeholder="Accessible saved run UUID"
                      value={runId}
                      onChange={(e) => setRunId(e.target.value)}
                    />
                  )}
                  <Button
                    disabled={!editable || !runId || busy}
                    onClick={() => void action(addRun)}
                  >
                    Add selected run
                  </Button>
                  <p>
                    Run evidence resolves immutable recorded metrics and configuration. An active
                    network may differ from the run's snapshot; no re-simulation is implied.
                  </p>
                  <ul>
                    {document.evidence.map((e, i) => (
                      <li key={i}>
                        <strong>{e.type === 'run' ? e.runId : e.assetId}</strong>
                        <p>{e.caption}</p>
                        <pre>{JSON.stringify(e.snapshot, null, 2)}</pre>
                        <Button
                          disabled={!editable}
                          onClick={() =>
                            setDocument((d) =>
                              d ? { ...d, source: d.source + evidenceLatex(e) } : d,
                            )
                          }
                        >
                          Insert captioned {e.type === 'run' ? 'table' : 'figure'}
                        </Button>
                        <Button
                          disabled={!editable}
                          onClick={() => {
                            const caption = prompt('Evidence caption', e.caption);
                            if (caption !== null)
                              setDocument((d) =>
                                d
                                  ? {
                                      ...d,
                                      evidence: d.evidence.map((item, n) =>
                                        n === i
                                          ? { ...item, caption: caption.slice(0, 400) }
                                          : item,
                                      ),
                                    }
                                  : d,
                              );
                          }}
                        >
                          Edit caption
                        </Button>
                        <a
                          href={
                            e.type === 'run'
                              ? '/ai?project=' + projectId + '&experiment=' + e.runId
                              : '/research?project=' + projectId + '&asset=' + e.assetId
                          }
                        >
                          Open original source
                        </a>
                        {e.type === 'asset' && (
                          <Button
                            onClick={() =>
                              void action(async () => {
                                const a = index.assets.find((a) => a.id === e.assetId);
                                if (!a)
                                  throw Error(
                                    'Source asset is no longer available. Provenance is retained in the revision.',
                                  );
                                const { blob } = await readResearchAsset(projectId, a.id);
                                const extension =
                                  a.mime === 'image/jpeg'
                                    ? 'jpg'
                                    : a.mime === 'application/pdf'
                                      ? 'pdf'
                                      : a.mime === 'image/png'
                                        ? 'png'
                                        : a.name.split('.').at(-1);
                                downloadFile(
                                  new File([blob], a.id + '.' + extension, { type: a.mime }),
                                );
                              })
                            }
                          >
                            Download evidence asset
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>Document sharing · versioned collaboration</summary>
                  <p>
                    Documents are private until shared with current project members.
                    Owner/editor/viewer permissions are enforced by RLS and checked saves. Use
                    Refresh or Check latest revision for updates. No live presence or simultaneous
                    text merging is claimed.
                  </p>
                  {index.cloud && document.role === 'owner' ? (
                    <>
                      <label>
                        Project collaborator
                        <select
                          aria-label="Document collaborator"
                          value={shareUser}
                          onChange={(e) => setShareUser(e.target.value)}
                        >
                          <option value="">Choose collaborator</option>
                          {peers.map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.name} · project {p.role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Document role
                        <select
                          aria-label="Document grant role"
                          value={shareRole}
                          onChange={(e) => setShareRole(e.target.value as typeof shareRole)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor (also requires project editor)</option>
                        </select>
                      </label>
                      <Button
                        disabled={!shareUser || busy}
                        onClick={() =>
                          void action(async () => {
                            await shareResearchDocument(document.id, shareUser, shareRole);
                            setMembers(await researchDocumentMembers(document.id));
                            setNotice('Document access updated.');
                          })
                        }
                      >
                        Share document
                      </Button>
                      <Button
                        onClick={() =>
                          void action(async () =>
                            setMembers(await researchDocumentMembers(document.id)),
                          )
                        }
                      >
                        Refresh document access
                      </Button>
                      {members.map((m) => (
                        <p key={m.user_id}>
                          {peers.find((p) => p.user_id === m.user_id)?.name ?? m.user_id} · {m.role}{' '}
                          <Button
                            onClick={() => {
                              if (confirm('Revoke this document grant?'))
                                void action(async () => {
                                  await shareResearchDocument(document.id, m.user_id, null);
                                  setMembers(await researchDocumentMembers(document.id));
                                });
                            }}
                          >
                            Revoke document access
                          </Button>
                        </p>
                      ))}
                    </>
                  ) : (
                    <p>
                      {index.cloud
                        ? 'Only the document owner manages document grants.'
                        : 'Local browser documents have one local owner. Sign in and use cloud project collaboration for shared documents.'}
                    </p>
                  )}
                </details>
                <div className="research-actions">
                  <Link
                    href={aiURL(
                      'Explain the equations in the selected document using only available source context. Identify any missing definitions.',
                    )}
                  >
                    Explain this equation
                  </Link>
                  <Link
                    href={aiURL(
                      'Draft related-work notes using only the selected sources. Cite source IDs and available pages; mark unsupported claims.',
                    )}
                  >
                    Draft related-work notes
                  </Link>
                  <Link
                    href={aiURL(
                      'Create a methodology outline from the selected document and its actual attached experiment configuration. Separate missing data from facts.',
                    )}
                  >
                    Draft methodology outline
                  </Link>
                  <Link
                    href={aiURL(
                      'Review this draft for claims lacking a supplied source. Do not invent references or bibliographic details.',
                    )}
                  >
                    Check unsupported claims
                  </Link>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
