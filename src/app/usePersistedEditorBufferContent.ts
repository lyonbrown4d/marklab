import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { produce } from 'immer'
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
}

export const usePersistedEditorBufferContent = ({
  workspace,
  latestContentsRef,
  changeVersionRef,
  setWorkspaceFileContents,
  markPathClean,
  persistence,
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
    },
    [
      changeVersionRef,
      latestContentsRef,
      markPathClean,
      persistence,
      setWorkspaceFileContents,
      workspace,
    ],
  )
