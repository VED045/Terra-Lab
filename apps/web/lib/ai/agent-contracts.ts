import { z } from 'zod';
import { pointSchema, labConfigSchema } from '@terralab/shared';
import { chatSchema, contextInputSchema } from './contracts';
import { commandIdSchema } from './testing';
import { studySchema } from './research-workflows';

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
const propertyValue = z.union([
  z.number().finite(),
  z.string().max(100),
  z.boolean(),
  z.null(),
  z.array(z.union([z.number().finite(), z.string().max(100), pointSchema])).max(1000),
]);
const properties = z
  .record(z.string().max(40), propertyValue)
  .refine((p) => Object.keys(p).length <= 32, 'At most 32 properties');
// Expose actual field names/types to the planner. Omitted fields must preserve saved settings,
// so remove schema defaults before making each patch field optional. Domain validation still
// checks the merged full configuration and its scientific/workload constraints.
const experimentPatch = z
  .object(
    Object.fromEntries(
      Object.entries(labConfigSchema.shape).map(([key, schema]) => [
        key,
        (schema instanceof z.ZodDefault ? schema.removeDefault() : schema).optional(),
      ]),
    ),
  )
  .strict();
export const operationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add'),
      kind: z.enum(['anchor', 'receiver', 'obstacle', 'trajectory']),
      x: pointSchema.shape.x,
      y: pointSchema.shape.y,
      properties: properties.optional(),
    })
    .strict(),
  z.object({ op: z.literal('update'), id, properties }).strict(),
  z.object({ op: z.literal('delete'), id }).strict(),
]);
export type NetworkOperation = z.infer<typeof operationSchema>;
export const toolSchemas = {
  inspect_project: z.object({}).strict(),
  inspect_entities: z
    .object({
      kind: z.enum(['all', 'anchor', 'receiver', 'obstacle', 'trajectory']),
      ids: z.array(id).max(50).optional(),
    })
    .strict(),
  inspect_parameters: z.object({ parameter: z.string().min(1).max(80).optional() }).strict(),
  diagnose_geometry: z.object({}).strict(),
  list_runs: z.object({}).strict(),
  inspect_run: z.object({ runId: z.string().uuid().optional() }).strict(),
  compare_runs: z.object({ runIds: z.array(z.string().uuid()).min(1).max(4) }).strict(),
  list_revisions: z.object({}).strict(),
  propose_network_changes: z
    .object({
      operations: z.array(operationSchema).min(1).max(50),
      reason: z.string().min(1).max(500),
    })
    .strict(),
  propose_scenario_copy: z.object({ name: z.string().trim().min(1).max(80) }).strict(),
  propose_parameter_change: z
    .object({
      target: z.enum(['laboratory', 'simulation']),
      values: properties,
      reason: z.string().min(1).max(500),
    })
    .strict(),
  propose_experiment: z
    .object({ config: experimentPatch, reason: z.string().min(1).max(500) })
    .strict(),
  propose_cancel_run: z.object({ runId: z.string().uuid() }).strict(),
  export_run: z.object({ runId: z.string().uuid(), format: z.enum(['json', 'csv']) }).strict(),
  inspect_test_commands: z.object({}).strict(),
  inspect_changes: z.object({}).strict(),
  propose_test_run: z
    .object({ commandId: commandIdSchema, reason: z.string().min(1).max(500) })
    .strict(),
  inspect_test_run: z.object({ testId: z.string().uuid() }).strict(),
  propose_cancel_test: z.object({ testId: z.string().uuid() }).strict(),
  propose_parameter_study: studySchema,
} as const;
export type ToolName = keyof typeof toolSchemas;
export const toolDescriptions: Record<ToolName, string> = {
  inspect_project:
    'Read the current authorized project, revision and scenario bounds. Never invent an active project.',
  inspect_entities:
    'List current entity IDs and validated physical, path and mobility properties. Names and private prose are excluded.',
  inspect_parameters:
    'Read actual schema defaults, ranges, units and source-grounded interpretation. Omit parameter to list all controls.',
  diagnose_geometry:
    'Run the existing calibrated-range diagnostic at t=0. This is a baseline diagnostic, not a laboratory experiment.',
  list_runs: 'List actual jobs/runs in the selected project, most recent first.',
  inspect_run:
    'Read actual progress, errors, metrics, bounded residual/measurement samples and artifact links. Omit runId for latest.',
  compare_runs:
    'Compare actual run metrics and matched observation hashes. A single run can compare its estimators under the same generated observations.',
  list_revisions: 'List the selected project revision numbers without author identities.',
  propose_network_changes:
    'Validate a batch of additions/updates/deletions and return a review preview. Does not apply changes. Add uses existing domain defaults, shown in preview. No ID/kind changes via properties. Deleting a path makes dependent receivers stationary.',
  propose_scenario_copy:
    'Prepare a separate private scenario copy for review, preserving the original. The user must confirm it.',
  propose_parameter_change:
    'Propose bounded laboratory or simulation parameter changes. Explain the current value with inspect_parameters first. Validates the full resulting configuration; human approval is required before saving.',
  propose_experiment:
    'Validate an experiment using current saved laboratory defaults plus supplied config fields. Return configuration, cost/work estimate and approval. Does not submit until confirmed. Compare estimators in ONE run for matched observations.',
  propose_cancel_run:
    'Prepare cancellation of the selected active project run for human confirmation.',
  export_run:
    'Prepare a link to export the actual authorized run with existing JSON/CSV conversion. Does not invent an artifact.',
  inspect_test_commands:
    'List actual fixed command IDs and local runner limits. No arbitrary shell or arguments. Only advertised on an enabled local development server.',
  inspect_changes:
    'Read bounded changed source paths and working-tree hash, and suggest relevant allowlisted tests. No source bodies, environment files or arbitrary paths.',
  propose_test_run:
    'Prepare a reviewed exact test command ID, source hash and limits. Does not execute. Explain the plan and stop for human approval.',
  inspect_test_run:
    'Read actual local test state, timestamps, exit code, counts when provided, bounded logs and tested revision. Missing exit code is never a pass.',
  propose_cancel_test:
    'Prepare human-reviewed cancellation for the exact local test job. A terminal result cannot be relabeled cancelled.',
  propose_parameter_study:
    'Prepare a bounded single-variable reproducible experiment matrix using the existing scientific sweep queue. Requires a clearly stated target metric and human approval. Never silently expand limits.',
};
export const agentRequestSchema = chatSchema.extend({}).strict();
export const approvalRequestSchema = z
  .object({
    context: contextInputSchema,
    token: z.string().min(20).max(250000),
    decision: z.enum(['approve', 'cancel']),
  })
  .strict();
export type ApprovalView = {
  id?: string;
  token: string;
  title: string;
  kind: 'network' | 'copy' | 'experiment' | 'cancel' | 'restore' | 'test' | 'cancel_test';
  preview: unknown;
  destructive: boolean;
  shared: boolean;
  projectId: string;
  expiresAt: string;
};
export type AgentEvent =
  | { type: 'plan'; text: string }
  | {
      type: 'tool';
      id: string;
      name: string;
      state: 'executing' | 'completed' | 'failed' | 'cancelled';
      summary: string;
      result?: unknown;
    }
  | { type: 'approval'; action: ApprovalView }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };
export type ToolSpec = {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
};
export type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
};
export type ModelTurn = { text: string; calls: { id: string; name: string; arguments: unknown }[] };
export const AGENT_LIMITS = {
  steps: 6,
  calls: 12,
  milliseconds: 45000,
  outputCharacters: 32000,
  toolResultCharacters: 22000,
} as const;
