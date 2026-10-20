import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  try {
    if (
      process.env.NODE_ENV === 'production' &&
      !request.headers.get('authorization')?.startsWith('Bearer ')
    )
      return NextResponse.json({ detail: 'Sign in to export a PDF report' }, { status: 401 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ detail: 'JSON body required' }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        return NextResponse.json(
          { detail: 'Report exceeds 2 MB; reduce network size' },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.length;
    }
    const response = await fetch(
      `${process.env.SIMULATION_API_URL ?? 'http://127.0.0.1:8000'}/reports/pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(request.headers.get('authorization')
            ? { Authorization: request.headers.get('authorization')! }
            : {}),
        },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      },
    );
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
        'Content-Disposition': response.ok
          ? 'attachment; filename="terralab-report.pdf"'
          : 'inline',
      },
    });
  } catch {
    return NextResponse.json(
      { detail: 'PDF API unavailable. Start or configure the Python backend.' },
      { status: 503 },
    );
  }
}
