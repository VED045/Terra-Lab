import { z } from 'zod';
import { contextInputSchema, AIError } from '../../../../lib/ai/contracts';
import { guard, body, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { activeProject } from '../../../../lib/ai/domain';
import { authorizedRun } from '../../../../lib/ai/scientific';
import { experimentCsv } from '../../../../lib/laboratory';
import { auditTool, toolRateLimit } from '../../../../lib/ai/tools';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const identity = await guard(request);
    toolRateLimit(identity.userId);
    const input = z
      .object({
        context: contextInputSchema,
        runId: z.string().uuid(),
        format: z.enum(['json', 'csv']),
      })
      .strict()
      .parse(await body(request));
    const active = await activeProject(identity, input.context);
    const run = await authorizedRun(request, identity, active.project, input.runId);
    if (['queued', 'running'].includes(run.status))
      throw new AIError('run_active', 'Only a terminal run can be exported.', 409);
    const data = input.format === 'csv' ? experimentCsv(run) : JSON.stringify(run, null, 2);
    auditTool(
      identity,
      active.project.id,
      'export_run',
      'completed',
      'Actual authorized terminal snapshot exported',
    );
    return new Response(data, {
      headers: {
        ...privateHeaders,
        'Content-Type': input.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json',
        'Content-Disposition': `attachment; filename="terralab-${run.id}.${input.format}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
