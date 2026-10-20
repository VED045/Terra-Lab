import { z } from 'zod';
const layers = z.enum([
  'anchors',
  'receivers',
  'obstacles',
  'paths',
  'labels',
  'links',
  'truth',
  'estimates',
  'errors',
]);
export const viewPresetSchema = z.object({
  format: z.literal('terralab-view-1'),
  name: z.string().trim().min(1).max(80),
  unit: z.union([z.literal(0.01), z.literal(1), z.literal(1000)]),
  view: z.object({
    projection: z.enum(['perspective', 'orthographic']),
    preset: z.enum(['perspective', 'top', 'front', 'side']),
    grid: z.boolean(),
    ground: z.boolean(),
    planes: z.boolean(),
    elevation: z.boolean(),
    gridStep: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(50), z.literal(100)]),
    extrusion: z.number().min(0).max(20),
    snap: z.number().min(0).max(10),
    axis: z.enum(['xy', 'x', 'y', 'z']),
    layers: z.array(layers).max(9),
  }),
});
export type ViewPreset = z.infer<typeof viewPresetSchema>;
export function readViewPresets(raw: string | null): ViewPreset[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  return z.array(viewPresetSchema).max(10).parse(value);
}
