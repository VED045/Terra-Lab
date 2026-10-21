import { test, expect } from '@playwright/test';

test('browser → actual Next routes → minimal local context → Ollama protocol fixture → streamed UI, stop and failure', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.getByRole('button', { name: 'Cycle workspace theme', exact: true }).click();
  await page.getByRole('link', { name: 'AI Studio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveClass(/theme-light/);
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('ollama');
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('fixture-text');
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).fill('Summarize this project.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('verified summary contains 6 anchors');
  await expect(page.getByLabel('Verified activity')).toContainText('Text response completed');
  await page.getByRole('button', { name: 'Retry response' }).click();
  await expect(page.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).fill('fixture slow');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByRole('status')).toContainText('Response stopped');
  await page
    .getByRole('combobox', { name: 'Model', exact: true })
    .selectOption('fixture-embedding');
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).fill('Explain geometry.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'AI Studio error' })).toContainText(
    'completion capability',
  );
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('fixture-text');
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).fill('fixture outage');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'AI Studio error' })).toContainText('unavailable');
  await page.screenshot({ path: 'test-results/ai-studio-light.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-studio-mobile.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});
