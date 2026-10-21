import { test, expect, type APIRequestContext } from '@playwright/test';
import { createTemplate, type Project } from '@terralab/shared';

const origin = 'http://127.0.0.1:13042';
type Proposal = { token: string; preview: unknown; kind: string };
async function tool(api: APIRequestContext, project: Project, name: string, args: unknown = {}) {
  const response = await api.post('/api/ai/tools', {
    headers: { Origin: origin },
    data: { context: { projectId: project.id, localProject: project }, name, arguments: args },
  });
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBe(true);
  expect(result.ok).toBe(true);
  return result;
}
async function approve(api: APIRequestContext, project: Project, approval: Proposal) {
  const response = await api.post('/api/ai/approve', {
    headers: { Origin: origin },
    data: {
      context: { projectId: project.id, localProject: project },
      token: approval.token,
      decision: 'approve',
    },
  });
  const result = await response.json();
  expect(response.ok(), JSON.stringify(result)).toBe(true);
  return result;
}
async function run(api: APIRequestContext, project: Project, config: Record<string, unknown>) {
  const proposal = await tool(api, project, 'propose_experiment', {
    config: {
      sweep: 'none',
      trials: 2,
      duration: 0,
      timingNs: 0,
      estimators: ['ls', 'wls', 'huber'],
      seed: 42,
      ...config,
    },
    reason: 'Real scientific integration verification',
  });
  const submitted = await approve(api, project, proposal.approval);
  expect(submitted.state).toBe('submitted');
  let data;
  await expect
    .poll(
      async () => {
        data = (await tool(api, project, 'inspect_run', { runId: submitted.runId })).data;
        return ['queued', 'running'].includes(data.status) ? 'active' : 'terminal';
      },
      { timeout: 30000, intervals: [300, 500, 1000] },
    )
    .toBe('terminal');
  return data as {
    id: string;
    status: string;
    completed: number;
    planned: number;
    error: string | null;
    metrics: { estimator: string; rmseM: number | null; fixes: number }[];
    measurementSamples: unknown[];
  };
}

