import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useLatest, useUnmount } from 'ahooks'
import { produce } from 'immer'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import { isTextFileViewPath } from '@/logic/fileTypes'
import { toast } from 'sonner'
import { useEditorBufferChanges } from '@/app/useEditorBufferChanges'
import { useEditorBufferStatus } from '@/app/useEditorBufferStatus'
import { useEditorBufferInvalidation } from '@/app/useEditorBufferInvalidation'
import {
  createEditorBufferPersistence,
  editorBufferIdentity,
  useEditorBufferState,
  type SaveState,
} from '@/app/useEditorBufferState'

export type { SaveState } from '@/app/useEditorBufferState'

const BUFFER_FLUSH_DEBOUNCE_MS = 800
const BUFFER_ERROR_TOAST_ID_PREFIX = 'editor-buffer-error'

const LOAD_GENERATION_KEY = 'editorLoadGeneration'

const routeStateRecord = (state: unknown): Record<string, unknown> =>
  typeof state === 'object' && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {}

export const editorLoadGenerationFromState = (state: unknown) => {
  const generation = routeStateRecord(state)[LOAD_GENERATION_KEY]
  return typeof generation === 'number' && Number.isSafeInteger(generation) && generation >= 0
    ? generation
    : 0
}

export const nextEditorLoadRouteState = (state: unknown): Record<string, unknown> => ({
  ...routeStateRecord(state),
  [LOAD_GENERATION_KEY]: editorLoadGenerationFromState(state) + 1,
})
type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
}

