import { test, expect } from '@playwright/test';
import { createTemplate } from '@terralab/shared';

test('dismissible sidebar, shared theme, vertical tools, formatted streaming and chat scroll ownership', async ({
  page,
}) => {
  const p = createTemplate('outdoor');
  await page.addInitScript((p) => {
    if (!localStorage.getItem('terralab.projects.v1'))
      localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
    if (!localStorage.getItem('terralab.workspace-theme.v1'))
      localStorage.setItem('terralab.workspace-theme.v1', 'violet');
  }, p);
  await page.goto('/ai?project=' + p.id);
  await expect(page.locator('main')).toHaveClass(/theme-violet/);
  const context = page.getByLabel('Project context');
  await expect(context.getByLabel('Starter prompts', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide starter prompts', exact: true }).click();
  await expect(context.getByLabel('Starter prompts', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Hide research workflows', exact: true }).click();
  await expect(context.getByLabel('Research workflow panel')).toBeHidden();
  await page.reload();
  await expect(page.locator('main')).toHaveClass(/theme-violet/);
  await page.getByRole('button', { name: 'Show starter prompts', exact: true }).click();
  await page.getByRole('button', { name: 'Show research workflows', exact: true }).click();
  const rail = page.getByRole('toolbar', { name: 'Network tools' });
  const boxes = await rail
    .locator('button')
    .evaluateAll((bs) =>
      bs
        .slice(0, 2)
        .map((b) => ({ x: b.getBoundingClientRect().x, y: b.getBoundingClientRect().y })),
    );
  expect(boxes[1].x).toBeCloseTo(boxes[0].x, 0);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('ollama');
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('fixture-text');
  await page.getByLabel('Canvas layout').selectOption('hidden');
  await page.getByLabel('Message TerraLab AI', { exact: true }).fill('fixture formatted long');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel('Response streaming', { exact: true })).toBeVisible();
  const meteor = page.locator('.ai-agent-flow[data-busy="true"] li').first();
  await expect
    .poll(() => meteor.evaluate((el) => getComputedStyle(el, '::before').animationName))
    .toBe('ai-meteor');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => meteor.evaluate((el) => getComputedStyle(el, '::before').animationName))
    .toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const log = page.getByRole('log', { name: 'Conversation messages' });
  await expect(log).toContainText('Paragraph 8');
  await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await log.evaluate((el) => (el.scrollTop = 0));
  await expect(log).toContainText('Paragraph 24');
  expect(await log.evaluate((el) => el.scrollTop)).toBeLessThan(60);
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toBeEnabled();
  await expect(log.locator('.ai-assistant strong')).toContainText('Measured facts');
  await expect(log.locator('.ai-assistant ol li')).toHaveCount(2);
  await expect(log.locator('.ai-assistant table')).toHaveCount(1);
  await expect(log.locator('.ai-assistant pre code')).toContainText('timingNs');
  expect(await log.evaluate((el) => getComputedStyle(el).overflowY)).toBe('scroll');
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.getByLabel('Message TerraLab AI', { exact: true }).fill('Summarize the network.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toBeEnabled();
  await expect
    .poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(5);
  await page.screenshot({ path: 'test-results/ai-workbench-v2-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Hide context', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Message TerraLab AI', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/ai-workbench-v2-mobile.png', fullPage: true });
});

test('Manuscript desk preserves source in independent editor and preview panes', async ({
  page,
}) => {
  const p = createTemplate('outdoor');
  await page.addInitScript((p) => {
    localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
    localStorage.setItem('terralab.workspace-theme.v1', 'light');
  }, p);
  await page.goto('/research?project=' + p.id);
  await expect(
    page.getByRole('heading', { name: 'TerraLab Manuscript', exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).toHaveClass(/theme-light/);
  await page.getByRole('button', { name: 'New paper', exact: true }).click();
  const source = page.getByLabel('LaTeX source', { exact: true });
  await expect(source).toContainText('documentclass');
  await expect(page.locator('.manuscript-line-numbers')).toContainText('1');
  await expect(page.getByLabel('LaTeX math preview')).toBeVisible();
  const rows = await page
    .locator('.research-source-layout')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(rows).toBe(2);
  await source.fill('Exact source $x^2$\nLine two.');
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  await expect(page.locator('.katex')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/manuscript-v2-light.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Editor layout').selectOption('source');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(source).toHaveValue('Exact source $x^2$\nLine two.');
  await page.screenshot({ path: 'test-results/manuscript-v2-mobile.png', fullPage: true });
});
