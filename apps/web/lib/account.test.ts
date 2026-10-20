import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
const { client } = vi.hoisted(() => ({
  client: { auth: { getSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn() } },
}));
vi.mock('./persistence', () => ({ supabase: () => client }));
import { displayName, initials, getAccount, updateDisplayName } from './account';
const user = {
  id: 'test-user',
  email: 'researcher@example.test',
  user_metadata: { display_name: 'Terra Researcher' },
  app_metadata: { provider: 'email' },
  aud: 'authenticated',
  created_at: '2026-10-20T00:00:00.000Z',
} satisfies User;
beforeEach(() => vi.clearAllMocks());
describe('Researcher profile', () => {
  it('shows a chosen display name, falling back to the email when absent', () => {
    expect(displayName(user)).toBe('Terra Researcher');
    expect(initials(displayName(user))).toBe('TR');
    expect(displayName({ ...user, user_metadata: {} })).toBe('researcher');
    expect(displayName({ ...user, user_metadata: { full_name: 'Another Researcher' } })).toBe(
      'Another Researcher',
    );
  });
  it('uses server-verified user details for an authenticated profile', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    client.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await getAccount()).toEqual(user);
    expect(client.auth.getUser).toHaveBeenCalledOnce();
  });
  it('shows signed-out state without making an invalid user request', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getAccount()).toBeNull();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it('updates only display-name metadata after validation', async () => {
    client.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    expect(await updateDisplayName('  New Name  ')).toEqual(user);
    expect(client.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'New Name' } });
  });
  it('rejects empty or excessively long names before contacting Auth', async () => {
    await expect(updateDisplayName('   ')).rejects.toThrow('1–80');
    await expect(updateDisplayName('A'.repeat(81))).rejects.toThrow('1–80');
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('surfaces Auth failures without claiming profile update success', async () => {
    client.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: Error('Session expired'),
    });
    await expect(updateDisplayName('Valid name')).rejects.toThrow('Session expired');
  });
});
