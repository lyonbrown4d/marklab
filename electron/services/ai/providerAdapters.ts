import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import type { AiProviderConfig, AiProviderKind } from '@electron/services/ai/providerCatalog'

export type AiProviderAdapter = Readonly<{
  kind: AiProviderKind
  createModel: (provider: AiProviderConfig, apiKey: string) => LanguageModel
}>

const adapter = (
  kind: AiProviderKind,
  createModel: AiProviderAdapter['createModel'],
): AiProviderAdapter => Object.freeze({ kind, createModel })

const adapters = new Map<AiProviderKind, AiProviderAdapter>([
  ['openai', adapter('openai', (provider, apiKey) => createOpenAI({ apiKey })(provider.model))],
  [
    'anthropic',
    adapter('anthropic', (provider, apiKey) => createAnthropic({ apiKey })(provider.model)),
  ],
  [
    'google',
    adapter('google', (provider, apiKey) => createGoogleGenerativeAI({ apiKey })(provider.model)),
  ],
  [
    'openai-compatible',
    adapter('openai-compatible', (provider, apiKey) =>
      createOpenAICompatible({
        apiKey,
        baseURL: provider.baseUrl!,
        name: provider.id,
      })(provider.model),
    ),
  ],
])

export const getAiProviderAdapter = (kind: AiProviderKind): AiProviderAdapter => {
  const providerAdapter = adapters.get(kind)
  if (!providerAdapter) throw new Error(`Unsupported AI provider kind: ${kind}`)
  return providerAdapter
}
