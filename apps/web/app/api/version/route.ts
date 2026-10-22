// Public build metadata only. Values are fixed when Next loads/builds the application.
export function GET() {
  return Response.json(
    {
      commit: process.env.NEXT_PUBLIC_TERRALAB_REVISION ?? 'unknown',
      mode: process.env.NODE_ENV,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
