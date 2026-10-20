import { create } from 'zustand';

// View-only state: deliberately absent from Project, JSON exports and cloud revisions.
export type SceneLayer =
  | 'anchors'
  | 'receivers'
  | 'obstacles'
  | 'paths'
  | 'labels'
  | 'links'
  | 'truth'
  | 'estimates'
  | 'errors';
type SceneView = {
  mode: '2d' | '3d';
  editable: boolean;
  projection: 'perspective' | 'orthographic';
  preset: 'perspective' | 'top' | 'front' | 'side';
  cameraRevision: number;
  grid: boolean;
  ground: boolean;
  planes: boolean;
  elevation: boolean;
  gridStep: number;
  extrusion: number;
  snap: number;
  axis: 'xy' | 'x' | 'y' | 'z';
  layers: SceneLayer[];
  set: (patch: Partial<Omit<SceneView, 'set' | 'camera' | 'toggle'>>) => void;
  camera: (preset: SceneView['preset']) => void;
  toggle: (layer: SceneLayer) => void;
};
export const useSceneView = create<SceneView>((set) => ({
  mode: '2d',
  editable: true,
  projection: 'perspective',
  preset: 'perspective',
  cameraRevision: 0,
  grid: true,
  ground: true,
  planes: false,
  elevation: false,
  gridStep: 10,
  extrusion: 0,
  snap: 5,
  axis: 'xy',
  layers: [
    'anchors',
    'receivers',
    'obstacles',
    'paths',
    'labels',
    'links',
    'truth',
    'estimates',
    'errors',
  ],
  set: (patch) => set(patch),
  camera: (preset) => set((s) => ({ preset, cameraRevision: s.cameraRevision + 1 })),
  toggle: (layer) =>
    set((s) => ({
      layers: s.layers.includes(layer) ? s.layers.filter((x) => x !== layer) : [...s.layers, layer],
    })),
}));
export function sceneMutationAllowed() {
  const s = useSceneView.getState();
  return s.mode === '2d' || s.editable;
}
