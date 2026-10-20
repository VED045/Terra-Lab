'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="fatal">
      <h1>The workspace encountered an error</h1>
      <p>Your saved projects are kept in browser storage or Supabase.</p>
      <button onClick={reset}>Reload workspace</button>
    </main>
  );
}
