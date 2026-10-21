'use client';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@terralab/shared';
import type { ApprovalView } from '@/lib/ai/agent-contracts';
import {
  readTasks,
  taskKey,
  transitionTask,
  type ResearchTask,
  type ActionOutcome,
} from '@/lib/ai/task-history';
import { Button } from './ui/button';

type Context = { projectId: string; localProject?: Project; experimentId?: string };
type TestView = {
  id: string;
  state: string;
  command?: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number | null;
  counts?: Record<string, number | null>;
  output?: string;
  message?: string;
  real?: boolean;
  revision?: { hash: string; commit?: string | null };
};
export function AIResearchTasks({
  actor,
  project,
  api,
  contextInput,
  approval,
  onApproval,
  outcome,
  runView,
  trackedRun,
  onTrackRun,
  testId,
  onTrackTest,
  testingEnabled,
  onDraft,
}: {
  actor: string;
  project: Project;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  contextInput: () => Context;
  approval: ApprovalView | null;
  onApproval: (value: ApprovalView) => void;
  outcome: ActionOutcome | null;
  runView: { id: string; status: string } | null;
  trackedRun: string;
  onTrackRun: (id: string) => void;
  testId: string;
  onTrackTest: (id: string) => void;
  testingEnabled: boolean;
  onDraft: (value: string) => void;
}) {
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<unknown>(null);
  const [commands, setCommands] = useState<{ id: string; command: string }[]>([]);
  const [command, setCommand] = useState('typecheck');
  const [test, setTest] = useState<TestView | null>(null);
  const [metric, setMetric] = useState('rmseM');
  const [parameter, setParameter] = useState('timingNs');
  const [values, setValues] = useState('0.1, 1, 3');
  const [width, setWidth] = useState(100),
    [height, setHeight] = useState(80);
  const [anchors, setAnchors] = useState(6),
    [receivers, setReceivers] = useState(3);
  const alive = useRef(true);
  const lastOutcome = useRef('');
  useEffect(() => {
    alive.current = true;
    const saved = readTasks(localStorage, actor, project.id);
    setTasks(saved);
    setReady(true);
    const pendingRun = saved.find((t) => t.state === 'running' && t.runId)?.runId;
    const pendingTest = saved.find((t) => t.state === 'running' && t.testId)?.testId;
    if (!trackedRun && pendingRun) onTrackRun(pendingRun);
    if (!testId && pendingTest) onTrackTest(pendingTest);
    return () => {
      alive.current = false;
    };
    // The parent keys this component by verified actor and selected project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(taskKey(actor, project.id), JSON.stringify(tasks.slice(0, 50)));
    } catch {
      setError(
        'Task recovery history could not be saved in this browser. Keep the actual run/test ID before refreshing.',
      );
    }
  }, [tasks, ready, actor, project.id]);
  function record(
    id: string,
    kind: string,
    title: string,
    state: ResearchTask['state'],
    summary: string,
    refs: Pick<ResearchTask, 'runId' | 'testId'> = {},
  ) {
    setTasks((items) => {
      const at = new Date().toISOString();
      const previous = items.find((t) => t.id === id) ?? {
        id,
        projectId: project.id,
        kind,
        title,
        state: 'draft' as const,
        createdAt: at,
        updatedAt: at,
        history: [],
        plan:
          kind === 'accuracy'
            ? [
                'Inspect actual run and saved settings.',
                'Collect geometry and recorded measurements/metrics.',
                'Separate measured facts from candidate explanations.',
                'Propose one controlled experiment for review.',
              ]
            : [
                'Inspect the current authorized scenario and relevant constraints.',
                'Review the exact proposed operation and resource budget.',
                'Execute only the explicitly approved operation.',
                'Retrieve the actual result and report partial/failure states.',
              ],
      };
      return [
        transitionTask(previous, state, summary, refs),
        ...items.filter((t) => t.id !== id),
      ].slice(0, 50);
    });
  }
  useEffect(() => {
    if (!approval?.id || !ready) return;
    record(
      approval.id,
      approval.kind,
      approval.title,
      'awaiting_approval',
      'Validated proposal awaits explicit review. Refresh requires a fresh preview; approval tokens are not retained.',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval, ready]);
  useEffect(() => {
    if (!outcome || lastOutcome.current === outcome.actionId + outcome.state || !ready) return;
    lastOutcome.current = outcome.actionId + outcome.state;
    const state =
      outcome.state === 'cancelled'
        ? 'cancelled'
        : outcome.state === 'failed'
          ? 'failed'
          : outcome.runId || outcome.testId
            ? 'running'
            : 'completed';
    record(
      outcome.actionId,
      outcome.testId ? 'test' : outcome.runId ? 'experiment' : 'edit',
      'Reviewed action',
      state,
      outcome.message || 'Reviewed domain action returned.',
      {
        ...(outcome.runId ? { runId: outcome.runId } : {}),
        ...(outcome.testId ? { testId: outcome.testId } : {}),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, ready]);
  useEffect(() => {
    if (!runView || ['queued', 'running'].includes(runView.status)) return;
    const state =
      runView.status === 'completed'
        ? 'completed'
        : runView.status === 'cancelled'
          ? 'cancelled'
          : 'failed';
    setTasks((items) =>
      items.map((t) =>
        t.runId === runView.id && t.state === 'running'
          ? transitionTask(
              t,
              state,
              `Actual experiment status: ${runView.status}. Inspect recorded metrics and sample counts.`,
            )
          : t,
      ),
    );
  }, [runView]);
  useEffect(() => {
    if (!testId) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await api('tools', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            context: contextInput(),
            name: 'inspect_test_run',
            arguments: { testId },
          }),
        });
        const result = await response.json();
        if (stopped) return;
        if (!result.ok && result.code === 'tool_rate_limit') {
          setError(
            'Test status polling paused for the request-limit cooldown. The same test will be read again in one minute; no command will be resubmitted.',
          );
          timer = setTimeout(() => void poll(), 60000);
          return;
        }
        if (!result.ok) throw Error(result.message);
        if (stopped) return;
        setError('');
        const actual = result.data as TestView;
        setTest(actual);
        if (['queued', 'running'].includes(actual.state))
          timer = setTimeout(() => void poll(), 2500);
        else {
          const state =
            actual.state === 'completed' && actual.exitCode === 0
              ? 'completed'
              : actual.state === 'cancelled'
                ? 'cancelled'
                : 'failed';
          setTasks((items) =>
            items.map((t) =>
              t.testId === testId && t.state === 'running'
                ? transitionTask(
                    t,
                    state,
                    `Actual test: ${actual.state}; exit ${actual.exitCode ?? 'unavailable'}.`,
                  )
                : t,
            ),
          );
        }
      } catch (e) {
        if (!stopped && (e as Error & { code?: string }).code === 'tool_rate_limit') {
          setError(
            'Test status polling paused for the request-limit cooldown. The same test will be read again in one minute; no command will be resubmitted.',
          );
          timer = setTimeout(() => void poll(), 60000);
          return;
        }
        if (!stopped)
          setError(
            `Cannot resume this test: ${(e as Error).message} No success is assumed. Keep its ID and request a fresh authorized read.`,
          );
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, project]);
  async function tool(name: string, args: unknown = {}) {
    const result = await (
      await api('tools', {
        method: 'POST',
        body: JSON.stringify({ context: contextInput(), name, arguments: args }),
      })
    ).json();
    if (!result.ok) throw Error(result.message);
    return result;
  }
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function diagnose() {
    const id = crypto.randomUUID();
    record(
      id,
      'accuracy',
      'Accuracy investigation',
      'running',
      'Collecting actual runs, parameters and baseline geometry.',
    );
    try {
      const run = await tool('inspect_run');
      const geometry = await tool('diagnose_geometry');
      const parameters = await tool('inspect_parameters');
      if (!alive.current) return;
      setEvidence({
        run: run.data,
        geometry: geometry.data,
        parameters: parameters.data,
        method:
          'Recorded measurements/metrics are facts. Geometry at t=0 and configured impairments are candidate explanations, not proof of the dominant cause. Review one controlled change and compare actual results.',
      });
      record(
        id,
        'accuracy',
        'Accuracy investigation',
        'completed',
        'Retrieved actual run, parameter settings and baseline diagnostic; interpretation remains conditional.',
        { runId: run.data.id },
      );
      onDraft(
        'Use the actual latest run, geometry and parameters to explain evidence-supported candidate causes. Separate hypotheses and missing evidence, then propose one controlled approved experiment.',
      );
    } catch (e) {
      record(
        id,
        'accuracy',
        'Accuracy investigation',
        'failed',
        'Could not retrieve all required evidence. No diagnosis or success is assumed.',
      );
      throw e;
    }
  }
  const disabled = busy || !!approval;
  return (
    <section className="ai-workflows" aria-label="Research tasks and approved tests">
      <details>
        <summary>Research workflows and task recovery</summary>
        <p>
          Task references stay in this browser for seven days, up to 50 tasks. Chat, keys and
          approval tokens are not saved. Reads always recheck server permissions.
        </p>
        <div className="ai-workflow-actions">
          <Button size="sm" disabled={disabled} onClick={() => void work(diagnose)}>
            Investigate accuracy
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              void work(async () => {
                const result = await tool('diagnose_geometry');
                if (alive.current) setEvidence(result.data);
              })
            }
          >
            Validate saved network
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              void work(async () => {
                const result = await tool('propose_experiment', {
                  config: { sweep: 'none', trials: 2 },
                  reason:
                    'Controlled validation of the saved network using existing laboratory configuration.',
                });
                if (alive.current) onApproval(result.approval);
              })
            }
          >
            Review validation experiment
          </Button>
        </div>
        <details>
          <summary>Construct a boundary network</summary>
          <p>
            These explicit dimensions and counts define this request. Existing entities are
            retained. Review all new defaults and placements.
          </p>
          <div className="ai-workflow-fields">
            <label>
              Boundary width (m)
              <input
                type="number"
                min={1}
                max={100000}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <label>
              Boundary height (m)
              <input
                type="number"
                min={1}
                max={100000}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </label>
            <label>
              Anchor count
              <input
                type="number"
                min={3}
                max={12}
                value={anchors}
                onChange={(e) => setAnchors(Number(e.target.value))}
              />
            </label>
            <label>
              Receiver count
              <input
                type="number"
                min={1}
                max={6}
                value={receivers}
                onChange={(e) => setReceivers(Number(e.target.value))}
              />
            </label>
          </div>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              void work(async () => {
                if (
                  ![width, height].every((v) => Number.isFinite(v) && v >= 1 && v <= 100000) ||
                  !Number.isInteger(anchors) ||
                  anchors < 3 ||
                  anchors > 12 ||
                  !Number.isInteger(receivers) ||
                  receivers < 1 ||
                  receivers > 6
                )
                  throw Error('Use valid finite dimensions and bounded integer counts.');
                await tool('inspect_project');
                const operations = Array.from({ length: anchors }, (_, i) => {
                  const t = (i / anchors) * 2 * Math.PI;
                  const scale = Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)));
                  return {
                    op: 'add',
                    kind: 'anchor',
                    x: width / 2 + ((width / 2) * Math.cos(t)) / scale,
                    y: height / 2 + ((height / 2) * Math.sin(t)) / scale,
                  };
                });
                const all = [
                  ...operations,
                  ...Array.from({ length: receivers }, (_, i) => ({
                    op: 'add',
                    kind: 'receiver',
                    x: (width * (i + 1)) / (receivers + 1),
                    y: height * (i % 2 ? 0.6 : 0.4),
                  })),
                ];
                const result = await tool('propose_network_changes', {
                  operations: all,
                  reason:
                    'Explicit bounded boundary construction; preserve existing entities and inspect actual defaults before approval.',
                });
                if (alive.current) onApproval(result.approval);
              })
            }
          >
            Preview boundary network
          </Button>
        </details>
        <details>
          <summary>Controlled parameter study</summary>
          <div className="ai-workflow-fields">
            <label>
              Target metric
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {['rmseM', 'p95ErrorM', 'availability', 'medianRuntimeMs'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Changing parameter
              <select value={parameter} onChange={(e) => setParameter(e.target.value)}>
                {['timingNs', 'nlosProbability', 'anchorCount', 'speed'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Sweep values (2–5)
              <input value={values} maxLength={100} onChange={(e) => setValues(e.target.value)} />
            </label>
          </div>
          <p>
            One existing queued sweep; 10 trials and seed 42 are explicit study settings. All other
            saved inputs remain fixed. Cross-sweep observations are not assumed paired.
          </p>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              void work(async () => {
                const parts = values.split(',');
                if (parts.some((v) => !v.trim()))
                  throw Error('Enter finite comma-separated values without blank entries.');
                const result = await tool('propose_parameter_study', {
                  metric,
                  parameter,
                  values: parts.map(Number),
                  trials: 10,
                  seed: 42,
                });
                if (alive.current) onApproval(result.approval);
              })
            }
          >
            Review parameter study
          </Button>
        </details>
        <details>
          <summary>Regression investigation and approved tests</summary>
          {testingEnabled ? (
            <>
              <p>
                Trusted local development only. Exact commands run in a disposable code copy, with
                shared installed dependencies and OS process limits. No source-edit tool or hosted
                command execution.
              </p>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  void work(async () => {
                    const catalog = await tool('inspect_test_commands');
                    const changes = await tool('inspect_changes');
                    if (!alive.current) return;
                    setCommands(catalog.data.commands);
                    setEvidence(changes.data);
                  })
                }
              >
                Discover commands and regression plan
              </Button>
              {commands.length > 0 && (
                <label>
                  Approved test command
                  <select
                    aria-label="Approved test command"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                  >
                    {commands.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                size="sm"
                disabled={disabled || !commands.length}
                onClick={() =>
                  void work(async () => {
                    const result = await tool('propose_test_run', {
                      commandId: command,
                      reason:
                        'User-selected regression check; inspect actual exit status and bounded logs.',
                    });
                    if (alive.current) onApproval(result.approval);
                  })
                }
              >
                Review selected test
              </Button>
            </>
          ) : (
            <p>
              The local test runner is disabled on this server. An operator must enable the trusted
              local development workflow. No shell access is offered in production.
            </p>
          )}
          {test && (
            <section aria-label="Actual approved test result">
              <h3>Actual test · {test.state}</h3>
              <p className="mono">{test.id}</p>
              <p>{test.command}</p>
              <p>
                Exit: {test.exitCode ?? 'not available'} · Real execution:{' '}
                {test.real ? 'yes' : 'not verified'}
              </p>
              <p>
                Start: {test.startedAt ?? 'not started'} · End: {test.endedAt ?? 'not ended'}
              </p>
              <p>{test.message}</p>
              <pre>{JSON.stringify({ counts: test.counts, revision: test.revision }, null, 2)}</pre>
              <details>
                <summary>Bounded command output · untrusted diagnostic data</summary>
                <pre>{test.output || 'No output supplied; this is not evidence of a pass.'}</pre>
              </details>
              {['queued', 'running'].includes(test.state) && (
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    void work(async () => {
                      const result = await tool('propose_cancel_test', { testId: test.id });
                      if (alive.current) onApproval(result.approval);
                    })
                  }
                >
                  Review test cancellation
                </Button>
              )}
            </section>
          )}
        </details>
        {evidence !== null && (
          <details>
            <summary>Actual collected evidence and proposed method</summary>
            <pre>{JSON.stringify(evidence, null, 2)}</pre>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
        <ol className="ai-task-history" aria-label="Saved research task history">
          {tasks.map((t) => (
            <li key={t.id}>
              <strong>
                {t.title} · {t.state.replaceAll('_', ' ')}
              </strong>
              <p className="mono">
                {t.id} · {new Date(t.updatedAt).toLocaleString()}
              </p>
              {t.state === 'awaiting_approval' && approval?.id !== t.id && (
                <p>
                  The preview was not retained. Request a fresh proposal; it will not execute
                  automatically.
                </p>
              )}
              {t.runId && (
                <Button size="sm" onClick={() => onTrackRun(t.runId!)}>
                  Inspect recorded experiment
                </Button>
              )}
              {t.testId && (
                <Button size="sm" onClick={() => onTrackTest(t.testId!)}>
                  Inspect recorded test
                </Button>
              )}
              <details>
                <summary>Timestamped step history</summary>
                <ul>
                  {t.history.map((h, i) => (
                    <li key={i}>
                      {h.at} · {h.state} · {h.summary}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
        <Button size="sm" onClick={() => setTasks([])}>
          Clear this project’s task history
        </Button>
      </details>
    </section>
  );
}
