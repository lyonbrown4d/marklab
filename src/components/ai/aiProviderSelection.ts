import type { PublicAiProvider } from '@/services/aiApi'

export type InlineAiProvider = {
  id: string
  label: string
}

const isLoopbackProvider = (provider: PublicAiProvider) => {
  if (provider.kind !== 'openai-compatible' || !provider.baseUrl) return false
  try {
    const url = new URL(provider.baseUrl)
    return (
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

const isUsableProvider = (provider: PublicAiProvider) =>
  provider.hasApiKey || isLoopbackProvider(provider)

const toInlineProvider = (provider: PublicAiProvider): InlineAiProvider => ({
  id: provider.id,
  label: `${provider.label} · ${provider.model}`,
})

export const resolveInlineAiProvider = (
  defaultProviderId: string | null,
  providers: PublicAiProvider[],
): InlineAiProvider | null => {
  if (defaultProviderId !== null) {
    const explicitProvider = providers.find(
      (provider) => provider.id === defaultProviderId && isUsableProvider(provider),
    )
    return explicitProvider ? toInlineProvider(explicitProvider) : null
  }

  const firstConfigured = providers.find(isUsableProvider)
  return firstConfigured ? toInlineProvider(firstConfigured) : null
}
