import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createTemplate, workspaceThemes } from '../../packages/shared/src/index';

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  const projects = ['moving', 'outdoor', 'square', 'poor'].map((id, i) => ({
    ...createTemplate(id),
    archived: i === 3,
  }));
  await page.addInitScript((projects) => {
    if (!sessionStorage.getItem('dashboard-seeded')) {
      localStorage.setItem('terralab.projects.v1', JSON.stringify(projects));
      localStorage.setItem('terralab.active.v1', JSON.stringify(projects[0]));
      sessionStorage.setItem('dashboard-seeded', '1');
    }
  }, projects);
});

test('reference dashboard has real counts, searchable projects, row actions and portable export', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1786, height: 1000 });
  await page.goto('/projects');
  await expect(page.locator('.research-project')).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'View My Projects', exact: true }).locator('strong'),
  ).toHaveText('3');
  await expect(
    page.getByRole('button', { name: 'View Experiments', exact: true }).locator('strong'),
  ).toHaveText('0');
  await page.screenshot({ path: info.outputPath('dashboard-dark.png'), fullPage: true });
  const row = page.locator('.research-project').filter({ hasText: 'A receiver in motion' });
  await row.getByRole('button', { name: 'Star A receiver in motion', exact: true }).click();
  await page.getByRole('button', { name: 'Starred Projects', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(1);
  await row.getByLabel('Actions for A receiver in motion', { exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived Projects', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(2);
  await row.getByLabel('Actions for A receiver in motion', { exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(1);
  await page.getByRole('button', { name: 'My Projects', exact: true }).click();
  await row.getByLabel('Actions for A receiver in motion', { exact: true }).click();
  await row.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Project details', exact: true })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox', { name: 'Search research workspace' })).toBeFocused();
  await page.keyboard.type('Outdoor');
  await expect(page.locator('.research-project')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Project', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.name).toBe('A receiver in motion');
  await page.getByRole('textbox', { name: 'Search research workspace' }).fill('');
  for (const theme of workspaceThemes) {
    await page
      .getByRole('combobox', { name: 'Workspace theme', exact: true })
      .selectOption(theme.id);
    await expect(page.locator('.research-page')).toHaveClass(new RegExp('theme-' + theme.id));
    const styles = await page.locator('.dashboard-sidebar').evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color,
    }));
    expect(styles.bg).not.toBe(styles.text);
    expect(
      await page
        .locator('.research-page')
        .evaluate((e) => getComputedStyle(e).getPropertyValue('--bg').trim()),
    ).toBe(theme.background);
    if (theme.id === 'light')
      await page.screenshot({ path: info.outputPath('dashboard-light.png'), fullPage: true });
  }
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Workspace theme', exact: true })).toHaveValue(
    'sand',
  );
});

test('new project validates and persists the chosen network and theme; import works from experiment view', async ({
  page,
}) => {
  await page.goto('/projects');
  await page.getByRole('combobox', { name: 'Workspace theme', exact: true }).selectOption('forest');
  await page.getByRole('button', { name: 'Create from Template', exact: true }).click();
  await expect(page.locator('#dashboard-starters')).toBeFocused();
  await page
    .locator('#dashboard-starters')
    .getByRole('button', { name: /Geometry matters/ })
    .click();
  const preview = page.getByRole('dialog', { name: 'New research project', exact: true });
  await expect(preview.getByRole('combobox', { name: 'Starting network' })).toHaveValue('poor');
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.research-project')).toHaveCount(3);
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New research project', exact: true });
  await dialog.getByRole('textbox', { name: 'New project name' }).fill('  ');
  await expect(dialog.getByRole('button', { name: 'Create project', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'New project name' }).fill('Field research');
  await dialog.getByRole('combobox', { name: 'Starting network' }).selectOption('outdoor');
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  expect(saved.name).toBe('Field research');
  expect(saved.canvas.theme).toBe('forest');
  expect(saved.objects.filter((o: { kind: string }) => o.kind === 'anchor')).toHaveLength(6);
  await page.goto('/projects');
  await expect(page.locator('.research-project')).toHaveCount(4);
  await page.getByRole('button', { name: 'Recent Experiments', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Project', exact: true }).click();
  const chooser = await chooserPromise;
  const imported = createTemplate('square');
  imported.name = 'Imported network';
  await chooser.setFiles({
    name: 'Imported network.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page).toHaveURL(/\/studio$/);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!).name),
  ).toBe('Imported network');
});

test('responsive navigation, project rows and theme controls fit mobile and tablet', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/projects');
  await expect(page.locator('.research-project')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'My Projects', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My Projects', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Workspace theme', exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Recent Experiments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My Projects', exact: true })).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Recent Experiments', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Show navigation', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'View My Projects', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('dashboard-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});

test('Projects opens a distinct library and resets stale search and filters', async ({ page }) => {
  await page.goto('/projects');
  const nav = page.getByRole('navigation', { name: 'Research navigation' });
  await expect(nav.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'My Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project library', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'My Projects', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('button', { name: 'Home', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  await page
    .getByRole('textbox', { name: 'Search research workspace' })
    .fill('No matching project');
  await expect(page.locator('.research-project')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived Projects', exact: true }).click();
  await nav.getByRole('button', { name: 'My Projects', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search research workspace' })).toHaveValue('');
  await expect(page.locator('.research-project')).toHaveCount(3);
  await nav.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Research workspace', exact: true }),
  ).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('blank project opens empty, persists, and supports building a network from scratch', async ({
  page,
}, info) => {
  await page.goto('/projects');
  await page
    .getByRole('combobox', { name: 'Workspace theme', exact: true })
    .selectOption('mono-dark');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New research project', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Starting network' })).toHaveValue('blank');
  await dialog.getByRole('textbox', { name: 'New project name' }).fill('My blank research canvas');
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('application')).toBeVisible();
  let project = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  expect(project.objects).toEqual([]);
  expect(project.canvas.theme).toBe('mono-dark');
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'My blank research canvas', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rover 01, receiver', exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: info.outputPath('blank-canvas.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add transmitter (A)', exact: true }).click();
  await page.getByRole('application').click({ position: { x: 350, y: 220 } });
  await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  project = await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!));
  expect(project.objects).toHaveLength(1);
  expect(project.objects[0].kind).toBe('anchor');
  expect(typeof project.objects[0].x).toBe('number');
  expect(typeof project.objects[0].y).toBe('number');
});
