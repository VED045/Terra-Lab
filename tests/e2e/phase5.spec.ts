import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createTemplate, newObject, workspaceThemes } from '../../packages/shared/src/index';
test('all dashboard palettes match their studio tokens', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/');
  for (const theme of workspaceThemes) {
    const p = createTemplate('square');
    p.canvas.theme = theme.id;
    await page.evaluate((p) => localStorage.setItem('terralab.active.v1', JSON.stringify(p)), p);
    await page.goto('/projects');
    const surface = page.locator('.research-page');
    await expect(surface).toHaveClass(new RegExp('theme-' + theme.id));
    expect(await surface.evaluate((e) => getComputedStyle(e).getPropertyValue('--bg').trim())).toBe(
      theme.background,
    );
    if (theme.id === 'midnight' || theme.id === 'light')
      await page.screenshot({
        path: info.outputPath('projects-' + theme.id + '.png'),
        fullPage: true,
      });
  }
});
test('action help stays on screen and remains keyboard accessible', async ({ page }) => {
  await page.goto('/');
  const baseline = page.getByRole('button', { name: 'Run baseline', exact: true });
  await baseline.hover();
  await expect(page.getByRole('tooltip')).toContainText('calibrated 2D');
  // The primary action now lives in the top bar, so Radix places its help below.
  await expect(page.getByRole('tooltip')).toHaveAttribute('data-side', 'bottom');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('measurement models');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const lab = page.getByRole('dialog', { name: 'Scientific laboratory', exact: true });
  await lab.getByRole('button', { name: 'Load six-anchor benchmark', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Replace the current network');
  await page.keyboard.press('Escape');
  await lab
    .getByRole('button', { name: 'Run reproducible experiment', exact: true })
    .scrollIntoViewIfNeeded();
  await lab.getByRole('button', { name: 'Run reproducible experiment', exact: true }).focus();
  await lab
    .getByRole('button', { name: 'Run reproducible experiment', exact: true })
    .press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tooltip')).toContainText('Freeze this network');
  await expect(
    lab.getByRole('spinbutton', { name: 'Trajectory duration', exact: true }),
  ).toHaveAttribute('aria-describedby', 'help-duration');
  await lab.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Run demo', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('workspace is preserved');
});
test('rename validates, cancels and persists without changing project identity', async ({
  page,
}) => {
  await page.goto('/');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename project', exact: true });
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill('  ');
  await dialog.getByRole('button', { name: 'Apply name', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('1–80');
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill('Research field');
  await dialog.getByRole('button', { name: 'Apply name', exact: true }).click();
  await expect(page.locator('.project-switcher')).toContainText('Research field');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill('Discard me');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await expect(page.locator('.project-switcher')).toContainText('Research field');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  expect(after.id).toBe(before.id);
  expect(after.objects).toEqual(before.objects);
});
test('duration controls support baseline scrubbing beyond a minute and independent lab timing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open simulation settings', exact: true }).click();
  await page.getByRole('button', { name: '2 min', exact: true }).click();
  const timeline = page.getByRole('slider', { name: 'Simulation timeline', exact: true });
  await expect(timeline).toHaveAttribute('max', '120');
  await timeline.fill('90');
  await expect(page.getByTestId('simulation-time')).toContainText('01:30.0');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const lab = page.getByRole('dialog', { name: 'Scientific laboratory', exact: true });
  await lab.getByRole('button', { name: '120 s', exact: true }).click();
  await expect(
    lab.getByRole('spinbutton', { name: 'Trajectory duration', exact: true }),
  ).toHaveValue('120');
  await expect(lab).toContainText('up to 5 minutes');
});
test('physical obstacle dimensions persist and render in optional 3D', async ({ page }, info) => {
  test.setTimeout(60000);
  const p = createTemplate('square'),
    o = newObject('obstacle', { x: 30, y: 25 });
  o.name = 'Tower block';
  p.objects.push(o);
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('terralab.active.v1', JSON.stringify(p));
      sessionStorage.setItem('seeded', '1');
    }
  }, p);
  await page.goto('/');
  await page.getByRole('button', { name: 'Tower block', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Depth (Y)', exact: true })).toHaveValue(
    String(o.height),
  );
  await page.getByRole('button', { name: 'Set height (Z): 10 m', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Height (Z)', exact: true }).fill('37');
  await page.getByRole('spinbutton', { name: 'Height (Z)', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Set base elevation: 0 m', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Base elevation (Z)', exact: true }).fill('5');
  await page.getByRole('spinbutton', { name: 'Base elevation (Z)', exact: true }).press('Enter');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  await expect(page.locator('.scene-viewport')).toHaveScreenshot('physical-obstacle-schema2.png', {
    maxDiffPixelRatio: 0.02,
    animations: 'disabled',
  });
  await page.screenshot({ path: info.outputPath('physical-dimensions.png'), fullPage: true });
  await page.getByText('Saved view presets', { exact: true }).click();
  await page.getByRole('button', { name: 'Save view preset', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'View saved separately' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.objects.find((x: { id: string }) => x.id === o.id)).toMatchObject({
    height: o.height,
    verticalHeight: 37,
    baseElevation: 5,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tower block', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Height (Z)', exact: true })).toHaveValue('37');
});
test('immutable run comparison exports complete sources and saves named references', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const a = JSON.parse(readFileSync('docs/examples/timing-benchmark.result.json', 'utf8')),
    b = structuredClone(a);
  b.id = crypto.randomUUID();
  b.request.config.seed++;
  await page.goto('/');
  await page.evaluate(
    async (runs) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('terralab-laboratory', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('experiments', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('experiments', 'readwrite');
        for (const run of runs) tx.objectStore('experiments').add(run);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    [a, b],
  );
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Recent Experiments', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Compare ' + a.id, exact: true }).check();
  await page.getByRole('checkbox', { name: 'Compare ' + b.id, exact: true }).check();
  await page.getByRole('button', { name: 'Compare selected runs', exact: true }).click();
  await expect(
    page.getByText('Seeds differ. This is not a paired-observation comparison.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Comparison empirical position error CDF', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save named collection locally', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Named collection saved locally');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export comparison and complete source JSON', exact: true })
    .click();
  const file = await download;
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(exported.runs[0].records).toHaveLength(a.records.length);
  expect(exported.manifest.sources).toHaveLength(2);
  for (const label of ['Export Position CDF SVG', 'Export Position CDF PNG']) {
    const next = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const file = await next;
    const bytes = readFileSync((await file.path())!);
    if (label.endsWith('SVG')) expect(bytes.toString()).toContain('Position error (m)');
    else expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  }
  await page.getByRole('checkbox', { name: 'Compare ' + a.id, exact: true }).uncheck();
  await page
    .getByRole('button', { name: 'Open collection Research comparison', exact: true })
    .click();
  await expect(page.getByRole('checkbox', { name: 'Compare ' + a.id, exact: true })).toBeChecked();
  await expect(
    page.getByRole('img', { name: 'Comparison empirical position error CDF', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('run-comparison.png'), fullPage: true });
});

test('workspace type, date and owner filters reflect the loaded project index', async ({
  page,
}) => {
  const a = createTemplate('square'),
    b = createTemplate('moving');
  a.name = 'Static field';
  a.updatedAt = '2026-01-01T00:00:00Z';
  b.name = 'Mobile field';
  b.updatedAt = '2026-10-21T00:00:00Z';
  await page.addInitScript(
    (projects) => localStorage.setItem('terralab.projects.v1', JSON.stringify(projects)),
    [a, b],
  );
  await page.goto('/projects');
  await expect(page.locator('.research-project')).toHaveCount(2);
  await page.getByText('Project filters (loaded index)', { exact: true }).click();
  await page.getByLabel('Filter project type', { exact: true }).selectOption('moving');
  await expect(page.locator('.research-project')).toHaveCount(1);
  await expect(page.locator('.research-project')).toContainText('Mobile field');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Updated since', { exact: true }).fill('2026-10-01');
  await expect(page.locator('.research-project')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Filter owner', { exact: true }).selectOption('local');
  await expect(page.locator('.research-project')).toHaveCount(2);
  await page.getByRole('button', { name: 'Team Projects', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(0);
});

test('save-copy confirmation can cancel without creating a project', async ({ page }) => {
  await page.goto('/projects');
  const copy = page.getByRole('button', { name: 'Save current as copy', exact: true });
  await expect(copy).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await copy.click();
  await expect(page.locator('.research-project')).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await copy.click();
  await expect(page.locator('.research-project')).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('Saved your edits as a new project');
});
