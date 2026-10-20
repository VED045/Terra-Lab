import { deserializeProject, type Project } from '@terralab/shared';
export function conflictChoices(local: Project, latest: Project) {
  const keys = ['name', 'description', 'archived', 'settings', 'laboratory', 'canvas'] as const;
  return [
    ...keys
      .filter((k) => JSON.stringify(local[k]) !== JSON.stringify(latest[k]))
      .map((k) => ({ key: k, label: k })),
    ...Array.from(new Set([...local.objects, ...latest.objects].map((o) => o.id))).flatMap((id) => {
      const a = local.objects.find((o) => o.id === id),
        b = latest.objects.find((o) => o.id === id);
      return JSON.stringify(a) === JSON.stringify(b)
        ? []
        : [{ key: 'object:' + id, label: (a?.name ?? b?.name ?? id) + (a ? '' : ' (delete)') }];
    }),
  ];
}
export function reapplyDraft(local: Project, latest: Project, selected: string[]): Project {
  if (local.id !== latest.id) throw Error('Cannot merge different projects');
  const copy = structuredClone(latest);
  for (const key of selected) {
    if (key.startsWith('object:')) {
      const id = key.slice(7);
      copy.objects = copy.objects.filter((o) => o.id !== id);
      const source = local.objects.find((o) => o.id === id);
      if (source) copy.objects.push(structuredClone(source));
    } else if (
      ['name', 'description', 'archived', 'settings', 'laboratory', 'canvas'].includes(key)
    ) {
      const src = local as unknown as Record<string, unknown>,
        dst = copy as unknown as Record<string, unknown>;
      if (src[key] === undefined) delete dst[key];
      else dst[key] = structuredClone(src[key]);
    } else throw Error('Unknown merge choice');
  }
  copy.schemaVersion = local.schemaVersion === 2 || latest.schemaVersion === 2 ? 2 : 1;
  return deserializeProject(JSON.stringify(copy));
}
