import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

import type { AiModelResolverContract, StoredAiProvider } from '@electron/services/ai/types.js'

export class VercelAiProviderResolver implements AiModelResolverContract {
  resolve(provider: StoredAiProvider, apiKey: string) {
    const common = {
      apiKey,
      ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
    }
    switch (provider.kind) {
      case 'openai':
        return createOpenAI(common)(provider.model)
      case 'anthropic':
        return createAnthropic(common)(provider.model)
      case 'google':
        return createGoogleGenerativeAI(common)(provider.model)
      case 'openai-compatible':
        return createOpenAICompatible({
          ...common,
          baseURL: provider.baseUrl!,
          name: provider.id,
        })(provider.model)
    }
  }
}
