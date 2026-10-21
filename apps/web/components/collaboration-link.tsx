'use client';
import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import { useStudio } from '@/lib/store';
export function CollaborationLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={compact ? 'rail-collaboration-link' : 'dashboard-collaboration-link'}
      href="/collaboration"
      aria-label="Collaboration"
      title="Collaboration"
      onClick={() => {
        localStorage.setItem('terralab.active.v1', JSON.stringify(useStudio.getState().project));
      }}
    >
      <UsersRound size={compact ? 21 : 18} />
      {!compact && 'Collaboration'}
    </Link>
  );
}
