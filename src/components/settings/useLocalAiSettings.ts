import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { aiApi } from '@/services/aiApi'
import type { LocalModelProgress } from '@/components/settings/aiSettingsTypes'
import {
  MARKLAB_LOCAL_PROVIDER_ID,
  type LocalAiStatus,
} from '@/components/settings/aiSettingsTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const localStatusKey = ['ai', 'local-status'] as const
const migrationStateRank = { copying: 0, verifying: 1, switching: 2, completed: 3, error: 3 }

const syncDirectoryPreferences = (status: LocalAiStatus) => {
  const preferences = usePreferencesStore.getState()
  preferences.setAiCustomModelDirectoryEnabled(status.customModelDirectoryEnabled)
  if (status.customModelDirectoryEnabled) preferences.setAiModelDirectory(status.modelDirectory)
}

export const useLocalAiSettings = () => {
  const queryClient = useQueryClient()
  const [progressByModel, setProgressByModel] = useState<Record<string, LocalModelProgress>>({})
  const statusQuery = useQuery({
    queryKey: localStatusKey,
    queryFn: () => aiApi.localStatus(),
  })

  useEffect(() => {
    const status = statusQuery.data
    if (!status || status.migration) return
    syncDirectoryPreferences(status)
  }, [statusQuery.data])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void aiApi
      .onLocalModelProgress((progress) => {
        setProgressByModel((current) => ({ ...current, [progress.modelId]: progress }))
        if (progress.state === 'completed') {
          void queryClient.invalidateQueries({ queryKey: localStatusKey })
        }
      })
      .then((resolvedUnsubscribe) => {
        if (disposed) {
          resolvedUnsubscribe()
          return
        }
        unsubscribe = resolvedUnsubscribe
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [queryClient])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void aiApi
      .onLocalModelDirectoryProgress((migration) => {
        let accepted = true
        queryClient.setQueryData<LocalAiStatus>(localStatusKey, (current) =>
          current
            ? (() => {
                const previous = current.migration
                const previousActive =
                  previous && ['copying', 'verifying', 'switching'].includes(previous.state)
                const staleDifferentMigration =
                  previousActive && previous.migrationId !== migration.migrationId
                const staleSameMigration =
                  previous?.migrationId === migration.migrationId &&
                  (migrationStateRank[previous.state] > migrationStateRank[migration.state] ||
                    (previous.state === migration.state && previous.percent > migration.percent))
                if (staleDifferentMigration || staleSameMigration) {
                  accepted = false
                  return current
                }
                return { ...current, migration }
              })()
            : current,
        )
        if (accepted && migration.state === 'completed') {
          void aiApi
            .localStatus()
            .then((status) => {
              if (disposed) return
              const currentMigration =
                queryClient.getQueryData<LocalAiStatus>(localStatusKey)?.migration
              if (currentMigration?.migrationId !== migration.migrationId) return
              if (status.migration && status.migration.migrationId !== migration.migrationId) return
              syncDirectoryPreferences(status)
              queryClient.setQueryData(localStatusKey, { ...status, migration })
            })
            .catch(() => undefined)
        }
      })
      .then((resolvedUnsubscribe) => {
        if (disposed) {
          resolvedUnsubscribe()
          return
        }
        unsubscribe = resolvedUnsubscribe
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [queryClient])

  const selectDirectoryMutation = useMutation({
    mutationFn: () => aiApi.selectLocalModelDirectory(),
  })
  const setDirectoryMutation = useMutation({
    mutationFn: (input: { enabled: boolean; path?: string }) => aiApi.setLocalModelDirectory(input),
    onSuccess: (status) => queryClient.setQueryData(localStatusKey, status),
  })

  const downloadMutation = useMutation({
    mutationFn: (modelId: string) => aiApi.downloadLocalModel(modelId),
    onSuccess: ({ taskId }, modelId) => {
      setProgressByModel((current) => {
        if (current[modelId]?.taskId === taskId) return current
        return {
          ...current,
          [modelId]: {
            taskId,
            modelId,
            state: 'queued',
            downloadedBytes: 0,
            totalBytes: 0,
            percent: 0,
          },
        }
      })
    },
  })
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) => aiApi.cancelLocalModelDownload(taskId),
  })
  const deleteMutation = useMutation({
    mutationFn: (modelId: string) => aiApi.deleteLocalModel(modelId),
    onSuccess: (_data, modelId) => {
      const status = queryClient.getQueryData<LocalAiStatus>(localStatusKey)
      const removesActiveModel = status?.activeModelId === modelId
      const hasAnotherInstalledModel = status?.models.some(
        (model) => model.id !== modelId && model.installed,
      )
      const preferences = usePreferencesStore.getState()
      if (
        preferences.aiDefaultProviderId === MARKLAB_LOCAL_PROVIDER_ID &&
        (removesActiveModel || !hasAnotherInstalledModel)
      ) {
        preferences.setAiDefaultProviderId(null)
      }
      return queryClient.invalidateQueries({ queryKey: localStatusKey })
    },
  })
  const activateMutation = useMutation({
    mutationFn: (modelId: string) => aiApi.setActiveLocalModel(modelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: localStatusKey }),
  })

  return {
    statusQuery,
    progressByModel,
    downloadMutation,
    cancelMutation,
    deleteMutation,
    activateMutation,
    selectDirectoryMutation,
    setDirectoryMutation,
  }
}
