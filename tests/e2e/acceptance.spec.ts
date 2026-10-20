import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// Compile the PDF route before opening a client page so development HMR does
// not interrupt the export workflow when this route is first visited.
test.beforeAll(async ({ request }) => {
  const invalidReport = await request.post('/api/reports', { data: {} });
  expect(invalidReport.status()).toBe(422);
});

async function downloadBytes(page: Page, click: () => Promise<void>) {
  const pending = page.waitForEvent('download');
  await click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  if (process.env.TERRALAB_ARTIFACT_DIR) {
    await mkdir(process.env.TERRALAB_ARTIFACT_DIR, { recursive: true });
    await download.saveAs(join(process.env.TERRALAB_ARTIFACT_DIR, download.suggestedFilename()));
  }
  return readFile(path!);
}

test('real browser to Next to Python run persists and exports scientific data and figures', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const lab = page.getByRole('dialog', { name: 'Scientific laboratory', exact: true });
  await lab.getByRole('combobox', { name: 'Experiment parameter sweep' }).selectOption('none');
  await lab.getByRole('spinbutton', { name: 'Monte Carlo trials', exact: true }).fill('1');
  await lab.getByRole('spinbutton', { name: 'Monte Carlo trials', exact: true }).press('Enter');
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith('/api/laboratory') && r.request().method() === 'POST',
  );
  await lab.getByRole('button', { name: 'Run reproducible experiment', exact: true }).click();
  expect((await submitted).status()).toBe(202);
  await expect(lab.getByRole('status')).toContainText('Snapshot saved locally.');
  const original = JSON.parse(
    (
      await downloadBytes(page, () =>
        lab.getByRole('button', { name: 'Export complete JSON', exact: true }).click(),
      )
    ).toString(),
  );
  expect(original.status).toBe('completed');
  expect(original.records).toHaveLength(original.planned);
  expect(original.completed).toBe(original.planned);
  expect(original.records.length).toBeGreaterThan(0);
  expect(
    original.summaries.reduce((n: number, s: { attempted: number }) => n + s.attempted, 0),
  ).toBe(original.completed);
  await lab.getByRole('button', { name: 'Publication exports', exact: true }).click();
  const publication = page.getByRole('dialog', { name: 'Publication exports', exact: true });
  const svg = await downloadBytes(page, () =>
    publication.getByRole('button', { name: 'Export SVG', exact: true }).click(),
  );
  expect(svg.toString()).toContain('<svg');
  expect(svg.toString()).toContain('Conditional on fixes');
  const png = await downloadBytes(page, () =>
    publication.getByRole('button', { name: 'Export PNG', exact: true }).click(),
  );
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBeGreaterThan(0);
  const pdf = await downloadBytes(page, () =>
    publication.getByRole('button', { name: 'Export PDF', exact: true }).click(),
  );
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10000);
  const csv = await downloadBytes(page, () =>
    publication.getByRole('button', { name: 'Export CSV', exact: true }).click(),
  );
  expect(csv.toString()).toContain('error_m');
  const manifest = JSON.parse(
    (
      await downloadBytes(page, () =>
        publication.getByRole('button', { name: 'Export MANIFEST', exact: true }).click(),
      )
    ).toString(),
  );
  expect(manifest.metrics).toEqual(original.summaries);
  expect(manifest.configurationSha256).toMatch(/^[a-f0-9]{64}$/);
  await publication.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await lab.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Rover 01, receiver', exact: true }).click();
  const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
  await x.fill('99');
  await x.press('Enter');
  await page.reload();
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  await lab.getByRole('button', { name: 'Saved snapshots', exact: true }).click();
  await lab.locator('.lab-snapshot').first().click();
  const restored = JSON.parse(
    (
      await downloadBytes(page, () =>
        lab.getByRole('button', { name: 'Export complete JSON', exact: true }).click(),
      )
    ).toString(),
  );
  expect(restored).toEqual(original);
});

test('tablet editor, zoom, pan and layer controls remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Pan canvas (H / middle drag)', exact: true }).click();
  const canvas = page.getByRole('application'),
    box = await canvas.boundingBox();
  await page.mouse.move(box!.x + 200, box!.y + 150);
  await page.mouse.down();
  await page.mouse.move(box!.x + 240, box!.y + 180, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Fit network (F)', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle grid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Toggle grid', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Toggle labels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Toggle labels', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('laboratory displays safe request failures without inventing results', async ({ page }) => {
  await page.route('**/api/laboratory', (route) =>
    route.fulfill({ status: 422, json: { detail: 'Experiment resource limit exceeded' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const lab = page.getByRole('dialog', { name: 'Scientific laboratory', exact: true });
  await lab.getByRole('button', { name: 'Run reproducible experiment', exact: true }).click();
  await expect(lab.getByRole('alert')).toContainText('Experiment resource limit exceeded');
  await expect(lab.getByRole('button', { name: 'Export complete JSON', exact: true })).toHaveCount(
    0,
  );
});

test('archiving the active project retains unsaved geometry and undo history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
  await x.fill('99');
  await x.press('Enter');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const workspace = page.getByRole('dialog', { name: 'Research workspace', exact: true });
  const row = workspace
    .locator('.research-project')
    .filter({ has: page.getByRole('button', { name: 'Star Outdoor research site', exact: true }) });
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(row).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Rover 01, receiver', exact: true }).click();
  await expect(x).toHaveValue('99');
  await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(x).toHaveValue('45');
});
