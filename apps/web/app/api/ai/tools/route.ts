import { z } from 'zod';
import { contextInputSchema } from '../../../../lib/ai/contracts';
import { guard, body, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { executeTool } from '../../../../lib/ai/tools';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    await guard(request);
    const input = z
      .object({
        context: contextInputSchema,
        name: z.string().min(1).max(80),
        arguments: z.unknown(),
      })
      .strict()
      .parse(await body(request));
    const result = await executeTool(request, input.context, input.name, input.arguments);
    return Response.json(result, { status: result.ok ? 200 : 422, headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
