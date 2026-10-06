import { AI_PROVIDER_KINDS, getAiProviderPolicy } from '@electron/services/ai/providerCatalog'
import type { AiEnvironment } from '@electron/services/ai/types'

export const readAiEnvironment = (environment: NodeJS.ProcessEnv = process.env): AiEnvironment =>
  Object.fromEntries(
    AI_PROVIDER_KINDS.map((kind) => {
      const name = getAiProviderPolicy(kind).environmentVariable
      return [kind, name ? readSecret(environment, name) : undefined]
    }),
  ) as AiEnvironment

const readSecret = (environment: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = environment[name]
  return value?.trim() ? value : undefined
}
