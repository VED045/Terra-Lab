import { guard, body, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { contextInputSchema } from '../../../../lib/ai/contracts';
import { readContext } from '../../../../lib/ai/context';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const identity = await guard(request);
    return Response.json(
      await readContext(identity, contextInputSchema.parse(await body(request)), request),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
