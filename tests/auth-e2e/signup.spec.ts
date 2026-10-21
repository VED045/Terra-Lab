import { test, expect } from '@playwright/test';
const origin = 'https://fixture.supabase.invalid';
test('email rate limit pauses signup across addresses and reloads without blocking sign-in', async ({
  page,
}) => {
  let attempts = 0;
  await page.route(origin + '/**', (route) => {
    if (new URL(route.request().url()).pathname === '/auth/v1/signup') {
      attempts++;
      return route.fulfill({
        status: 429,
        json: { code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Account & cloud sync', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your TerraLab account', exact: true });
  await dialog.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('first@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('Fixture-password-123!');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByRole('alert')).toContainText('shared across email addresses');
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill('another@example.test');
  await expect(dialog.getByRole('button', { name: /Retry signup in/ })).toBeDisabled();
  expect(attempts).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Account & cloud sync', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await expect(dialog.getByRole('button', { name: /Retry signup in/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
  expect(attempts).toBe(1);
});

test('auto-confirmed signup reports a signed-in session and allows cloud workspace navigation', async ({
  page,
}) => {
  const user = {
    id: '10000000-0000-4000-8000-000000000017',
    email: 'new@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: {},
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
    .map((x, i) => (i === 2 ? x : Buffer.from(JSON.stringify(x)).toString('base64url')))
    .join('.');
  let attempts = 0;
  await page.route(origin + '/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/signup') {
      attempts++;
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: 'fixture-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        },
      });
    }
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    return route.fulfill({ json: [] });
  });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Account & cloud sync', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your TerraLab account', exact: true });
  await dialog.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await dialog.getByLabel('Password', { exact: true }).fill('Fixture-password-123!');
  await dialog.locator('button[type="submit"]').click();
  await expect(
    page.getByRole('dialog', { name: 'Your researcher profile', exact: true }).getByRole('status'),
  ).toHaveText('Account created. You are signed in.');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByText('Signed in as new@example.test · cloud sync enabled', { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(1);
});
