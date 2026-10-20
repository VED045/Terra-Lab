import { create } from 'zustand';
import {
  createTemplate,
  newObject,
  projectSchema,
  type NetworkObject,
  type Project,
  type Point,
} from '@terralab/shared';
export type ToolMode =
  'select' | 'pan' | 'anchor' | 'receiver' | 'obstacle' | 'polygon' | 'trajectory' | 'measure';
type State = {
  project: Project;
  selected: string[];
  tool: ToolMode;
  past: Project[];
  future: Project[];
  time: number;
  playing: boolean;
  dirty: boolean;
  logs: { time: string; text: string; level: 'info' | 'warn' }[];
  edit: (fn: (p: Project) => void, history?: boolean) => void;
  load: (p: Project) => void;
  select: (ids: string[]) => void;
  setTool: (t: ToolMode) => void;
  add: (kind: NetworkObject['kind'], p: Point) => void;
  update: (id: string, patch: Record<string, unknown>) => void;
  remove: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  setTime: (t: number) => void;
  play: (v: boolean) => void;
  setSpeed: (v: number) => void;
  markSaved: (at: string, id?: string) => void;
  log: (text: string, level?: 'info' | 'warn') => void;
};
const clone = <T>(p: T): T => structuredClone(p);
export const useStudio = create<State>((set, get) => ({
  project: createTemplate('outdoor', '00000000-0000-4000-8000-000000000042'),
  selected: ['rx-1'],
  tool: 'select',
  past: [],
  future: [],
  time: 0,
  playing: false,
  dirty: false,
  logs: [
    { time: '00:00.0', text: 'Workspace ready. Calibrated-range baseline loaded.', level: 'info' },
  ],
  edit: (fn, history = true) =>
    set((s) => {
      const p = clone(s.project);
      fn(p);
      const result = projectSchema.safeParse(p);
      if (!result.success)
        return {
          logs: [
            ...s.logs.slice(-99),
            {
              time: formatTime(s.time),
              text: result.error.issues[0].message,
              level: 'warn' as const,
            },
          ],
        };
      if (JSON.stringify(p) === JSON.stringify(s.project) && !history) return s;
      return {
        project: result.data,
        past: history ? [...s.past.slice(-79), s.project] : s.past,
        future: [],
        dirty: true,
      };
    }),
  load: (p) => {
    projectSchema.parse(p);
    set({
      project: clone(p),
      selected: [],
      past: [],
      future: [],
      time: 0,
      playing: false,
      dirty: false,
    });
    get().log(`Opened ${p.name}`);
  },
  select: (ids) => set({ selected: ids }),
  setTool: (tool) => set({ tool }),
  add: (kind, p) => {
    const s = get();
    const o = newObject(kind, p);
    const n = s.project.objects.filter((x) => x.kind === kind).length + 1;
    o.name =
      kind === 'anchor'
        ? `TX-${String(n).padStart(2, '0')}`
        : kind === 'receiver'
          ? `Rover ${String(n).padStart(2, '0')}`
          : o.name;
    s.edit((p) => p.objects.push(o));
    set({ selected: [o.id], tool: 'select' });
    s.log(`Added ${o.name}`);
  },
  update: (id, patch) =>
    get().edit((p) => {
      const i = p.objects.findIndex((x) => x.id === id);
      if (i >= 0) p.objects[i] = { ...p.objects[i], ...patch } as NetworkObject;
    }),
  remove: () => {
    const s = get();
    s.edit((p) => {
      p.objects = p.objects.filter((o) => !s.selected.includes(o.id));
      for (const o of p.objects)
        if (o.kind === 'receiver' && s.selected.includes(o.trajectoryId ?? '')) {
          o.trajectoryId = null;
          o.mobility = 'stationary';
        }
    });
    set({ selected: [] });
  },
  duplicate: () => {
    const s = get();
    const ids: string[] = [];
    s.edit((p) => {
      const copies = p.objects
        .filter((o) => s.selected.includes(o.id))
        .map((o) => {
          const c = clone(o);
          c.id = crypto.randomUUID();
          c.name += ' copy';
          c.x += 5;
          c.y += 5;
          if (c.kind === 'trajectory') c.points = c.points.map((q) => ({ x: q.x + 5, y: q.y + 5 }));
          ids.push(c.id);
          return c;
        });
      p.objects.push(...copies);
    });
    set({ selected: ids });
  },
  undo: () =>
    set((s) =>
      s.past.length
        ? {
            project: s.past.at(-1)!,
            past: s.past.slice(0, -1),
            future: [s.project, ...s.future],
            dirty: true,
            playing: false,
          }
        : s,
    ),
  redo: () =>
    set((s) =>
      s.future.length
        ? {
            project: s.future[0],
            future: s.future.slice(1),
            past: [...s.past, s.project],
            dirty: true,
            playing: false,
          }
        : s,
    ),
  setTime: (time) =>
    set((s) => ({ time: Math.max(0, Math.min(s.project.settings.duration, time)) })),
  play: (playing) => set({ playing }),
  setSpeed: (speed) => {
    get().edit((p) => {
      p.settings.speedMultiplier = speed;
    });
  },
  markSaved: (updatedAt, id) =>
    set((s) => ({ project: { ...s.project, updatedAt, id: id ?? s.project.id }, dirty: false })),
  log: (text, level = 'info') =>
    set((s) => ({ logs: [...s.logs.slice(-99), { time: formatTime(s.time), text, level }] })),
}));
export function formatTime(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}
