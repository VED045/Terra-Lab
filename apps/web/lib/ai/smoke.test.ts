import { expect, it } from 'vitest';
import { textProviders } from './providers';
import { modelSchema, providerSchema } from './contracts';

// Never runs as part of npm test unless deliberately enabled. Uses only the user's supplied key.
it.skipIf(process.env.TERRALAB_AI_SMOKE !== '1')(
  'opt-in real-provider model discovery and text generation (may bill the user)',
  async () => {
    const provider = providerSchema.parse(process.env.TERRALAB_AI_SMOKE_PROVIDER || 'deepseek');
    const model = modelSchema.parse(process.env.TERRALAB_AI_SMOKE_MODEL);
    const key = provider === 'deepseek' ? process.env.TERRALAB_AI_DEV_DEEPSEEK_KEY || '' : '';
    if (provider === 'deepseek' && !key)
      throw Error('Set your own development key for the opt-in smoke test.');
    const connection = { key, signal: AbortSignal.timeout(45000) };
    expect(await textProviders[provider].models(connection)).toContain(model);
    let text = '';
    for await (const chunk of textProviders[provider].stream(
      model,
      [{ role: 'user', content: 'In one sentence, explain dilution of precision in positioning.' }],
      connection,
    ))
      text += chunk;
    expect(text.trim().length).toBeGreaterThan(10);
  },
  50000,
);
