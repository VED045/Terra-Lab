'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Circle, Network, Settings2, Square, RotateCcw } from 'lucide-react';
import type { Project } from '@terralab/shared';
import { listProjects, supabase, localSave, localList } from '@/lib/persistence';
import { projectContent } from '@/lib/project-content';
import { projectSchema } from '@terralab/shared';
import { laboratoryRequest, saveExperiment, savedExperiments } from '@/lib/laboratory';
import { downloadFile } from '@/lib/downloads';
import { freshCopy } from '@/lib/research';
import type { AgentEvent, ApprovalView } from '@/lib/ai/agent-contracts';
import { AIActionReview } from './ai-action-review';
import { useStudio } from '@/lib/store';
import { providers, type Message, type ProviderId, type StreamEvent } from '@/lib/ai/contracts';
import { NetworkLogo } from './network-logo';
import { Button } from './ui/button';

type Settings = { mode: string; canSave: boolean; configured: boolean; ollamaEnabled: boolean };
type Experiment = { measurement: string; trials: number; estimators: string[] };
type Context = {
  source: string;
  objects: Record<string, { total: number; enabled: number }>;
  mobility: string[];
  simulation: { engine: string; measurement: string };
  experiment: Experiment | null;
  run: { status: string; experiment: Experiment } | null;
};
const starters = [
  'Summarize this network and its experiment configuration.',
  'Explain how anchor geometry affects positioning accuracy.',
  'Which assumptions should I check before comparing estimators?',
];

