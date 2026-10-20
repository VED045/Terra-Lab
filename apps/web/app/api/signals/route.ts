import { NextResponse } from 'next/server';
import { boundedText } from '../../../lib/request-body';
export async function POST(request: Request) {
  try {
    if (
      process.env.NODE_ENV === 'production' &&
      !request.headers.get('authorization')?.startsWith('Bearer ')
    )
      return NextResponse.json({ detail: 'Sign in to run signal experiments' }, { status: 401 });
    const text = await boundedText(request, 32000);
    const response = await fetch(
      `${process.env.SIMULATION_API_URL ?? 'http://127.0.0.1:8000'}/signals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(request.headers.get('authorization')
            ? { Authorization: request.headers.get('authorization')! }
            : {}),
        },
        body: JSON.stringify(JSON.parse(text)),
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      },
    );
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof SyntaxError
            ? 'Invalid JSON'
            : error instanceof RangeError
              ? error.message
              : 'Signal API unavailable',
      },
      { status: error instanceof SyntaxError ? 400 : error instanceof RangeError ? 413 : 503 },
    );
  }
}
