import { useCallback, useMemo, useState } from 'react'
import { produce } from 'immer'

export type SaveState = {
  status: 'saved' | 'saving' | 'unsaved' | 'error'
  message?: string
}

type WorkspaceContents = Record<string, Record<string, string>>
type WorkspaceDirtyPaths = Record<string, Record<string, true>>
type WorkspaceLoadingPaths = Record<string, Record<string, true>>
type WorkspaceSaveStates = Record<string, Record<string, SaveState>>

const EMPTY_FILE_CONTENTS: Record<string, string> = {}
const EMPTY_DIRTY_PATHS: Record<string, true> = {}
const EMPTY_SAVE_STATES: Record<string, SaveState> = {}

export const useEditorBufferState = (workspaceKey: string) => {
  const [workspaceFileContents, setWorkspaceFileContents] = useState<WorkspaceContents>({})
  const [workspaceDirtyPaths, setWorkspaceDirtyPaths] = useState<WorkspaceDirtyPaths>({})
  const [workspaceLoadingPaths, setWorkspaceLoadingPaths] = useState<WorkspaceLoadingPaths>({})
  const [workspaceSaveStates, setWorkspaceSaveStates] = useState<WorkspaceSaveStates>({})

  const fileContents = useMemo(
    () => workspaceFileContents[workspaceKey] ?? EMPTY_FILE_CONTENTS,
    [workspaceFileContents, workspaceKey],
  )
  const dirtyPaths = useMemo(
    () => workspaceDirtyPaths[workspaceKey] ?? EMPTY_DIRTY_PATHS,
    [workspaceDirtyPaths, workspaceKey],
  )
  const loadingPaths = useMemo(
    () => workspaceLoadingPaths[workspaceKey] ?? EMPTY_DIRTY_PATHS,
    [workspaceLoadingPaths, workspaceKey],
  )
  const saveStates = useMemo(
    () => workspaceSaveStates[workspaceKey] ?? EMPTY_SAVE_STATES,
    [workspaceSaveStates, workspaceKey],
  )

  const setPathSaveState = useCallback((workspace: string, path: string, next: SaveState) => {
    setWorkspaceSaveStates((prev) =>
      produce(prev, (draft) => {
        const currentWorkspaceStates = draft[workspace] ?? (draft[workspace] = {})
        const current = currentWorkspaceStates[path]
        if (current?.status === next.status && current.message === next.message) return
        currentWorkspaceStates[path] = next
      }),
    )
  }, [])

  const setPathLoading = useCallback((workspace: string, path: string, loading: boolean) => {
    setWorkspaceLoadingPaths((prev) =>
      produce(prev, (draft) => {
        if (loading) {
          const currentWorkspaceLoading = draft[workspace] ?? (draft[workspace] = {})
          currentWorkspaceLoading[path] = true
          return
        }

        const currentWorkspaceLoading = draft[workspace]
        if (!currentWorkspaceLoading?.[path]) return
        delete currentWorkspaceLoading[path]
        if (Object.keys(currentWorkspaceLoading).length === 0) delete draft[workspace]
      }),
    )
  }, [])

  return {
    dirtyPaths,
    fileContents,
    loadingPaths,
    saveStates,
    setPathLoading,
    setPathSaveState,
    setWorkspaceDirtyPaths,
    setWorkspaceFileContents,
  }
}
