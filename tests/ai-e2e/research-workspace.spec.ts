import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createTemplate, defaultLabConfig } from '@terralab/shared';
function paperPDF() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const text = 'BT /F1 14 Tf 50 750 Td (Terrestrial positioning assumes calibrated timing.) Tj ET';
  objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  let out = '%PDF-1.4\n',
    offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
async function seed(page: import('@playwright/test').Page) {
  const p = createTemplate('outdoor');
  await page.addInitScript((p) => {
    if (!localStorage.getItem('terralab.projects.v1'))
      localStorage.setItem('terralab.projects.v1', JSON.stringify([p]));
    if (!localStorage.getItem('terralab.active.v1'))
      localStorage.setItem('terralab.active.v1', JSON.stringify(p));
  }, p);
  return p;
}
test('research paper, source upload/extraction, math preview, faithful export and revision restore', async ({
  page,
}) => {
  test.setTimeout(120000);
  const p = await seed(page);
  await page.goto('/research?project=' + p.id);
  await page.getByRole('button', { name: 'New paper', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
  await expect(source).toContainText('documentclass');
  const exact = String.raw`\section{Measured experiment}\nTiming $\sigma_t=1\,\mathrm{ns}$. $$\frac{1}{$$`;
  await source.fill(exact);
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  await expect(page.getByLabel('LaTeX math preview')).toContainText('Line');
  await expect(page.locator('.katex')).not.toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({
    name: 'calibrated-paper.pdf',
    mimeType: 'application/pdf',
    buffer: paperPDF(),
  });
  await expect(page.getByLabel('Selected research asset')).toContainText('calibrated-paper.pdf', {
    timeout: 45000,
  });
  await page.getByText(/Extracted source text/).click();
  await page.getByText('Page 1', { exact: true }).click();
  await expect(page.getByLabel('Selected research asset')).toContainText('calibrated timing');
  await page.getByRole('button', { name: 'Attach to document', exact: true }).click();
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export LaTeX source', exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.tex$/);
  expect(await readFile((await exported.path())!, 'utf8')).toBe(exact);
  await expect(source).toHaveValue(exact);
  await page.getByRole('button', { name: 'Revision history', exact: true }).click();
  await expect(page.getByLabel('Document revisions')).toContainText('Revision 1');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Restore revision 1', exact: true }).click();
  await expect(source).toContainText('documentclass');
  await page.screenshot({ path: 'test-results/research-desktop.png', fullPage: true });
  await page.evaluate(() =>
    document.querySelector('.research-workspace')?.classList.replace('theme-dark', 'theme-light'),
  );
  await page.screenshot({ path: 'test-results/research-desktop-light.png', fullPage: true });
  await page.evaluate(() =>
    document.querySelector('.research-workspace')?.classList.replace('theme-light', 'theme-dark'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Editor layout').selectOption('source');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/research-mobile.png', fullPage: true });
});

test('selected research source reaches the existing chat and manuscript insertion requires review', async ({
  page,
}) => {
  test.setTimeout(60000);
  const p = await seed(page);
  await page.goto('/research?project=' + p.id);
  await page.getByRole('button', { name: 'Blank document', exact: true }).click();
  const source = page.getByLabel('LaTeX source', { exact: true });
  await source.fill('Original manuscript.');
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  await page.getByRole('link', { name: 'Draft related-work notes', exact: true }).click();
  await expect(page.getByText('Selected research sources', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Research agent', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('ollama');
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('fixture-text');
  await page
    .getByLabel('Message TerraLab AI', { exact: true })
    .fill('Explain calibrated timing with the selected manuscript as source data.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review draft in document', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review draft in document', exact: true }).click();
  await expect(page.getByLabel('Review manuscript insertion', { exact: true })).toBeVisible();
  await expect(page.getByLabel('LaTeX source', { exact: true })).toHaveValue(
    'Original manuscript.',
  );
  await page.getByRole('button', { name: 'Approve insertion', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Reviewed draft appended');
  await expect(page.getByLabel('LaTeX source', { exact: true })).toContainText('Reviewed AI draft');
});

test('actual 3D WebGL surface can be captured as private evidence', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page);
  await page.goto('/studio');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(
    page.getByRole('application', {
      name: 'Interactive 3D network canvas, coordinates in metres',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add canvas evidence', exact: true }).click();
  await expect(page).toHaveURL(/\/research\?project=.*asset=/, { timeout: 30000 });
  await expect(page.getByLabel('Selected research asset')).toContainText('canvas-3d');
  await expect(page.locator('.research-figure')).toBeVisible();
  await page.getByText('Capture and source provenance', { exact: true }).click();
  await expect(page.getByLabel('Selected research asset')).toContainText('actual WebGL');
});
test('two tabs preserve conflicting manuscript drafts and create a separate recovery copy', async ({
  page,
  context,
}) => {
  const p = await seed(page);
  await page.goto('/research?project=' + p.id);
  await page.getByRole('button', { name: 'Blank document', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
  await source.fill('First source');
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  const second = await context.newPage();
  await second.goto('/research?project=' + p.id);
  await second
    .getByRole('button', { name: 'Open document Untitled document', exact: true })
    .click();
  await expect(second.getByLabel('LaTeX source', { exact: true })).toHaveValue('First source');
  await source.fill('Owner tab change');
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
  await second.getByLabel('LaTeX source', { exact: true }).fill('Other tab preserved draft');
  await second.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(second.getByRole('alert').first()).toContainText('VERSION_CONFLICT');
  await expect(second.getByLabel('LaTeX source', { exact: true })).toHaveValue(
    'Other tab preserved draft',
  );
  await second.getByRole('button', { name: 'Save draft as copy', exact: true }).click();
  await expect(second.getByLabel('Document title', { exact: true })).toHaveValue(
    'Untitled document copy',
  );
  await expect(second.getByLabel('LaTeX source', { exact: true })).toHaveValue(
    'Other tab preserved draft',
  );
  await second.close();
});
test('actual renderer snapshot and real saved numerical run become traceable research evidence', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const p = await seed(page);
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Add canvas evidence', exact: true }).click();
  await expect(page).toHaveURL(/\/research\?project=.*asset=/, { timeout: 30000 });
  await expect(page.getByLabel('Selected research asset')).toContainText('canvas-2d');
  await expect(page.locator('.research-figure')).toBeVisible();
  await page.getByRole('button', { name: 'New paper', exact: true }).click();
  // The request reaches the actual numerical engine; the returned record is stored unchanged in the existing history database.
  const result = await request.post('/api/laboratory', {
    headers: { Origin: 'http://127.0.0.1:13042' },
    data: {
      project: p,
      config: { ...defaultLabConfig(), trials: 1, duration: 1, sampleStep: 1, estimators: ['ls'] },
    },
  });
  expect(result.ok()).toBe(true);
  let run = await result.json();
  for (let n = 0; n < 80 && !['completed', 'failed', 'cancelled'].includes(run.status); n++) {
    await new Promise((r) => setTimeout(r, 100));
    run = await (await request.get('/api/laboratory?id=' + run.id + '&detail=true')).json();
  }
  expect(run.status).toBe('completed');
  await page.evaluate(async (r) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('terralab-laboratory', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('experiments', { keyPath: 'id' });
      open.onsuccess = () => {
        const tx = open.result.transaction('experiments', 'readwrite');
        tx.objectStore('experiments').add(r);
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, run);
  await page.reload();
  await page.getByRole('button', { name: 'Open document Untitled paper', exact: true }).click();
  await page.getByText('Add evidence and captions', { exact: true }).click();
  await page.getByLabel('Evidence run', { exact: true }).selectOption(run.id);
  await page.getByRole('button', { name: 'Add selected run', exact: true }).click();
  await expect(page.locator('.research-evidence')).toContainText(run.id);
  await expect(page.locator('.research-evidence')).toContainText('rmseM');
  await page.getByRole('button', { name: 'Insert captioned table', exact: true }).click();
  await expect(page.getByLabel('LaTeX source', { exact: true })).toContainText(run.id);
});
