import type { User } from '@supabase/supabase-js';
import { supabase } from './persistence';

export function displayName(user: User): string {
  for (const value of [user.user_metadata?.display_name, user.user_metadata?.full_name]) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return user.email?.split('@')[0] || 'TerraLab researcher';
}
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'TL'
  );
}
export async function getAccount(): Promise<User | null> {
  const db = supabase();
  if (!db) return null;
  const { data: session, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  return data.user;
}
export async function updateDisplayName(value: string): Promise<User> {
  const name = value.trim();
  if (!name || name.length > 80) throw Error('Display name must contain 1–80 characters.');
  const db = supabase();
  if (!db) throw Error('Cloud accounts are not configured.');
  const { data, error } = await db.auth.updateUser({ data: { display_name: name } });
  if (error) throw error;
  if (!data.user) throw Error('Sign in again to update your profile.');
  return data.user;
}

/** Auth quotas are project-wide; changing the recipient cannot bypass them. */
export function accountAuthError(reason: unknown): { message: string; emailLimited: boolean } {
  const failure =
    reason && typeof reason === 'object' ? (reason as { code?: string; message?: string }) : {};
  const emailLimited =
    failure.code === 'over_email_send_rate_limit' ||
    /email.*rate limit/i.test(failure.message ?? '');
  if (emailLimited)
    return {
      emailLimited: true,
      message:
        'The authentication email quota for this TerraLab project has been reached. It is shared across email addresses, so trying another address will not help. Wait before retrying, or ask the administrator to configure a custom SMTP sender. Sign-in to an existing account is still available.',
    };
  if (failure.code === 'email_address_not_authorized')
    return {
      emailLimited: false,
      message:
        'This project’s default email sender cannot deliver to that address. Ask the administrator to configure custom SMTP for signup emails.',
    };
  return { message: failure.message || 'Authentication failed.', emailLimited: false };
}
