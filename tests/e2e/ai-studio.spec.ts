import { expect, test } from '@playwright/test';

test('AI Studio shows honest unauthenticated states and fits desktop and mobile', async ({
  page,
}) => {
  await page.goto('/ai');
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await expect(page.getByRole('heading', { name: 'AI Studio', exact: true })).toBeVisible();
  await expect(page.getByRole('alert', { name: 'AI Studio error' })).toContainText('Sign in');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Provider settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your provider, your account' })).toBeVisible();
  await expect(page.getByLabel('DeepSeek API key', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'AI Studio error' })).toContainText('Sign in');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('ollama');
  await expect(page.getByText('Not checked', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Message TerraLab AI' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('log', { name: 'Conversation messages' })).toBeFocused();
});

test('AI Studio renders verified context, streamed text, retry and errors using explicit browser fixtures', async ({
  page,
}) => {
  // Browser fixtures exercise UI states. API authorization/provider behavior is tested separately in ai.test.ts.
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project saved');
  await page.route('**/api/ai/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    const data =
      endpoint === 'settings'
        ? { mode: 'local-development', configured: false, canSave: false, ollamaEnabled: false }
        : endpoint === 'connection'
          ? { checked: true, models: ['fixture-text-model'] }
          : {
              source: 'local-development',
              objects: { anchors: { enabled: 6, total: 6 }, receivers: { enabled: 1, total: 1 } },
              experiment: null,
              run: null,
            };
    if (endpoint === 'chat')
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body: [
          { type: 'activity', text: 'Fixture: project access verified; context read.' },
          {
            type: 'text',
            text: 'Anchor geometry affects the conditioning of the positioning solution.',
          },
          { type: 'done' },
        ]
          .map((event) => JSON.stringify(event) + '\n')
          .join(''),
      });
    return route.fulfill({ json: data });
  });
  await page.getByRole('link', { name: 'AI Studio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Model', exact: true })
    .selectOption('fixture-text-model');
  await page.getByRole('button', { name: /Explain how anchor geometry/ }).click();
  await page.getByRole('textbox', { name: 'Message TerraLab AI' }).press('Enter');
  await expect(page.getByRole('log')).toContainText('conditioning');
  await expect(page.getByLabel('Verified activity')).toContainText(
    'No network changes or tests executed',
  );
  await page.getByRole('button', { name: 'Retry response' }).click();
  await expect(page.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  await page.unroute('**/api/ai/**');
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      status: 429,
      json: { code: 'rate_limit', message: 'Provider rate limit. Wait and retry.' },
    }),
  );
  await page
    .getByRole('textbox', { name: 'Message TerraLab AI' })
    .fill('Explain dilution of precision.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'AI Studio error' })).toContainText('rate limit');
  await expect(page.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/ai-studio-desktop.png', fullPage: true });
});
