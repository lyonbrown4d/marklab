import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLatest, useUnmount } from 'ahooks'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import { toast } from 'sonner'
import { useEditorBufferMarkers } from '@/app/useEditorBufferMarkers'
import { useEditorBufferCache } from '@/app/useEditorBufferCache'
import { useEditorBufferLoad } from '@/app/useEditorBufferLoad'
import { useEditorBufferPathMutation } from '@/app/useEditorBufferPathMutation'
import { useEditorBufferChanges } from '@/app/useEditorBufferChanges'
import { registerEditorBufferFlusher } from '@/app/editorCloseLifecycle'
import { editorLoadGenerationFromState } from '@/app/editorLoadRouteState'
import { useEditorBufferStatus } from '@/app/useEditorBufferStatus'
import { useEditorBufferInvalidation } from '@/app/useEditorBufferInvalidation'
import { usePersistedEditorBufferContent } from '@/app/usePersistedEditorBufferContent'
import {
  createEditorBufferPersistence,
  editorBufferIdentity,
  useEditorBufferState,
} from '@/app/useEditorBufferState'
import { createEditorBufferSync } from '@/app/editorBufferSync'
export type { SaveState } from '@/app/useEditorBufferState'
export { editorLoadGenerationFromState, nextEditorLoadRouteState } from '@/app/editorLoadRouteState'

const BUFFER_FLUSH_DEBOUNCE_MS = 800
const BUFFER_ERROR_TOAST_ID_PREFIX = 'editor-buffer-error'
type UseEditorBufferArgs = {
  activePath: string | null
  workspaceKey: string
  openPaths?: readonly string[]
}

export const useEditorBuffer = ({ activePath, workspaceKey, openPaths }: UseEditorBufferArgs) => {
  const { t } = useI18n()
  const location = useLocation()
  const loadGeneration = editorLoadGenerationFromState(location.state)
  const state = useEditorBufferState(workspaceKey)
  const {
    loadedVersions,
    dirtyPaths,
    fileContents,
    loadingPaths,
    saveStates,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    workspaceFileContentsRef,
    workspaceLoadingPathsRef,
  } = state
  const editorValue = activePath ? (fileContents[activePath] ?? '') : ''

  const [settledUpdates, setSettledUpdates] = useState(0)
  const persistence = useMemo(
    () => createEditorBufferPersistence(() => setSettledUpdates((count) => count + 1)),
    [],
  )
  const bufferSync = useMemo(
    () =>
      createEditorBufferSync({
        applyBufferUpdate: (request) => fsApi.applyBufferUpdate(request),
      }),
    [],
  )
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
  const loadedVersionsRef = useLatest(loadedVersions)
  const loadTokenRef = useRef(0)
  const activeLoadRef = useRef<{ path: string; token: number; workspace: string } | null>(null)
  const workspaceSessionRef = useRef(workspaceKey)
  const externalGeneration = useEditorBufferInvalidation(
    workspaceKey,
    syncedContentsRef,
    activePath,
  )

  const { markPathClean, markPathDirty } = useEditorBufferMarkers({
    workspaceKeyRef,
    syncedContentsRef,
    setPathSaveState,
    setWorkspaceDirtyPaths,
  })

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

  useEffect(() => registerEditorBufferFlusher(flushNow), [flushNow])

  useEffect(() => {
    if (workspaceSessionRef.current === workspaceKey) return
    const previousWorkspace = workspaceSessionRef.current
    workspaceSessionRef.current = workspaceKey
    loadTokenRef.current += 1
    syncedContentsRef.current = {}
    latestContentsRef.current = {}
    changeVersionRef.current = {}
    persistence.clearRevisions()
    void flushNow().then(
      () => bufferSync.clearWorkspace(previousWorkspace),
      (error) => reportFlushError(error),
    )
  }, [bufferSync, flushNow, persistence, reportFlushError, workspaceKey])

  const { beginPathMutation, pathMutationPending, mutationGeneration, isPathBlocked } =
    useEditorBufferPathMutation({ activePath, workspaceKey, state, loadTokenRef, activeLoadRef })

  useEditorBufferLoad({
    activePath,
    workspaceKey,
    loadGeneration,
    externalGeneration,
    mutationGeneration,
    isPathBlocked,
    state,
    bufferSync,
    persistence,
    loadTokenRef,
    activeLoadRef,
    dirtyPathsRef,
    fileContentsRef,
    latestContentsRef,
    syncedContentsRef,
    changeVersionRef,
    tRef,
  })

  useUnmount(() => {
    loadTokenRef.current += 1
    activeLoadRef.current = null
    void flushNow().catch(reportFlushError)
  })

  useEditorBufferCache({
    activePath,
    workspaceKey,
    openPaths,
    settledUpdates,
    state,
    persistence,
    bufferSync,
    syncedContentsRef,
    latestContentsRef,
    changeVersionRef,
  })

  const updateErrorMessage = useCallback(() => tRef.current('editor.updateFileFailed'), [tRef])
  const onEditorChange = useEditorBufferChanges({
    activePath,
    loadedContent: activePath ? fileContents[activePath] : undefined,
    loadedRevision: activePath
      ? bufferSync.revisionFor(editorBufferIdentity(workspaceKey, activePath))
      : undefined,
    loadedVersion: activePath
      ? loadedVersions[editorBufferIdentity(workspaceKey, activePath)]
      : undefined,
    loadedVersionsRef,
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
    bufferSync,
    isPathBlocked,
  })
  const onPersistedContentChange = usePersistedEditorBufferContent({
    bufferSync,
    workspaceKeyRef,
    markPathDirty,
    workspace: workspaceKey,
    latestContentsRef,
    changeVersionRef,
    setWorkspaceFileContents,
    markPathClean,
    persistence,
  })
  return {
    fileContents,
    editorValue,
    dirtyPaths,
    loadingPaths,
    saveStates,
    onEditorChange,
    onPersistedContentChange,
    beginPathMutation,
    pathMutationPending,
  }
}
