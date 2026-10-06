import { aiApi } from '@/services/aiApi'
import type { SourceProviderLocality } from '@/components/markdownSourceInlineCompletionTypes'

export const createSourceCompletionSessionId = () => {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto)
  return `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const resolveSourceProviderLocality = async (
  providerId: string,
): Promise<SourceProviderLocality> => {
  try {
    const provider = await aiApi.getProvider(providerId)
    return provider.available ? provider.locality : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
