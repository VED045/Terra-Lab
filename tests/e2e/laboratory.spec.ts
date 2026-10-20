import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
const result = JSON.parse(
  readFileSync(resolve('docs/examples/timing-benchmark.result.json'), 'utf8'),
);
test('opens laboratory controls, filters compatibility and retains numeric settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Scientific laboratory' });
  await dialog.getByRole('combobox', { name: 'Laboratory measurement model' }).selectOption('aoa');
  await expect(
    dialog.getByRole('checkbox', { name: 'Linear LS · incompatible', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Monte Carlo trials', exact: true }).fill('5');
  await dialog.getByRole('spinbutton', { name: 'Monte Carlo trials', exact: true }).press('Enter');
  await expect(
    dialog.getByRole('slider', { name: 'Monte Carlo trials slider', exact: true }),
  ).toHaveValue('5');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Laboratory measurement model' })).toHaveValue(
    'aoa',
  );
  await expect(
    dialog.getByRole('spinbutton', { name: 'Monte Carlo trials', exact: true }),
  ).toHaveValue('5');
});
test('renders actual saved output, exports it and previews scientific layers', async ({ page }) => {
  await page.route('**/api/laboratory**', (route) =>
    route.fulfill({
      json: route.request().method() === 'POST' ? { id: result.id } : result,
      status: route.request().method() === 'POST' ? 202 : 200,
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Scientific laboratory' });
  await dialog.getByRole('button', { name: 'Run reproducible experiment', exact: true }).click();
  await expect(dialog.getByText('Snapshot saved locally.', { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await expect(dialog.getByRole('table')).toContainText('Weighted nonlinear LS');
  await expect(dialog.getByRole('img', { name: /Empirical CDF/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export complete JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toContain(result.id);
  await dialog.getByRole('button', { name: 'Restore snapshot network', exact: true }).click();
  await dialog.getByRole('button', { name: 'Preview on studio canvas', exact: true }).click();
  await expect(page.locator('.laboratory-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Clear lab overlay', exact: true }).click();
  await expect(page.locator('.laboratory-overlay')).not.toBeVisible();
});
