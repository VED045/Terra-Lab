import { join } from 'node:path';
import { test, expect } from '@playwright/test';
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
  page.once('dialog', (d) => d.accept('Test field network'));
  await page.getByRole('button', { name: 'Rename Outdoor research site' }).click();
  await expect(
    page.getByRole('button', { name: /Test field network.*transmitters/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate Test field network' }).click();
  await expect(
    page.getByRole('button', { name: 'Archive Test field network copy', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Archive Test field network copy', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unarchive Test field network copy', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show archived' }).check();
  await expect(
    page.getByRole('button', { name: 'Unarchive Test field network copy', exact: true }),
  ).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Test field network copy', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unarchive Test field network copy', exact: true }),
  ).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Toggle light / dark theme', exact: true }).click();
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
