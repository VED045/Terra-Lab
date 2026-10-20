import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type AuthState = {
  status: 'checking' | 'offline' | 'signed-in' | 'signed-out' | 'error';
  email: string | null;
};
export function cloudStatusText(state: AuthState): string {
  switch (state.status) {
    case 'checking':
      return 'Checking cloud session…';
    case 'offline':
      return 'Local workspace · saved in this browser';
    case 'signed-in':
      return state.email
        ? `Signed in as ${state.email} · cloud sync enabled`
        : 'Signed in · cloud sync enabled';
    case 'signed-out':
      return 'Cloud available · sign in to sync';
    case 'error':
      return 'Could not check cloud session · open your account to reconnect';
  }
}
// Subscribe before reading storage so a delayed initial read cannot overwrite a newer auth event.
export function observeAuthSession(
  db: SupabaseClient | null,
  update: (state: AuthState) => void,
): () => void {
  if (!db) {
    update({ status: 'offline', email: null });
    return () => {};
  }
  let active = true;
  let revision = 0;
  const apply = (session: Session | null) =>
    update({ status: session ? 'signed-in' : 'signed-out', email: session?.user.email ?? null });
  update({ status: 'checking', email: null });
  const initialRevision = revision;
  const { data } = db.auth.onAuthStateChange((_, session) => {
    if (!active) return;
    revision++;
    apply(session);
  });
  void db.auth
    .getSession()
    .then(({ data, error }) => {
      if (!active || revision !== initialRevision) return;
      if (error) update({ status: 'error', email: null });
      else apply(data.session);
    })
    .catch(() => {
      if (active && revision === initialRevision) update({ status: 'error', email: null });
    });
  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}
