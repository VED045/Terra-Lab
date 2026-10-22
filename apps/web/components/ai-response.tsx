'use client';
import React, { Fragment, useEffect, useState, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\[\]\n]+\]\([^\s)]+\))/g;
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(offset, match.index));
    const token = match[0],
      key = match.index;
    if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      const safe =
        !/[\\\u0000-\u0020]/.test(link[2]) &&
        (/^https?:\/\/[^\s]+$/i.test(link[2]) || /^\/(?!\/)[^\s]*$/.test(link[2]));
      parts.push(
        safe ? (
          <a
            key={key}
            href={link[2]}
            target={link[2].startsWith('/') ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            {link[1]}
          </a>
        ) : (
          <Fragment key={key}>{link[1]}</Fragment>
        ),
      );
    }
    offset = match.index! + token.length;
  }
  parts.push(text.slice(offset));
  return parts;
}

// A deliberately small, escaped Markdown subset. Imported HTML is always text.
export function AIResponse({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const [visible, setVisible] = useState(content.length);
  useEffect(() => {
    if (!streaming || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(content.length);
      return;
    }
    let frame: number;
    let shown = Math.min(visible, content.length);
    const tick = () => {
      shown = Math.min(
        content.length,
        shown + Math.max(2, Math.ceil((content.length - shown) / 10)),
      );
      setVisible(shown);
      if (shown < content.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Visible text is presentation only; model context and reviewed drafts use original content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, streaming]);
  const text = streaming ? content.slice(0, visible) : content;
  const lines = text.slice(0, 32000).split('\n'),
    blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i],
      key = i;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      i++;
      blocks.push(
        <figure className="ai-code-block" key={key}>
          <figcaption>{language || 'Code'}</figcaption>
          <pre>
            <code>{code.join('\n')}</code>
          </pre>
        </figure>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(<h4 key={key}>{inline(heading[2])}</h4>);
      i++;
      continue;
    }
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)\S/.test(line)) {
      const ordered = /^\s*\d/.test(line),
        items: ReactNode[] = [];
      const expression = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      let match: RegExpExecArray | null;
      while (i < lines.length && (match = expression.exec(lines[i]))) {
        items.push(<li key={i++}>{inline(match[1])}</li>);
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .slice(0, 12);
      const headers = cells(line),
        rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push(
        <div className="ai-response-table" key={key}>
          <table>
            <thead>
              <tr>
                {headers.map((cell, c) => (
                  <th key={c}>{inline(cell.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={key}>{inline(line.slice(2))}</blockquote>);
      i++;
      continue;
    }
    const paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>\s|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])
    )
      paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return (
    <div className="ai-response-body" data-streaming={streaming}>
      {blocks}
      {streaming && (
        <span
          className="ai-typing"
          aria-label={content ? 'Response streaming' : 'Waiting for provider'}
        >
          <i />
          <i />
          <i />
          <span className="sr-only">{content ? 'Response streaming' : 'Waiting for provider'}</span>
        </span>
      )}
      {!content && !streaming && <p>No completed response.</p>}
    </div>
  );
}
