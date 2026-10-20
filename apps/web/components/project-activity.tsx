'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/persistence';
export function ProjectActivity({ projectId, cloud }: { projectId: string; cloud: boolean }) {
  const query = useQuery({
    queryKey: ['project-activity', projectId],
    enabled: cloud,
    retry: 0,
    queryFn: async () => {
      const db = supabase();
      if (!db) throw Error('Sign in to read activity');
      const { data, error } = await db
        .from('project_activity')
        .select('id,event,actor_id,created_at,resource_id,revision')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw Error('Recorded activity unavailable. The server needs migration 006.');
      return data as {
        id: string;
        event: string;
        actor_id: string | null;
        created_at: string;
        resource_id: string;
        revision: number | null;
      }[];
    },
  });
  return (
    <details>
      <summary>Recorded collaboration activity</summary>
      <p className="small-copy">
        Server-recorded events since activity logging was installed; latest 100. This is not a live
        notification feed. Membership events include direct grants; historical team membership
        changes are not backfilled.
      </p>
      {!cloud ? (
        <p>Cloud activity requires sign-in and a saved project.</p>
      ) : query.isPending ? (
        <p>Loading activity…</p>
      ) : query.isError ? (
        <p>{query.error.message}</p>
      ) : query.data?.length ? (
        <ul>
          {query.data.map((e) => (
            <li key={e.id}>
              {e.event} · {e.actor_id ?? 'system worker'} ·{' '}
              {new Date(e.created_at).toLocaleString()} · {e.resource_id}
              {e.revision ? ' · revision ' + e.revision : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>No events recorded since logging began.</p>
      )}
    </details>
  );
}
