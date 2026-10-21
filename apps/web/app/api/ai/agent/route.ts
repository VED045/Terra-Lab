import { guard, body, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { agentRequestSchema, type AgentEvent } from '../../../../lib/ai/agent-contracts';
import { runAgent } from '../../../../lib/ai/agent';
import { safeError } from '../../../../lib/ai/contracts';
import { toolRateLimit } from '../../../../lib/ai/tools';
import { admitInference } from '../../../../lib/ai/admission';
import { inferenceBudget } from '../../../../lib/ai/providers';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const stopped = new AbortController();
  let release = () => {};
  try {
    const identity = await guard(request);
    toolRateLimit(identity.userId);
    const input = agentRequestSchema.parse(await body(request));
    release = admitInference(identity.userId, inferenceBudget(input.provider));
    const scoped = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      signal: AbortSignal.any([request.signal, stopped.signal]),
    });
    const iterator = runAgent(scoped, input);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: AgentEvent) =>
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        try {
          for await (const event of iterator) emit(event);
        } catch (error) {
          if (!stopped.signal.aborted && !request.signal.aborted) {
            const safe = safeError(error);
            emit({ type: 'error', code: safe.code, message: safe.message });
          }
        } finally {
          release();
          stopped.abort();
          try {
            controller.close();
          } catch {
            /* Disconnected. */
          }
        }
      },
      cancel() {
        release();
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
    release();
    stopped.abort();
    return errorResponse(error);
  }
}
