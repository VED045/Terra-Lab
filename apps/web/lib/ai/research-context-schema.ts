import { z } from 'zod';
export const researchContextInputSchema = z
  .object({
    documentId: z.string().uuid().optional(),
    assetIds: z.array(z.string().uuid()).max(2),
    includeDocument: z.boolean(),
    includeFiles: z.boolean(),
    localDocument: z
      .object({
        id: z.string().uuid(),
        project_id: z.string().uuid(),
        version: z.number().int().min(1),
        title: z.string().max(160),
        source: z.string().max(6000),
      })
      .strict()
      .optional(),
    localAssets: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            project_id: z.string().uuid(),
            name: z.string().max(180),
            mime: z.string().max(100),
            extraction: z.object({
              status: z.string().max(30),
              pages: z
                .array(z.object({ page: z.number().int().positive(), text: z.string().max(1500) }))
                .max(2),
            }),
            provenance: z
              .record(z.string(), z.unknown())
              .refine((v) => JSON.stringify(v).length <= 3000),
          })
          .strict(),
      )
      .max(2)
      .optional(),
  })
  .strict();
