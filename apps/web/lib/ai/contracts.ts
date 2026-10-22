import { z } from 'zod';
import { researchContextInputSchema } from './research-context-schema';

export const providerSchema = z.enum(['deepseek', 'ollama']);
export type ProviderId = z.infer<typeof providerSchema>;
export const providers = {
  deepseek: { label: 'DeepSeek API', recipient: 'api.deepseek.com', needsKey: true },
  ollama: {
    label: 'Ollama (local, optional)',
    recipient: 'Local TerraLab server',
    needsKey: false,
  },
} as const;
export const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const keySchema = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .regex(/^[\x21-\x7e]+$/);
export const selectionSchema = z.object({ provider: providerSchema, model: modelSchema });
export const contextInputSchema = z.object({
  projectId: z.string().uuid(),
  experimentId: z.string().uuid().optional(),
  localProject: z.unknown().optional(),
  editorDraft: z.unknown().optional(),
  research: researchContextInputSchema.optional(),
  view: z
    .object({
      revision: z.string().max(150),
      selected: z.array(z.string().max(100)).max(20),
      zoom: z.number().finite().min(0.2).max(12),
      pan: z.object({ x: z.number().finite(), y: z.number().finite() }),
      mode: z.enum(['2d', '3d']),
    })
    .strict()
    .optional(),
  include: z
    .object({
      canvas: z.boolean(),
      selected: z.boolean(),
      configuration: z.boolean(),
      results: z.boolean(),
    })
    .strict()
    .optional(),
});
export const chatSchema = selectionSchema
  .extend({
    context: contextInputSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(8000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type Message = z.infer<typeof chatSchema>['messages'][number];
export type StreamEvent =
  | { type: 'activity'; text: string }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

export class AIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return new AIError('invalid_request', 'Check the provider, model and request fields.');
  if (error instanceof RangeError)
    return new AIError(
      'too_large',
      'The request or provider response exceeds the size limit.',
      413,
    );
  return new AIError(
    'unavailable',
    'The AI service is unavailable. Check configuration and retry.',
    503,
  );
}
