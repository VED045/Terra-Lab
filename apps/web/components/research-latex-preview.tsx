'use client';
import { useMemo } from 'react';
import { latexPreview } from '@/lib/research-workspace/latex';
export function ResearchLatexPreview({ source }: { source: string }) {
  const preview = useMemo(() => latexPreview(source), [source]);
  return (
    <section className="manuscript-preview" aria-label="LaTeX math preview">
      <p className="research-limit">{preview.notice}</p>
      {preview.blocks.map((block, i) =>
        block.error ? (
          <div className="research-diagnostic" role="note" key={i}>
            <strong>Line {block.line}</strong>: {block.error}
            <pre>{block.text}</pre>
          </div>
        ) : block.kind === 'heading' ? (
          <h3 key={i}>{block.text}</h3>
        ) : block.html ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
        ) : (
          <pre key={i}>{block.text}</pre>
        ),
      )}
    </section>
  );
}
