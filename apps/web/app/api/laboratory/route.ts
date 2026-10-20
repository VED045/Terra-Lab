import { NextResponse } from 'next/server';
import { z } from 'zod';
import { projectSchema, labConfigSchema } from '@terralab/shared';
import { boundedText } from '../../../lib/request-body';
const schema = z.object({ project: projectSchema, config: labConfigSchema });
async function proxy(request: Request) {
  try {
    if (
      process.env.NODE_ENV === 'production' &&
      !request.headers.get('authorization')?.startsWith('Bearer ')
    )
      return NextResponse.json({ detail: 'Sign in to run cloud experiments' }, { status: 401 });
    const query = new URL(request.url).searchParams;
    const identity =
      request.method === 'POST' ? '' : `/${z.string().uuid().parse(query.get('id'))}`;
    let body: string | undefined;
    if (request.method === 'POST') {
      const text = await boundedText(request, 2_000_000);
      if (text.length > 2_000_000)
        return NextResponse.json({ detail: 'Experiment request exceeds 2 MB' }, { status: 413 });
      body = JSON.stringify(schema.parse(JSON.parse(text)));
    }
    const response = await fetch(
      `${process.env.SIMULATION_API_URL ?? 'http://127.0.0.1:8000'}/experiments${identity}${query.get('detail') === 'true' ? '?detail=true' : ''}`,
      {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          ...(request.headers.get('authorization')
            ? { Authorization: request.headers.get('authorization')! }
            : {}),
          ...(request.headers.get('idempotency-key')
            ? { 'Idempotency-Key': request.headers.get('idempotency-key')! }
            : {}),
        },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      },
    );
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    if (error instanceof RangeError)
      return NextResponse.json({ detail: error.message }, { status: 413 });
    if (error instanceof z.ZodError)
      return NextResponse.json({ detail: error.issues[0].message }, { status: 422 });
    if (error instanceof SyntaxError)
      return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 });
    return NextResponse.json(
      { detail: 'Scientific API unavailable. Start npm run dev:api, then retry.' },
      { status: 503 },
    );
  }
}
export const POST = proxy;
export const GET = proxy;
export const DELETE = proxy;
