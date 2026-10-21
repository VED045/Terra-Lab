import { test, expect } from '@playwright/test';
import { createTemplate } from '../../packages/shared/src/index';
const origin = 'https://fixture.supabase.invalid';
for (const role of ['owner', 'editor', 'viewer'] as const)
  test('3D cloud ' + role + ' preserves access rules and stale-save recovery', async ({ page }) => {
    test.setTimeout(60000);
    const uid = '10000000-0000-4000-8000-000000000001',
      other = '10000000-0000-4000-8000-000000000002';
    const user = {
      id: uid,
      email: 'fixture@example.test',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: '2026-10-20T00:00:00Z',
      app_metadata: { provider: 'email' },
      user_metadata: {},
    };
    const p = {
      ...createTemplate('square'),
      name: 'Shared ' + role + ' network',
      cloudVersion: 2,
      cloudOwnerId: role === 'owner' ? uid : other,
    };
    const token = [
      { alg: 'HS256', typ: 'JWT' },
      {
        sub: uid,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'fixture',
    ]
      .map((v, i) => (i === 2 ? v : Buffer.from(JSON.stringify(v)).toString('base64url')))
      .join('.');
    await page.addInitScript(
      ({ user, token }) =>
        localStorage.setItem(
          'sb-fixture-auth-token',
          JSON.stringify({
            user,
            access_token: token,
            refresh_token: 'fixture',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
          }),
        ),
      { user, token },
    );
    let writes = 0;
    await page.route(origin + '/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/auth/v1/user') return route.fulfill({ json: user });
      if (
        path === '/rest/v1/projects' &&
        route.request().headers()['accept']?.includes('application/vnd.pgrst.object+json')
      )
        return route.fulfill({ json: { config: { ...p, cloudVersion: 3, name: 'Remote title' } } });
      if (path === '/rest/v1/projects')
        return route.fulfill({
          json: [
            {
              id: p.id,
              owner_id: p.cloudOwnerId,
              team_id: null,
              version: 2,
              config: p,
              updated_at: p.updatedAt,
              created_at: p.updatedAt,
            },
          ],
        });
      if (path === '/rest/v1/project_members')
        return route.fulfill({
          json: role === 'owner' ? [] : [{ project_id: p.id, user_id: uid, role }],
        });
      if (path === '/rest/v1/rpc/save_research_project') {
        writes++;
        const body = route.request().postDataJSON();
        if (role !== 'viewer' && body.p_expected === 3)
          return route.fulfill({
            json: { ...body.p_config, cloudVersion: 4, cloudOwnerId: p.cloudOwnerId },
          });
        return route.fulfill({
          status: role === 'viewer' ? 403 : 409,
          json: {
            code: role === 'viewer' ? '42501' : 'PT409',
            message: role === 'viewer' ? 'Edit denied' : 'VERSION_CONFLICT: reload or save a copy',
          },
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/projects');
    if (role !== 'owner')
      await page.getByRole('button', { name: 'Shared With Me', exact: true }).click();
    await page.locator('.project-open').filter({ hasText: p.name }).click();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'TX-01', exact: true }).first().click();
    const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
    if (role === 'viewer') {
      await expect(x).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Duplicate selected', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeDisabled();
      await page.keyboard.press('Delete');
      const snapshot = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('terralab.active.v1')!),
      );
      expect(snapshot.objects).toHaveLength(p.objects.length);
      expect(writes).toBe(0);
      // Both renderers retain server-side authorization; 2D keeps its historical local-draft editing behavior.
      await page.getByRole('button', { name: '2D', exact: true }).click();
      await page.getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Edit denied');
      expect(writes).toBe(1);
    } else {
      await expect(x).toBeEnabled();
      await x.fill('42');
      await x.press('Enter');
      await page.getByRole('button', { name: 'Save project', exact: true }).click();
      const conflict = page.getByRole('dialog', { name: 'Resolve revision conflict', exact: true });
      await expect(conflict).toBeVisible();
      await conflict
        .getByRole('button', { name: 'Compare with latest revision', exact: true })
        .click();
      await expect(conflict).toContainText('latest 3');
      await expect(
        conflict.getByRole('checkbox', { name: 'Reapply TX-01', exact: true }),
      ).toBeVisible();
      await conflict.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('VERSION_CONFLICT');
      await expect(x).toHaveValue('42');
      expect(writes).toBe(1);
      const failedWrites = writes;
      await x.fill('43');
      await x.press('Enter');
      await page.waitForTimeout(3500);
      expect(writes).toBe(failedWrites);
      await x.fill('42');
      await x.press('Enter');
      expect(
        (await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!)))
          .cloudVersion,
      ).toBe(2);
      await page.getByRole('button', { name: 'Save project', exact: true }).click();
      await conflict
        .getByRole('button', { name: 'Compare with latest revision', exact: true })
        .click();
      expect(writes).toBe(failedWrites);
      await conflict.getByRole('checkbox', { name: 'Reapply TX-01', exact: true }).check();
      await conflict
        .getByRole('button', { name: 'Save selected changes against latest revision', exact: true })
        .click();
      await expect(conflict).not.toBeVisible();
      const recovered = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('terralab.active.v1')!),
      );
      expect(recovered.cloudVersion).toBe(4);
      expect(recovered.name).toBe('Remote title');
      expect(recovered.objects.find((o: { id: string }) => o.id === 'tx-1').x).toBe(42);
      expect(
        await page.evaluate(() => localStorage.getItem('terralab.conflict-recovery.v1')),
      ).not.toBeNull();
    }
  });
