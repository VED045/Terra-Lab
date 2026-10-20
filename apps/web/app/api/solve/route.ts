import { NextResponse } from 'next/server';
import { z } from 'zod';
const requestSchema = z.object({
  type: z.literal('calibrated_range'),
  units: z.literal('m'),
  time: z.number().finite().nonnegative(),
  measurements: z
    .array(
      z.object({
        anchorId: z.string(),
        anchor: z.object({ x: z.number().finite(), y: z.number().finite() }),
        range: z.number().finite().nonnegative(),
        truth: z.number().finite().nonnegative(),
        blocked: z.boolean(),
        sigma: z.number().finite().nonnegative(),
      }),
    )
    .min(3)
    .max(500),
});
export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 200000) return NextResponse.json({ detail: 'Request too large' }, { status: 413 });
    const payload = requestSchema.parse(await request.json());
    const response = await fetch(
      `${process.env.SIMULATION_API_URL ?? 'http://127.0.0.1:8000'}/solve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    if (e instanceof SyntaxError)
      return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ detail: e.issues[0].message }, { status: 422 });
    return NextResponse.json(
      {
        detail:
          'Python service unavailable. Start the API or choose Browser QR in simulation settings.',
      },
      { status: 503 },
    );
  }
}
