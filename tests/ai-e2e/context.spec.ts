import { test, expect } from '@playwright/test';
import { createTemplate } from '@terralab/shared';
test('actual saved selection, excluded categories, stale metadata and unsaved draft labels', async ({
  page,
  request,
}) => {
  const p = createTemplate('outdoor');
  await page.addInitScript(
    (p) => localStorage.setItem('terralab.projects.v1', JSON.stringify([p])),
    p,
  );
  await page.goto('/ai?project=' + p.id);
  await page.getByText('What the model can see', { exact: true }).click();
  await expect(page.getByLabel('Project context')).toContainText(p.updatedAt);
  const selected = p.objects[0];
  const context = {
    projectId: p.id,
    localProject: p,
    view: {
      revision: 'local:' + p.updatedAt,
      selected: [selected.id],
      zoom: 2,
      pan: { x: 0, y: 0 },
      mode: '2d',
    },
  };
  const headers = { Origin: 'http://127.0.0.1:13042' };
  const response = await request.post('/api/ai/context', { headers, data: context });
  expect(response.ok()).toBe(true);
  const value = await response.json();
  expect(value.canvas.selected[0].id).toBe(selected.id);
  const stale = await request.post('/api/ai/context', {
    headers,
    data: { ...context, view: { ...context.view, revision: 'old' } },
  });
  expect((await stale.json()).canvas).toMatchObject({ staleView: true, selected: [] });
  const draft = structuredClone(p);
  draft.objects = [];
  const unsaved = await request.post('/api/ai/context', {
    headers,
    data: { ...context, editorDraft: draft },
  });
  expect((await unsaved.json()).canvas.state).toBe('unsaved-editor-draft');
  const denied = await request.post('/api/ai/tools', {
    headers,
    data: {
      context: {
        ...context,
        include: { canvas: false, selected: false, configuration: false, results: false },
      },
      name: 'inspect_entities',
      arguments: { kind: 'all' },
    },
  });
  expect((await denied.json()).code).toBe('context_excluded');
  const initial = await request.post('/api/ai/tools', {
    headers,
    data: {
      context: {
        ...context,
        include: { canvas: false, selected: false, configuration: false, results: false },
      },
      name: 'inspect_project',
      arguments: {},
    },
  });
  expect((await initial.json()).data).not.toHaveProperty('currentExtent');
  await page.getByLabel('Current canvas', { exact: true }).uncheck();
  await expect(page.getByLabel('Project context').locator('dl')).toBeEmpty();
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.classList.remove('theme-dark');
    main.classList.add('theme-light');
  });
  await page.screenshot({ path: 'test-results/ai-context-light.png', fullPage: true });
});
