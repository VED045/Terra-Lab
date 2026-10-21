import { test, expect } from '@playwright/test';
test('verified baseline survives a metadata-only save and rejects changed scientific inputs', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.inspector').getByRole('button', { name: 'Simulation', exact: true }).click();
  await page.getByRole('combobox', { name: 'Solver engine' }).selectOption('python');
  let release = () => {},
    announce = () => {};
  let gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    reached = new Promise<void>((resolve) => {
      announce = resolve;
    });
  await page.route('**/api/solve', async (route) => {
    const response = await route.fetch();
    announce();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
    await reached;
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Project saved');
    release();
    await expect(page.getByText('Last run verified · Python SVD')).toBeVisible();
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    reached = new Promise<void>((resolve) => {
      announce = resolve;
    });
    await page.getByRole('button', { name: 'Run baseline', exact: true }).click();
    await reached;
    await page
      .locator('.inspector')
      .getByRole('button', { name: 'Properties', exact: true })
      .click();
    const x = page.getByRole('spinbutton', { name: 'X position', exact: true });
    await x.fill(String(Number(await x.inputValue()) + 3));
    await x.press('Enter');
    release();
    await expect(page.getByRole('button', { name: 'Run baseline', exact: true })).toBeEnabled();
    await expect(page.getByText('Last run verified · Python SVD')).toHaveCount(0);
  } finally {
    release();
  }
});
