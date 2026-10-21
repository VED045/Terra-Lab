import { test, expect } from '@playwright/test';
import { createTemplate } from '../../packages/shared/src/index';

test('Network objects collapses by keyboard, preserves the network and remembers the view', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/studio');
  const panel = page.getByRole('complementary', { name: 'Network objects', exact: true });
  const canvas = page.getByRole('application');
  await expect(panel.getByRole('button', { name: 'TX-01', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'TX-01', exact: true }).click();
  const count = await panel.locator('.object-list-row').count();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('terralab.active.v1')!).objects,
  );
  const width = (await canvas.boundingBox())!.width;
  const collapse = page.getByRole('button', { name: 'Collapse Network objects', exact: true });
  await collapse.focus();
  await page.keyboard.press('Enter');
  const expand = page.getByRole('button', { name: 'Expand Network objects', exact: true });
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('textbox', { name: 'Find network objects', exact: true }),
  ).toBeHidden();
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(width + 100);
  await page.screenshot({ path: info.outputPath('network-objects-collapsed.png') });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand Network objects', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('/');
  await expect(
    page.getByRole('textbox', { name: 'Find network objects', exact: true }),
  ).toBeFocused();
  await expect(panel.locator('.object-list-row')).toHaveCount(count);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')!).objects),
  ).toEqual(before);
  await expect(panel.getByRole('button', { name: 'TX-01', exact: true })).toBeVisible();
  // The narrower desktop breakpoint keeps both header controls reachable.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole('button', { name: 'Collapse Network objects', exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Add transmitter at origin', exact: true }),
  ).toBeInViewport();
});

test('baseline model explains its purpose and each symbol; delete actions stay red in monochrome', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const project = createTemplate('square');
  project.canvas.theme = 'mono-dark';
  await page.addInitScript(
    (project) => localStorage.setItem('terralab.active.v1', JSON.stringify(project)),
    project,
  );
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Open simulation settings', exact: true }).click();
  const inspector = page.locator('.inspector');
  await expect(inspector.getByText(/isolate the effects of transmitter geometry/)).toBeVisible();
  await expect(inspector.locator('dt')).toHaveText(['rᵢ', 'p', 'aᵢ', '‖p − aᵢ‖', 'εᵢ']);
  await expect(inspector.getByText(/zero-mean Gaussian/)).toBeVisible();
  await inspector.locator('.model-equation').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('range-model-explained.png') });
  await page.getByRole('button', { name: 'TX-01', exact: true }).click();
  await inspector.getByRole('button', { name: 'Properties', exact: true }).click();
  const remove = inspector.getByRole('button', { name: 'Delete', exact: true });
  await expect(remove).toHaveClass(/button-danger/);
  async function expectRed(locator: typeof remove) {
    const color = await locator.evaluate((e) => getComputedStyle(e).color);
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(g * 1.4);
    expect(r).toBeGreaterThan(b * 1.4);
  }
  await expectRed(remove);
  await canvasMenu();
  await expect(page.getByRole('button', { name: 'Delete selection', exact: true })).toHaveClass(
    /destructive-action/,
  );
  await expectRed(page.getByRole('button', { name: 'Delete selection', exact: true }));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.goto('/projects');
  await page
    .locator('.research-project')
    .first()
    .getByLabel('Actions for Four-anchor square', { exact: true })
    .click();
  await expectRed(
    page.locator('.research-project').first().getByRole('button', { name: 'Delete', exact: true }),
  );
  async function canvasMenu() {
    await page.getByRole('application').click({ button: 'right', position: { x: 300, y: 250 } });
  }
});
