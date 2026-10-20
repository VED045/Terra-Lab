import { test, expect } from '@playwright/test';

test('Projects page runs an actual moving demo and preserves the previous workspace', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('application')).toBeVisible();
  const previous = await page.evaluate(() => localStorage.getItem('terralab.active.v1'));
  await page.goto('/projects');
  await expect(
    page.getByRole('heading', { name: 'Research workspace', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('projects-page.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Teams', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recent Experiments', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run demo', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\?demo=moving$/);
  await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toBeVisible();
  const bounds = await page.getByRole('application').boundingBox();
  for (const anchor of await page.locator('.anchor-node').all()) {
    const box = await anchor.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(box!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  }
  const rover = page.getByRole('button', { name: 'Rover 01, receiver', exact: true });
  const start = await rover.getAttribute('transform');
  await expect.poll(() => rover.getAttribute('transform')).not.toBe(start);
  await expect(page.getByTestId('simulation-time')).not.toContainText('00:00.0 /');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('moving-demo.png'), fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(previous);
  expect(await page.evaluate(() => localStorage.getItem('terralab.projects.v1'))).toBeNull();
  await page.getByRole('link', { name: 'Exit demo', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Research workspace', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Network studio', exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terralab.active.v1')!),
  );
  expect(restored.id).toBe(JSON.parse(previous!).id);
  expect(restored.name).toBe(JSON.parse(previous!).name);
  expect(errors).toEqual([]);
});

test('Projects page is usable on a small screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/projects');
  await expect(page.getByRole('button', { name: 'Run demo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My Projects', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('projects-mobile.png'), fullPage: true });
});
