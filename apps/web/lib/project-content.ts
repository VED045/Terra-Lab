import type { Project } from '@terralab/shared';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
// Server-controlled synchronization fields are not unsaved user edits.
export function projectContent(project: Project): string {
  const { updatedAt, cloudVersion, cloudOwnerId, ...content } = project;
  return JSON.stringify(canonical(content));
}
