import { useEffect, useRef, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { getEditorBufferEvictions } from '@/app/editorBufferCachePolicy'
import {
  editorBufferIdentity,
  type useEditorBufferState,
  type createEditorBufferPersistence,
} from '@/app/useEditorBufferState'
import type { createEditorBufferSync } from '@/app/editorBufferSync'

type Options = {
  activePath: string | null
  settledUpdates: number
  workspaceKey: string
  openPaths: readonly string[] | undefined
  state: ReturnType<typeof useEditorBufferState>
  persistence: ReturnType<typeof createEditorBufferPersistence>
  bufferSync: ReturnType<typeof createEditorBufferSync>
  syncedContentsRef: RefObject<Record<string, string>>
  latestContentsRef: RefObject<Record<string, string>>
  changeVersionRef: RefObject<Record<string, number>>
}

export const useEditorBufferCache = ({
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
}: Options) => {
  const activeIdentity = useLatest(
    activePath ? editorBufferIdentity(workspaceKey, activePath) : null,
  )
  const activity = useRef(new Map<string, number>())
  const sequence = useRef(0)
  const previousEntries = useRef(new Map<string, { workspace: string; path: string }>())
  const {
    workspaceFileContents,
    workspaceDirtyPaths,
    workspaceLoadingPaths,
    workspaceSaveStates,
    evictSavedBuffers,
  } = state
  useEffect(() => {
    if (activePath)
      activity.current.set(editorBufferIdentity(workspaceKey, activePath), ++sequence.current)
    const entries = Object.entries(workspaceFileContents).flatMap(([workspace, files]) =>
      Object.entries(files).map(([path, content]) => ({
        workspace,
        path,
        content,
        lastActive: activity.current.get(editorBufferIdentity(workspace, path)) ?? 0,
        dirty: workspaceDirtyPaths[workspace]?.[path],
        loading: workspaceLoadingPaths[workspace]?.[path],
        saveState: workspaceSaveStates[workspace]?.[path],
        pending: persistence.isPending(editorBufferIdentity(workspace, path)),
      })),
    )
    const currentEntries = new Map(
      entries.map(({ workspace, path }) => [
        editorBufferIdentity(workspace, path),
        { workspace, path },
      ]),
    )
    // Release sync snapshots only after the buffer owner committed an eviction.
    for (const identity of previousEntries.current.keys()) {
      if (currentEntries.has(identity) || persistence.isPending(identity)) continue
      activity.current.delete(identity)
      delete syncedContentsRef.current[identity]
      delete latestContentsRef.current[identity]
      delete changeVersionRef.current[identity]
      bufferSync.forget(identity)
    }
    previousEntries.current = currentEntries
    const evictions = getEditorBufferEvictions(entries, workspaceKey, activePath, openPaths)
    if (evictions.length)
      evictSavedBuffers(
        evictions,
        (identity) => persistence.isPending(identity) || activeIdentity.current === identity,
      )
  }, [
    activePath,
    activeIdentity,
    settledUpdates,
    workspaceKey,
    openPaths,
    workspaceFileContents,
    workspaceDirtyPaths,
    workspaceLoadingPaths,
    workspaceSaveStates,
    persistence,
    bufferSync,
    evictSavedBuffers,
    syncedContentsRef,
    latestContentsRef,
    changeVersionRef,
  ])
}
