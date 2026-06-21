import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLatest, useUnmount } from 'ahooks'
import { produce } from 'immer'
import { fsApi, fsBufferStatusSchema } from '@/services/fsApi'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import { toast } from 'sonner'
import { useEditorBufferState, type SaveState } from '@/app/useEditorBufferState'

export type { SaveState } from '@/app/useEditorBufferState'

const BUFFER_SYNC_DEBOUNCE_MS = 800
const BUFFER_ERROR_TOAST_ID_PREFIX = 'editor-buffer-error'

type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
}

export const useEditorBuffer = ({ activePath, workspaceKey }: UseEditorBufferArgs) => {
  const { t } = useI18n()
  const {
    dirtyPaths,
    fileContents,
    loadingPaths,
    saveStates,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
  } = useEditorBufferState(workspaceKey)
  const editorValue = useMemo(
    () => (activePath ? (fileContents[activePath] ?? '') : ''),
    [activePath, fileContents],
  )

  const fileContentsRef = useLatest(fileContents)
  const dirtyPathsRef = useLatest(dirtyPaths)
  const activePathRef = useLatest(activePath)
  const workspaceKeyRef = useLatest(workspaceKey)
  const syncTimers = useRef<Record<string, number>>({})
  const syncedContentsRef = useRef<Record<string, string>>({})
  const changeVersionRef = useRef<Record<string, number>>({})
  const revisionVersionRef = useRef<Record<string, Record<number, number>>>({})
  const revisionContentRef = useRef<Record<string, Record<number, string>>>({})
  const loadToken = useRef(0)

  const markPathClean = useCallback(
    (workspace: string, path: string, content: string) => {
      syncedContentsRef.current[path] = content
      setWorkspaceDirtyPaths((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceDirty = draft[workspace]
          if (!currentWorkspaceDirty?.[path]) return
          delete currentWorkspaceDirty[path]
        }),
      )
      setPathSaveState(workspace, path, { status: 'saved' })
    },
    [setPathSaveState, setWorkspaceDirtyPaths],
  )

  const markPathDirty = useCallback(
    (workspace: string, path: string, nextState: SaveState) => {
      setWorkspaceDirtyPaths((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceDirty = draft[workspace] ?? (draft[workspace] = {})
          currentWorkspaceDirty[path] = true
        }),
      )
      setPathSaveState(workspace, path, nextState)
    },
    [setPathSaveState, setWorkspaceDirtyPaths],
  )

  useEffect(() => {
    if (!isDesktopRuntime()) return
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    syncedContentsRef.current = {}
    changeVersionRef.current = {}
    revisionVersionRef.current = {}
    revisionContentRef.current = {}
    loadToken.current += 1
    void fsApi.flushBuffers().catch((error) => {
      toast.error(t('editor.flushBuffersFailed'), {
        id: `${BUFFER_ERROR_TOAST_ID_PREFIX}:flush`,
        description: String(error),
      })
    })
  }, [workspaceKey, t])

  useEffect(() => {
    if (!activePath) return
    if (!isDesktopRuntime()) return
    const hasLocalChange = Boolean(
      dirtyPathsRef.current[activePath] || syncTimers.current[activePath],
    )
    const hasLoadedContent = Object.prototype.hasOwnProperty.call(
      fileContentsRef.current,
      activePath,
    )
    if (hasLocalChange || (hasLoadedContent && syncedContentsRef.current[activePath] != null)) {
      return
    }

    const token = loadToken.current + 1
    loadToken.current = token
    const requestWorkspace = workspaceKey
    setPathLoading(requestWorkspace, activePath, true)

    void fsApi
      .openFile(activePath)
      .then((content) => {
        if (loadToken.current !== token) return
        setWorkspaceFileContents((prev) =>
          produce(prev, (draft) => {
            const currentWorkspaceContents =
              draft[requestWorkspace] ?? (draft[requestWorkspace] = {})
            if (currentWorkspaceContents[activePath] === content) return
            currentWorkspaceContents[activePath] = content
          }),
        )
        syncedContentsRef.current[activePath] = content
        revisionVersionRef.current[activePath] = {}
        revisionContentRef.current[activePath] = {}
        setWorkspaceDirtyPaths((prev) =>
          produce(prev, (draft) => {
            const currentWorkspaceDirty = draft[requestWorkspace]
            if (!currentWorkspaceDirty?.[activePath]) return
            delete currentWorkspaceDirty[activePath]
          }),
        )
        setPathSaveState(requestWorkspace, activePath, { status: 'saved' })
      })
      .catch((error) => {
        if (loadToken.current !== token) return
        toast.error(t('editor.openFileFailed'), {
          id: `${BUFFER_ERROR_TOAST_ID_PREFIX}:open:${activePath}`,
          description: String(error),
        })
        setPathSaveState(requestWorkspace, activePath, {
          status: 'error',
          message: String(error),
        })
      })
      .finally(() => {
        setPathLoading(requestWorkspace, activePath, false)
      })
  }, [
    activePath,
    dirtyPathsRef,
    fileContentsRef,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    workspaceKey,
    t,
  ])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let cancelled = false
    let unlisten: (() => void) | undefined

    void listen<unknown>('fs-buffer-status', (event) => {
      const parsed = fsBufferStatusSchema.safeParse(event.payload)
      if (!parsed.success) return

      const { path, revision, dirty } = parsed.data
      const currentWorkspace = workspaceKeyRef.current
      if (dirty) {
        const revisionVersion = revisionVersionRef.current[path]?.[revision]
        const revisionContent = revisionContentRef.current[path]?.[revision]
        if (revisionVersion == null || revisionContent == null) return

        const hasNewChange = changeVersionRef.current[path] !== revisionVersion
        const currentValue = fileContentsRef.current[path] ?? ''
        if (hasNewChange || currentValue !== revisionContent) return

        markPathDirty(currentWorkspace, path, { status: 'saving' })
        return
      }

      const revisionVersion = revisionVersionRef.current[path]?.[revision]
      const revisionContent = revisionContentRef.current[path]?.[revision]
      if (revisionVersion == null || revisionContent == null) return

      const hasNewChange = changeVersionRef.current[path] !== revisionVersion
      const currentValue = fileContentsRef.current[path] ?? ''
      if (hasNewChange || currentValue !== revisionContent) return

      markPathClean(currentWorkspace, path, revisionContent)
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [fileContentsRef, markPathClean, markPathDirty, workspaceKeyRef])

  useUnmount(() => {
    Object.values(syncTimers.current).forEach((timer) => window.clearTimeout(timer))
    syncTimers.current = {}
    if (isDesktopRuntime()) {
      void fsApi.flushBuffers().catch((error) => {
        toast.error(t('editor.flushBuffersFailed'), {
          id: `${BUFFER_ERROR_TOAST_ID_PREFIX}:flush`,
          description: String(error),
        })
      })
    }
  })

  const onEditorChange = useCallback(
    (value: string) => {
      const path = activePathRef.current
      if (!path) return

      const currentWorkspace = workspaceKeyRef.current

      setWorkspaceFileContents((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceContents = draft[currentWorkspace] ?? (draft[currentWorkspace] = {})
          if (currentWorkspaceContents[path] === value) return
          currentWorkspaceContents[path] = value
        }),
      )

      const nextVersion = (changeVersionRef.current[path] ?? 0) + 1
      changeVersionRef.current[path] = nextVersion

      const syncedValue = syncedContentsRef.current[path]
      const isDirty = syncedValue !== value
      setWorkspaceDirtyPaths((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceDirty = draft[currentWorkspace] ?? (draft[currentWorkspace] = {})
          if (isDirty) {
            currentWorkspaceDirty[path] = true
            return
          }
          if (!currentWorkspaceDirty[path]) return
          delete currentWorkspaceDirty[path]
        }),
      )
      setPathSaveState(currentWorkspace, path, { status: isDirty ? 'unsaved' : 'saved' })

      if (!isDesktopRuntime()) return
      const currentTimer = syncTimers.current[path]
      if (currentTimer) {
        window.clearTimeout(currentTimer)
      }

      syncTimers.current[path] = window.setTimeout(() => {
        const latestValue = fileContentsRef.current[path] ?? value
        const dispatchedVersion = changeVersionRef.current[path]
        void fsApi
          .updateBuffer(path, latestValue)
          .then((status) => {
            const pathRevisions =
              revisionVersionRef.current[path] ?? (revisionVersionRef.current[path] = {})
            const pathContents =
              revisionContentRef.current[path] ?? (revisionContentRef.current[path] = {})
            pathRevisions[status.revision] = dispatchedVersion
            pathContents[status.revision] = latestValue

            const hasNewChange = changeVersionRef.current[path] !== dispatchedVersion
            const currentValue = fileContentsRef.current[path] ?? ''
            if (hasNewChange || currentValue !== latestValue) {
              return
            }

            if (status.dirty) {
              markPathDirty(currentWorkspace, path, { status: 'saving' })
              void fsApi
                .flushBuffers()
                .then(() => fsApi.getBufferStatus(path))
                .then((latestStatus) => {
                  if (!latestStatus || latestStatus.revision !== status.revision) return
                  if (latestStatus.dirty) return

                  const revisionVersion = pathRevisions[latestStatus.revision]
                  const revisionContent = pathContents[latestStatus.revision]
                  if (revisionVersion == null || revisionContent == null) return

                  const hasNewerChange = changeVersionRef.current[path] !== revisionVersion
                  const latestEditorValue = fileContentsRef.current[path] ?? ''
                  if (hasNewerChange || latestEditorValue !== revisionContent) return

                  markPathClean(currentWorkspace, path, revisionContent)
                })
                .catch((error) => {
                  toast.error(t('editor.syncFileFailed'), {
                    id: `${BUFFER_ERROR_TOAST_ID_PREFIX}:sync:${path}`,
                    description: String(error),
                  })
                })
              return
            }

            markPathClean(currentWorkspace, path, latestValue)
          })
          .catch((error) => {
            toast.error(t('editor.updateFileFailed'), {
              id: `${BUFFER_ERROR_TOAST_ID_PREFIX}:update:${path}`,
              description: String(error),
            })
            markPathDirty(currentWorkspace, path, {
              status: 'error',
              message: String(error),
            })
          })
        delete syncTimers.current[path]
      }, BUFFER_SYNC_DEBOUNCE_MS)
    },
    [
      activePathRef,
      fileContentsRef,
      markPathClean,
      markPathDirty,
      setPathSaveState,
      setWorkspaceDirtyPaths,
      setWorkspaceFileContents,
      workspaceKeyRef,
      t,
    ],
  )

  return {
    fileContents,
    editorValue,
    dirtyPaths,
    loadingPaths,
    saveStates,
    onEditorChange,
  }
}
