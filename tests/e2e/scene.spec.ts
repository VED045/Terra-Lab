import { test, expect, type Page } from '@playwright/test';
import { createTemplate, newObject, serializeProject } from '../../packages/shared/src/index';
import { readFileSync } from 'node:fs';
test.setTimeout(60000);
async function scene(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/studio');
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(
    page.getByRole('application', { name: 'Interactive 3D network canvas, coordinates in metres' }),
  ).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
}
test('3D shares selection, initial-coordinate edits, snapping, creation, undo and persistence', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await scene(page);
  await page.screenshot({ path: info.outputPath('scene-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'TX-01', exact: true }).first().click();
  await expect(page.getByText(/Selected: TX-01/)).toBeVisible();
  const input = page.getByRole('spinbutton', { name: 'X position', exact: true });
  await input.fill('17');
  await input.press('Enter');
  await expect(page.getByText(/X 17.00 m/)).toBeVisible();
  await page.getByRole('button', { name: 'Move selected east', exact: true }).click();
  await expect(input).toHaveValue('20');
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(input).toHaveValue('17');
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  await expect(input).toHaveValue('20');
  await page.getByRole('button', { name: 'Duplicate selected', exact: true }).click();
  await expect(page.getByText(/Selected: TX-01 copy/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByText('Add object', { exact: true }).click();
  await page.getByRole('button', { name: 'Add 3D receiver at origin', exact: true }).click();
  await expect(page.getByText(/Selected: Rover 02/)).toBeVisible();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  const before = await page.evaluate(() => localStorage.getItem('terralab.active.v1'));
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(
    page.getByRole('application', { name: 'Interactive network canvas, coordinates in metres' }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(before);
  await page.reload();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});
test('camera, units, layers and themes do not create scientific edits; context loss recovers to 2D', async ({
  page,
}, info) => {
  await scene(page);
  const original = await page.evaluate(() => localStorage.getItem('terralab.active.v1'));
  await page.getByRole('combobox', { name: '3D projection' }).selectOption('orthographic');
  for (const preset of ['top', 'front', 'side', 'perspective'])
    await page.getByRole('button', { name: '3D ' + preset + ' view', exact: true }).click();
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await page.getByText('View & layers', { exact: true }).click();
  await page.getByRole('combobox', { name: '3D unit scale' }).selectOption('1000');
  await page.getByRole('combobox', { name: 'Illustrative obstacle extrusion' }).selectOption('5');
  await page.getByRole('checkbox', { name: 'Coordinate planes', exact: true }).check();
  expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(original);
  await page.getByText('View & layers', { exact: true }).click();
  await page.getByRole('button', { name: 'Cycle workspace theme', exact: true }).click();
  await expect(page.locator('main.studio')).toHaveClass(/theme-light/);
  await page.screenshot({ path: info.outputPath('scene-light.png'), fullPage: true });
  await page
    .locator('.scene-viewport canvas')
    .evaluate((el) => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByText('The 3D graphics context was lost', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(
    page.getByRole('application', { name: 'Interactive network canvas, coordinates in metres' }),
  ).toBeVisible();
});
test('WebGL unavailable fallback leaves the SVG editor working on mobile', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: any, ...args: any[]) {
      return kind === 'webgl2' ? null : get.call(this, kind, ...(args as []));
    } as typeof get;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(
    page.getByText('WebGL 2 is unavailable in this browser', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(
    page.getByRole('application', { name: 'Interactive network canvas, coordinates in metres' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('3D renders recorded estimator/epoch values and keeps failures unestimated', async ({
  page,
}, info) => {
  const result = JSON.parse(readFileSync('docs/examples/timing-clean.result.json', 'utf8'));
  await page.route('**/api/laboratory**', (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' ? 202 : 200,
      json: route.request().method() === 'POST' ? { id: result.id } : result,
    }),
  );
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Scientific laboratory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Scientific laboratory' });
  await dialog.getByRole('button', { name: 'Run reproducible experiment', exact: true }).click();
  await expect(dialog.getByText('Snapshot saved locally.', { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await dialog.getByRole('button', { name: 'Restore snapshot network', exact: true }).click();
  await dialog.getByRole('button', { name: 'Preview on studio canvas', exact: true }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  await page.locator('.scene-recorded > summary').click();
  await expect(page.getByTestId('scene-recorded-position')).toContainText(
    'estimate ' + result.records[0].position.join(', ') + ' m',
  );
  await expect(page.getByTestId('scene-recorded-position')).toContainText('Z unestimated');
  await page.getByRole('slider', { name: '3D recorded epoch' }).fill('1');
  await expect(page.getByTestId('scene-recorded-position')).toContainText(
    'estimate ' + result.records[1].position.join(', ') + ' m',
  );
  await page.screenshot({ path: info.outputPath('scene-recorded.png'), fullPage: true });
});
test('500-object scene initializes and disposes cleanly when switched back to 2D', async ({
  page,
}, info) => {
  const p = createTemplate('square');
  p.objects = Array.from({ length: 499 }, (_, i) =>
    newObject('anchor', { x: (i % 25) * 10, y: Math.floor(i / 25) * 10 }, 'a-' + i),
  );
  p.objects.push(newObject('receiver', { x: 120, y: 95 }, 'large-rover'));
  const cleanupWarnings: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('synchronously unmount')) cleanupWarnings.push(m.text());
  });
  await page.addInitScript(
    (json) => localStorage.setItem('terralab.active.v1', json),
    serializeProject(p),
  );
  const start = Date.now();
  await scene(page);
  await expect(page.getByTestId('scene-stats')).toContainText('500 objects');
  await page.screenshot({ path: info.outputPath('scene-500.png'), fullPage: true });
  const elapsed = Date.now() - start;
  const renderer = await page.locator('.scene-viewport canvas').evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log('WebGL renderer:', renderer);
  console.log(
    '500-object scene ready ms:',
    elapsed,
    'stats:',
    await page.getByTestId('scene-stats').textContent(),
  );
  expect(elapsed).toBeLessThan(10000);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.locator('.scene-viewport canvas')).toHaveCount(0);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true');
  }
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.locator('.scene-viewport canvas')).toHaveCount(0);
});
test('tower logo is shared with the browser favicon and generated icons', async ({
  page,
  request,
}) => {
  await page.goto('/studio');
  await expect(page.locator('[data-brand="network-tower"]')).toBeVisible();
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/brand/network-tower.svg',
  );
  expect((await request.get('/brand/network-tower.svg')).status()).toBe(200);
  expect((await request.get('/favicon.ico')).status()).toBe(200);
  expect((await request.get('/apple-icon.png')).status()).toBe(200);
});
test('the translation gizmo commits a real pointer drag as one undoable snapped edit', async ({
  page,
}) => {
  const p = createTemplate('square');
  await page.addInitScript(
    (json) => localStorage.setItem('terralab.active.v1', json),
    serializeProject(p),
  );
  await scene(page);
  await page.getByRole('button', { name: 'TX-01', exact: true }).first().click();
  await page.getByRole('combobox', { name: '3D projection' }).selectOption('orthographic');
  await page.getByRole('button', { name: '3D top view', exact: true }).click();
  await page.getByRole('combobox', { name: '3D translation constraint' }).selectOption('x');
  const label = page.locator('[data-scene-object-id="tx-1"]');
  await expect(label).toBeVisible();
  const box = (await page.locator('.scene-viewport').boundingBox())!;
  const point = await label.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
  const x = box.x + point.x + box.height * 0.2 * 0.6,
    y = box.y + point.y;
  const input = page.getByRole('spinbutton', { name: 'X position', exact: true }),
    before = Number(await input.inputValue());
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y, { steps: 12 });
  await page.mouse.up();
  await expect(input).not.toHaveValue(String(before));
  expect(Number(await input.inputValue()) % 5).toBe(0);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(input).toHaveValue(String(before));
});

test('touch orbit and mobile 3D controls preserve the project', async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/studio');
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    });
    await expect(page.locator('[data-scene-object-id="tx-1"]')).toBeVisible();
    const original = await page.evaluate(() => localStorage.getItem('terralab.active.v1'));
    const label = page.locator('[data-scene-object-id="tx-1"]'),
      before = await label.getAttribute('style');
    const box = (await page.locator('.scene-viewport').boundingBox())!,
      x = box.x + box.width * 0.6,
      y = box.y + box.height * 0.55;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let n = 1; n <= 6; n++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + n * 7, y: y + n * 2, id: 1 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(label).not.toHaveAttribute('style', before!);
    expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: info.outputPath('scene-mobile.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
