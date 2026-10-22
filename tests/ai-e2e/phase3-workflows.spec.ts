import { test, expect } from '@playwright/test';
import { createTemplate, type Project } from '@terralab/shared';
test('Phase 3: reviewed construction, actual test process, refresh recovery, controlled queued study and accuracy evidence', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const project = createTemplate('outdoor');
  project.objects = [];
  project.name = 'Phase 3 real acceptance';
  await page.addInitScript((p) => {
    if (!localStorage.getItem('terralab.projects.v1')) {
      localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
      localStorage.setItem('terralab.active.v1', JSON.stringify(p));
    }
  }, project);
  await page.goto('/ai?project=' + project.id);
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await page.getByText('Research workflows and task recovery', { exact: true }).click();
  await page.getByText('Construct a boundary network', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview boundary network', exact: true }).click();
  await expect(page.getByLabel('Review proposed action')).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Approve & apply', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
      ),
    )
    .toBe(9);
  await page.getByText('Regression investigation and approved tests', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Discover commands and regression plan', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Approved test command' }).selectOption('ai-unit');
  await page.getByRole('button', { name: 'Review selected test', exact: true }).click();
  await expect(page.getByLabel('Review proposed action')).toContainText('disposable');
  await page.getByRole('button', { name: 'Approve & apply', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Actual test · completed', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const result = page.getByLabel('Actual approved test result');
  await expect(result).toContainText('Exit: 0');
  await expect(result).toContainText('Real execution: yes');
  await expect(result).toContainText('passed');
  const testId = (await result.locator('.mono').innerText()).trim();
  await page.reload();
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await page.getByText('Research workflows and task recovery', { exact: true }).click();
  await page.getByText('Regression investigation and approved tests', { exact: true }).click();
  await page.getByRole('button', { name: 'Inspect recorded test', exact: true }).first().click();
  await expect(page.getByLabel('Actual approved test result')).toContainText(testId);
  await expect(
    page.getByRole('heading', { name: 'Actual test · completed', exact: true }),
  ).toBeVisible();
  await page.getByText('Controlled parameter study', { exact: true }).click();
  await page.getByRole('button', { name: 'Review parameter study', exact: true }).click();
  await expect(page.getByLabel('Review proposed action')).toContainText('not proven paired');
  const submission = page.waitForResponse((r) => r.url().endsWith('/api/ai/approve'));
  await page.getByRole('button', { name: 'Approve & apply', exact: true }).click();
  const response = await submission;
  if (response.status() === 429) {
    // All local tests share one real actor/budget. A rejected approval did not submit a run.
    // Wait for an authorized read to succeed, then obtain and review a fresh proposal.
    expect((await response.json()).code).toBe('tool_rate_limit');
    await expect(page.getByLabel('AI Studio error')).toContainText('request limit');
    const saved = await page.evaluate(() => {
      const ps = JSON.parse(localStorage.getItem('terralab.projects.v1')!);
      return ps.find(
        (p: Project) => p.id === JSON.parse(localStorage.getItem('terralab.active.v1')!).id,
      );
    });
    await expect
      .poll(
        async () => {
          const read = await request.post('/api/ai/tools', {
            headers: { Origin: 'http://127.0.0.1:13042' },
            data: {
              context: { projectId: saved.id, localProject: saved },
              name: 'inspect_project',
              arguments: {},
            },
          });
          return read.status();
        },
        { intervals: [5000], timeout: 70000 },
      )
      .toBe(200);
    await page.getByRole('button', { name: 'Review parameter study', exact: true }).click();
    await expect(page.getByLabel('Review proposed action')).toBeVisible();
    await page.getByRole('button', { name: 'Approve & apply', exact: true }).click();
  } else expect(response.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Actual run · completed', exact: true }),
  ).toBeVisible({ timeout: 90000 }); // A shared actor can legitimately hit the one-minute read cooldown.
  await page.getByRole('button', { name: 'Investigate accuracy', exact: true }).click();
  await expect(page.getByLabel('Saved research task history')).toContainText(
    'Accuracy investigation · completed',
  );
  await page.getByText('Actual collected evidence and proposed method', { exact: true }).click();
  await expect(page.getByLabel('Research tasks and approved tests')).toContainText(
    'candidate explanations',
  );
  await page.screenshot({
    path: 'test-results/ai-phase3-real-tests-and-study.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-phase3-mobile.png', fullPage: true });
  const saved = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('terralab.projects.v1')!).find(
      (p: Project) => p.id === JSON.parse(localStorage.getItem('terralab.active.v1')!).id,
    ),
  )) as Project;
  const malicious = await request.post('/api/ai/tools', {
    headers: { Origin: 'http://127.0.0.1:13042' },
    data: {
      context: { projectId: saved.id, localProject: saved },
      name: 'propose_test_run',
      arguments: { commandId: 'typecheck; echo hacked', reason: 'Invalid command injection' },
    },
  });
  expect((await malicious.json()).ok).toBe(false);
});
