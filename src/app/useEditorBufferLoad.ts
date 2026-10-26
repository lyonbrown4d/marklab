import { useEffect, type RefObject } from 'react'
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
  workspaceKey: string
  loadGeneration: number
  externalGeneration: number
  mutationGeneration: number
  isPathBlocked: (workspace: string, path: string) => boolean
  state: ReturnType<typeof useEditorBufferState>
  bufferSync: ReturnType<typeof createEditorBufferSync>
  persistence: ReturnType<typeof createEditorBufferPersistence>
  loadTokenRef: RefObject<number>
  activeLoadRef: RefObject<{ path: string; token: number; workspace: string } | null>
  dirtyPathsRef: RefObject<Record<string, true>>
  fileContentsRef: RefObject<Record<string, string>>
  latestContentsRef: RefObject<Record<string, string>>
  syncedContentsRef: RefObject<Record<string, string>>
  changeVersionRef: RefObject<Record<string, number>>
  tRef: RefObject<(key: string) => string>
}

export const useEditorBufferLoad = ({
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
}: Options) => {
  const {
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
    setLoadedVersions,
  } = state
  useEffect(() => {
    const previousLoad = activeLoadRef.current
    if (previousLoad) {
      activeLoadRef.current = null
      setPathLoading(previousLoad.workspace, previousLoad.path, false)
    }

    if (
      !activePath ||
      !isDesktopRuntime() ||
      !isTextFileViewPath(activePath) ||
      isPathBlocked(workspaceKey, activePath)
    )
      return

    const identity = editorBufferIdentity(workspaceKey, activePath)
    const hasLocalChange = Boolean(dirtyPathsRef.current[activePath])
    const hasLoadedContent = Object.prototype.hasOwnProperty.call(
      fileContentsRef.current,
      activePath,
    )
    const hasLoadedRevision = bufferSync.revisionFor(identity) !== undefined
    if (hasLocalChange || (hasLoadedContent && syncedContentsRef.current[identity] != null)) return

    const token = loadTokenRef.current + 1
    loadTokenRef.current = token
    activeLoadRef.current = { path: activePath, token, workspace: workspaceKey }
    const version = changeVersionRef.current[identity]
    const isCurrentLoad = () =>
      loadTokenRef.current === token &&
      !isPathBlocked(workspaceKey, activePath) &&
      changeVersionRef.current[identity] === version &&
      !dirtyPathsRef.current[activePath]
    // A renamed cache entry has text but no revision for its new path yet.
    // Keep editing gated until the new versioned snapshot is available.
    setPathLoading(workspaceKey, activePath, !hasLoadedContent || !hasLoadedRevision)

    void fsApi
      .openBufferSnapshot(activePath)
      .then((snapshot) => {
        const { content } = snapshot
        if (!isCurrentLoad()) return
        bufferSync.seed(identity, content, snapshot)
        setWorkspaceFileContents((prev) =>
          produce(prev, (draft) => {
            const contents = draft[workspaceKey] ?? (draft[workspaceKey] = {})
            contents[activePath] = content
          }),
        )
        setLoadedVersions((previous) => ({ ...previous, [identity]: token }))
        latestContentsRef.current[identity] = content
        syncedContentsRef.current[identity] = content
        delete changeVersionRef.current[identity]
        persistence.resetDocument(identity)
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
        if (!hasLoadedContent || !hasLoadedRevision) {
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
          id: 'editor-buffer-error' + ':open:' + activePath,
          description: String(error),
        })
        setPathSaveState(workspaceKey, activePath, {
          status: 'error',
          message: String(error),
        })
      })
      .finally(() => {
        if (loadTokenRef.current !== token) return
        activeLoadRef.current = null
        setPathLoading(workspaceKey, activePath, false)
      })

    return () => {
      if (loadTokenRef.current === token) loadTokenRef.current += 1
    }
  }, [
    activePath,
    mutationGeneration,
    isPathBlocked,
    loadTokenRef,
    activeLoadRef,
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
