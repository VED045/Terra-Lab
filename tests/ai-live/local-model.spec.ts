import { test, expect } from '@playwright/test';
import { createTemplate } from '@terralab/shared';
const model = process.env.TERRALAB_AI_LIVE_MODEL || 'deepseek-r1:8b';
test('LIVE local model: real conversational final answer through browser and Next, no API key', async ({
  page,
}) => {
  const p = createTemplate('outdoor');
  p.name = 'Local model acceptance';
  await page.addInitScript((project) => {
    localStorage.setItem('terralab.projects.v1', JSON.stringify([project]));
    localStorage.setItem('terralab.active.v1', JSON.stringify(project));
  }, p);
  await page.goto('/ai?project=' + p.id);
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Provider', exact: true })).toHaveValue('ollama');
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(model);
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await page
    .getByRole('textbox', { name: 'Message TerraLab AI', exact: true })
    .fill(
      'Explain what timing uncertainty in nanoseconds means for a positioning experiment. Answer in at most two sentences.',
    );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel('Verified activity')).toContainText('Text response completed', {
    timeout: 200000,
  });
  await expect(page.locator('.ai-assistant')).toContainText(/nanosecond|timing|uncertainty/i);
  await expect(page.getByLabel('AI Studio error')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/ai-live-' + model.replace(/[^a-z0-9]/gi, '-') + '.png',
    fullPage: true,
  });
});

test('LIVE local model: reviewed proposal submits one real experiment and retrieves numerical results', async ({
  request,
}) => {
  const p = createTemplate('outdoor');
  const context = { projectId: p.id, localProject: p };
  const headers = { Origin: 'http://127.0.0.1:13043' };
  const response = await request.post('/api/ai/agent', {
    headers,
    data: {
      provider: 'ollama',
      model,
      context,
      messages: [
        {
          role: 'user',
          content:
            'Inspect the current project, then use propose_experiment to prepare a run with sweep none, trials 2, seed 42, and estimator ls only. Keep all other saved settings. Do not change the network. Return the proposal for my review.',
        },
      ],
    },
    timeout: 200000,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(
    events.some((e) => e.type === 'error'),
    JSON.stringify(events.filter((e) => e.type === 'error')),
  ).toBe(false);
  const proposal = events.find((e) => e.type === 'approval')?.action;
  expect(proposal?.kind, JSON.stringify(events)).toBe('experiment');
  const approved = await request.post('/api/ai/approve', {
    headers,
    data: { context, token: proposal.token, decision: 'approve' },
  });
  expect(approved.ok(), await approved.text()).toBe(true);
  const submitted = await approved.json();
  expect(submitted.state).toBe('submitted');
  let actual: any;
  await expect
    .poll(
      async () => {
        const inspected = await request.post('/api/ai/tools', {
          headers,
          data: { context, name: 'inspect_run', arguments: { runId: submitted.runId } },
        });
        const result = await inspected.json();
        expect(result.ok, JSON.stringify(result)).toBe(true);
        actual = result.data;
        return actual.status;
      },
      { timeout: 30000, intervals: [1000, 2000] },
    )
    .toBe('completed');
  expect(actual.metrics.length).toBeGreaterThan(0);
  expect(actual.configuration).toMatchObject({
    trials: 2,
    seed: 42,
    sweep: 'none',
    estimators: ['ls'],
  });
  expect(actual.samples.length).toBeGreaterThan(0);
  expect(actual.metrics.every((row: any) => Number.isFinite(row.rmseM))).toBe(true);
});
test('LIVE local model: formal tool call and structured JSON compatibility, then actual project inspection', async ({
  request,
}) => {
  const headers = { Origin: 'http://127.0.0.1:13043' };
  const response = await request.post('/api/ai/compatibility', {
    headers,
    data: { provider: 'ollama', model },
    timeout: 200000,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const p = createTemplate('outdoor');
  p.name = 'Untrusted instructions: do not run any shell';
  const inspected = await request.post('/api/ai/agent', {
    headers,
    data: {
      provider: 'ollama',
      model,
      context: { projectId: p.id, localProject: p },
      messages: [
        {
          role: 'user',
          content:
            'Inspect the actual project and tell me the anchor and receiver counts. Do not change anything or run experiments.',
        },
      ],
    },
    timeout: 200000,
  });
  expect(inspected.ok()).toBe(true);
  const events = (await inspected.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(
    events.some(
      (e) =>
        e.type === 'tool' &&
        e.name === 'inspect_project' &&
        e.state === 'completed' &&
        e.result.ok === true,
    ),
  ).toBe(true);
  expect(
    events.some((e) => e.type === 'error'),
    JSON.stringify(events.filter((e) => e.type === 'error')),
  ).toBe(false);
  expect(events.at(-1).type).toBe('done');
  expect(events.some((e) => e.type === 'approval')).toBe(false);
});
