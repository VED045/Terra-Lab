import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
async function boot(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Terrestrial network 2D' })).toBeVisible();
  await expect(page.getByTestId('position-error')).toBeVisible();
}
test('renders a working solver and measurement table without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Baseline solution validated');
  await page.getByRole('button', { name: 'Measurements', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('TX-01');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(7);
  await page
    .locator('.simulation-tabs')
    .getByRole('button', { name: 'Simulation', exact: true })
    .click();
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse simulation panel', exact: true }).click();
  await page.getByRole('button', { name: 'Expand simulation panel', exact: true }).click();
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  await expect(page.getByTestId('simulation-time')).not.toContainText('00:00.0 /');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  expect(errors).toEqual([]);
});
test('adds an object, edits coordinates, undoes, redoes, saves and reloads', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add transmitter (A)', exact: true }).click();
  const canvas = page.getByRole('application');
  await canvas.click({ position: { x: 360, y: 230 } });
  const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
  await x.fill('75');
  await x.press('Enter');
  await expect(x).toHaveValue('75');
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(x).not.toHaveValue('75');
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  await expect(x).toHaveValue('75');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.reload();
  await expect(page.getByRole('button', { name: 'TX-07, anchor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'TX-07, anchor', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toHaveValue('75');
});
test('waypoint mobility plays, pauses, steps, scrubs and stops', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await page.getByRole('button', { name: /A receiver in motion/ }).click();
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect(page.getByTestId('simulation-time')).not.toContainText('00:00.0 /');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const t = await page.getByTestId('simulation-time').textContent();
  await page.getByRole('button', { name: 'Single simulation step', exact: true }).click();
  await expect(page.getByTestId('simulation-time')).not.toHaveText(t!);
  await page.getByRole('slider', { name: 'Simulation timeline' }).fill('20');
  await expect(page.getByTestId('simulation-time')).toContainText('00:20.0');
  await page.getByRole('button', { name: 'Stop simulation', exact: true }).click();
  await expect(page.getByTestId('simulation-time')).toContainText('00:00.0');
});
test('draws polygons and paths and supports object context actions', async ({ page }) => {
  await boot(page);
  const canvas = page.getByRole('application');
  await page.getByRole('button', { name: 'Draw polygon · Enter to finish' }).click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await canvas.click({ position: { x: 360, y: 240 } });
  await canvas.click({ position: { x: 290, y: 280 } });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Custom polygon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Draw trajectory · Enter to finish' }).click();
  await canvas.click({ position: { x: 420, y: 200 } });
  await canvas.click({ position: { x: 460, y: 280 } });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Survey route', exact: true })).toBeVisible();
  await page.keyboard.press('Control+d');
  await expect(page.getByRole('heading', { name: 'Survey route copy', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('heading', { name: 'Survey route copy', exact: true })).toHaveCount(
    0,
  );
});
test('degenerate layouts produce an explicit no-fix state', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await page.getByRole('button', { name: /Geometry matters/ }).click();
  await expect(page.getByText(/Degenerate geometry: anchors/)).toBeVisible();
  await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Degenerate');
});
test('Python backend accepts actual editor ranges through the Next route', async ({ page }) => {
  await boot(page);
  await page.locator('.inspector').getByRole('button', { name: 'Simulation', exact: true }).click();
  await page.getByRole('combobox', { name: 'Solver engine' }).selectOption('python');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/solve') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText('Last run verified · Python SVD')).toBeVisible();
});
test('themes and local account setup are usable', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Toggle light / dark theme', exact: true }).click();
  await expect(page.locator('main')).toHaveClass(/theme-light/);
  await page.getByRole('button', { name: 'Account & cloud sync', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Your TerraLab account' });
  await expect(account).toBeVisible();
  if (await account.getByText('Cloud sync needs configuration').isVisible()) {
    await expect(account.getByText('Cloud sync needs configuration')).toBeVisible();
  } else {
    await expect(account.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Terrestrial network 2D' })).toBeVisible();
});
test('Python response coordinates are rendered in the canvas and inspector', async ({ page }) => {
  await boot(page);
  await page.locator('.inspector').getByRole('button', { name: 'Simulation', exact: true }).click();
  await page.getByRole('combobox', { name: 'Solver engine' }).selectOption('python');
  await page.route('**/api/solve', (route) =>
    route.fulfill({
      json: {
        position: { x: 50, y: 40 },
        condition: 2,
        rank: 2,
        residuals: [1, 1, 1, 1, 1, 1],
        rms: 1,
      },
    }),
  );
  await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
  await expect(page.getByTestId('position-error')).toContainText('5.385');
  await expect(page.locator('.estimate title')).toContainText('Estimate (50.000, 40.000)');
});
test('captures the actual workspace for visual review', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await boot(page);
  await page.getByRole('button', { name: 'Fit network (F)', exact: true }).click();
  await expect(page.locator('.js-plotly-plot')).toBeVisible();
  await page.screenshot({
    path: join(
      process.env.TERRALAB_ARTIFACT_DIR ?? 'test-results/screenshots',
      'terralab-desktop.png',
    ),
    fullPage: true,
  });
});
