import { useEffect, useRef, type RefObject } from 'react'
import { produce } from 'immer'
import { toast } from 'sonner'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { isTextFileViewPath } from '@/logic/fileTypes'
import {
  editorBufferIdentity,
  type useEditorBufferState,
  type createEditorBufferPersistence,
} from '@/app/useEditorBufferState'
import type { createEditorBufferSync } from '@/app/editorBufferSync'

type Options = {
  activePath: string | null
  visiblePaths: readonly string[]
  workspaceKey: string
  loadGeneration: number
  externalGeneration: Record<string, number>
  mutationGeneration: number
  isPathBlocked: (workspace: string, path: string) => boolean
  state: ReturnType<typeof useEditorBufferState>
  bufferSync: ReturnType<typeof createEditorBufferSync>
  persistence: ReturnType<typeof createEditorBufferPersistence>
  loadedVersionsRef: RefObject<Record<string, number>>
  loadTokenRef: RefObject<number>
  activeLoadsRef: RefObject<Map<string, { path: string; token: number; workspace: string }>>
  dirtyPathsRef: RefObject<Record<string, true>>
  fileContentsRef: RefObject<Record<string, string>>
  latestContentsRef: RefObject<Record<string, string>>
  syncedContentsRef: RefObject<Record<string, string>>
  changeVersionRef: RefObject<Record<string, number>>
  tRef: RefObject<(key: string) => string>
}

export const useEditorBufferLoad = ({
  activePath,
  visiblePaths,
  workspaceKey,
  loadGeneration,
  externalGeneration,
  mutationGeneration,
  isPathBlocked,
  state,
  bufferSync,
  persistence,
  loadTokenRef,
  loadedVersionsRef,
  activeLoadsRef,
  dirtyPathsRef,
  fileContentsRef,
  latestContentsRef,
  syncedContentsRef,
  changeVersionRef,
  tRef,
}: Options) => {
  const {
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    setLoadedVersions,
  } = state
  const previousTrigger = useRef({ workspaceKey, loadGeneration, externalGeneration })
  useEffect(() => {
    const previous = previousTrigger.current
    previousTrigger.current = { workspaceKey, loadGeneration, externalGeneration }
    const retryChanged =
      previous.workspaceKey === workspaceKey && previous.loadGeneration !== loadGeneration
    for (const [identity, request] of activeLoadsRef.current) {
      if (
        request.workspace === workspaceKey &&
        visiblePaths.includes(request.path) &&
        !isPathBlocked(workspaceKey, request.path) &&
        !(retryChanged && request.path === activePath) &&
        (previous.externalGeneration[request.path] ?? 0) ===
          (externalGeneration[request.path] ?? 0) &&
        (previous.externalGeneration['*'] ?? 0) === (externalGeneration['*'] ?? 0)
      )
        continue
      activeLoadsRef.current.delete(identity)
      setPathLoading(request.workspace, request.path, false)
    }
    if (!isDesktopRuntime()) return
    for (const path of visiblePaths) {
      if (retryChanged && path !== activePath) continue
      if (!isTextFileViewPath(path) || isPathBlocked(workspaceKey, path)) continue
      const identity = editorBufferIdentity(workspaceKey, path)
      if (activeLoadsRef.current.has(identity)) continue
      const hasLocalChange = Boolean(dirtyPathsRef.current[path])
      const hasLoadedContent = Object.prototype.hasOwnProperty.call(fileContentsRef.current, path)
      const hasLoadedRevision = bufferSync.revisionFor(identity) !== undefined
      if (hasLocalChange || (hasLoadedContent && syncedContentsRef.current[identity] != null))
        continue

      const token = loadTokenRef.current + 1
      loadTokenRef.current = token
      activeLoadsRef.current.set(identity, { path, token, workspace: workspaceKey })
      const version = changeVersionRef.current[identity]
      const isCurrentLoad = () =>
        activeLoadsRef.current.get(identity)?.token === token &&
        !isPathBlocked(workspaceKey, path) &&
        changeVersionRef.current[identity] === version &&
        !dirtyPathsRef.current[path]
      // A renamed cache entry has text but no revision for its new path yet.
      // Keep editing gated until the new versioned snapshot is available.
      setPathLoading(workspaceKey, path, !hasLoadedContent || !hasLoadedRevision)

      void fsApi
        .openBufferSnapshot(path)
        .then((snapshot) => {
          const { content } = snapshot
          if (!isCurrentLoad()) return
          bufferSync.seed(identity, content, snapshot)
          setWorkspaceFileContents((prev) =>
            produce(prev, (draft) => {
              const contents = draft[workspaceKey] ?? (draft[workspaceKey] = {})
              contents[path] = content
            }),
          )
          loadedVersionsRef.current = { ...loadedVersionsRef.current, [identity]: token }
          setLoadedVersions((previous) => ({ ...previous, [identity]: token }))
          latestContentsRef.current[identity] = content
          syncedContentsRef.current[identity] = content
          delete changeVersionRef.current[identity]
          persistence.resetDocument(identity)
          setWorkspaceDirtyPaths((prev) =>
            produce(prev, (draft) => {
              const dirty = draft[workspaceKey]
              if (dirty?.[path]) delete dirty[path]
            }),
          )
          setPathSaveState(workspaceKey, path, { status: 'saved' })
        })
        .catch((error) => {
          if (!isCurrentLoad()) return
          if (!hasLoadedContent || !hasLoadedRevision) {
            setWorkspaceFileContents((prev) =>
              produce(prev, (draft) => {
                const contents = draft[workspaceKey]
                if (!contents || !Object.prototype.hasOwnProperty.call(contents, path)) return
                delete contents[path]
                if (Object.keys(contents).length === 0) delete draft[workspaceKey]
              }),
            )
            delete latestContentsRef.current[identity]
            delete syncedContentsRef.current[identity]
            delete changeVersionRef.current[identity]
            persistence.deleteRevision(identity)
          }
          toast.error(tRef.current('editor.openFileFailed'), {
            id: 'editor-buffer-error' + ':open:' + path,
            description: String(error),
          })
          setPathSaveState(workspaceKey, path, {
            status: 'error',
            message: String(error),
          })
        })
        .finally(() => {
          if (activeLoadsRef.current.get(identity)?.token !== token) return
          activeLoadsRef.current.delete(identity)
          setPathLoading(workspaceKey, path, false)
        })
    }
  }, [
    activePath,
    visiblePaths,
    mutationGeneration,
    isPathBlocked,
    loadTokenRef,
    loadedVersionsRef,
    activeLoadsRef,
    changeVersionRef,
    latestContentsRef,
    syncedContentsRef,
    bufferSync,
    dirtyPathsRef,
    fileContentsRef,
    loadGeneration,
    externalGeneration,
    persistence,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    setLoadedVersions,
    tRef,
    workspaceKey,
  ])
}
