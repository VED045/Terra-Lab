import { guard, body, errorResponse, privateHeaders, providerKey } from '../../../../lib/ai/server';
import { selectionSchema } from '../../../../lib/ai/contracts';
import { verifyAgentProvider } from '../../../../lib/ai/agent-provider';
import { toolRateLimit } from '../../../../lib/ai/tools';
import { inferenceBudget } from '../../../../lib/ai/providers';
import { admitInference } from '../../../../lib/ai/admission';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  let release = () => {};
  try {
    const identity = await guard(request);
    toolRateLimit(identity.userId);
    const input = selectionSchema.strict().parse(await body(request, 2048));
    release = admitInference(identity.userId, inferenceBudget(input.provider));
    const result = await verifyAgentProvider(input.provider, input.model, {
      key: providerKey(request, identity, input.provider),
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(input.provider === 'ollama' ? inferenceBudget(input.provider) : 30000),
      ]),
    });
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  } finally {
    release();
  }
}
