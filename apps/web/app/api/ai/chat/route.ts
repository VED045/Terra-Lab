import {
  guard,
  body,
  errorResponse,
  privateHeaders,
  providerKey,
  systemMessage,
  cleanMessages,
} from '../../../../lib/ai/server';
import { AIError, chatSchema, safeError, type StreamEvent } from '../../../../lib/ai/contracts';
import { readContext } from '../../../../lib/ai/context';
import { textProviders } from '../../../../lib/ai/providers';
import { streamRedactor } from '../../../../lib/ai/credentials';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const stopped = new AbortController();
  const signal = AbortSignal.any([request.signal, stopped.signal, AbortSignal.timeout(45000)]);
  try {
    const identity = await guard(request);
    const input = chatSchema.parse(await body(request));
    if (input.messages.at(-1)?.role !== 'user')
      throw new AIError('invalid_request', 'Send a user message to start a response.');
    const context = await readContext(identity, input.context); // Fresh authorization on every turn.
    const key = providerKey(request, identity, input.provider);
    const provider = textProviders[input.provider];
    const connection = { key, signal };
    const models = await provider.models(connection);
    if (!models.includes(input.model))
      throw new AIError('unsupported_model', 'Select a model returned by Check connection.', 422);
    const iterator = provider.stream(
      input.model,
      cleanMessages([systemMessage(context), ...input.messages], key),
      connection,
    );
    const first = await iterator.next(); // Report pre-stream failures as HTTP errors.
    if (first.done)
      throw new AIError(
        'empty_response',
        'The provider returned no text. Select a text model and retry.',
        502,
      );
    const encode = new TextEncoder();
    const scrub = streamRedactor(key);
    let length = 0;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: StreamEvent) =>
          controller.enqueue(encode.encode(JSON.stringify(event) + '\n'));
        const text = (value: string) => {
          length += value.length;
          if (length > 32000)
            throw new AIError(
              'output_limit',
              'Response length limit reached. Ask a shorter question.',
              422,
            );
          const clean = scrub(value);
          if (clean) emit({ type: 'text', text: clean });
        };
        try {
          emit({
            type: 'activity',
            text: 'Project access verified; minimal saved context read. No simulator actions executed.',
          });
          text(first.value);
          for await (const value of { [Symbol.asyncIterator]: () => iterator }) text(value);
          if (!length)
            throw new AIError(
              'empty_response',
              'The provider returned no text. Try another text model.',
              502,
            );
          const tail = scrub('', true);
          if (tail) emit({ type: 'text', text: tail });
          emit({ type: 'done' });
        } catch (error) {
          if (!signal.aborted) {
            const safe = safeError(error);
            emit({ type: 'error', code: safe.code, message: safe.message });
          } else if (!request.signal.aborted && !stopped.signal.aborted) {
            emit({
              type: 'error',
              code: 'timeout',
              message: 'Response timed out. Retry when ready.',
            });
          }
        } finally {
          stopped.abort();
          try {
            controller.close();
          } catch {
            /* Client disconnected. */
          }
        }
      },
      cancel() {
        stopped.abort();
        void iterator.return(undefined);
      },
    });
    return new Response(stream, {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const wasAborted = signal.aborted;
    stopped.abort();
    if (wasAborted && !(error instanceof AIError))
      return errorResponse(
        new AIError('timeout', 'Request stopped or timed out. Retry when ready.', 504),
      );
    return errorResponse(error);
  }
}
