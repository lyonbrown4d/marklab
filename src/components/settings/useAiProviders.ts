import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aiApi, type AiProviderUpdate } from '@/services/aiApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isAiProviderUsable } from '@/components/settings/aiProviderUtils'

const providersKey = ['ai', 'providers'] as const

export const useAiProviders = () => {
  const queryClient = useQueryClient()
  const providersQuery = useQuery({
    queryKey: providersKey,
    queryFn: () => aiApi.listProviders(),
  })
  const saveMutation = useMutation({
    mutationFn: (input: AiProviderUpdate) => aiApi.updateProvider(input),
    onSuccess: (provider) => {
      const preferences = usePreferencesStore.getState()
      if (preferences.aiDefaultProviderId === provider.id && !isAiProviderUsable(provider)) {
        preferences.setAiDefaultProviderId(null)
      }
      if (preferences.aiCompletionProviderId === provider.id && !isAiProviderUsable(provider)) {
        preferences.setAiCompletionProviderId(null)
      }
      return queryClient.invalidateQueries({ queryKey: providersKey })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => aiApi.deleteProvider(id),
    onSuccess: (_data, id) => {
      const preferences = usePreferencesStore.getState()
      if (preferences.aiDefaultProviderId === id) preferences.setAiDefaultProviderId(null)
      if (preferences.aiCompletionProviderId === id) preferences.setAiCompletionProviderId(null)
      return queryClient.invalidateQueries({ queryKey: providersKey })
    },
  })
  const testMutation = useMutation({
    mutationFn: (id: string) => aiApi.testProvider(id),
  })

  return { providersQuery, saveMutation, deleteMutation, testMutation }
}
