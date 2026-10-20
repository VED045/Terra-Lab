// Verify the built app in an isolated local process and browser; never use a real account.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, expect } from '@playwright/test';
const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    'apps/web',
    '-H',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '';
server.stdout.on('data', (c) => (logs += c));
server.stderr.on('data', (c) => (logs += c));
const base = 'http://127.0.0.1:' + port,
  at = process.argv.indexOf('--artifacts'),
  artifacts = at < 0 ? null : resolve(process.argv[at + 1]);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 200; i++) {
    if (server.exitCode !== null) throw Error('Temporary production server exited');
    try {
      ready = (await fetch(base + '/studio')).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!ready) throw Error('Temporary production server did not start');
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/studio');
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('terralab.active.v1')))
    .not.toBeNull();
  const original = await page.evaluate(() => localStorage.getItem('terralab.active.v1'));
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, 'network-studio.png'), fullPage: true });
  }
  for (const path of ['/brand/network-tower.svg', '/favicon.ico', '/apple-icon.png'])
    expect((await fetch(base + path)).status).toBe(200);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  await expect(page.locator('[data-scene-object-id="tx-1"]')).toBeVisible();
  await page.getByRole('button', { name: '3D top view', exact: true }).click();
  await page.getByRole('button', { name: '3D perspective view', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(original);
  if (artifacts) await page.screenshot({ path: join(artifacts, 'network-3d.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'network-3d-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.locator('.scene-viewport canvas')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('terralab.active.v1'))).toBe(original);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const obstacle = JSON.parse(original).objects.find((o) => o.kind === 'obstacle');
  if (!obstacle) throw Error('Production fixture needs an obstacle');
  await page.getByRole('button', { name: obstacle.name, exact: true }).click();
  await page.getByRole('button', { name: 'Set height (Z): 10 m', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Height (Z)', exact: true }).fill('37');
  await page.getByRole('spinbutton', { name: 'Height (Z)', exact: true }).press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('terralab.active.v1')).schemaVersion),
    )
    .toBe(2);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.scene-viewport')).toHaveAttribute('data-ready', 'true', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'physical-obstacle.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('application')).toBeVisible();
  await page.getByRole('button', { name: obstacle.name, exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Height (Z)', exact: true })).toHaveValue('37');
  const source = JSON.parse(await readFile('docs/examples/timing-benchmark.result.json', 'utf8')),
    copy = structuredClone(source);
  copy.id = crypto.randomUUID();
  await page.evaluate(
    async (runs) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('terralab-laboratory', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('experiments', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('experiments', 'readwrite');
        for (const run of runs) tx.objectStore('experiments').add(run);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    [source, copy],
  );
  await page.goto(base + '/projects');
  await page.getByRole('button', { name: 'Recent Experiments', exact: true }).click();
  for (const run of [source, copy])
    await page.getByRole('checkbox', { name: 'Compare ' + run.id, exact: true }).check();
  await page.getByRole('button', { name: 'Compare selected runs', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Comparison selected XY trajectories', exact: true }),
  ).toBeVisible();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Position CDF PNG', exact: true }).click();
  const png = await pngDownload;
  const pngBytes = await readFile(await png.path());
  expect(pngBytes.subarray(1, 4).toString()).toBe('PNG');
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'run-comparison.png'), fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    'PASS production build: 2D default, real WebGL 3D, camera presets, unchanged project, mobile width, cleanup, tower favicon routes and schema-2 physical-height save/reload, immutable run comparison and actual PNG export. External browser requests blocked; no cloud account or mutation.',
  );
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise((r) => server.once('exit', r));
  }
}
