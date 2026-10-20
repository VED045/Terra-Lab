import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { workspaceThemes } from '../../packages/shared/src/themes';

test('all workspace palettes apply to the canvas and dialogs and survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspace settings' });
  for (const theme of workspaceThemes) {
    await dialog.getByRole('button', { name: `Use ${theme.name} theme`, exact: true }).click();
    await expect(page.locator('main')).toHaveClass(new RegExp(`theme-${theme.id}\\b`));
    await expect(dialog).toHaveClass(new RegExp(`theme-${theme.id}\\b`));
    await expect(dialog.getByRole('combobox', { name: 'Workspace theme' })).toHaveValue(theme.id);
  }
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('main')).toHaveClass(/theme-sand\b/);
});
test('workspace settings open from the command bar on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Workspace settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Workspace theme' }).selectOption('light');
  await expect(page.locator('main')).toHaveClass(/theme-light/);
  await dialog.getByRole('spinbutton', { name: 'Duration', exact: true }).fill('90');
  await dialog.getByRole('spinbutton', { name: 'Duration', exact: true }).press('Enter');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Open simulation settings', exact: true }).click();
  await expect(
    page.locator('.inspector').getByRole('spinbutton', { name: 'Duration', exact: true }),
  ).toHaveValue('90');
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toBeVisible();
});
test('dragging preserves world coordinates and multi-selection can be duplicated', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/');
  const rx = page.getByRole('button', { name: 'Rover 01, receiver', exact: true });
  const b = await rx.boundingBox();
  expect(b).not.toBeNull();
  const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
  const before = Number(await x.inputValue());
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 30);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2 + 55, b!.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect(x).not.toHaveValue(String(before));
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(x).toHaveValue(String(before));
  await page.keyboard.down('Shift');
  await page.getByRole('button', { name: 'TX-01, anchor', exact: true }).click();
  await page.keyboard.up('Shift');
  await expect(page.getByText('2 OBJECTS SELECTED')).toBeVisible();
  await page.keyboard.press('Control+d');
  await expect(page.getByText('2 OBJECTS SELECTED')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rover 01 copy, receiver', exact: true }),
  ).toBeVisible();
});
test('autosaves during playback and preserves the editable configuration', async ({ page }) => {
  await page.goto('/');
  const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
  await x.fill('51');
  await x.press('Enter');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('terralab.projects.v1') ?? '[]').some(
            (p: { objects: { kind: string; x: number }[] }) =>
              p.objects.some((o) => o.kind === 'receiver' && o.x === 51),
          ),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
});
test('project library supports rename, duplicate, archive and delete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: 'Research workspace' });
  const original = workspace
    .locator('.research-project')
    .filter({ has: page.getByRole('button', { name: 'Star Outdoor research site', exact: true }) });
  await original.getByRole('button', { name: 'Details', exact: true }).click();
  page.once('dialog', (d) => d.accept('Test field network'));
  await workspace.getByRole('button', { name: 'Rename', exact: true }).click();
  const renamed = workspace
    .locator('.research-project')
    .filter({ has: page.getByRole('button', { name: 'Star Test field network', exact: true }) });
  await expect(renamed).toHaveCount(1);
  await renamed.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const copy = workspace
    .locator('.research-project')
    .filter({
      has: page.getByRole('button', { name: 'Star Test field network copy', exact: true }),
    });
  await expect(copy).toHaveCount(1);
  await copy.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(copy).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Archived Projects', exact: true }).click();
  await expect(copy.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  await copy.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(copy).toHaveCount(0);
  await workspace.getByRole('button', { name: 'My Projects', exact: true }).click();
  await expect(copy).toHaveCount(1);
  page.once('dialog', (d) => d.accept());
  await copy.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(copy).toHaveCount(0);
});
test('mobile workspace fits the viewport and opens a usable inspector', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Terrestrial network 2D' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'X position', exact: true }).fill('55');
  await page.getByRole('spinbutton', { name: 'X position', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await page.screenshot({
    path: join(
      process.env.TERRALAB_ARTIFACT_DIR ?? 'test-results/screenshots',
      'terralab-mobile.png',
    ),
    fullPage: true,
  });
});
test('light theme and project library have a reviewed layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cycle workspace theme', exact: true }).click();
  await page.getByRole('button', { name: 'Fit network (F)', exact: true }).click();
  await page.screenshot({
    path: join(
      process.env.TERRALAB_ARTIFACT_DIR ?? 'test-results/screenshots',
      'terralab-light.png',
    ),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await page.screenshot({
    path: join(
      process.env.TERRALAB_ARTIFACT_DIR ?? 'test-results/screenshots',
      'terralab-projects.png',
    ),
    fullPage: true,
  });
});
