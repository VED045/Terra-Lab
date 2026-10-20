import { z } from 'zod';
const finite = z.number().finite();
const coordinate = finite.min(-1000000).max(1000000);
export const pointSchema = z.object({ x: coordinate, y: coordinate });
export type Point = z.infer<typeof pointSchema>;
const base = {
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  x: coordinate,
  y: coordinate,
  enabled: z.boolean(),
};
export const anchorSchema = z.object({
  ...base,
  kind: z.literal('anchor'),
  power: finite.min(-100).max(100),
  frequency: finite.positive().max(100000),
  bandwidth: finite.positive().max(10000),
  timingOffset: finite,
  timingUncertainty: finite.nonnegative(),
  clockDrift: finite,
  hardwareDelay: finite,
  noise: finite.min(0).max(1000),
});
export const receiverSchema = z.object({
  ...base,
  kind: z.literal('receiver'),
  altitude: finite,
  deviceType: z.enum(['rover', 'vehicle', 'handheld']),
  clockOffset: finite,
  clockDrift: finite,
  mobility: z.enum(['stationary', 'velocity', 'linear', 'circular', 'random', 'waypoints']),
  speed: finite.min(0).max(1000),
  heading: finite,
  updateInterval: finite.min(0.1).max(60),
  radius: finite.positive().max(10000),
  trajectoryId: z.string().nullable(),
});
export const obstacleSchema = z.object({
  ...base,
  kind: z.literal('obstacle'),
  shape: z.enum(['rectangle', 'wall', 'polygon']),
  width: finite.min(0.1).max(10000),
  height: finite.min(0.1).max(10000),
  vertices: z.array(pointSchema).min(3).max(200),
});
export const trajectorySchema = z.object({
  ...base,
  kind: z.literal('trajectory'),
  points: z.array(pointSchema).min(1).max(1000),
  loop: z.boolean(),
  speed: finite.min(0).max(1000),
});
export const objectSchema = z.discriminatedUnion('kind', [
  anchorSchema,
  receiverSchema,
  obstacleSchema,
  trajectorySchema,
]);
export type Anchor = z.infer<typeof anchorSchema>;
export type Receiver = z.infer<typeof receiverSchema>;
export type Obstacle = z.infer<typeof obstacleSchema>;
export type Trajectory = z.infer<typeof trajectorySchema>;
export type NetworkObject = z.infer<typeof objectSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    updatedAt: z.string().datetime(),
    archived: z.boolean(),
    objects: z
      .array(objectSchema)
      .max(500)
      .refine((a) => new Set(a.map((o) => o.id)).size === a.length, 'Object IDs must be unique'),
    settings: z.object({
      duration: finite.min(1).max(3600),
      step: finite.min(0.1).max(1),
      seed: z.number().int().min(0).max(2147483647),
      excludeBlocked: z.boolean(),
      engine: z.enum(['browser', 'python']),
      measurement: z.literal('calibrated_range'),
      speedMultiplier: finite.min(0.25).max(4).default(1),
    }),
    canvas: z.object({
      grid: z.boolean(),
      labels: z.boolean(),
      snap: z.boolean(),
      links: z.boolean(),
      obstacles: z.boolean(),
      trajectories: z.boolean(),
      estimates: z.boolean(),
      zoom: finite.min(0.2).max(12),
      pan: pointSchema,
      theme: z.enum(['dark', 'light']),
    }),
  })
  .superRefine((p, ctx) => {
    for (const r of p.objects) {
      if (
        r.kind === 'receiver' &&
        r.trajectoryId &&
        !p.objects.some((t) => t.id === r.trajectoryId && t.kind === 'trajectory')
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Receiver references a missing trajectory',
          path: ['objects'],
        });
    }
  });
export type Project = z.infer<typeof projectSchema>;
export function serializeProject(project: Project): string {
  return JSON.stringify(projectSchema.parse(project));
}
export function deserializeProject(text: string): Project {
  return projectSchema.parse(JSON.parse(text));
}
export function newObject(kind: 'anchor', p: Point, id?: string): Anchor;
export function newObject(kind: 'receiver', p: Point, id?: string): Receiver;
export function newObject(kind: 'obstacle', p: Point, id?: string): Obstacle;
export function newObject(kind: 'trajectory', p: Point, id?: string): Trajectory;
export function newObject(kind: NetworkObject['kind'], p: Point, id?: string): NetworkObject;
export function newObject(
  kind: NetworkObject['kind'],
  p: Point,
  id = crypto.randomUUID(),
): NetworkObject {
  const base = {
    id,
    name:
      kind === 'anchor'
        ? 'Transmitter'
        : kind === 'receiver'
          ? 'Receiver'
          : kind === 'trajectory'
            ? 'Trajectory'
            : 'Building',
    ...p,
    enabled: true,
  };
  switch (kind) {
    case 'anchor':
      return {
        ...base,
        kind,
        power: 20,
        frequency: 3960,
        bandwidth: 160,
        timingOffset: 0,
        timingUncertainty: 0,
        clockDrift: 0,
        hardwareDelay: 0,
        noise: 0.15,
      };
    case 'receiver':
      return {
        ...base,
        kind,
        altitude: 1.5,
        deviceType: 'rover',
        clockOffset: 0,
        clockDrift: 0,
        mobility: 'stationary',
        speed: 2,
        heading: 0,
        updateInterval: 0.1,
        radius: 15,
        trajectoryId: null,
      };
    case 'trajectory':
      return { ...base, kind, points: [p, { x: p.x + 20, y: p.y }], speed: 2, loop: true };
    case 'obstacle':
      return {
        ...base,
        kind,
        shape: 'rectangle',
        width: 18,
        height: 12,
        vertices: [
          { x: 0, y: 0 },
          { x: 18, y: 0 },
          { x: 18, y: 12 },
          { x: 0, y: 12 },
        ],
      };
  }
}
