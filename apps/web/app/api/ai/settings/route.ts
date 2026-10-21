import {
  guard,
  body,
  errorResponse,
  privateHeaders,
  configSchema,
} from '../../../../lib/ai/server';
import {
  canSaveCredentials,
  credentialCookie,
  credentialLifetime,
  openCredential,
  readCookie,
  sealCredential,
} from '../../../../lib/ai/credentials';
import { AIError, keySchema } from '../../../../lib/ai/contracts';
import { textProviders } from '../../../../lib/ai/providers';
import { testingAvailable } from '../../../../lib/ai/testing';
import { modelSchema } from '../../../../lib/ai/contracts';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const identity = await guard(request);
    return Response.json(
      {
        mode: identity.local ? 'local-development' : 'user-encrypted-cookie',
        canSave: !identity.local && canSaveCredentials(),
        configured: identity.local
          ? Boolean(process.env.TERRALAB_AI_DEV_DEEPSEEK_KEY)
          : Boolean(openCredential(readCookie(request), identity.userId)),
        ollamaEnabled: identity.local && process.env.TERRALAB_AI_OLLAMA_ENABLED === '1',
        actorId: identity.userId,
        freeLocalOnly: process.env.TERRALAB_AI_FREE_LOCAL_ONLY === '1',
        testingEnabled: testingAvailable(identity),
        preferredLocalModel: identity.local
          ? (modelSchema.safeParse(process.env.TERRALAB_AI_OLLAMA_MODEL).data ?? null)
          : null,
        analysisLocalModel: identity.local
          ? (modelSchema.safeParse(process.env.TERRALAB_AI_OLLAMA_ANALYSIS_MODEL).data ?? null)
          : null,
        agentLocalModel: identity.local
          ? (modelSchema.safeParse(process.env.TERRALAB_AI_OLLAMA_AGENT_MODEL).data ?? null)
          : null,
        // Configuration is not proof of a live connection.
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await guard(request);
    if (process.env.TERRALAB_AI_FREE_LOCAL_ONLY === '1')
      throw new AIError(
        'free_local_only',
        'Hosted credentials are disabled in this free local profile.',
        403,
      );
    if (identity.local)
      throw new AIError(
        'local_configuration',
        'Local development uses your server environment key. Browser key saving requires sign-in.',
        403,
      );
    if (!canSaveCredentials())
      throw new AIError(
        'secret_store_unavailable',
        'The administrator must configure AI encryption before keys can be saved.',
        503,
      );
    const config = configSchema.parse(await body(request, 2048));
    const key = keySchema.parse(config.key);
    // Verify the key before replacing a working credential; no generation/billing call.
    const models = await textProviders.deepseek.models({
      key,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    const sealed = sealCredential(key, identity.userId);
    return Response.json(
      { configured: true, models, checked: true },
      {
        headers: {
          ...privateHeaders,
          'Set-Cookie': `${credentialCookie}=${sealed}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${credentialLifetime}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await guard(request);
    return Response.json(
      { configured: false },
      {
        headers: {
          ...privateHeaders,
          'Set-Cookie': `${credentialCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