export default function AIStudio() {
  const theme = useStudio((s) => s.project.canvas.theme);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [experimentId, setExperimentId] = useState('');
  const [context, setContext] = useState<Context | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>('deepseek');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [plans, setPlans] = useState<string[]>([]);
  const [toolEvents, setToolEvents] = useState<Extract<AgentEvent, { type: 'tool' }>[]>([]);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [recovery, setRecovery] = useState<ApprovalView | null>(null);
  const [trackedRun, setTrackedRun] = useState('');
  const [changedProject, setChangedProject] = useState<Project | null>(null);
  const [changedEntities, setChangedEntities] = useState<string[]>([]);
  const [runView, setRunView] = useState<{
    id: string;
    status: string;
    completed: number;
    planned: number;
    error?: string | null;
    metrics: { estimator: string; rmseM: number | null; fixes: number; attempted: number }[];
  } | null>(null);
  const keyInput = useRef<HTMLInputElement>(null); // Uncontrolled; cleared immediately after submission.
  const abort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const contextRevision = useRef(0);
  const lastQuestion = useRef('');
  const end = useRef<HTMLDivElement>(null);

  async function api(path: string, init?: RequestInit) {
    const db = supabase();
    const session = db ? await db.auth.getSession() : null;
    const token = session?.data.session?.access_token;
    const response = await fetch('/api/ai/' + path, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw Error(failure?.message || 'AI Studio is unavailable. Retry shortly.');
    }
    return response;
  }
  function resetConversation() {
    revision.current++;
    contextRevision.current++;
    abort.current?.abort();
    setBusy(false);
    setMessages([]);
    setActivity([]);
    setError('');
    setNotice('');
    setPlans([]);
    setToolEvents([]);
    setApproval(null);
    setRecovery(null);
    setTrackedRun('');
    setRunView(null);
    setChangedProject(null);
    setChangedEntities([]);
    lastQuestion.current = '';
  }
  useEffect(() => {
    let active = true;
    let loadEpoch = 0;
    async function load() {
      const epoch = ++loadEpoch;
      try {
        const [result, config] = await Promise.all([
          listProjects(),
          api('settings').then((r) => r.json() as Promise<Settings>),
        ]);
        if (!active || epoch !== loadEpoch) return;
        setProjects(result);
        setSettings(config);
        const query = new URLSearchParams(location.search);
        const id = query.get('project');
        if (id && result.some((p) => p.id === id)) {
          setProjectId(id);
          setExperimentId(query.get('experiment') || '');
          setTrackedRun(query.get('experiment') || '');
        }
      } catch (e) {
        if (active && epoch === loadEpoch)
          setError(e instanceof Error ? e.message : 'Could not open AI Studio.');
      }
    }
    void load();
    const db = supabase();
    const subscription = db?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadEpoch++;
        resetConversation();
        setContext(null);
        setProjects([]);
        setProjectId('');
        setConnected(false);
        setModels([]);
        setModel('');
        setSettings(null);
        setChecking(false);
        if (keyInput.current) keyInput.current.value = '';
        setTimeout(() => {
          if (active) void load();
        }, 0);
      }
    });
    return () => {
      active = false;
      revision.current++;
      abort.current?.abort();
      subscription?.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setContext(null);
    if (projectId && settings) {
      void api('context', {
        method: 'POST',
        body: JSON.stringify(contextInput()),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((value) => {
          if (active) setContext(value);
        })
        .catch((e) => {
          if (active && !controller.signal.aborted) setError(e.message);
        });
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, experimentId, settings, projects]);
  useEffect(() => {
    if (!trackedRun || !projectId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const epoch = contextRevision.current;
    async function poll() {
      try {
        const result = await (
          await api('tools', {
            method: 'POST',
            signal: controller.signal,
            body: JSON.stringify({
              context: contextInput(),
              name: 'inspect_run',
              arguments: { runId: trackedRun },
            }),
          })
        ).json();
        if (stopped || epoch !== contextRevision.current) return;
        if (!result.ok) throw Error(result.message);
        setRunView(result.data);
        if (['queued', 'running'].includes(result.data.status))
          timer = setTimeout(() => void poll(), 2500);
        else {
          setNotice(
            `Actual run ${result.data.id}: ${result.data.status} · ${result.data.completed}/${result.data.planned} samples.`,
          );
          if (
            settings?.mode === 'local-development' &&
            !(await savedExperiments()).some((r) => r.id === trackedRun)
          ) {
            const full = await laboratoryRequest('?id=' + trackedRun + '&detail=true');
            if (!stopped && epoch === contextRevision.current) await saveExperiment(full);
          }
        }
      } catch (e) {
        if (!stopped && !controller.signal.aborted) setError((e as Error).message);
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [trackedRun, projectId, projects]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);
  function contextInput() {
    return {
      projectId,
      ...(experimentId ? { experimentId } : {}),
      ...(settings?.mode === 'local-development'
        ? { localProject: projects.find((p) => p.id === projectId) }
        : {}),
    };
  }
  async function checkConnection() {
    const epoch = revision.current;
    setChecking(true);
    setError('');
    setConnected(false);
    try {
      const result = await (
        await api('connection', { method: 'POST', body: JSON.stringify({ provider }) })
      ).json();
      if (epoch !== revision.current) return;
      setModels(result.models);
      setModel((current) => (result.models.includes(current) ? current : ''));
      setConnected(result.checked === true);
      setNotice('Connection verified. Choose a model before sending.');
    } catch (e) {
      if (epoch === revision.current) {
        setError((e as Error).message);
        setModels([]);
        setModel('');
      }
    } finally {
      if (epoch === revision.current) setChecking(false);
    }
  }
  async function saveKey(event: React.FormEvent) {
    event.preventDefault();
    const input = keyInput.current;
    if (!input?.value) return;
    const payload = JSON.stringify({ provider: 'deepseek', key: input.value });
    const epoch = revision.current;
    input.value = '';
    setChecking(true);
    setError('');
    setConnected(false);
    try {
      const result = await (await api('settings', { method: 'POST', body: payload })).json();
      if (epoch !== revision.current) return;
      setSettings((current) => (current ? { ...current, configured: true } : current));
      if (provider === 'deepseek') {
        setModels(result.models);
        setConnected(true);
      }
      setNotice('Key verified and saved for this signed-in user in this browser.');
    } catch (e) {
      if (epoch === revision.current) setError((e as Error).message);
    } finally {
      if (epoch === revision.current) setChecking(false);
    }
  }
  async function forgetKey() {
    const epoch = revision.current;
    setChecking(true);
    setError('');
    try {
      await api('settings', { method: 'DELETE' });
      if (epoch !== revision.current) return;
      setSettings((current) => (current ? { ...current, configured: false } : current));
      setConnected(false);
      setModels([]);
      setModel('');
      setNotice('Saved credential removed from this browser.');
    } catch (e) {
      if (epoch === revision.current) setError((e as Error).message);
    } finally {
      if (epoch === revision.current) setChecking(false);
    }
  }
  async function send(question = draft, retry = false) {
    if (busy || approval || !question.trim() || !context || !model || !connected) return;
    const current = ++revision.current;
    const controller = new AbortController();
    abort.current = controller;
    const history = retry ? messages.slice(0, -2) : messages;
    const outgoing: Message[] = [
      ...history,
      { role: 'user' as const, content: question.trim() },
    ].slice(-19);
    setMessages([...outgoing, { role: 'assistant', content: '' }]);
    setDraft('');
    setError('');
    setNotice('');
    setBusy(true);
    setActivity([
      agentEnabled
        ? 'Preparing bounded tool workflow with fresh project authorization…'
        : 'Preparing a read-only response with fresh project authorization…',
    ]);
    setPlans([]);
    setToolEvents([]);
    lastQuestion.current = question;
    try {
      const response = await api(agentEnabled ? 'agent' : 'chat', {
        method: 'POST',
        body: JSON.stringify({ provider, model, context: contextInput(), messages: outgoing }),
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      if (!reader) throw Error('The provider returned no response stream.');
      const decoder = new TextDecoder();
      let buffer = '',
        completed = false;
      while (true) {
        const chunk = await reader.read();
        if (current !== revision.current) {
          await reader.cancel();
          return;
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const event = JSON.parse(buffer.slice(0, newline)) as StreamEvent | AgentEvent;
          buffer = buffer.slice(newline + 1);
          if (event.type === 'activity') setActivity((items) => [...items, event.text]);
          if (event.type === 'plan') setPlans((items) => [...items, event.text]);
          if (event.type === 'tool')
            setToolEvents((items) => [...items.filter((item) => item.id !== event.id), event]);
          if (event.type === 'approval') setApproval(event.action);
          if (event.type === 'text')
            setMessages((items) =>
              items.map((m, i) =>
                i === items.length - 1 ? { ...m, content: m.content + event.text } : m,
              ),
            );
          if (event.type === 'error') throw Error(event.message);
          if (event.type === 'done') completed = true;
        }
      }
      if (!completed) throw Error('The response ended early. Retry when ready.');
      setActivity((items) => [
        ...items,
        agentEnabled
          ? 'Agent turn completed. Proposed mutations still require human review; only recorded tool results are verified.'
          : 'Text response completed. No network changes or tests executed.',
      ]);
    } catch (e) {
      if (current !== revision.current) return;
      if (controller.signal.aborted) setNotice('Response stopped. Partial text is unverified.');
      else setError((e as Error).message);
    } finally {
      if (current === revision.current) {
        setBusy(false);
        abort.current = null;
      }
    }
  }
  async function inspectLatestRun() {
    const epoch = revision.current;
    setError('');
    try {
      const result = await (
        await api('tools', {
          method: 'POST',
          body: JSON.stringify({ context: contextInput(), name: 'inspect_run', arguments: {} }),
        })
      ).json();
      if (!result.ok) throw Error(result.message);
      if (epoch !== revision.current) return;
      setRunView(result.data);
      setTrackedRun(result.data.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function requestCancellation() {
    const epoch = revision.current;
    setError('');
    try {
      const result = await (
        await api('tools', {
          method: 'POST',
          body: JSON.stringify({
            context: contextInput(),
            name: 'propose_cancel_run',
            arguments: { runId: trackedRun },
          }),
        })
      ).json();
      if (!result.ok) throw Error(result.message);
      if (epoch !== revision.current) return;
      setApproval(result.approval);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reviewAction(decision: 'approve' | 'cancel') {
    if (!approval || busy) return;
    const epoch = revision.current;
    setBusy(true);
    setError('');
    try {
      const result = await (
        await api('approve', {
          method: 'POST',
          body: JSON.stringify({ context: contextInput(), token: approval.token, decision }),
        })
      ).json();
      if (epoch !== revision.current) return;
      if (result.project) {
        const saved = projectSchema.parse(result.project);
        let recoveryCopy: Project | null = null;
        if (result.persistence === 'browser') {
          const current = projects.find((p) => p.id === projectId);
          if (!current)
            throw Error('Project context changed before the local save. Refresh and review again.');
          const stored = localList(localStorage).find((p) => p.id === projectId);
          if (!stored || projectContent(stored) !== projectContent(current)) {
            setProjects(localList(localStorage));
            throw Error(
              'The saved local project changed after preview. Nothing was overwritten. Request a fresh proposal.',
            );
          }
          if (saved.id === current.id) {
            recoveryCopy = freshCopy(current, `${current.name} · before AI`);
            localSave(localStorage, recoveryCopy);
          }
          localSave(localStorage, saved);
        }
        setProjects((items) => [
          saved,
          ...(recoveryCopy ? [recoveryCopy] : []),
          ...items.filter((p) => p.id !== saved.id),
        ]);
        setChangedProject(saved);
        setChangedEntities(result.entityIds || []);
        const studio = useStudio.getState();
        if (!studio.dirty && studio.project.id === saved.id) {
          studio.load(saved);
          localStorage.setItem('terralab.active.v1', JSON.stringify(saved));
        }
        setRecovery(result.undo || null);
        setActivity((items) => [
          ...items,
          `Confirmed: saved actual project ${saved.id}, revision ${saved.cloudVersion ?? 'local'}.`,
        ]);
        if (saved.id !== projectId) {
          setProjectId(saved.id);
          setMessages([]);
        }
      }
      if (result.runId) {
        setTrackedRun(result.runId);
        setRunView(null);
      }
      setApproval(null);
      setNotice(
        result.state === 'local_save_required'
          ? 'Approved changes saved through the browser project store. Existing unsaved Network studio drafts are preserved.'
          : result.message,
      );
      setDraft(
        result.runId
          ? `Continue the original task. Inspect actual run ${result.runId} and report its real status before comparing results.`
          : 'Continue the original task. Inspect the saved project to verify what changed, then propose the next controlled step if needed.',
      );
    } catch (e) {
      if (epoch === revision.current) {
        setError((e as Error).message);
        setApproval(null);
      }
    } finally {
      if (epoch === revision.current) setBusy(false);
    }
  }
  async function downloadRun(format: 'json' | 'csv') {
    const epoch = contextRevision.current;
    try {
      const response = await api('export', {
        method: 'POST',
        body: JSON.stringify({ context: contextInput(), runId: trackedRun, format }),
      });
      const data = await response.blob();
      if (epoch !== contextRevision.current) return;
      downloadFile(
        new File([data], `terralab-${trackedRun}.${format}`, {
          type: format === 'csv' ? 'text/csv' : 'application/json',
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function verifyTools() {
    const epoch = revision.current;
    setChecking(true);
    setError('');
    try {
      const result = await (
        await api('compatibility', { method: 'POST', body: JSON.stringify({ provider, model }) })
      ).json();
      if (epoch !== revision.current) return;
      setNotice(
        result.checked
          ? 'Tool calling and structured JSON verified by actual provider probes.'
          : 'Compatibility was not verified.',
      );
    } catch (e) {
      if (epoch === revision.current) setError((e as Error).message);
    } finally {
      if (epoch === revision.current) setChecking(false);
    }
  }
  return (
    <main className={`ai-studio research-page theme-${theme}`}>
      <header className="ai-header">
        <Link href="/projects" aria-label="TerraLab project library">
          <NetworkLogo size={29} />
        </Link>
        <div>
          <h1>AI Studio</h1>
          <p>
            {agentEnabled
              ? 'Research agent · Changes require review'
              : 'Research assistant · Read only'}
          </p>
        </div>
        <nav aria-label="AI Studio navigation">
          <Link href="/projects">Projects</Link>
          <Link href="/studio">
            <Network size={16} />
            Network studio
          </Link>
        </nav>
        <Button
          aria-expanded={settingsOpen}
          aria-controls="ai-provider-settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings2 size={16} />
          Provider settings
        </Button>
      </header>
      <div className="ai-layout">
        <aside className="ai-context" aria-label="Project context">
          <h2>Research context</h2>
          <label htmlFor="ai-project">Saved project</label>
          <select
            id="ai-project"
            value={projectId}
            disabled={busy || checking}
            onChange={(e) => {
              resetConversation();
              setExperimentId('');
              setProjectId(e.target.value);
            }}
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!context ? (
            <p>
              Open or select a saved project to discuss its real configuration. Save changes in
              Network studio first.
            </p>
          ) : (
            <>
              <p className="ai-source">
                {context.source === 'cloud-saved'
                  ? 'Authorized cloud snapshot'
                  : 'Local development snapshot'}
              </p>
              <dl>
                {Object.entries(context.objects).map(([kind, count]) => (
                  <div key={kind}>
                    <dt>{kind}</dt>
                    <dd>
                      {count.enabled} enabled / {count.total}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3>Current experiment</h3>
              {context.run?.experiment || context.experiment ? (
                <p>
                  {(context.run?.experiment || context.experiment)!.measurement.toUpperCase()} ·{' '}
                  {(context.run?.experiment || context.experiment)!.trials} trials
                  <br />
                  {(context.run?.experiment || context.experiment)!.estimators.join(', ')}
                </p>
              ) : (
                <p>No saved laboratory configuration.</p>
              )}
              {context.run && <p>Selected run: {context.run.status}</p>}
              <p>
                {agentEnabled
                  ? 'Tools may inspect authorized synthetic measurements and actual recorded metrics.'
                  : 'Configuration only. No measured results are sent.'}
              </p>
            </>
          )}
          <div className="ai-boundary">
            <Check size={16} />
            <p>
              The assistant can inspect and propose. You review edits and experiment submissions
              before execution.
            </p>
          </div>
          <section className="ai-activity" aria-label="Verified activity">
            <h2>Activity</h2>
            <p>Only completed server checks appear as verified activity.</p>
            <ol aria-live="polite">
              {activity.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
            {plans.length > 0 && (
              <section aria-label="Proposed plan">
                <h3>Proposed plan</h3>
                {plans.map((plan, index) => (
                  <p key={index}>{plan}</p>
                ))}
              </section>
            )}
            <ol className="ai-tool-timeline" aria-live="polite">
              {toolEvents.map((event) => (
                <li key={event.id}>
                  <strong>
                    {event.name} · {event.state}
                  </strong>
                  <p>{event.summary}</p>
                  {event.result !== undefined && (
                    <details>
                      <summary>Actual tool result</summary>
                      <pre>{JSON.stringify(event.result, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
        <section className="ai-conversation" aria-label="Research conversation">
          <div className="ai-toolbar">
            <label className="ai-agent-mode">
              <input
                type="checkbox"
                checked={agentEnabled}
                disabled={busy || checking || !!approval}
                onChange={(e) => {
                  resetConversation();
                  setAgentEnabled(e.target.checked);
                }}
              />
              Research agent
            </label>
            {agentEnabled && (
              <Button
                disabled={busy || checking || !model || !connected}
                onClick={() => void verifyTools()}
              >
                Verify tool compatibility
              </Button>
            )}
            <label>
              Provider
              <select
                value={provider}
                disabled={busy || checking}
                onChange={(e) => {
                  resetConversation();
                  setProvider(e.target.value as ProviderId);
                  setConnected(false);
                  setModels([]);
                  setModel('');
                }}
              >
                {Object.entries(providers).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select
                value={model}
                disabled={busy || checking || !models.length}
                onChange={(e) => {
                  resetConversation();
                  setModel(e.target.value);
                }}
              >
                <option value="">Choose after connection check</option>
                {models.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy || checking} onClick={() => void checkConnection()}>
              {checking ? 'Checking…' : 'Check connection'}
            </Button>
            <span className="ai-connection">
              <Circle size={9} fill={connected ? 'currentColor' : 'none'} />
              {connected ? 'Verified' : 'Not checked'}
            </span>
          </div>
          {settingsOpen && (
            <section
              className="ai-settings"
              id="ai-provider-settings"
              aria-label="Provider settings"
            >
              <h2>Your provider, your account</h2>
              <p>
                DeepSeek receives your messages and the minimal project summary shown here. An API
                key is required; DeepSeek may bill your account. TerraLab supplies no shared key and
                never switches providers automatically. Do not paste secrets into chat.
              </p>
              {settings?.canSave ? (
                <form onSubmit={saveKey}>
                  <label htmlFor="ai-key">DeepSeek API key</label>
                  <input
                    id="ai-key"
                    ref={keyInput}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={256}
                    required
                    placeholder={
                      settings.configured ? 'Saved · enter a replacement' : 'Enter your own API key'
                    }
                  />
                  <Button type="submit" disabled={busy || checking}>
                    Verify & save key
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || checking || !settings.configured}
                    onClick={() => void forgetKey()}
                  >
                    Forget saved key
                  </Button>
                  <p>
                    Write only after saving. Encrypted, user-bound HttpOnly cookie; expires in seven
                    days. This browser only.
                  </p>
                </form>
              ) : (
                <p>
                  {settings?.mode === 'local-development'
                    ? 'Development mode: configure your own TERRALAB_AI_DEV_DEEPSEEK_KEY on the local server.'
                    : 'Sign in through Projects. The administrator must configure TERRALAB_AI_COOKIE_KEY before browser key saving is available.'}
                </p>
              )}
              <h3>Optional Ollama</h3>
              <p>
                Run Ollama and TerraLab on the same computer, enable the local development
                connection, install a suitable model manually, then check the connection and choose
                it. No models are downloaded automatically. A deployed server cannot reach Ollama on
                your computer’s localhost.
              </p>
              <p>
                {settings?.ollamaEnabled
                  ? 'Local Ollama connection enabled; use Check connection to verify availability.'
                  : 'Ollama is disabled on this server.'}{' '}
                Setup: docs/ai/PROVIDER_SETUP.md
              </p>
            </section>
          )}
          <div
            className="ai-transcript"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!messages.length && (
              <div className="ai-empty">
                <span className="ai-eyebrow">TERRALAB / AI</span>
                <h2>Understand your next experiment.</h2>
                <p>
                  Explore the network you’ve built, question its assumptions, and plan a clearer
                  comparison.
                </p>
                <div className="ai-starters">
                  {starters.map((prompt) => (
                    <button key={prompt} onClick={() => setDraft(prompt)}>
                      {prompt}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, i) => (
              <article className={`ai-message ai-${message.role}`} key={i}>
                <h3>
                  {message.role === 'user' ? 'You' : 'TerraLab AI · Explanation / proposed actions'}
                </h3>
                <p>
                  {message.content || (busy ? 'Waiting for provider…' : 'No completed response.')}
                </p>
              </article>
            ))}
            <div ref={end} />
          </div>
          <div className="ai-compose-area">
            {agentEnabled && context && (
              <div className="ai-research-controls">
                <Button
                  size="sm"
                  disabled={busy || checking || !!approval}
                  onClick={() => void inspectLatestRun()}
                >
                  Inspect latest run
                </Button>
                {recovery && (
                  <Button
                    size="sm"
                    disabled={busy || !!approval}
                    onClick={() => setApproval(recovery)}
                  >
                    Undo / redo last change
                  </Button>
                )}
              </div>
            )}
            {changedProject && (
              <div className="ai-changed-links">
                <p>Confirmed saved project: {changedProject.id}</p>
                {[null, ...changedEntities.slice(0, 12)].map((id) => (
                  <Link
                    key={id ?? 'network'}
                    href={'/studio' + (id ? '?entity=' + encodeURIComponent(id) : '')}
                    onClick={(event) => {
                      const studio = useStudio.getState();
                      if (studio.dirty) {
                        event.preventDefault();
                        setError(
                          'Save the unsaved Network studio draft through Projects before opening the changed snapshot. Your draft is preserved.',
                        );
                        return;
                      }
                      const validated = projectSchema.parse(changedProject);
                      studio.load(validated);
                      if (id && validated.objects.some((o) => o.id === id)) studio.select([id]);
                      localStorage.setItem('terralab.active.v1', JSON.stringify(validated));
                    }}
                  >
                    {id ? 'Inspect entity ' + id : 'Open saved network'}
                  </Link>
                ))}
              </div>
            )}
            {approval && (
              <AIActionReview
                action={approval}
                busy={busy}
                onReview={(decision) => void reviewAction(decision)}
              />
            )}
            {runView && (
              <a
                className="ai-record-link"
                href={
                  '/ai?project=' +
                  encodeURIComponent(projectId) +
                  '&experiment=' +
                  encodeURIComponent(runView.id)
                }
              >
                Open this recorded run
              </a>
            )}
            {runView && (
              <section className="ai-run-result" aria-label="Actual experiment result">
                <h2>Actual run · {runView.status}</h2>
                <p className="mono">
                  {runView.id} · {runView.completed}/{runView.planned} samples
                </p>
                {runView.error && <p>{runView.error}</p>}
                <table>
                  <caption>Recorded metrics · conditional on successful fixes</caption>
                  <thead>
                    <tr>
                      <th>Estimator</th>
                      <th>RMSE (m)</th>
                      <th>Fixes / attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runView.metrics.map((metric, i) => (
                      <tr key={i}>
                        <td>{metric.estimator}</td>
                        <td>{metric.rmseM ?? 'Unavailable'}</td>
                        <td>
                          {metric.fixes}/{metric.attempted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  {['queued', 'running'].includes(runView.status) ? (
                    <Button
                      disabled={busy || !!approval}
                      onClick={() => void requestCancellation()}
                    >
                      Cancel active run
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void downloadRun('json')}>
                        Export actual JSON
                      </Button>
                      <Button size="sm" onClick={() => void downloadRun('csv')}>
                        Export actual CSV
                      </Button>
                    </>
                  )}
                </div>
              </section>
            )}
            {error && (
              <div className="ai-error" role="alert" aria-label="AI Studio error">
                {error}
              </div>
            )}
            <p role="status" className="ai-notice">
              {notice}
            </p>
            <form
              className="ai-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label className="sr-only" htmlFor="ai-message">
                Message TerraLab AI
              </label>
              <textarea
                id="ai-message"
                value={draft}
                maxLength={8000}
                disabled={busy}
                placeholder="Ask about this project…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <Button
                  type="button"
                  disabled={!abort.current}
                  onClick={() => abort.current?.abort()}
                >
                  <Square size={15} />
                  {abort.current ? 'Stop response' : 'Applying reviewed action…'}
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="default"
                  disabled={
                    !draft.trim() || !context || !connected || !model || checking || !!approval
                  }
                >
                  <ArrowUp size={16} />
                  Send
                </Button>
              )}
            </form>
            <div className="ai-compose-foot">
              <span>Enter to send · Shift+Enter for a new line · Responses can be mistaken.</span>
              {!busy && lastQuestion.current && (
                <Button
                  size="sm"
                  disabled={!context || !model || !connected || checking}
                  onClick={() => void send(lastQuestion.current, true)}
                >
                  <RotateCcw size={13} />
                  Retry response
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
