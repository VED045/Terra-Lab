import { test, expect } from '@playwright/test';
import { createTemplate } from '@terralab/shared';
test('layout preference, draft preservation, local onboarding and dark reduced-motion mobile', async ({
  page,
}) => {
  const project = createTemplate('outdoor');
  await page.addInitScript((p) => {
    localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
  }, project);
  await page.goto('/ai?project=' + project.id);
  const canvas = page.getByLabel('Selected project canvas');
  await expect(canvas.locator('.network-node')).not.toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Message TerraLab AI' })
    .fill('Keep this research question');
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await canvas.locator('.zoom-value').textContent();
  await page.getByLabel('Canvas layout').selectOption('hidden');
  await expect(canvas.locator('.network-canvas')).toHaveCount(0);
  await page.getByLabel('Canvas layout').selectOption('compact');
  await expect(canvas.locator('.network-node')).not.toHaveCount(0);
  await expect(canvas.locator('.zoom-value')).toHaveText(zoom!);
  await expect
    .poll(() =>
      canvas
        .locator('.ai-canvas-stage')
        .evaluate((el) =>
          Math.abs(
            el.getBoundingClientRect().height -
              el.querySelector('.canvas-wrap')!.getBoundingClientRect().height,
          ),
        ),
    )
    .toBeLessThan(1);
  await expect(page.getByRole('textbox', { name: 'Message TerraLab AI' })).toHaveValue(
    'Keep this research question',
  );
  await page.getByRole('button', { name: 'Hide context', exact: true }).click();
  await expect(page.getByLabel('Project context')).toBeHidden();
  await page.getByRole('button', { name: 'Show context', exact: true }).click();
  await page.getByRole('button', { name: 'Provider settings', exact: true }).click();
  await expect(
    page.getByText('Local Ollama · free downloaded weights', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/workbench-desktop.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector('main')?.classList.add('theme-dark');
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workbench-mobile-dark.png', fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Canvas layout')).toHaveValue('compact');
});
