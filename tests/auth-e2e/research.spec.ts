// Actual local PostgreSQL/RLS with simulated Supabase Auth/PostgREST; never hosted users.
import { test, expect, type Browser } from '@playwright/test';
import { collaborationFixture } from '../../scripts/lib/collaboration-fixture.mjs';
let fixture: Awaited<ReturnType<typeof collaborationFixture>>;
test.beforeAll(async () => {
  fixture = await collaborationFixture();
});
test.afterAll(async () => fixture.close());
async function account(browser: Browser, index: number) {
  const u = fixture.users[index],
    user = {
      ...u,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: {},
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
    ({ user, token }) =>
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
      ),
    { user, token },
  );
  await context.route('https://fixture.supabase.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/'))
        return route.fulfill({
          json:
            (await fixture.rpc(
              u.id,
              url.pathname.split('/').pop()!,
              route.request().postDataJSON() || {},
            )) ?? null,
        });
      const table = url.pathname.split('/').pop()!;
      if (
        ![
          'projects',
          'teams',
          'team_members',
          'project_members',
          'experiment_runs',
          'network_templates',
          'project_stars',
          'research_jobs',
          'research_document_members',
          'research_document_revisions',
          'research_documents',
        ].includes(table)
      )
        return route.fulfill({ json: [] });
      const filters: string[] = [],
        args: string[] = [];
      for (const key of ['id', 'document_id', 'project_id']) {
        const value = url.searchParams.get(key);
        if (value?.startsWith('eq.')) {
          args.push(value.slice(3));
          filters.push(key + '=$' + args.length);
        }
      }
      const rows = await fixture.sql(
        u.id,
        'select * from public.' + table + (filters.length ? ' where ' + filters.join(' and ') : ''),
        args,
      );
      return route.fulfill({
        json: route.request().headers().accept?.includes('vnd.pgrst.object')
          ? (rows[0] ?? null)
          : rows,
      });
    } catch (error) {
      const e = error as Error & { code: string };
      return route.fulfill({
        status: e.code === 'PT409' ? 409 : 400,
        json: { message: e.message, code: e.code },
      });
    }
  });
  const page = await context.newPage();
  return { page, context, id: u.id };
}
test('cloud manuscripts are private, explicitly shared, read-only for viewers and revoked without changing project grants', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const [owner, viewer, editor, outsider] = await Promise.all(
    [0, 1, 2, 3].map((i) => account(browser, i)),
  );
  await fixture.rpc(owner.id, 'manage_project_member', {
    p_id: fixture.projectId,
    p_user: viewer.id,
    p_role: 'viewer',
  });
  await fixture.rpc(owner.id, 'manage_project_member', {
    p_id: fixture.projectId,
    p_user: editor.id,
    p_role: 'editor',
  });
  await owner.page.goto('/research?project=' + fixture.projectId);
  await owner.page.getByRole('button', { name: 'Blank document', exact: true }).click();
  await expect(owner.page.getByLabel('LaTeX source', { exact: true })).toBeVisible();
  await viewer.page.goto('/research?project=' + fixture.projectId);
  await expect(
    viewer.page.getByRole('button', { name: 'Open document Untitled document', exact: true }),
  ).toHaveCount(0);
  await owner.page.getByText('Document sharing · versioned collaboration', { exact: true }).click();
  await owner.page.getByLabel('Document collaborator', { exact: true }).selectOption(viewer.id);
  await owner.page.getByRole('button', { name: 'Share document', exact: true }).click();
  await expect(owner.page.getByRole('status')).toContainText('Document access updated');
  await viewer.page.getByRole('button', { name: 'Refresh library', exact: true }).click();
  await viewer.page
    .getByRole('button', { name: 'Open document Untitled document', exact: true })
    .click();
  await expect(viewer.page.getByLabel('LaTeX source', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await expect(
    viewer.page.getByRole('button', { name: 'Save revision', exact: true }),
  ).toBeDisabled();
  await owner.page.getByLabel('Document collaborator', { exact: true }).selectOption(editor.id);
  await owner.page.getByLabel('Document grant role', { exact: true }).selectOption('editor');
  await owner.page.getByRole('button', { name: 'Share document', exact: true }).click();
  await expect(owner.page.getByRole('status')).toContainText('Document access updated');
  await editor.page.goto('/research?project=' + fixture.projectId);
  await editor.page
    .getByRole('button', { name: 'Open document Untitled document', exact: true })
    .click();
  await editor.page
    .getByLabel('LaTeX source', { exact: true })
    .fill('Authorized editor revision $x^2$');
  await editor.page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(editor.page.getByRole('status')).toContainText('Saved revision 2');
  await owner.page.getByRole('button', { name: 'Check latest revision', exact: true }).click();
  await expect(owner.page.getByLabel('LaTeX source', { exact: true })).toHaveValue(
    'Authorized editor revision $x^2$',
  );
  if (
    !(await owner.page
      .getByRole('button', { name: 'Refresh document access', exact: true })
      .isVisible())
  )
    await owner.page
      .getByText('Document sharing · versioned collaboration', { exact: true })
      .click();
  await owner.page.getByRole('button', { name: 'Refresh document access', exact: true }).click();
  owner.page.once('dialog', (d) => d.accept());
  await owner.page
    .locator('p')
    .filter({ hasText: 'Viewer Researcher · viewer' })
    .getByRole('button', { name: 'Revoke document access', exact: true })
    .click();
  await viewer.page.getByRole('button', { name: 'Refresh library', exact: true }).click();
  await expect(
    viewer.page.getByRole('button', { name: 'Open document Untitled document', exact: true }),
  ).toHaveCount(0);
  await expect(viewer.page.getByLabel('LaTeX source', { exact: true })).toHaveCount(0);
  await outsider.page.goto('/research?project=' + fixture.projectId);
  await expect(
    outsider.page.getByRole('button', { name: 'Open document Untitled document', exact: true }),
  ).toHaveCount(0);
  expect(
    (await fixture.sql(viewer.id, 'select * from public.projects where id=$1', [fixture.projectId]))
      .length,
  ).toBe(1);
  await Promise.all([owner, viewer, editor, outsider].map((a) => a.context.close()));
});
