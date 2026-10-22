import type { Project } from '@terralab/shared';
import type { z } from 'zod';
import { contextInputSchema } from './contracts';
import { diagnostics, publicEntities } from './domain';
export function snapshotRevision(p: Project) {
  return `${p.cloudVersion ?? 'local'}:${p.updatedAt}`;
}
export function canvasContext(
  p: Project,
  input: z.infer<typeof contextInputSchema>,
  draft = false,
) {
  const view = input.view;
  const stale = !!view && view.revision !== snapshotRevision(p);
  const selected = !stale && input.include?.selected !== false ? (view?.selected ?? []) : [];
  const receiverIds = p.objects
    .filter((o) => o.kind === 'receiver' && o.enabled)
    .slice(0, 8)
    .map((o) => o.id);
  const diagnosticProject = {
    ...p,
    objects: p.objects.filter((o) => o.kind !== 'receiver' || receiverIds.includes(o.id)),
  };
  return {
    projectId: p.id,
    revision: snapshotRevision(p),
    state: draft ? 'unsaved-editor-draft' : 'saved-project',
    coordinateSystem: 'local Cartesian, metres; time seconds',
    view:
      view && !stale
        ? { mode: view.mode, zoom: view.zoom, pan: view.pan, source: 'browser view metadata' }
        : null,
    staleView: stale,
    selected: publicEntities(p)
      .filter((o) => selected.includes(o.id))
      .slice(0, 3)
      .map((o) =>
        o.kind === 'trajectory'
          ? { ...o, points: o.points.slice(0, 16), pointsTotal: o.points.length }
          : o,
      ),
    selectionTruncated: selected.length > 3,
    geometry: diagnostics(diagnosticProject),
    diagnosticReceiversTotal: p.objects.filter((o) => o.kind === 'receiver' && o.enabled).length,
    source: '/studio?project=' + p.id,
    limitation:
      'Saved scientific state unless explicitly labelled draft. Baseline geometry at t=0 is not an experiment. Visible viewport bounds unavailable; no assumption about off-screen entities.',
  };
}
