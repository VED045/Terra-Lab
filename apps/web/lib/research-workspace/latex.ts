import katex from 'katex';
export function latexPreview(source: string) {
  if (source.length > 120000) throw Error('Source exceeds 120,000 characters.');
  const blocks: {
    kind: 'text' | 'math' | 'heading';
    text: string;
    html?: string;
    line: number;
    error?: string;
  }[] = [];
  const pattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\))/g;
  let offset = 0,
    count = 0;
  const text = (value: string, start: number) => {
    const section = /\\(?:section|subsection|title|author)\{([^{}\n]{1,300})\}/g;
    let last = 0;
    const paragraph = (t: string, at: number) => {
      const clean = t
        .replace(/^\s*\\(?:documentclass|usepackage)(?:\[[^\]\n]*\])?\{[^}\n]*\}\s*$/gm, '')
        .replace(/\\(?:begin|end)\{(?:document|abstract|thebibliography)\}(?:\{[^}]*\})?/g, '')
        .replace(/\\maketitle/g, '');
      if (clean.trim())
        blocks.push({ kind: 'text', text: clean, line: source.slice(0, at).split('\n').length });
    };
    for (const h of value.matchAll(section)) {
      paragraph(value.slice(last, h.index), start + last);
      blocks.push({
        kind: 'heading',
        text: h[1],
        line: source.slice(0, start + h.index!).split('\n').length,
      });
      last = h.index! + h[0].length;
    }
    paragraph(value.slice(last), start + last);
  };
  for (const match of source.matchAll(pattern)) {
    if (++count > 150) {
      text(source.slice(offset), offset);
      blocks.push({
        kind: 'text',
        text: '',
        line: 1,
        error: 'Math preview limited to 150 expressions.',
      });
      offset = source.length;
      break;
    }
    const start = match.index!;
    text(source.slice(offset, start), offset);
    const raw = match[0],
      display = raw.startsWith('$$') || raw.startsWith('\\['),
      cut = raw.startsWith('$') && !display ? 1 : 2,
      expression = raw.slice(cut, -cut);
    const line = source.slice(0, start).split('\n').length;
    try {
      if (expression.length > 3000) throw Error('Expression exceeds 3,000 characters.');
      if (/\\(?:href|url|includegraphics|html\w*)\b/.test(expression))
        throw Error('Links and external content are not supported in math preview.');
      blocks.push({
        kind: 'math',
        text: raw,
        line,
        html: katex.renderToString(expression, {
          displayMode: display,
          throwOnError: true,
          trust: false,
          strict: 'error',
          maxExpand: 500,
          maxSize: 30,
          output: 'htmlAndMathml',
        }),
      });
    } catch (e) {
      blocks.push({
        kind: 'math',
        text: raw,
        line,
        error: String((e as Error).message).slice(0, 350),
      });
    }
    offset = start + raw.length;
  }
  text(source.slice(offset), offset);
  const unsafe = /\\(?:write18|input|include|openout|read|usepackage|documentclass)\b/.test(source);
  return {
    blocks,
    notice: unsafe
      ? 'Preamble, file and package commands remain source text. No compiler or shell is executed.'
      : 'Math preview only; source text and section commands are preserved. This is not a full LaTeX compiler.',
  };
}
