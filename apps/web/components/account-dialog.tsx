'use client';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { Check, LogOut, Mail, ShieldCheck, FolderOpen, UserRound } from 'lucide-react';
import { supabase, listProjects } from '@/lib/persistence';
import {
  getAccount,
  displayName,
  initials,
  updateDisplayName,
  accountAuthError,
} from '@/lib/account';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

export function AccountDialog({
  open,
  onOpenChange,
  onSession,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSession: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState('');
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const submitting = useRef(false);
  const [signupRetryAt, setSignupRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  useEffect(() => {
    try {
      setSignupRetryAt(Number(sessionStorage.getItem('terralab.signup-retry-at')) || 0);
    } catch {
      /* Optional client cooldown. */
    }
  }, []);
  useEffect(() => {
    if (!signupRetryAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((signupRetryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (!remaining) setSignupRetryAt(0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [signupRetryAt]);
  const db = supabase();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: open && Boolean(user),
  });
  useEffect(() => {
    if (!open || !db) return;
    let alive = true;
    setLoading(true);
    setError('');
    setMessage('');
    void getAccount()
      .then((value) => {
        if (alive) setUser(value);
      })
      .catch((reason) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Could not load your account.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const { data } = db.auth.onAuthStateChange((_, session) => {
      if (alive) setUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [open, db]);
  useEffect(() => {
    setName(user ? displayName(user) : '');
  }, [user]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!db || submitting.current || (mode === 'register' && Date.now() < signupRetryAt)) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const { data, error } =
        mode === 'login'
          ? await db.auth.signInWithPassword({ email, password })
          : await db.auth.signUp({ email, password });
      if (error) throw error;
      setPassword('');
      setUser(await getAccount());
      setMessage(
        mode === 'register'
          ? data.session
            ? 'Account created. You are signed in.'
            : 'Signup submitted. If confirmation is required for this address, check your email before signing in.'
          : 'Signed in. Your profile and cloud projects are ready.',
      );
      onSession();
    } catch (reason) {
      const failure = accountAuthError(reason);
      setError(failure.message);
      if (mode === 'register' && failure.emailLimited) {
        // A minimum pause prevents repeated email attempts; it is not the server's quota reset time.
        const retryAt = Date.now() + 60000;
        setSignupRetryAt(retryAt);
        try {
          sessionStorage.setItem('terralab.signup-retry-at', String(retryAt));
        } catch {
          /* In-memory pause still applies. */
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setUser(await updateDisplayName(name));
      setMessage('Profile updated.');
      onSession();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Profile update failed.');
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!db) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await db.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setUser(null);
      setMessage('Signed out on this device. Local projects remain available.');
      onSession();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string | undefined) =>
    value
      ? new Date(value).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? 'Your researcher profile' : 'Your TerraLab account'}
      description={
        user
          ? 'Manage your identity and personal research workspace.'
          : 'Sign in to keep personal research projects in your Supabase workspace.'
      }
    >
      {!db ? (
        <div className="setup-note">
          <h3>Cloud sync needs configuration</h3>
          <p>
            Add the Supabase URL and publishable key to <code>apps/web/.env.local</code> and restart
            Next.js. Local saving works without an account.
          </p>
        </div>
      ) : loading ? (
        <p className="small-copy" role="status">
          Loading your profile…
        </p>
      ) : user ? (
        <>
          <div className="profile-card">
            <div className="profile-avatar">{initials(displayName(user))}</div>
            <div>
              <span className="eyebrow">RESEARCHER</span>
              <h2>{displayName(user)}</h2>
              <p>
                <Mail size={13} />
                {user.email ?? 'Email not provided'}
              </p>
            </div>
          </div>
          <div className={`profile-verification ${user.email_confirmed_at ? 'good' : 'warning'}`}>
            <ShieldCheck size={15} />
            {user.email_confirmed_at ? 'Email verified' : 'Email confirmation pending'}
          </div>
          <form onSubmit={saveProfile} className="profile-form">
            <label className="text-field">
              Display name
              <input
                aria-label="Display name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                autoComplete="nickname"
              />
            </label>
            <Button type="submit" disabled={busy || name.trim() === displayName(user)}>
              <Check size={14} />
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
          <div className="profile-details">
            <span>
              <UserRound size={14} />
              Joined<b>{date(user.created_at)}</b>
            </span>
            <span>
              <ShieldCheck size={14} />
              Last sign-in<b>{date(user.last_sign_in_at)}</b>
            </span>
            <span>
              <FolderOpen size={14} />
              Cloud projects
              <b>
                {projects.isPending
                  ? 'Loading…'
                  : projects.isError
                    ? 'Unavailable'
                    : (projects.data?.length ?? 0)}
              </b>
            </span>
          </div>
          {projects.isError && (
            <p className="error-message">Could not load cloud projects: {projects.error.message}</p>
          )}
          <div className="profile-user-id">
            <span className="eyebrow">ACCOUNT ID</span>
            <code>{user.id}</code>
          </div>
          <p className="small-copy">
            Projects belong to your account. Sharing exported files does not make your cloud library
            public.
          </p>
          <Button onClick={() => void signOut()} disabled={busy}>
            <LogOut size={14} />
            Sign out
          </Button>
        </>
      ) : (
        <>
          <div className="account-modes">
            <button
              disabled={busy}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <button
              disabled={busy}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
          <form onSubmit={signIn} className="account-form">
            <label className="text-field">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="text-field">
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            <Button
              variant="default"
              type="submit"
              disabled={busy || (mode === 'register' && retrySeconds > 0)}
            >
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : retrySeconds > 0
                    ? `Retry signup in ${retrySeconds}s`
                    : 'Create account'}
            </Button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
    </Dialog>
  );
}
