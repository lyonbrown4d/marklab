import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { AiService } from '@electron/services/ai/aiService'
import { AiInlineCompletionPolicy } from '@electron/services/ai/completion/policy'
import { AiInlineCompletionService } from '@electron/services/ai/completion/service'
import { AiProviderStore } from '@electron/services/ai/providerStore'
import { VercelAiProviderResolver } from '@electron/services/ai/providerResolver'

export const aiModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.aiProviderStore)
    .toResolvedValue(
      (database, safeStorage) => new AiProviderStore(database, safeStorage),
      [TOKENS.localDatabaseService, TOKENS.safeStorage],
    )
    .inSingletonScope()
  bind(TOKENS.aiModelResolver)
    .toResolvedValue(() => new VercelAiProviderResolver(), [])
    .inSingletonScope()
  bind(TOKENS.aiService)
    .toResolvedValue(
      (resolver, store) => new AiService({ resolver, store }),
      [TOKENS.aiModelResolver, TOKENS.aiProviderStore],
    )
    .inSingletonScope()
  bind(TOKENS.aiInlineCompletionPolicy)
    .toResolvedValue(
      (providerStore) => new AiInlineCompletionPolicy({ providerStore }),
      [TOKENS.aiProviderStore],
    )
    .inSingletonScope()
  bind(TOKENS.aiInlineCompletionService)
    .toResolvedValue(
      (policy, aiService) => new AiInlineCompletionService({ aiService, policy }),
      [TOKENS.aiInlineCompletionPolicy, TOKENS.aiService],
    )
    .inSingletonScope()
})
