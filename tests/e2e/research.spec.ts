import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
const csi = JSON.parse(readFileSync(resolve('docs/examples/csi-example.result.json'), 'utf8'));
test('research workspace saves, stars, searches, duplicates and reloads structured networks', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: 'Research workspace' });
  await expect(
    workspace.getByRole('button', { name: 'Shared With Me', exact: true }),
  ).toBeVisible();
  await workspace.getByRole('button', { name: 'Save current', exact: true }).click();
  await expect(workspace.getByRole('status')).toContainText('Current project saved');
  const row = workspace
    .locator('.research-project')
    .filter({ has: page.getByRole('button', { name: /Star Outdoor research site/ }) })
    .first();
  await row.getByRole('button', { name: /Star Outdoor research site/ }).click();
  await workspace.getByRole('button', { name: 'Starred Projects', exact: true }).click();
  await expect(workspace.locator('.research-project')).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await workspace.getByRole('button', { name: 'My Projects', exact: true }).click();
  await workspace.getByRole('textbox', { name: 'Search research workspace' }).fill('copy');
  await expect(workspace.locator('.research-project')).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
});
test('bounded CSI controls render actual stored results and export portable raw data', async ({
  page,
}) => {
  await page.route('**/api/signals', (route) => route.fulfill({ json: csi }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Multiband signal laboratory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Multiband signal laboratory' });
  await dialog.getByRole('button', { name: 'Run bounded CSI example', exact: true }).click();
  await expect(dialog.getByRole('table')).toContainText('112.5000');
  await expect(dialog.getByRole('table')).toContainText('180.0000');
  await expect(
    dialog.getByRole('img', { name: 'Experimental normalized delay spectra' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog
    .getByRole('button', { name: 'Export CSI, configuration and actual results JSON' })
    .click();
  expect((await download).suggestedFilename()).toContain('123');
});
