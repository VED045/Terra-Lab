import { z } from 'zod';
import { AIError, modelSchema, type Message, type ProviderId } from './contracts';

type Connection = { key: string; signal: AbortSignal };
type ProviderMessage = Omit<Message, 'role'> & { role: 'user' | 'assistant' | 'system' };
export interface TextProvider {
  models(connection: Connection): Promise<string[]>;
  stream(
    model: string,
    messages: ProviderMessage[],
    connection: Connection,
  ): AsyncGenerator<string>;
}
function upstreamError(status: number): AIError {
  if (status === 401 || status === 403)
    return new AIError(
      'invalid_key',
      'The provider rejected your key. Replace it in Provider settings.',
      401,
    );
  if (status === 402)
    return new AIError(
      'quota',
      'Your provider balance or quota is exhausted. Check your provider account.',
      402,
    );
  if (status === 429)
    return new AIError('rate_limit', 'The provider rate limit was reached. Wait and retry.', 429);
  if (status === 404 || status === 400 || status === 422)
    return new AIError(
      'unsupported_model',
      'This model or request is unsupported. Check the connection and select an available text model.',
      422,
    );
  return new AIError(
    'provider_unavailable',
    'The provider is unavailable. Check its status and retry.',
    503,
  );
}
async function call(url: string, connection: Connection, body?: unknown): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: connection.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(connection.key ? { Authorization: `Bearer ${connection.key}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw upstreamError(response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (connection.signal.aborted)
      throw new AIError('timeout', 'The request was stopped or timed out. Retry when ready.', 504);
    throw new AIError(
      'provider_unavailable',
      'Cannot reach the provider. Check the connection and retry.',
      503,
    );
  }
}
// Both SSE and NDJSON use bounded lines; no upstream body/errors are forwarded.
export async function* lines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIError('invalid_response', 'The provider returned no response.', 502);
  const decoder = new TextDecoder();
  let buffer = '',
    size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_000_000) throw new RangeError();
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 65536) throw new RangeError();
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        yield buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function json(response: Response): Promise<unknown> {
  let text = '';
  for await (const line of lines(response)) text += line;
  return JSON.parse(text);
}
const modelList = z.object({ data: z.array(z.object({ id: modelSchema })).max(1000) });
const deepseek: TextProvider = {
  async models(connection) {
    return modelList
      .parse(await json(await call('https://api.deepseek.com/models', connection)))
      .data.map((m) => m.id);
  },
  async *stream(model, messages, connection) {
    const response = await call('https://api.deepseek.com/chat/completions', connection, {
      model,
      messages,
      stream: true,
      max_tokens: 2048,
      thinking: { type: 'disabled' },
    });
    let ended = false;
    for await (const line of lines(response)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        ended = true;
        break;
      }
      const chunk = z
        .object({
          choices: z.array(
            z.object({
              delta: z.object({ content: z.string().nullish() }),
              finish_reason: z.string().nullish(),
            }),
          ),
        })
        .parse(JSON.parse(data));
      const choice = chunk.choices[0];
      if (choice?.delta.content) yield choice.delta.content;
      if (choice?.finish_reason === 'length')
        throw new AIError(
          'output_limit',
          'The provider reached the output token limit. Ask a shorter question.',
          422,
        );
    }
    if (!ended)
      throw new AIError(
        'incomplete_response',
        'The provider stream ended early. Retry the response.',
        502,
      );
  },
};
export function ollamaBase(): string {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.TERRALAB_AI_LOCAL_DEV !== '1' ||
    process.env.TERRALAB_AI_OLLAMA_ENABLED !== '1'
  )
    throw new AIError(
      'ollama_disabled',
      'Ollama requires an explicitly enabled local TerraLab development server.',
      503,
    );
  const url = new URL(process.env.TERRALAB_AI_OLLAMA_URL || 'http://127.0.0.1:11434');
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new AIError('ollama_address', 'Set a loopback-only Ollama URL on the local server.', 503);
  return url.origin;
}
const ollama: TextProvider = {
  async models(connection) {
    const result = z
      .object({ models: z.array(z.object({ name: modelSchema })).max(1000) })
      .parse(await json(await call(ollamaBase() + '/api/tags', connection)));
    if (!result.models.length)
      throw new AIError(
        'unsupported_model',
        'No local models are installed. Install a suitable text model manually in Ollama.',
        422,
      );
    return result.models.map((m) => m.name);
  },
  async *stream(model, messages, connection) {
    const base = ollamaBase();
    const details = z
      .object({ capabilities: z.array(z.string()) })
      .parse(await json(await call(base + '/api/show', connection, { model })));
    if (!details.capabilities.includes('completion'))
      throw new AIError(
        'unsupported_model',
        'Choose an Ollama model with text completion capability.',
        422,
      );
    const response = await call(base + '/api/chat', connection, {
      model,
      messages,
      stream: true,
      options: { num_predict: 2048, num_ctx: 8192 },
    });
    let ended = false;
    for await (const line of lines(response)) {
      if (!line.trim()) continue;
      const chunk = z
        .object({
          message: z.object({ content: z.string() }).optional(),
          done: z.boolean().optional(),
          error: z.string().optional(),
        })
        .parse(JSON.parse(line));
      if (chunk.error)
        throw new AIError(
          'provider_unavailable',
          'Ollama could not complete the response. Check the local model and available memory.',
          503,
        );
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) {
        ended = true;
        break;
      }
    }
    if (!ended)
      throw new AIError(
        'incomplete_response',
        'Ollama ended the response early. Check the local server and retry.',
        502,
      );
  },
};
export const textProviders: Record<ProviderId, TextProvider> = { deepseek, ollama };
