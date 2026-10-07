import { useQuery } from '@tanstack/react-query'
import { aiApi } from '@/services/aiApi'

export const aiProvidersQueryKey = ['ai', 'providers'] as const

export const useAiProvidersQuery = (enabled = true) =>
  useQuery({ queryKey: aiProvidersQueryKey, queryFn: () => aiApi.listProviders(), enabled })
