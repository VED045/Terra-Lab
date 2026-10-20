import { describe, it, expect } from 'vitest';
import { createTemplate, simulationSnapshot } from '@terralab/shared';
import { buildSimulationReport, escapeHtml, exportStem } from './report';
describe('Shareable reports', () => {
  it('contains units, timestamp, observations, reproducibility and print action', () => {
    const project = createTemplate('moving'),
      html = buildSimulationReport(simulationSnapshot(project, 10));
    expect(html).toContain('10.0 s');
    expect(html).toContain('Current range observations');
    expect(html).toContain('RANGE (m)');
    expect(html).toContain('seed');
    expect(html).toContain('window.print()');
    expect(html).toContain('No account email');
    expect(html).toContain('simulated results');
    expect(html).toContain('browser Householder QR');
  });
  it('escapes user-controlled names, descriptions and configuration text', () => {
    const project = createTemplate();
    project.name = '<script>alert(1)</script>';
    project.description = '<img src=x onerror=alert(1)>';
    project.objects[0].name = '</td><script>bad()</script>';
    const html = buildSimulationReport(simulationSnapshot(project, 0));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"<&'>`)).toBe('&quot;&lt;&amp;&#39;&gt;');
  });
  it('states failure honestly for rank-deficient configurations', () => {
    const html = buildSimulationReport(simulationSnapshot(createTemplate('poor'), 5));
    expect(html).toContain('Degenerate geometry');
    expect(html).toContain('No valid sampled fixes');
    expect(html).toContain('— m');
  });
  it('generates portable filenames and embeds only an explicitly supplied network diagram', () => {
    expect(exportStem('My / test: network', 2.5)).toBe('My-test-network-t2.5s');
    expect(exportStem('!!!', 0)).toBe('terralab-t0.0s');
    const html = buildSimulationReport(
      simulationSnapshot(createTemplate(), 0),
      '<svg data-test="network"></svg>',
    );
    expect(html).toContain('<svg data-test="network"></svg>');
  });
});
