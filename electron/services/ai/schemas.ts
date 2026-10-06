import { z } from 'zod'

import {
  AI_PROVIDER_KINDS,
  getProviderBaseUrlIssue,
  normalizeProviderBaseUrl,
} from '@electron/services/ai/providerCatalog'

export const aiProviderKindSchema = z.enum(AI_PROVIDER_KINDS)

const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Provider id contains invalid characters')

const optionalBaseUrlSchema = z.string().max(2048).transform(normalizeProviderBaseUrl).optional()

export const providerMetadataSchema = z
  .object({
    id: providerIdSchema,
    label: z.string().trim().min(1).max(80),
    kind: aiProviderKindSchema,
    model: z.string().trim().min(1).max(160),
    baseUrl: optionalBaseUrlSchema,
  })
  .strict()

export const providerUpdateSchema = providerMetadataSchema
  .extend({
    apiKey: z
      .string()
      .max(8192)
      .refine((value) => value.trim().length > 0, 'API key cannot be empty')
      .nullable()
      .optional(),
  })
  .superRefine((value, context) => {
    const issue = getProviderBaseUrlIssue(value.kind, value.baseUrl)
    if (issue) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: issue,
      })
    }
  })

export const providerIdRequestSchema = z.object({ id: providerIdSchema }).strict()
export const generationCancelSchema = z.object({ requestId: z.uuid() }).strict()

export const generateTextRequestSchema = z
  .object({
    providerId: providerIdSchema,
    prompt: z.string().min(1).max(100_000),
    system: z.string().max(50_000).optional(),
    maxOutputTokens: z.number().int().min(1).max(32_768).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()

export type AiProviderUpdate = z.infer<typeof providerUpdateSchema>
export type AiGenerateTextRequest = z.infer<typeof generateTextRequestSchema>
