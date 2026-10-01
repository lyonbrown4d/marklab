import { z } from 'zod'

import { LOCAL_AI_PROVIDER_ID } from '@electron/services/ai/local/types.js'

const idSchema = z.string().min(1).max(128)

export const localAiModelRequestSchema = z.object({ modelId: idSchema }).strict()
export const localAiDownloadTaskRequestSchema = z.object({ taskId: z.string().uuid() }).strict()
export const localAiGenerationCancelSchema = z.object({ requestId: z.string().uuid() }).strict()
export const localAiDirectoryConfigSchema = z
  .object({
    enabled: z.boolean(),
    path: z.string().min(1).max(32_768).optional(),
  })
  .strict()

export const localAiGenerationInputSchema = z
  .object({
    providerId: z.literal(LOCAL_AI_PROVIDER_ID, {
      error: `providerId must be ${LOCAL_AI_PROVIDER_ID}`,
    }),
    prompt: z.string().min(1).max(100_000),
    system: z.string().max(50_000).optional(),
    maxOutputTokens: z.number().int().min(1).max(8_192).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()
