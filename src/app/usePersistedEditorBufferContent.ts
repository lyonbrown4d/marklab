import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { produce } from 'immer'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { createEditorBufferSync } from '@/app/editorBufferSync'
import {
  editorBufferIdentity,
  type createEditorBufferPersistence,
} from '@/app/useEditorBufferState'

type WorkspaceContents = Record<string, Record<string, string>>

type PersistedEditorBufferContentOptions = {
  workspace: string
  latestContentsRef: RefObject<Record<string, string>>
  changeVersionRef: RefObject<Record<string, number>>
  setWorkspaceFileContents: Dispatch<SetStateAction<WorkspaceContents>>
  markPathClean: (workspace: string, path: string, content: string) => void
  persistence: ReturnType<typeof createEditorBufferPersistence>
  bufferSync: ReturnType<typeof createEditorBufferSync>
  workspaceKeyRef: RefObject<string>
  markPathDirty: (
    workspace: string,
    path: string,
    state: { status: 'error'; message: string },
  ) => void
}

export const usePersistedEditorBufferContent = ({
  workspace,
  latestContentsRef,
  changeVersionRef,
  setWorkspaceFileContents,
  markPathClean,
  persistence,
  bufferSync,
  workspaceKeyRef,
  markPathDirty,
}: PersistedEditorBufferContentOptions) =>
  useCallback(
    (path: string, content: string) => {
      const identity = editorBufferIdentity(workspace, path)

      // The caller has already persisted this content. Invalidate older async edits
      // and update only the renderer-side buffer without another IPC write or flush.
      changeVersionRef.current[identity] = (changeVersionRef.current[identity] ?? 0) + 1
      latestContentsRef.current[identity] = content
      persistence.deleteRevision(identity)
      setWorkspaceFileContents((prev) =>
        produce(prev, (draft) => {
          const files = draft[workspace] ?? (draft[workspace] = {})
          if (files[path] !== content) files[path] = content
        }),
      )
      markPathClean(workspace, path, content)
      bufferSync.forget(identity)
      if (!isDesktopRuntime() || workspaceKeyRef.current !== workspace) return
      const version = changeVersionRef.current[identity]
      const refresh = fsApi.openBufferSnapshot(path).then((snapshot) => {
        if (workspaceKeyRef.current !== workspace || changeVersionRef.current[identity] !== version)
          return
        if (snapshot.content !== content)
          throw new Error('Persisted document changed in another editor. Reload before editing.')
        bufferSync.seed(identity, content, snapshot)
        persistence.resetDocument(identity)
      })
      persistence.trackUpdate(refresh, identity)
      void refresh.catch((error: unknown) => {
        if (workspaceKeyRef.current !== workspace || changeVersionRef.current[identity] !== version)
          return
        markPathDirty(workspace, path, { status: 'error', message: String(error) })
      })
    },
    [
      bufferSync,
      changeVersionRef,
      latestContentsRef,
      markPathDirty,
      workspaceKeyRef,
      markPathClean,
      persistence,
      setWorkspaceFileContents,
      workspace,
    ],
  )
