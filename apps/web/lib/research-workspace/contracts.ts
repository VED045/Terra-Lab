import { z } from 'zod';
export const MAX_FILE = 10 * 1024 * 1024;
export const CLOUD_MAX_FILE = 4 * 1024 * 1024;
export const extractionSchema = z
  .object({
    status: z.enum(['ready', 'empty', 'failed', 'not-applicable']),
    pages: z
      .array(
        z.object({ page: z.number().int().min(1).max(10000), text: z.string().max(6000) }).strict(),
      )
      .max(40),
    truncated: z.boolean(),
    message: z.string().max(300).optional(),
  })
  .strict()
  .refine(
    (v) => v.pages.reduce((n, p) => n + p.text.length, 0) <= 60000,
    'Extracted text exceeds 60,000 characters',
  );
export const evidenceSchema = z
  .object({
    type: z.enum(['run', 'asset']),
    runId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    caption: z.string().max(400),
    snapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((e) => (e.type === 'run' ? !!e.runId : !!e.assetId));
export const documentInputSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    authors: z.string().max(300),
    source: z
      .string()
      .max(120000)
      .refine((s) => !s.includes('\0')),
    evidence: z.array(evidenceSchema).max(32),
  })
  .strict();
export type DocumentInput = z.infer<typeof documentInputSchema>;
export type ResearchDocument = DocumentInput & {
  owner_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'editor' | 'viewer';
};
export type DocumentRevision = DocumentInput & {
  version: number;
  author_id: string;
  created_at: string;
};
export const assetInputSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string().min(1).max(180),
    collection: z.string().max(80),
    mime: z.enum([
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/x-tex',
      'text/csv',
      'application/json',
      'image/png',
      'image/jpeg',
    ]),
    bytes: z.number().int().min(1).max(MAX_FILE),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    path: z.string().max(300),
    extraction: extractionSchema,
    provenance: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 20000),
  })
  .strict();
export type ResearchAsset = z.infer<typeof assetInputSchema> & {
  owner_id: string;
  created_at: string;
  updated_at: string;
  version: number;
};
export type WorkspaceIndex = {
  actor: string;
  cloud: boolean;
  documents: ResearchDocument[];
  assets: ResearchAsset[];
};
export const blankPaper = String.raw`\documentclass{article}
\usepackage{amsmath,graphicx}
\title{Terrestrial positioning study}
\author{Research team}
\begin{document}
\maketitle
\begin{abstract}
Describe the research question, method and measured findings.
\end{abstract}
\section{Introduction}
\section{Related work}
\section{Methodology}
For calibrated ranges, $r_i=\lVert x-a_i\rVert+\epsilon_i$.
\section{Experimental setup}
Record configuration, seed, trials and estimator assumptions.
\section{Results}
Attach actual saved evidence before describing findings.
\section{Discussion and limitations}
\section{Conclusion}
\begin{thebibliography}{9}
% Add only verified references.
\end{thebibliography}
\end{document}
`;
export function manuscriptFields(d: DocumentInput): DocumentInput {
  return documentInputSchema.parse({
    id: d.id,
    project_id: d.project_id,
    title: d.title,
    authors: d.authors,
    source: d.source,
    evidence: d.evidence,
  });
}
export function sameManuscript(a: DocumentInput, b: DocumentInput) {
  return JSON.stringify(manuscriptFields(a)) === JSON.stringify(manuscriptFields(b));
}
export function escapeLatex(s: string) {
  return s.replace(
    /[\\{}$&#_%~^]/g,
    (c) =>
      ({
        '\\': '\\textbackslash{}',
        '{': '\\{',
        '}': '\\}',
        $: '\\$',
        '&': '\\&',
        '#': '\\#',
        _: '\\_',
        '%': '\\%',
        '~': '\\textasciitilde{}',
        '^': '\\textasciicircum{}',
      })[c]!,
  );
}
export function evidenceLatex(e: z.infer<typeof evidenceSchema>) {
  if (e.type === 'asset') {
    const extension =
      e.snapshot?.mime === 'image/jpeg'
        ? 'jpg'
        : e.snapshot?.mime === 'application/pdf'
          ? 'pdf'
          : 'png';
    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(String(e.snapshot?.mime)))
      return `\n% TerraLab source asset ${e.assetId}\n${escapeLatex(e.caption)} (source asset \\texttt{${e.assetId}}).\n`;
    return `\n\\begin{figure}\n\\centering\n\\includegraphics[width=0.9\\linewidth]{figures/${e.assetId}.${extension}}\n\\caption{${escapeLatex(e.caption)}}\n\\label{fig:${e.assetId}}\n\\end{figure}\n% Download the evidence asset as ${e.assetId}.${extension} into the figures folder.\n`;
  }
  const rows = Array.isArray(e.snapshot?.metrics)
    ? (e.snapshot.metrics.slice(0, 20) as Record<string, unknown>[])
    : [];
  return `\n% TerraLab immutable run ${e.runId}\n\\begin{table}\n\\centering\n\\begin{tabular}{lr}\nEstimator & RMSE (m) \\\\\n${rows.map((r) => `${escapeLatex(String(r.estimator))} & ${typeof r.rmseM === 'number' ? r.rmseM.toPrecision(6) : 'Unavailable'} \\\\`).join('\n')}\n\\end{tabular}\n\\caption{${escapeLatex(e.caption)}}\n\\label{tab:${e.runId}}\n\\end{table}\n`;
}
