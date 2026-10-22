'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/store';

export function AIStudioLink({
  compact = false,
  onOpen,
}: {
  compact?: boolean;
  onOpen?: () => void;
}) {
  const id = useStudio((s) => s.project.id);
  return (
    <Link
      className={compact ? 'rail-collaboration-link' : 'dashboard-collaboration-link'}
      href={'/ai?project=' + encodeURIComponent(id)}
      aria-label="AI Studio"
      title="AI Studio · saved project context"
      onClick={(event) => {
        if (onOpen) {
          event.preventDefault();
          onOpen();
          return;
        }
        localStorage.setItem('terralab.active.v1', JSON.stringify(useStudio.getState().project));
      }}
    >
      <Sparkles size={compact ? 21 : 18} />
      {!compact && 'AI Studio'}
    </Link>
  );
}
