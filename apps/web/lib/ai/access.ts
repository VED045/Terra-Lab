import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AIError } from './contracts';

export type AIIdentity = { userId: string; local: boolean; db: SupabaseClient | null };
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (
    !origin &&
    request.method === 'GET' &&
    request.headers.get('sec-fetch-site') === 'same-origin'
  )
    return;
  // Next's internal URL may use localhost even when the browser opened 127.0.0.1.
  // Use the received Host, never caller-controlled forwarded-host/proto headers.
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const protocol = process.env.NODE_ENV === 'production' ? 'https:' : url.protocol;
  if (
    !origin ||
    origin !== `${protocol}//${host}` ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new AIError('origin_denied', 'Open AI Studio from this TerraLab site and retry.', 403);
}
export function localDevelopment(request: Request): boolean {
  const host = new URL('http://' + (request.headers.get('host') || new URL(request.url).host))
    .hostname;
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.TERRALAB_AI_LOCAL_DEV === '1' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(host)
  );
}
export async function identify(request: Request): Promise<AIIdentity> {
  // A supplied but invalid JWT must never fall back to local mode.
  const authorization = request.headers.get('authorization');
  if (!authorization && localDevelopment(request))
    return { userId: 'local-development', local: true, db: null };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !authorization?.startsWith('Bearer ') || authorization.length > 8192)
    throw new AIError('sign_in', 'Sign in through your TerraLab account to use AI Studio.', 401);
  const db = createClient(url, key, {
    global: {
      headers: { Authorization: authorization },
      fetch: (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error' }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data, error } = await db.auth.getUser(authorization.slice(7));
    if (error || !data.user || !z.string().uuid().safeParse(data.user.id).success)
      throw new AIError('sign_in', 'Your session expired. Sign in again.', 401);
    return { userId: data.user.id, local: false, db };
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(
      'auth_unavailable',
      'Account verification is unavailable. Retry shortly.',
      503,
    );
  }
}
