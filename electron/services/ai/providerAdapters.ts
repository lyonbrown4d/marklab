import type { LanguageModel } from 'ai'

import type { AiProviderConfig, AiProviderKind } from '@electron/services/ai/providerCatalog'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export type AiProviderAdapter = Readonly<{
  kind: AiProviderKind
  createModel: (provider: AiProviderConfig, apiKey: string) => Promise<LanguageModel>
}>

const adapter = (
  kind: AiProviderKind,
  createModel: AiProviderAdapter['createModel'],
): AiProviderAdapter => Object.freeze({ kind, createModel })

const lazyModelCreator = (
  load: () => Promise<(provider: AiProviderConfig, apiKey: string) => LanguageModel>,
): AiProviderAdapter['createModel'] => {
  let pending: ReturnType<typeof load> | undefined
  return async (provider, apiKey) => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return (await pending)(provider, apiKey)
  }
}

const compatibleModel = lazyModelCreator(async () => {
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
  return (provider, apiKey) =>
    createOpenAICompatible({
      apiKey,
      baseURL: provider.kind === 'deepseek' ? DEEPSEEK_BASE_URL : provider.baseUrl!,
      name: provider.id,
    })(provider.model)
})

const adapters = new Map<AiProviderKind, AiProviderAdapter>([
  [
    'openai',
    adapter(
      'openai',
      lazyModelCreator(async () => {
        const { createOpenAI } = await import('@ai-sdk/openai')
        return (provider, apiKey) => createOpenAI({ apiKey })(provider.model)
      }),
    ),
  ],
  [
    'anthropic',
    adapter(
      'anthropic',
      lazyModelCreator(async () => {
        const { createAnthropic } = await import('@ai-sdk/anthropic')
        return (provider, apiKey) => createAnthropic({ apiKey })(provider.model)
      }),
    ),
  ],
  [
    'google',
    adapter(
      'google',
      lazyModelCreator(async () => {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
        return (provider, apiKey) => createGoogleGenerativeAI({ apiKey })(provider.model)
      }),
    ),
  ],
  ['deepseek', adapter('deepseek', compatibleModel)],
  ['ollama', adapter('ollama', compatibleModel)],
  ['openai-compatible', adapter('openai-compatible', compatibleModel)],
])

export const getAiProviderAdapter = (kind: AiProviderKind): AiProviderAdapter => {
  const providerAdapter = adapters.get(kind)
  if (!providerAdapter) throw new Error(`Unsupported AI provider kind: ${kind}`)
  return providerAdapter
}
