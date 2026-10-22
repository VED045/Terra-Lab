import { test, expect } from '@playwright/test';
import { createTemplate } from '@terralab/shared';
test('same saved canvas renderer, collapsible preview, and project-preserving edit/AI round trip', async ({
  page,
}) => {
  const a = createTemplate('outdoor'),
    b = createTemplate('indoor');
  a.name = 'Canvas network A';
  b.name = 'Empty network B';
  b.objects = [];
  await page.addInitScript(
    ({ a, b }) => {
      localStorage.setItem('terralab.projects.v1', JSON.stringify([a, b]));
      localStorage.setItem('terralab.active.v1', JSON.stringify(a));
    },
    { a, b },
  );
  await page.goto('/ai?project=' + a.id);
  const canvas = page.getByLabel('Selected project canvas');
  const rendering = () =>
    canvas.getByRole('application', {
      name: 'Interactive network canvas, coordinates in metres',
      exact: true,
    });
  await expect(rendering()).toBeVisible();
  await expect(canvas.locator('.network-node')).toHaveCount(
    a.objects.filter((o) => o.kind === 'anchor' || o.kind === 'receiver').length,
  );
  await expect(canvas.getByRole('heading', { name: 'Terrestrial network 2D' })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('terralab.projects.v1'));
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await canvas.getByRole('button', { name: 'Fit network (F)', exact: true }).click();
  await expect(
    canvas.getByRole('button', { name: 'Add transmitter (A)', exact: true }),
  ).toBeDisabled();
  await canvas.getByRole('button', { name: /^Project canvas/ }).click();
  await expect(rendering()).toHaveCount(0);
  await canvas.getByRole('button', { name: /^Project canvas/ }).focus();
  await page.keyboard.press('Enter');
  await expect(rendering()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('terralab.projects.v1'))).toBe(before);
  await page.screenshot({ path: 'test-results/ai-shared-canvas-desktop.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Saved project', exact: true }).selectOption(b.id);
  await expect(canvas).toContainText(b.name);
  await expect(canvas.locator('.network-node')).toHaveCount(0);
  await canvas.getByRole('button', { name: 'Edit canvas', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/studio\\?project=' + b.id));
  await expect(page.locator('.project-switcher')).toContainText(b.name);
  await page.getByRole('button', { name: 'Add transmitter (A)', exact: true }).click();
  await page
    .getByRole('application', {
      name: 'Interactive network canvas, coordinates in metres',
      exact: true,
    })
    .click({ position: { x: 180, y: 240 } });
  await page.getByRole('button', { name: 'AI Studio', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/ai\\?project=' + b.id));
  await expect(page.getByRole('combobox', { name: 'Saved project', exact: true })).toHaveValue(
    b.id,
  );
  await expect(canvas.locator('.network-node')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-canvas-mobile.png', fullPage: true });
});
