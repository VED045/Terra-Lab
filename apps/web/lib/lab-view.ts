import { create } from 'zustand';
import type { ExperimentResult } from './laboratory';
export const labLayers = [
  'truth',
  'estimate',
  'errors',
  'ranges',
  'tdoa',
  'bearings',
  'links',
  'rejected',
  'uncertainty',
  'coverage',
  'geometry',
  'heatmap',
] as const;
export type LabLayer = (typeof labLayers)[number];
export const labLayerNames: Record<LabLayer, string> = {
  truth: 'Ground-truth trajectory',
  estimate: 'Estimated trajectory',
  errors: 'Error vectors',
  ranges: 'Range circles',
  tdoa: 'TDOA hyperbolas',
  bearings: 'AOA bearings',
  links: 'LOS / NLOS observations',
  rejected: 'Rejected observations',
  uncertainty: 'Nominal 95% ellipse',
  coverage: 'Sampled fix availability',
  geometry: 'Geometry diagnostics',
  heatmap: 'Sampled spatial error',
};
export const useLabView = create<{
  result: ExperimentResult | null;
  index: number;
  layers: LabLayer[];
  show: (result: ExperimentResult, index?: number) => void;
  clear: () => void;
  toggle: (layer: LabLayer) => void;
}>((set) => ({
  result: null,
  index: 0,
  layers: ['truth', 'estimate', 'errors', 'links', 'rejected', 'geometry'],
  show: (result, index = 0) => set({ result: structuredClone(result), index }),
  clear: () => set({ result: null }),
  toggle: (layer) =>
    set((s) => ({
      layers: s.layers.includes(layer) ? s.layers.filter((x) => x !== layer) : [...s.layers, layer],
    })),
}));
