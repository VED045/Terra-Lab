import { describe, it, expect, vi } from 'vitest';
import type { Session, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js';
import { observeAuthSession, cloudStatusText, type AuthState } from './auth-session';

function fixture() {
  let event: (event: AuthChangeEvent, session: Session | null) => void;
  let resolve!: (value: { data: { session: Session | null }; error: Error | null }) => void;
  const initial = new Promise<{ data: { session: Session | null }; error: Error | null }>(
    (done) => {
      resolve = done;
    },
  );
  const unsubscribe = vi.fn();
  const db = {
    auth: {
      getSession: vi.fn(() => initial),
      onAuthStateChange: vi.fn(
        (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
          event = callback;
          return { data: { subscription: { unsubscribe } } };
        },
      ),
    },
  } as unknown as SupabaseClient;
  const states: AuthState[] = [];
  const stop = observeAuthSession(db, (state) => states.push(state));
  return {
    states,
    stop,
    resolve,
    unsubscribe,
    emit: (name: AuthChangeEvent, session: Session | null) => event(name, session),
  };
}
const session = { user: { email: 'researcher@example.test' } } as Session;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
describe('Cloud session status', () => {
  it('restores the existing signed-in identity instead of prompting sign-in', async () => {
    const f = fixture();
    expect(cloudStatusText(f.states[0])).toContain('Checking');
    f.resolve({ data: { session }, error: null });
    await flush();
    expect(cloudStatusText(f.states.at(-1)!)).toBe(
      'Signed in as researcher@example.test · cloud sync enabled',
    );
    f.stop();
  });
  it('reacts to sign-in, token refresh, and sign-out without reloading', () => {
    const f = fixture();
    f.emit('SIGNED_IN', session);
    expect(f.states.at(-1)?.status).toBe('signed-in');
    f.emit('TOKEN_REFRESHED', session);
    expect(f.states.at(-1)?.email).toBe('researcher@example.test');
    f.emit('SIGNED_OUT', null);
    expect(cloudStatusText(f.states.at(-1)!)).toBe('Cloud available · sign in to sync');
    f.stop();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not let a delayed stored session undo a later sign-out', async () => {
    const f = fixture();
    f.emit('SIGNED_OUT', null);
    f.resolve({ data: { session }, error: null });
    await flush();
    expect(f.states.at(-1)?.status).toBe('signed-out');
    f.stop();
  });
  it('does not let a delayed empty stored session undo a later sign-in', async () => {
    const f = fixture();
    f.emit('SIGNED_IN', session);
    f.resolve({ data: { session: null }, error: null });
    await flush();
    expect(f.states.at(-1)?.status).toBe('signed-in');
    f.stop();
  });
  it('surfaces a session read failure without claiming the user is signed out', async () => {
    const f = fixture();
    f.resolve({ data: { session: null }, error: Error('Storage unavailable') });
    await flush();
    expect(f.states.at(-1)?.status).toBe('error');
    expect(cloudStatusText(f.states.at(-1)!)).toContain('reconnect');
    f.stop();
  });
  it('ignores pending results and auth callbacks after unmount', async () => {
    const f = fixture();
    f.stop();
    const count = f.states.length;
    f.resolve({ data: { session }, error: null });
    f.emit('SIGNED_IN', session);
    await flush();
    expect(f.states).toHaveLength(count);
  });
  it('supports local-only configuration', () => {
    const update = vi.fn();
    observeAuthSession(null, update)();
    expect(update).toHaveBeenCalledWith({ status: 'offline', email: null });
  });
});
