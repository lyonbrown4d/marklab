import { isIP } from 'node:net'

import { z } from 'zod'

export const aiProviderKindSchema = z.enum(['openai', 'anthropic', 'google', 'openai-compatible'])

const isLoopbackHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1') return true
  if (isIP(host) !== 4) return false
  return host.split('.')[0] === '127'
}

export const validateProviderBaseUrl = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('baseUrl must be a valid HTTP(S) URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('baseUrl must use HTTPS or loopback HTTP')
  }
  if (url.username || url.password) throw new Error('baseUrl must not contain credentials')
  if (url.search || url.hash) throw new Error('baseUrl must not contain a query or fragment')
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new Error('Remote AI provider baseUrl must use HTTPS')
  }
  const normalized = url.toString()
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Provider id contains invalid characters')

const optionalBaseUrlSchema = z.string().max(2048).transform(validateProviderBaseUrl).optional()

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
    if (value.kind === 'openai-compatible' && !value.baseUrl) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'baseUrl is required for openai-compatible providers',
      })
    }
  })

export const providerIdRequestSchema = z.object({ id: providerIdSchema }).strict()

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
