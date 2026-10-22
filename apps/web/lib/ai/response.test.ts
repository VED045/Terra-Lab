import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AIResponse } from '../../components/ai-response';
const render = (content: string) => renderToStaticMarkup(createElement(AIResponse, { content }));
describe('escaped research response formatting', () => {
  it('renders headings, lists, code and measured tables as semantic markup', () => {
    const html = render(
      '## Result\n**Measured facts**\n\n1. First\n2. Second\n\n```json\n{"timingNs":1}\n```\n\n| Estimator | RMSE |\n| --- | --- |\n| LS | 0.2 |',
    );
    expect(html).toContain('<h4>Result</h4>');
    expect(html).toContain('<strong>Measured facts</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<table>');
    expect(html).toContain('timingNs');
  });
  it('escapes imported HTML, rejects executable links and retains safe source links', () => {
    const html = render(
      '<script>alert(1)</script>\n\n[Unsafe](javascript:alert) [Source](/research?project=example)',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('href="/research?project=example"');
  });
  it('preserves incomplete streaming markup without a parser loop', () => {
    expect(render('- \n1. \n```\n<script>')).toContain('&lt;script&gt;');
  });
});
