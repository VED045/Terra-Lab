import { guard, body, errorResponse, privateHeaders, providerKey } from '../../../../lib/ai/server';
import { providerSchema } from '../../../../lib/ai/contracts';
import { textProviders } from '../../../../lib/ai/providers';
import { z } from 'zod';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const identity = await guard(request);
    const { provider } = z
      .object({ provider: providerSchema })
      .strict()
      .parse(await body(request, 2048));
    const models = await textProviders[provider].models({
      key: providerKey(request, identity, provider),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    return Response.json({ checked: true, models }, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
