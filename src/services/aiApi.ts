import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'
import { z } from 'zod'

import { listen } from '@/runtime/events'
import { invoke } from '@/runtime/ipc'

export const aiProviderKindSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'ollama',
  'openai-compatible',
])

export const publicAiProviderSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: aiProviderKindSchema,
    model: z.string(),
    locality: z.enum(['local', 'remote']),
    available: z.boolean(),
    requiresApiKey: z.boolean(),
    baseUrl: z.string().optional(),
    hasApiKey: z.boolean(),
    apiKeySource: z.enum(['stored', 'environment', 'none']),
    configurationSource: z.literal('environment').optional(),
    maskedApiKey: z.literal('••••••••').nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict() satisfies z.ZodType<PublicAiProvider>

export const aiProviderUpdateSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    kind: aiProviderKindSchema,
    model: z.string().min(1).max(160),
    baseUrl: z.string().max(2048).nullish(),
    apiKey: z.string().max(8192).nullable().optional(),
  })
  .strict() satisfies z.ZodType<AiProviderUpdate>

export const aiGenerateTextRequestSchema = z
  .object({
    providerId: z.string().min(1).max(64),
    prompt: z.string().min(1).max(100_000),
    system: z.string().max(50_000).nullish(),
    maxOutputTokens: z.number().int().min(1).max(32_768).nullish(),
    temperature: z.number().min(0).max(2).nullish(),
  })
  .strict() satisfies z.ZodType<AiGenerateTextRequest>

export const aiGenerateTextResultSchema = z
  .object({
    text: z.string(),
    finishReason: z.string(),
    usage: z.object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    }),
    warnings: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<AiGenerateTextResult>

const tokenUsageSchema = z
  .object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  })
  .strict()

export const aiGenerationEventSchema = z.discriminatedUnion('type', [
  z.object({ requestId: z.string(), type: z.literal('delta'), delta: z.string() }).strict(),
  z
    .object({
      requestId: z.string(),
      type: z.literal('finish'),
      finishReason: z.string(),
      usage: tokenUsageSchema,
      warnings: z.array(z.string()),
    })
    .strict(),
  z.object({ requestId: z.string(), type: z.literal('error'), message: z.string() }).strict(),
  z.object({ requestId: z.string(), type: z.literal('cancelled') }).strict(),
]) satisfies z.ZodType<AiGenerationEvent>

export type PublicAiProvider = DesktopCommandResults['ai_get_provider']
export type AiProviderUpdate = DesktopCommandArgs['ai_update_provider']['request']
export type AiGenerateTextRequest = DesktopCommandArgs['ai_generate_text']['request']
export type AiGenerateTextResult = DesktopCommandResults['ai_generate_text']
export type AiGenerationEvent = DesktopEventPayloads['ai-generation-event']

export const aiApi = {
  async listProviders(): Promise<PublicAiProvider[]> {
    return z.array(publicAiProviderSchema).parse(await invoke('ai_list_providers'))
  },
  async getProvider(id: string): Promise<PublicAiProvider> {
    return publicAiProviderSchema.parse(await invoke('ai_get_provider', { id }))
  },
  async updateProvider(input: AiProviderUpdate): Promise<PublicAiProvider> {
    const parsed = aiProviderUpdateSchema.parse(input)
    return publicAiProviderSchema.parse(await invoke('ai_update_provider', parsed))
  },
  async deleteProvider(id: string): Promise<void> {
    const result = await invoke('ai_delete_provider', { id })
    z.object({ ok: z.literal(true) }).parse(result)
  },
  async testProvider(id: string): Promise<boolean> {
    const result = await invoke('ai_test_provider', { id })
    return z.object({ ok: z.literal(true) }).parse(result).ok
  },
  async generateText(input: AiGenerateTextRequest): Promise<AiGenerateTextResult> {
    const parsed = aiGenerateTextRequestSchema.parse(input)
    return aiGenerateTextResultSchema.parse(await invoke('ai_generate_text', parsed))
  },
  async startGeneration(
    input: AiGenerateTextRequest,
  ): Promise<DesktopCommandResults['ai_start_generation']> {
    const parsed = aiGenerateTextRequestSchema.parse(input)
    return z
      .object({ requestId: z.string().min(1) })
      .strict()
      .parse(await invoke('ai_start_generation', parsed))
  },
  async cancelGeneration(requestId: string): Promise<void> {
    const result = await invoke('ai_cancel_generation', { requestId })
    z.object({ ok: z.literal(true) })
      .strict()
      .parse(result)
  },
  onGenerationEvent(handler: (event: AiGenerationEvent) => void) {
    return listen('ai-generation-event', (event) => {
      handler(aiGenerationEventSchema.parse(event.payload))
    })
  },
}
