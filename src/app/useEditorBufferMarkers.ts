import { useCallback, type Dispatch, type SetStateAction, type RefObject } from 'react'
import { produce } from 'immer'
import { editorBufferIdentity, type SaveState } from '@/app/useEditorBufferState'

type Options = {
  workspaceKeyRef: RefObject<string>
  syncedContentsRef: RefObject<Record<string, string>>
  setPathSaveState: (workspace: string, path: string, state: SaveState) => void
  setWorkspaceDirtyPaths: Dispatch<SetStateAction<Record<string, Record<string, true>>>>
}
export const useEditorBufferMarkers = ({
  workspaceKeyRef,
  syncedContentsRef,
  setPathSaveState,
  setWorkspaceDirtyPaths,
}: Options) => {
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
    [setPathSaveState, setWorkspaceDirtyPaths, workspaceKeyRef, syncedContentsRef],
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

  return { markPathClean, markPathDirty }
}
