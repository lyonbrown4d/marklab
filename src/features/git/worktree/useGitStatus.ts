import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import { toast } from 'sonner'
import { gitApi } from '@/services/gitApi'
import { listen } from '@/runtime/events'
import { useI18n } from '@/i18n/useI18n'
import { gitStatusQueryKey } from '@/logic/gitStatus'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

export const useGitStatus = (rootPath: string, enabled: boolean) => {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => gitStatusQueryKey(rootPath), [rootPath])
  const refresh = useGitRefreshOptions(rootPath)
  const statusQuery = useQuery({
    ...refresh,
    queryKey,
    queryFn: () => gitApi.getStatus(rootPath),
    enabled,
    staleTime: 2_000,
  })
  const invalidateStatus = useCallback(() => {
    void Promise.all(
      ['status', 'remote', 'operation'].map((namespace) =>
        queryClient.invalidateQueries({ queryKey: [`git-${namespace}`, rootPath] }),
      ),
    ).catch((error) => {
      toast.error(t('scm.statusRefreshFailed'), {
        id: 'scm-status-refresh',
        description: String(error),
      })
    })
  }, [queryClient, rootPath, t])
  const debouncedInvalidateStatus = useMemo(
    () => debounce(invalidateStatus, 250),
    [invalidateStatus],
  )
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen('fs-changed', debouncedInvalidateStatus)
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch((error) => toast.error(t('scm.statusRefreshFailed'), { description: String(error) }))
    return () => {
      disposed = true
      debouncedInvalidateStatus.cancel()
      unlisten?.()
    }
  }, [debouncedInvalidateStatus, enabled, t])
  return { statusQuery, invalidateStatus }
}
