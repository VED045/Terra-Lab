import { afterEach, describe, it, expect, vi } from 'vitest';
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ configured: true })) }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});
describe('Supabase public configuration', () => {
  it('uses the provided publishable key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-key');
    const { supabase } = await import('./persistence');
    supabase();
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_example',
    );
  });
  it('still supports existing anon-key configurations', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-key');
    const { supabase } = await import('./persistence');
    supabase();
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'legacy-key');
  });
  it('keeps local persistence available without a public key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { supabase } = await import('./persistence');
    expect(supabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
