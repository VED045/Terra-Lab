'use client';
import { useEffect, useState } from 'react';
import type { AgentEvent } from '@/lib/ai/agent-contracts';

type ToolEvent = Extract<AgentEvent, { type: 'tool' }>;
export function AIAgentActivity({
  busy,
  status,
  startedAt,
  events,
  plans,
  approval,
  run,
  projectId,
}: {
  busy: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  events: ToolEvent[];
  plans: string[];
  approval: boolean;
  run: { id: string; status: string } | null;
  projectId: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    if (!busy) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [busy, startedAt]);
  if (status === 'idle') return null;
  const steps: { label: string; state: string; detail?: string; result?: unknown }[] = [
    {
      label: 'Request',
      state: 'completed',
      detail: 'User request accepted. Domain operations recheck project access.',
    },
    ...events.map((e) => ({
      label: e.name.replaceAll('_', ' '),
      state: e.state,
      detail: e.summary,
      result: e.result,
    })),
  ];
  if (plans.length)
    steps.splice(1, 0, { label: 'Plan', state: 'completed', detail: plans.join('\n') });
  if (approval)
    steps.push({
      label: 'Review required',
      state: 'waiting',
      detail: 'No proposed mutation executes before your approval.',
    });
  if (run) steps.push({ label: 'Experiment', state: run.status, detail: run.id });
  steps.push({
    label: busy ? 'Model response' : status === 'completed' ? 'Turn complete' : status,
    state: busy ? 'executing' : status,
    detail:
      status === 'completed'
        ? 'Turn finished; experiment status and pending approvals remain separate.'
        : undefined,
  });
  return (
    <section className="ai-agent-flow" aria-label="Agent activity">
      <header>
        <strong>Agent activity</strong>
        <span>
          {approval ? 'Awaiting approval' : status} · {elapsed}s
        </span>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li key={index} data-state={step.state}>
            <details>
              <summary>
                <span className="ai-flow-dot" aria-hidden="true" />
                {step.label}
                <small>{step.state}</small>
              </summary>
              {step.detail && <p>{step.detail}</p>}
              {step.result !== undefined && <pre>{JSON.stringify(step.result, null, 2)}</pre>}
            </details>
          </li>
        ))}
      </ol>
      {run && (
        <a
          href={
            '/ai?project=' +
            encodeURIComponent(projectId) +
            '&experiment=' +
            encodeURIComponent(run.id)
          }
        >
          Open actual run {run.id}
        </a>
      )}
    </section>
  );
}
