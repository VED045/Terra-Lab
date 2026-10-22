import { describe, expect, it } from 'vitest';
import { documentInputSchema, sameManuscript, escapeLatex } from './contracts';
import { validateResearchFile } from './files';
import { latexPreview } from './latex';
const id = '10000000-0000-4000-8000-000000000001';
describe('research sources and safe previews', () => {
  it('rejects unsupported, misleading, oversized and malformed files', async () => {
    for (const file of [
      new File(['x'], 'paper.html', { type: 'text/html' }),
      new File(['not PDF'], 'paper.pdf', { type: 'application/pdf' }),
      new File(['x'], 'paper.txt', { type: 'image/png' }),
      new File(['{broken'], 'data.json', { type: 'application/json' }),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'paper.pdf'),
    ])
      await expect(validateResearchFile(file)).rejects.toThrow();
  });
  it('hashes exact UTF-8 bytes and preserves original text', async () => {
    const file = new File(['Research α\nline 2'], 'note.txt', { type: 'text/plain' });
    const result = await validateResearchFile(file);
    expect(result.mime).toBe('text/plain');
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new TextDecoder().decode(result.bytes)).toBe(await file.text());
  });
  it('renders bounded mathematics, flags invalid expressions and never executes source commands', () => {
    const source = String.raw`\write18{evil} $x^2$ $$\frac{1}{$$`;
    const result = latexPreview(source);
    expect(result.blocks.some((b) => !!b.html)).toBe(true);
    expect(result.blocks.some((b) => !!b.error)).toBe(true);
    expect(
      result.blocks
        .filter((b) => b.kind === 'text')
        .map((b) => b.text)
        .join(''),
    ).toContain('write18');
    expect(result.notice).toContain('No compiler');
    const unsafe = latexPreview(String.raw`$\href{javascript:alert(1)}{go}$`);
    expect(unsafe.blocks.some((b) => b.error)).toBe(true);
  });
  it('bounds manuscript fields and compares source faithfully', () => {
    const doc = {
      id,
      project_id: id,
      title: 'Paper',
      authors: 'A',
      source: 'Exact source\n',
      evidence: [],
    };
    expect(documentInputSchema.parse(doc).source).toBe(doc.source);
    expect(sameManuscript(doc, { ...doc, source: doc.source + ' ' })).toBe(false);
    expect(documentInputSchema.safeParse({ ...doc, source: 'x'.repeat(120001) }).success).toBe(
      false,
    );
    expect(escapeLatex('A & B_1')).toBe('A \\& B\\_1');
  });
});
