'use client';
import { useEffect, useState, useRef } from 'react';
import { Check, LoaderCircle, Clock3, X, Circle } from 'lucide-react';
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
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => ['executing', 'running', 'waiting', 'queued'].includes(step.state)) <
      0
      ? steps.length - 1
      : steps.findIndex((step) =>
          ['executing', 'running', 'waiting', 'queued'].includes(step.state),
        ),
  );
  const track = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = track.current,
      active = el?.children[activeIndex] as HTMLElement | undefined;
    if (el && active)
      el.scrollLeft = Math.max(
        0,
        active.offsetLeft - el.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2,
      );
  }, [activeIndex]);
  if (status === 'idle') return null;
  return (
    <section className="ai-agent-flow" data-busy={busy} aria-label="Agent activity">
      <header>
        <strong>Agent activity</strong>
        <span>
          {approval ? 'Awaiting approval' : status} · {elapsed}s
        </span>
      </header>
      <ol ref={track}>
        {steps.map((step, index) => (
          <li
            key={index}
            data-state={step.state}
            className={index === activeIndex ? 'is-active' : undefined}
          >
            <details>
              <summary>
                <span className="ai-flow-dot" aria-hidden="true">
                  {step.state === 'completed' ? (
                    <Check size={12} />
                  ) : ['executing', 'running'].includes(step.state) ? (
                    <LoaderCircle size={12} />
                  ) : step.state === 'waiting' ? (
                    <Clock3 size={12} />
                  ) : ['failed', 'cancelled'].includes(step.state) ? (
                    <X size={12} />
                  ) : (
                    <Circle size={9} />
                  )}
                </span>
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
