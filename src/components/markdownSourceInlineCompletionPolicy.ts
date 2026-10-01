import { isAiProviderUsable, isLoopbackHttpUrl } from '@/components/settings/aiProviderUtils'
import { aiApi } from '@/services/aiApi'
import type { SourceProviderLocality } from '@/components/markdownSourceInlineCompletionTypes'

const MARKLAB_LOCAL_PROVIDER_ID = 'marklab-local'

export const createSourceCompletionSessionId = () => {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto)
  return `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const resolveSourceProviderLocality = async (
  providerId: string,
): Promise<SourceProviderLocality> => {
  if (providerId === MARKLAB_LOCAL_PROVIDER_ID) return 'local'
  try {
    const provider = await aiApi.getProvider(providerId)
    if (!isAiProviderUsable(provider)) return 'unavailable'
    return provider.kind === 'openai-compatible' && isLoopbackHttpUrl(provider.baseUrl)
      ? 'local'
      : 'remote'
  } catch {
    return 'unavailable'
  }
}
