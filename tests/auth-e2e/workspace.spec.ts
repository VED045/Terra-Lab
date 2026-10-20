// Local Supabase Auth/PostgREST protocol fixtures: no production token or account.
import { test, expect } from '@playwright/test';
import { createTemplate } from '../../packages/shared/src/index';
const origin = 'https://fixture.supabase.invalid';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'researcher@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-10-20T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: { display_name: 'Fixture Researcher' },
};
test('session landing, offset cloud project load, explicit studio navigation and logout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const project = {
    ...createTemplate('square'),
    name: 'Cloud offset project',
    updatedAt: '2026-10-20T18:04:56.123456+05:30',
    cloudVersion: 1,
    cloudOwnerId: user.id,
  };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'fixture',
  ]
    .map((v, i) => (i === 2 ? v : Buffer.from(JSON.stringify(v)).toString('base64url')))
    .join('.');
  await page.addInitScript(
    ({ token, user }) => {
      if (!sessionStorage.getItem('fixture-initialized')) {
        localStorage.setItem(
          'sb-fixture-auth-token',
          JSON.stringify({
            access_token: token,
            refresh_token: 'fixture-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
        sessionStorage.setItem('fixture-initialized', 'yes');
      }
    },
    { token, user },
  );
  await page.route(origin + '/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/rest/v1/projects')
      return route.fulfill({
        json: [
          {
            id: project.id,
            owner_id: user.id,
            team_id: null,
            version: 1,
            config: project,
            updated_at: project.updatedAt,
            created_at: project.updatedAt,
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole('heading', { name: 'Research workspace', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Signed in as researcher@example.test · cloud sync enabled', { exact: true }),
  ).toBeVisible();
  await page.locator('.project-open').filter({ hasText: 'Cloud offset project' }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('application')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!).updatedAt),
  ).toBe('2026-10-20T12:34:56.123Z');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole('button', { name: 'Network studio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page).toHaveURL(/\/studio$/);
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
