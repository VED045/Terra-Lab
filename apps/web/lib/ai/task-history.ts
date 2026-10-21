import { z } from 'zod';
export const taskStates = [
  'draft',
  'awaiting_approval',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export const taskSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    kind: z.string().max(40),
    title: z.string().max(100),
    state: z.enum(taskStates),
    createdAt: z.string(),
    updatedAt: z.string(),
    runId: z.string().uuid().optional(),
    testId: z.string().uuid().optional(),
    plan: z.array(z.string().max(250)).max(10).default([]),
    history: z
      .array(z.object({ at: z.string(), state: z.enum(taskStates), summary: z.string().max(250) }))
      .max(30),
  })
  .strict();
export type ResearchTask = z.infer<typeof taskSchema>;
export type ActionOutcome = {
  actionId: string;
  state: string;
  message?: string;
  runId?: string;
  testId?: string;
  project?: { id: string };
};
export function taskKey(actor: string, project: string) {
  return `terralab.ai.tasks.v1:${actor}:${project}`;
}
export function readTasks(
  storage: Pick<Storage, 'getItem'>,
  actor: string,
  project: string,
  now = Date.now(),
): ResearchTask[] {
  try {
    const values = z
      .array(taskSchema)
      .max(50)
      .parse(JSON.parse(storage.getItem(taskKey(actor, project)) || '[]'));
    return values.filter(
      (t) => t.projectId === project && now - Date.parse(t.updatedAt) < 7 * 86400000,
    );
  } catch {
    return [];
  }
}
export function transitionTask(
  task: ResearchTask,
  state: ResearchTask['state'],
  summary: string,
  refs: Pick<ResearchTask, 'runId' | 'testId'> = {},
): ResearchTask {
  const at = new Date().toISOString();
  return taskSchema.parse({
    ...task,
    ...refs,
    state,
    updatedAt: at,
    history: [...task.history, { at, state, summary: summary.slice(0, 250) }].slice(-30),
  });
}
