// Independent browser sessions + actual migrated PostgreSQL/RLS.
// Supabase Auth/PostgREST transport is a local fixture, not hosted acceptance.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { collaborationFixture } from '../../scripts/lib/collaboration-fixture.mjs';
let fixture: Awaited<ReturnType<typeof collaborationFixture>>;
test.beforeAll(async () => {
  fixture = await collaborationFixture();
});
test.afterAll(async () => {
  await fixture?.close();
});
async function identity(browser: Browser, index: number) {
  const u = fixture.users[index],
    user = {
      ...u,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: { display_name: u.name },
    };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    'fixture',
  ]
    .map((v, i) => (i === 2 ? v : Buffer.from(JSON.stringify(v)).toString('base64url')))
    .join('.');
  const context = await browser.newContext();
  await context.addInitScript(
    ({ token, user }) => {
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
    },
    { token, user },
  );
  await context.route('https://fixture.supabase.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').pop()!;
        const result = await fixture.rpc(u.id, name, route.request().postDataJSON() || {});
        return route.fulfill({ json: result ?? null });
      }
      if (url.pathname === '/rest/v1/projects') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const rows = await fixture.sql(
          u.id,
          'select * from public.projects' + (id ? ' where id=$1' : ''),
          id ? [id] : [],
        );
        return route.fulfill({
          json: route.request().headers()['accept']?.includes('vnd.pgrst.object')
            ? rows[0] || null
            : rows,
        });
      }
      const table = url.pathname.split('/').pop()!;
      if (
        [
          'teams',
          'team_members',
          'project_members',
          'experiment_runs',
          'network_templates',
          'project_stars',
          'research_jobs',
        ].includes(table)
      )
        return route.fulfill({ json: await fixture.sql(u.id, 'select * from public.' + table) });
      return route.fulfill({ json: [] });
    } catch (error) {
      const e = error as Error & { code?: string };
      return route.fulfill({
        status: 400,
        json: { message: e.message, code: e.code || 'fixture' },
      });
    }
  });
  const page = await context.newPage();
  await page.goto('/collaboration');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText('Loading collaboration…')).toHaveCount(0);
  return { page, context, id: u.id };
}
async function section(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Collaboration sections' })
    .getByRole('button', { name: new RegExp('^' + name.replace('&', '&')) })
    .click();
}
async function refresh(page: Page) {
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
}
async function request(page: Page, role = 'viewer') {
  await section(page, 'People');
  await page.getByRole('textbox', { name: 'Exact username or email' }).fill('owner_lab');
  await page.getByRole('button', { name: 'Find peer', exact: true }).click();
  await page.getByRole('button', { name: 'Request studio access', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request studio access', exact: true });
  await dialog.getByLabel('Requested role').selectOption(role);
  await dialog.getByLabel('Message (optional)').fill('Review this research collaboration.');
  await dialog.getByRole('button', { name: 'Review request', exact: true }).click();
  await expect(dialog.getByText(/Scope: all projects explicitly assigned/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function invite(page: Page, resource: string, username: string, role = 'viewer') {
  await page.getByRole('button', { name: 'Invite people', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite people', exact: true });
  await dialog.getByLabel('Destination').selectOption(resource);
  await dialog.getByRole('textbox', { name: 'Exact username or email' }).fill(username);
  await dialog.getByRole('button', { name: 'Find peer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add peer', exact: true }).click();
  await dialog.getByLabel('Offered role').selectOption(role);
  await dialog.getByRole('button', { name: 'Review invitations', exact: true }).click();
  await expect(dialog.getByText(/Each recipient must explicitly accept/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Send invitations', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
test('three-account requests, invitations, scope, revocation, privacy and responsive keyboard workflows', async ({
  browser,
}, info) => {
  test.setTimeout(120000);
  const owner = await identity(browser, 0),
    viewer = await identity(browser, 1),
    editor = await identity(browser, 2),
    outsider = await identity(browser, 3);
  const errors: string[] = [];
  for (const session of [owner, viewer, editor, outsider])
    session.page.on('pageerror', (e) => errors.push(e.message));
  try {
    expect(
      await owner.page
        .locator('.collab-page')
        .evaluate((e) => getComputedStyle(e).getPropertyValue('--bg').trim()),
    ).not.toBe('');
    await request(viewer.page);
    await section(viewer.page, 'Requests & Invitations');
    await viewer.page.getByRole('button', { name: 'Sent requests', exact: true }).click();
    await expect(viewer.page.getByText('pending', { exact: true })).toBeVisible();
    await refresh(owner.page);
    await section(owner.page, 'Requests & Invitations');
    await owner.page.getByRole('button', { name: 'Review & accept', exact: true }).click();
    let dialog = owner.page.getByRole('dialog', { name: 'Approve access request', exact: true });
    await dialog.getByLabel('Approved role').selectOption('editor');
    await expect(dialog.getByText(/You explicitly selected editor/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm editor access', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await refresh(viewer.page);
    await viewer.page.getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(viewer.page.getByText('accepted', { exact: true })).toBeVisible();
    await section(viewer.page, 'Shared with me');
    await expect(
      viewer.page.getByRole('heading', { name: 'Assigned studio project', exact: true }),
    ).toBeVisible();
    await expect(viewer.page.getByText(/Effective role: editor/).first()).toBeVisible();
    await expect(
      viewer.page.getByRole('heading', { name: 'Confidential receiver study', exact: true }),
    ).toHaveCount(0);
    await section(outsider.page, 'Shared with me');
    await expect(outsider.page.getByText(/No matching shared resources/)).toBeVisible();
    await request(editor.page, 'editor');
    await refresh(owner.page);
    await owner.page.getByRole('button', { name: 'Received requests', exact: true }).click();
    await owner.page.getByRole('button', { name: 'Reject', exact: true }).click();
    await refresh(editor.page);
    await section(editor.page, 'Requests & Invitations');
    await editor.page.getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(editor.page.getByText('rejected', { exact: true })).toBeVisible();
    await section(editor.page, 'Shared with me');
    await expect(editor.page.getByText(/No matching shared resources/)).toBeVisible();
    await invite(owner.page, fixture.privateId, 'viewer_lab');
    await refresh(viewer.page);
    await section(viewer.page, 'Requests & Invitations');
    await viewer.page.getByRole('button', { name: 'Received invitations', exact: true }).click();
    await expect(
      viewer.page.getByRole('heading', { name: 'Confidential receiver study', exact: true }),
    ).toHaveCount(0);
    await viewer.page.getByRole('button', { name: 'Review & accept', exact: true }).click();
    dialog = viewer.page.getByRole('dialog', { name: 'Accept invitation', exact: true });
    await dialog.getByRole('button', { name: 'Confirm viewer access', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await section(viewer.page, 'Shared with me');
    const privateCard = viewer.page.locator('article').filter({
      has: viewer.page.getByRole('heading', { name: 'Confidential receiver study', exact: true }),
    });
    await expect(privateCard.getByText(/Effective role: viewer/)).toBeVisible();
    // Studio membership is independent of a project-only invitation.
    await invite(owner.page, fixture.team, 'editor_lab');
    await refresh(editor.page);
    await section(editor.page, 'Requests & Invitations');
    await editor.page.getByRole('button', { name: 'Received invitations', exact: true }).click();
    await editor.page.getByRole('button', { name: 'Review & accept', exact: true }).click();
    await editor.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm viewer access', exact: true })
      .click();
    await section(editor.page, 'Shared with me');
    await expect(
      editor.page.getByRole('heading', { name: 'Assigned studio project', exact: true }),
    ).toBeVisible();
    await expect(
      editor.page.getByRole('heading', { name: 'Confidential receiver study', exact: true }),
    ).toHaveCount(0);
    await section(owner.page, 'Manage access');
    await owner.page.getByLabel('Resource to manage').selectOption(fixture.projectId);
    await expect(owner.page.getByLabel('Assign to workspace')).toHaveValue(fixture.team);
    await owner.page.getByLabel('Resource to manage').selectOption(fixture.privateId);
    const member = owner.page
      .locator('.collab-item')
      .filter({ hasText: 'Viewer Researcher' })
      .filter({ has: owner.page.getByRole('button', { name: 'Remove access', exact: true }) });
    owner.page.once('dialog', (d) => d.accept());
    await member.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(member).toHaveCount(0);
    await refresh(viewer.page);
    await expect(
      viewer.page.getByRole('heading', { name: 'Confidential receiver study', exact: true }),
    ).toHaveCount(0);
    await section(owner.page, 'Overview');
    await owner.page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await expect(
      owner.page.getByRole('heading', { name: 'Notifications (0 unread)', exact: true }),
    ).toBeVisible();
    await owner.page.screenshot({
      path: info.outputPath('collaboration-desktop.png'),
      fullPage: true,
    });
    await viewer.page.setViewportSize({ width: 390, height: 844 });
    await section(viewer.page, 'People');
    await expect(viewer.page.getByLabel('Unique username')).toBeVisible();
    expect(
      await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await viewer.page
      .getByRole('navigation', { name: 'Collaboration sections' })
      .getByRole('button', { name: 'Overview', exact: true })
      .focus();
    await viewer.page.keyboard.press('Tab');
    await expect(
      viewer.page
        .getByRole('navigation', { name: 'Collaboration sections' })
        .getByRole('button', { name: 'People', exact: true }),
    ).toBeFocused();
    await viewer.page.keyboard.press('Enter');
    await expect(viewer.page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
    await viewer.page.screenshot({
      path: info.outputPath('collaboration-mobile.png'),
      fullPage: true,
    });
    const actual = await fixture.rpc(outsider.id, 'collaboration_state');
    expect(actual.resources).toHaveLength(0);
    expect(actual.requests).toHaveLength(0);
    expect(actual.invitations).toHaveLength(0);
    await section(viewer.page, 'Shared with me');
    const assigned = viewer.page.locator('article').filter({
      has: viewer.page.getByRole('heading', { name: 'Assigned studio project', exact: true }),
    });
    await assigned.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(viewer.page).toHaveURL(/\/studio$/);
    await expect(viewer.page.getByRole('application')).toBeVisible();
    await expect(
      viewer.page.getByRole('button', { name: 'Add transmitter (A)', exact: true }),
    ).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    for (const s of [owner, viewer, editor, outsider]) await s.context.close();
  }
});
