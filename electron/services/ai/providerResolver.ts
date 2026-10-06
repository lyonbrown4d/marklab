import { getAiProviderAdapter } from '@electron/services/ai/providerAdapters'
import type { AiModelResolverContract, StoredAiProvider } from '@electron/services/ai/types'

export class VercelAiProviderResolver implements AiModelResolverContract {
  resolve(provider: StoredAiProvider, apiKey: string) {
    return getAiProviderAdapter(provider.kind).createModel(provider, apiKey)
  }
}
