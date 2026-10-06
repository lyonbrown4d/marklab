import type { PublicAiProvider } from '@/services/aiApi'

export type InlineAiProvider = {
  id: string
  label: string
}

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
      (provider) => provider.id === defaultProviderId && provider.available,
    )
    return explicitProvider ? toInlineProvider(explicitProvider) : null
  }

  const firstConfigured = providers.find((provider) => provider.available)
  return firstConfigured ? toInlineProvider(firstConfigured) : null
}