export const useEditorBuffer = ({ activePath, workspaceKey }: UseEditorBufferArgs) => {
  const { t } = useI18n()
  const location = useLocation()
  const loadGeneration = editorLoadGenerationFromState(location.state)
  const {
    dirtyPaths,
    fileContents,
    loadingPaths,
    saveStates,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    workspaceFileContentsRef,
    workspaceLoadingPathsRef,
  } = useEditorBufferState(workspaceKey)
  const editorValue = useMemo(
    () => (activePath ? (fileContents[activePath] ?? '') : ''),
    [activePath, fileContents],
  )

  const persistence = useMemo(() => createEditorBufferPersistence(), [])
  const fileContentsRef = useLatest(fileContents)
  const dirtyPathsRef = useLatest(dirtyPaths)
  const workspaceKeyRef = useLatest(workspaceKey)
  const binding = useMemo(() => ({ workspace: workspaceKey }), [workspaceKey])
  const currentBindingRef = useLatest(binding)
  const tRef = useLatest(t)
  const flushTimerRef = useRef<number | null>(null)
  const syncedContentsRef = useRef<Record<string, string>>({})
  const latestContentsRef = useRef<Record<string, string>>({})
  const changeVersionRef = useRef<Record<string, number>>({})
  const loadToken = useRef(0)
  const activeLoadRef = useRef<{
    path: string
    token: number
    workspace: string
  } | null>(null)
  const workspaceSessionRef = useRef(workspaceKey)
  const externalGeneration = useEditorBufferInvalidation(
    workspaceKey,
    syncedContentsRef,
    activePath,
  )

  const markPathClean = useCallback(
    (workspace: string, path: string, content: string) => {
      if (workspaceKeyRef.current === workspace) {
        syncedContentsRef.current[editorBufferIdentity(workspace, path)] = content
      }
      setWorkspaceDirtyPaths((prev) =>
        produce(prev, (draft) => {
          const currentWorkspaceDirty = draft[workspace]
          if (!currentWorkspaceDirty?.[path]) return
          delete currentWorkspaceDirty[path]
        }),
      )
      setPathSaveState(workspace, path, { status: 'saved' })
    },
    [setPathSaveState, setWorkspaceDirtyPaths, workspaceKeyRef],
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

  const confirmFlushedRevisions = useEditorBufferStatus({
    changeVersionRef,
    latestContentsRef,
    markPathClean,
    markPathDirty,
    persistence,
    workspaceKeyRef,
  })

  const flushNow = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (!isDesktopRuntime()) return Promise.resolve()
    return persistence.flush(async () => {
      await fsApi.flushBuffers()
    }, confirmFlushedRevisions)
  }, [confirmFlushedRevisions, persistence])

  const reportFlushError = useCallback(
    (error: unknown) => {
      toast.error(tRef.current('editor.flushBuffersFailed'), {
        id: BUFFER_ERROR_TOAST_ID_PREFIX + ':flush',
        description: String(error),
      })
    },
    [tRef],
  )

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) window.clearTimeout(flushTimerRef.current)
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      void flushNow().catch(reportFlushError)
    }, BUFFER_FLUSH_DEBOUNCE_MS)
  }, [flushNow, reportFlushError])

  useEffect(() => {
    if (workspaceSessionRef.current === workspaceKey) return
    workspaceSessionRef.current = workspaceKey
    loadToken.current += 1
    syncedContentsRef.current = {}
    latestContentsRef.current = {}
    changeVersionRef.current = {}
    persistence.clearRevisions()
    void flushNow().catch(reportFlushError)
  }, [flushNow, persistence, reportFlushError, workspaceKey])

  useEffect(() => {
    const previousLoad = activeLoadRef.current
    if (previousLoad) {
      activeLoadRef.current = null
      setPathLoading(previousLoad.workspace, previousLoad.path, false)
    }

    if (!activePath || !isDesktopRuntime() || !isTextFileViewPath(activePath)) return

    const identity = editorBufferIdentity(workspaceKey, activePath)
    const hasLocalChange = Boolean(dirtyPathsRef.current[activePath])
    const hasLoadedContent = Object.prototype.hasOwnProperty.call(
      fileContentsRef.current,
      activePath,
    )
    if (hasLocalChange || (hasLoadedContent && syncedContentsRef.current[identity] != null)) return

    const token = loadToken.current + 1
    loadToken.current = token
    activeLoadRef.current = { path: activePath, token, workspace: workspaceKey }
    const version = changeVersionRef.current[identity]
    const isCurrentLoad = () =>
      loadToken.current === token &&
      changeVersionRef.current[identity] === version &&
      !dirtyPathsRef.current[activePath]
    setPathLoading(workspaceKey, activePath, !hasLoadedContent)

    void fsApi
      .openFile(activePath)
      .then((content) => {
        if (!isCurrentLoad()) return
        setWorkspaceFileContents((prev) =>
          produce(prev, (draft) => {
            const contents = draft[workspaceKey] ?? (draft[workspaceKey] = {})
            contents[activePath] = content
          }),
        )
        latestContentsRef.current[identity] = content
        syncedContentsRef.current[identity] = content
        delete changeVersionRef.current[identity]
        persistence.deleteRevision(identity)
        setWorkspaceDirtyPaths((prev) =>
          produce(prev, (draft) => {
            const dirty = draft[workspaceKey]
            if (dirty?.[activePath]) delete dirty[activePath]
          }),
        )
        setPathSaveState(workspaceKey, activePath, { status: 'saved' })
      })
      .catch((error) => {
        if (!isCurrentLoad()) return
        if (!hasLoadedContent) {
          setWorkspaceFileContents((prev) =>
            produce(prev, (draft) => {
              const contents = draft[workspaceKey]
              if (!contents || !Object.prototype.hasOwnProperty.call(contents, activePath)) return
              delete contents[activePath]
              if (Object.keys(contents).length === 0) delete draft[workspaceKey]
            }),
          )
          delete latestContentsRef.current[identity]
          delete syncedContentsRef.current[identity]
          delete changeVersionRef.current[identity]
          persistence.deleteRevision(identity)
        }
        toast.error(tRef.current('editor.openFileFailed'), {
          id: BUFFER_ERROR_TOAST_ID_PREFIX + ':open:' + activePath,
          description: String(error),
        })
        setPathSaveState(workspaceKey, activePath, {
          status: 'error',
          message: String(error),
        })
      })
      .finally(() => {
        if (loadToken.current !== token) return
        activeLoadRef.current = null
        setPathLoading(workspaceKey, activePath, false)
      })

    return () => {
      if (loadToken.current === token) loadToken.current += 1
    }
  }, [
    activePath,
    dirtyPathsRef,
    fileContentsRef,
    loadGeneration,
    externalGeneration,
    persistence,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    tRef,
    workspaceKey,
  ])

  useUnmount(() => {
    loadToken.current += 1
    activeLoadRef.current = null
    void flushNow().catch(reportFlushError)
  })

  const updateErrorMessage = useCallback(() => tRef.current('editor.updateFileFailed'), [tRef])
  const onEditorChange = useEditorBufferChanges({
    activePath,
    binding,
    currentBindingRef,
    workspaceFileContentsRef,
    workspaceLoadingPathsRef,
    latestContentsRef,
    changeVersionRef,
    setWorkspaceFileContents,
    markPathDirty,
    markPathClean,
    persistence,
    scheduleFlush,
    updateErrorMessage,
  })
  return {
    fileContents,
    editorValue,
    dirtyPaths,
    loadingPaths,
    saveStates,
    onEditorChange,
  }
}