test('A + C: browser agent reviews six-anchor / three-receiver network, undo/redo, then runs a real matched estimator experiment', async ({
  page,
}) => {
  const project = createTemplate('outdoor');
  project.objects = [];
  project.name = 'AI workflow A';
  await page.addInitScript((p) => {
    localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
    localStorage.setItem('terralab.active.v1', JSON.stringify(p));
  }, project);
  await page.goto('/ai?project=' + project.id);
  await expect(page.getByText('Local development snapshot', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('ollama');
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('fixture-text');
  await page.getByRole('button', { name: 'Verify tool compatibility' }).click();
  await expect(page.getByRole('status')).toContainText('structured JSON verified');
  await page
    .getByRole('textbox', { name: 'Message TerraLab AI' })
    .fill(
      'Create a network with six anchors around the boundary x=0..100 m, y=0..80 m and three receivers inside.',
    );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const review = page.getByLabel('Review proposed action');
  await expect(review).toBeVisible();
  await expect(review.getByRole('img')).toBeVisible();
  await page.screenshot({ path: 'test-results/ai-agent-placement-review.png', fullPage: true });
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
    ),
  ).toBe(0);
  await review.getByRole('button', { name: 'Approve & apply' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
      ),
    )
    .toBe(9);
  await page.getByRole('button', { name: 'Undo / redo last change' }).click();
  await page.getByRole('button', { name: 'Approve & apply' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
      ),
    )
    .toBe(0);
  await page.getByRole('button', { name: 'Undo / redo last change' }).click();
  await page.getByRole('button', { name: 'Approve & apply' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('terralab.projects.v1')!)[0].objects.length,
      ),
    )
    .toBe(9);
  await page
    .getByRole('textbox', { name: 'Message TerraLab AI' })
    .fill('Compare estimators in a real experiment with matched observations.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review experiment submission' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve & apply' }).click();
  await expect(page.getByRole('heading', { name: 'Actual run · completed' })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByLabel('Actual experiment result').getByRole('cell', { name: 'wls', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export actual JSON' }).click();
  expect((await download).suggestedFilename()).toMatch(/terralab-.*\.json/);
  await page.screenshot({ path: 'test-results/ai-agent-review-and-real-run.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-agent-mobile.png', fullPage: true });
});

test('B + D + E + F: real diagnostics, parameter change, obstacle, actual comparisons, worker failure and cancellation', async ({
  request: api,
}) => {
  test.setTimeout(90000);
  let project = createTemplate('outdoor');
  project.name = 'AI real workflows';
  project.objects = project.objects.filter((entity) => entity.kind !== 'obstacle');
  for (const entity of project.objects) if (entity.kind === 'anchor') entity.noise = 0;
  const baseline = await run(api, project, {});
  expect(baseline.status).toBe('completed');
  expect(baseline.completed).toBeGreaterThan(0);
  expect(baseline.metrics.every((m) => m.fixes > 0 && m.rmseM !== null && m.rmseM < 1e-4)).toBe(
    true,
  );
  expect(baseline.measurementSamples.length).toBeGreaterThan(0);
  const diagnostic = await tool(api, project, 'diagnose_geometry');
  expect(diagnostic.data.diagnostics[0].usableAnchors).toBeGreaterThanOrEqual(3);
  const explanation = await tool(api, project, 'inspect_parameters', { parameter: 'timingNs' });
  expect(explanation.data).toMatchObject({ default: 1, unit: 'ns' });
  const change = await tool(api, project, 'propose_parameter_change', {
    target: 'laboratory',
    values: { timingNs: 2, sweep: 'none', trials: 2 },
    reason: 'Change one noise parameter; inspect actual effects.',
  });
  project = (await approve(api, project, change.approval)).project;
  expect(project.laboratory!.timingNs).toBe(2);
  const noisy = await run(api, project, { timingNs: 2 });
  const compared = await tool(api, project, 'compare_runs', { runIds: [baseline.id, noisy.id] });
  expect(compared.data.metrics.length).toBe(6);
  expect(compared.data.warnings.join(' ')).toContain('Observation datasets are unmatched');
  const paired = await tool(api, project, 'compare_runs', { runIds: [noisy.id] });
  expect(paired.data.warnings[0]).toContain('Within-run estimators share');
  expect(paired.data.pairing[0].frames).toBe(2);
  const obstacle = await tool(api, project, 'propose_network_changes', {
    operations: [
      { op: 'add', kind: 'obstacle', x: 25, y: 15, properties: { width: 20, height: 20 } },
    ],
    reason:
      'Exercise existing geometric blockage and approximate NLOS in the actual laboratory model.',
  });
  project = (await approve(api, project, obstacle.approval)).project;
  const obstructed = await run(api, project, { timingNs: 2, nlosBiasM: 10, nlosLossDb: 10 });
  expect(obstructed.status).toBe('completed');
  expect(obstructed.measurementSamples.length).toBeGreaterThan(0);
  expect(JSON.stringify(obstructed.measurementSamples)).toContain('"blocked":true');
  const copied = await tool(api, project, 'propose_scenario_copy', {
    name: 'AI fault injection fixture',
  });
  const faultProject = (await approve(api, project, copied.approval)).project;
  expect(faultProject.id).not.toBe(project.id);
  const failed = await run(api, faultProject, {});
  expect(failed.status).toBe('failed');
  expect(failed.error).toContain('Injected worker exception');
  expect(failed.metrics).toEqual([]);
  const inspected = await tool(api, faultProject, 'inspect_run', { runId: failed.id });
  expect(inspected.data.status).toBe('failed');
  expect(inspected.data.completed).toBe(0);
  const crossProject = await api.post('/api/ai/tools', {
    headers: { Origin: origin },
    data: {
      context: { projectId: project.id, localProject: project },
      name: 'inspect_run',
      arguments: { runId: failed.id },
    },
  });
  expect((await crossProject.json()).ok).toBe(false);
  const long = await tool(api, project, 'propose_experiment', {
    config: { sweep: 'none', duration: 30, trials: 30, estimators: ['wls', 'huber'], timingNs: 2 },
    reason: 'Bounded real cancellation test',
  });
  const queued = await approve(api, project, long.approval);
  const cancel = await tool(api, project, 'propose_cancel_run', { runId: queued.runId });
  expect((await approve(api, project, cancel.approval)).state).toBe('cancellation_requested');
  await expect
    .poll(
      async () => (await tool(api, project, 'inspect_run', { runId: queued.runId })).data.status,
      { timeout: 30000, intervals: [300, 500, 1000] },
    )
    .toBe('cancelled');
});
