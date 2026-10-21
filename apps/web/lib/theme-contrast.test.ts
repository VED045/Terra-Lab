import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { workspaceThemes } from '@terralab/shared';
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
function palette(id: string) {
  const block = css.match(
    id === 'dark' ? /\.tooltip \{([^}]+)\}/ : new RegExp(`\\.theme-${id} \\{([^}]+)\\}`),
  )?.[1];
  if (!block) throw Error(`Missing CSS palette ${id}`);
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+):\s*(#[\da-f]{3,8})\s*;/g), (match) => [
      match[1],
      match[2].length === 4 ? '#' + [...match[2].slice(1)].map((c) => c + c).join('') : match[2],
    ]),
  );
}
function channels(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(hex: string) {
  const values = channels(hex).map((n) => {
    const s = n / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('Additional palette readability', () => {
  it.each(workspaceThemes)('$name uses readable red for destructive actions', (theme) => {
    const p = palette(theme.id);
    const [r, g, b] = channels(p.danger);
    expect(r).toBeGreaterThan(g * 1.4);
    expect(r).toBeGreaterThan(b * 1.4);
    for (const surface of ['bg', 'panel', 'panel-alt'])
      expect(contrast(p.danger, p[surface])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(workspaceThemes.slice(2))(
    '$name has readable body, secondary and primary-button text',
    (theme) => {
      const p = palette(theme.id);
      expect(p.bg).toBe(theme.background);
      expect(p.cyan).toBe(theme.accent);
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p['primary-foreground'], p.cyan)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p['primary-foreground'], p['primary-hover'])).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each(['mono-dark', 'mono-light'])(
    '%s keeps its palette grayscale except explicit destructive actions',
    (id) => {
      const p = palette(id);
      for (const [name, color] of Object.entries(p)) {
        if (name === 'danger') continue;
        const [r, g, b] = channels(color);
        expect(r).toBe(g);
        expect(g).toBe(b);
      }
    },
  );
});
