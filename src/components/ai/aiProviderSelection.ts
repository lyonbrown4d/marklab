import type { PublicAiProvider } from '@/services/aiApi'

export type InlineAiProvider = {
  id: string
  locality: PublicAiProvider['locality']
  label: string
}

export const toInlineAiProvider = (provider: PublicAiProvider): InlineAiProvider => ({
  id: provider.id,
  locality: provider.locality,
  label: `${provider.label} · ${provider.model}`,
})

export const listInlineAiProviders = (providers: PublicAiProvider[]) =>
  providers.filter((provider) => provider.available).map(toInlineAiProvider)

export const resolveInlineAiProvider = (
  defaultProviderId: string | null,
  providers: PublicAiProvider[],
): InlineAiProvider | null => {
  if (defaultProviderId !== null) {
    const explicitProvider = providers.find(
      (provider) => provider.id === defaultProviderId && provider.available,
    )
    return explicitProvider ? toInlineAiProvider(explicitProvider) : null
  }

  const firstConfigured = providers.find((provider) => provider.available)
  return firstConfigured ? toInlineAiProvider(firstConfigured) : null
}
