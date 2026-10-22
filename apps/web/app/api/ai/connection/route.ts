import { guard, body, errorResponse, privateHeaders, providerKey } from '../../../../lib/ai/server';
import { providerSchema, modelSchema, AIError } from '../../../../lib/ai/contracts';
import { textProviders } from '../../../../lib/ai/providers';
import { z } from 'zod';
import { admitInference } from '../../../../lib/ai/admission';
import { toolRateLimit } from '../../../../lib/ai/tools';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  let release = () => {};
  try {
    const identity = await guard(request);

    const { provider, model, generation } = z
      .object({
        provider: providerSchema,
        model: modelSchema.optional(),
        generation: z.boolean().optional(),
      })
      .strict()
      .parse(await body(request, 2048));
    const models = await textProviders[provider].models({
      key: providerKey(request, identity, provider),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    let generated = false;
    if (generation) {
      toolRateLimit(identity.userId);
      release = admitInference(identity.userId, provider === 'ollama' ? 180000 : 45000);
      if (!model || !models.includes(model))
        throw new AIError(
          'unsupported_model',
          'Choose an installed model before testing generation.',
          422,
        );
      let output = '';
      for await (const chunk of textProviders[provider].stream(
        model,
        [{ role: 'user', content: 'Reply with the word Ready only.' }],
        {
          key: providerKey(request, identity, provider),
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(provider === 'ollama' ? 180000 : 45000),
          ]),
        },
      )) {
        output += chunk;
        if (output.length > 4096) throw new RangeError();
      }
      if (!output.trim())
        throw new AIError(
          'invalid_response',
          'The model returned no text. Check its runner logs.',
          502,
        );
      generated = true;
    }
    return Response.json({ checked: true, models, generated }, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  } finally {
    release();
  }
}
