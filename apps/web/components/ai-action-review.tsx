'use client';
import type { ApprovalView } from '@/lib/ai/agent-contracts';
import { Button } from './ui/button';

export function AIActionReview({
  action,
  busy,
  onReview,
}: {
  action: ApprovalView;
  busy: boolean;
  onReview: (decision: 'approve' | 'cancel') => void;
}) {
  const raw = action.preview as { details?: unknown };
  const preview = (raw.details ?? raw) as {
    changedEntities?: { id: string; kind: string; x: number; y: number }[];
  };
  const entities =
    preview.changedEntities?.filter((o) => Number.isFinite(o.x) && Number.isFinite(o.y)) ?? [];
  const minX = Math.min(0, ...entities.map((o) => o.x)),
    maxX = Math.max(1, ...entities.map((o) => o.x));
  const minY = Math.min(0, ...entities.map((o) => o.y)),
    maxY = Math.max(1, ...entities.map((o) => o.y));
  return (
    <section className="ai-action-review" aria-label="Review proposed action">
      <h2>{action.title}</h2>
      <p>
        {action.shared
          ? 'Shared project: your approval saves changes visible to collaborators.'
          : 'Your approval is required before this operation runs.'}{' '}
        {action.destructive &&
          'This operation removes or restores state. Review the exact targets and consequences.'}
      </p>
      {entities.length > 0 && (
        <svg viewBox="0 0 400 170" role="img" aria-label="Proposed entity placement preview">
          {entities.map((o) => {
            const x = 20 + ((o.x - minX) / Math.max(1, maxX - minX)) * 360,
              y = 150 - ((o.y - minY) / Math.max(1, maxY - minY)) * 130;
            return (
              <g key={o.id}>
                <circle cx={x} cy={y} r={o.kind === 'anchor' ? 5 : 3} />
                <title>
                  {o.kind}: {o.x}, {o.y}
                </title>
              </g>
            );
          })}
        </svg>
      )}
      <details open>
        <summary>Exact validated preview and application defaults</summary>
        <pre>{JSON.stringify(action.preview, null, 2)}</pre>
      </details>
      <p>
        Expires {new Date(action.expiresAt).toLocaleTimeString()}. A changed revision requires a
        fresh preview.
      </p>
      <div>
        <Button
          variant={action.destructive ? 'danger' : 'default'}
          disabled={busy}
          onClick={() => onReview('approve')}
        >
          Approve & apply
        </Button>
        <Button disabled={busy} onClick={() => onReview('cancel')}>
          Cancel proposal
        </Button>
      </div>
    </section>
  );
}
