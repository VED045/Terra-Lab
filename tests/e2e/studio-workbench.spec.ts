import { test, expect } from '@playwright/test';
import { createTemplate, workspaceThemes } from '../../packages/shared/src/index';

test('reference workbench keeps the canvas between the objects and inspector, with a full-width live dock in every theme', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/studio');
  const canvas = page.getByRole('application');
  await expect(canvas).toBeVisible();
  const objects = page.getByRole('complementary', { name: 'Network objects', exact: true });
  await objects.getByRole('button', { name: 'TX-01', exact: true }).click();
  const position = page
    .locator('.inspector details')
    .filter({ has: page.locator('summary', { hasText: 'POSITION' }) });
  await position.locator('summary').click();
  await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toBeHidden();
  await position.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toBeVisible();
  const value = await page
    .getByRole('spinbutton', { name: 'X position', exact: true })
    .inputValue();
  for (const theme of workspaceThemes) {
    await expect(page.locator('main.studio')).toHaveClass(new RegExp(`theme-${theme.id}(?: |$)`));
    const boxes = await page.locator('.workspace-body').evaluate((body) => {
      const box = (selector: string) => {
        const r = body.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
      };
      return {
        objects: box('.object-panel'),
        canvas: box('.canvas-wrap'),
        inspector: box('.inspector'),
        dock: box('.simulation-panel'),
      };
    });
    expect(boxes.canvas.left).toBeGreaterThan(boxes.objects.right);
    expect(boxes.inspector.left).toBeGreaterThan(boxes.canvas.right);
    expect(boxes.dock.top).toBeGreaterThan(boxes.canvas.bottom);
    expect(boxes.dock.left).toBe(boxes.objects.left);
    expect(boxes.dock.right).toBe(boxes.inspector.right);
    await expect(page.getByRole('button', { name: 'Run baseline', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeInViewport();
    await expect(page.getByRole('spinbutton', { name: 'X position', exact: true })).toHaveValue(
      value,
    );
    await page.screenshot({ path: info.outputPath(`workbench-${theme.id}.png`) });
    await page.getByRole('button', { name: 'Cycle workspace theme', exact: true }).click();
  }
  // Group tools select the actual editor mode; placing a new receiver edits the live scene.
  const before = await objects.locator('.object-select.receiver').count();
  await objects.getByRole('button', { name: 'Add receiver on canvas', exact: true }).click();
  await canvas.click({ position: { x: 350, y: 230 } });
  await expect(objects.locator('.object-select.receiver')).toHaveCount(before + 1);
});

test('tablet inspector and mobile toolbar remain usable without horizontal page overflow', async ({
  page,
}, info) => {
  const project = createTemplate('square');
  await page.addInitScript(
    (project) => localStorage.setItem('terralab.active.v1', JSON.stringify(project)),
    project,
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'AI Studio', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Open account', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle properties inspector', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath('workbench-mobile.png') });
});
