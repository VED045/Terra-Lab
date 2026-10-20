export const themeIds = [
  'dark',
  'light',
  'mono-dark',
  'mono-light',
  'midnight',
  'forest',
  'amber',
  'violet',
  'rose',
  'sand',
] as const;
export type WorkspaceTheme = (typeof themeIds)[number];
export const workspaceThemes = [
  { id: 'dark', name: 'Deep teal', light: false, background: '#0d141e', accent: '#48c8cc' },
  { id: 'light', name: 'Daylight', light: true, background: '#f5f7fa', accent: '#148a92' },
  {
    id: 'mono-dark',
    name: 'Monochrome black',
    light: false,
    background: '#101010',
    accent: '#eeeeee',
  },
  {
    id: 'mono-light',
    name: 'Monochrome white',
    light: true,
    background: '#fafafa',
    accent: '#242424',
  },
  { id: 'midnight', name: 'Midnight blue', light: false, background: '#0c1424', accent: '#8cb4ff' },
  { id: 'forest', name: 'Forest green', light: false, background: '#0f1b16', accent: '#8dd6ae' },
  { id: 'amber', name: 'Amber terminal', light: false, background: '#1c1710', accent: '#e9bd70' },
  { id: 'violet', name: 'Violet dusk', light: false, background: '#1a1524', accent: '#c3a4ef' },
  { id: 'rose', name: 'Rose paper', light: true, background: '#faf3f4', accent: '#9c4162' },
  { id: 'sand', name: 'Warm sand', light: true, background: '#faf6ed', accent: '#876323' },
] as const satisfies readonly {
  id: WorkspaceTheme;
  name: string;
  light: boolean;
  background: string;
  accent: string;
}[];
export function isLightTheme(theme: WorkspaceTheme): boolean {
  return workspaceThemes.find((item) => item.id === theme)!.light;
}
export function nextTheme(theme: WorkspaceTheme): WorkspaceTheme {
  return themeIds[(themeIds.indexOf(theme) + 1) % themeIds.length];
}
