import { z } from 'zod'

import { getAiProviderPolicy } from '@electron/services/ai/providerCatalog'
import type { AiProviderStoreContract } from '@electron/services/ai/types'
import { getRendererPersistValue } from '@electron/services/settingsStore'

export type AiInlineCompletionPolicyContract = {
  assertProviderAllowed: (providerId: string) => Promise<void>
}

type AiInlineCompletionPolicyOptions = {
  providerStore: AiProviderStoreContract
  readCloudContextConsent?: () => boolean
}

const preferencesSchema = z
  .object({
    state: z.object({ aiCompletionCloudContextConsent: z.boolean().optional() }).loose(),
  })
  .loose()

export class AiInlineCompletionPolicy implements AiInlineCompletionPolicyContract {
  private readonly readCloudContextConsent: () => boolean

  constructor(private readonly options: AiInlineCompletionPolicyOptions) {
    this.readCloudContextConsent = options.readCloudContextConsent ?? readPersistedCloudConsent
  }

  async assertProviderAllowed(providerId: string): Promise<void> {
    const provider = await this.options.providerStore.get(providerId)
    if (!provider) throw new Error('AI provider was not found')
    if (getAiProviderPolicy(provider.kind).getLocality(provider) === 'local') {
      return
    }
    if (!this.readCloudContextConsent()) {
      throw new Error('Cloud AI inline completion requires explicit context consent')
    }
  }
}

const readPersistedCloudConsent = (): boolean => {
  const parsed = preferencesSchema.safeParse(getRendererPersistValue('marklab.preferences'))
  return parsed.success && parsed.data.state.aiCompletionCloudContextConsent === true
}
