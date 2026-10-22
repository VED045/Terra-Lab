import { z } from 'zod';
export const manuscriptProposalSchema = z
  .object({
    id: z.string().uuid(),
    actor: z.string().max(100),
    projectId: z.string().uuid(),
    documentId: z.string().uuid(),
    baseVersion: z.number().int().min(1),
    text: z.string().min(1).max(8000),
    createdAt: z.number().int(),
    provider: z.string().max(100),
  })
  .strict();
export type ManuscriptProposal = z.infer<typeof manuscriptProposalSchema>;
export const proposalKey = (actor: string, projectId: string, id: string) =>
  `terralab.research.proposal.v1:${actor}:${projectId}:${id}`;
export function readManuscriptProposal(
  storage: Pick<Storage, 'getItem'>,
  actor: string,
  projectId: string,
  id: string,
  now = Date.now(),
) {
  const raw = storage.getItem(proposalKey(actor, projectId, id));
  if (!raw) return null;
  const result = manuscriptProposalSchema.safeParse(JSON.parse(raw));
  return result.success &&
    result.data.actor === actor &&
    result.data.projectId === projectId &&
    now - result.data.createdAt >= 0 &&
    now - result.data.createdAt <= 15 * 60 * 1000
    ? result.data
    : null;
}
