import { useCallback, useMemo, useState } from 'react'
import { produce } from 'immer'
import { useLatest } from 'ahooks'

export type SaveState = {
  status: 'saved' | 'saving' | 'unsaved' | 'error'
  message?: string
}

export type EditorLoadState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string }

type ResolveEditorLoadStateArgs = {
  fileContents: Readonly<Record<string, string>>
  loadingPaths: Readonly<Record<string, true>>
  path: string
  saveStates: Readonly<Record<string, SaveState>>
}

export const resolveEditorLoadState = ({
  fileContents,
  loadingPaths,
  path,
  saveStates,
}: ResolveEditorLoadStateArgs): EditorLoadState => {
  if (loadingPaths[path]) return { status: 'loading' }

  if (Object.prototype.hasOwnProperty.call(fileContents, path)) {
    return { status: 'ready', content: fileContents[path] ?? '' }
  }

  const failure = saveStates[path]
  if (failure?.status === 'error') {
    return { status: 'error', message: failure.message ?? '' }
  }

  return { status: 'loading' }
}

export type EditorRevisionSnapshot = {
  identity: string
  path: string
  revision: number
  version: number
  workspace: string
}

type ConfirmRevisions = (snapshots: EditorRevisionSnapshot[]) => Promise<void>

export const editorBufferIdentity = (workspace: string, path: string) =>
  workspace.length + ':' + workspace + path

export const createEditorBufferPersistence = () => {
  const pendingUpdates = new Set<Promise<void>>()
  const revisions = new Map<string, EditorRevisionSnapshot>()
  let activeFlush: Promise<void> | null = null
  let updateSequence = 0

  const trackUpdate = (operation: Promise<void>) => {
    updateSequence += 1
    pendingUpdates.add(operation)
    void operation.then(
      () => pendingUpdates.delete(operation),
      () => pendingUpdates.delete(operation),
    )
  }

  const setRevision = (snapshot: EditorRevisionSnapshot) => {
    const current = revisions.get(snapshot.identity)
    if (current && current.version > snapshot.version) return
    revisions.set(snapshot.identity, snapshot)
  }

  const deleteRevision = (identity: string, revision?: number) => {
    const current = revisions.get(identity)
    if (!current || (revision != null && current.revision !== revision)) return
    revisions.delete(identity)
  }

  const revisionFor = (identity: string) => revisions.get(identity)

  const flush = (
    persist: () => Promise<void>,
    confirmRevisions: ConfirmRevisions,
  ): Promise<void> => {
    if (activeFlush) return activeFlush

    const task = (async () => {
      while (true) {
        const observedSequence = updateSequence
        while (pendingUpdates.size > 0) {
          await Promise.allSettled(Array.from(pendingUpdates))
        }

        await persist()
        await confirmRevisions(Array.from(revisions.values()))
        if (observedSequence === updateSequence && pendingUpdates.size === 0) return
      }
    })()

    const tracked = task.finally(() => {
      if (activeFlush === tracked) activeFlush = null
    })
    activeFlush = tracked
    return tracked
  }

  return {
    clearRevisions: () => revisions.clear(),
    deleteRevision,
    flush,
    revisionFor,
    setRevision,
    trackUpdate,
  }
}
type WorkspaceContents = Record<string, Record<string, string>>
type WorkspaceDirtyPaths = Record<string, Record<string, true>>
type WorkspaceLoadingPaths = Record<string, Record<string, true>>
type WorkspaceSaveStates = Record<string, Record<string, SaveState>>

const EMPTY_FILE_CONTENTS: Record<string, string> = {}
const EMPTY_DIRTY_PATHS: Record<string, true> = {}
const EMPTY_LOADING_PATHS: Record<string, true> = {}
const EMPTY_SAVE_STATES: Record<string, SaveState> = {}

export const useEditorBufferState = (workspaceKey: string) => {
  const [workspaceFileContents, setWorkspaceFileContents] = useState<WorkspaceContents>({})
  const [workspaceDirtyPaths, setWorkspaceDirtyPaths] = useState<WorkspaceDirtyPaths>({})
  const [workspaceLoadingPaths, setWorkspaceLoadingPaths] = useState<WorkspaceLoadingPaths>({})
  const [workspaceSaveStates, setWorkspaceSaveStates] = useState<WorkspaceSaveStates>({})
  const workspaceFileContentsRef = useLatest(workspaceFileContents)
  const workspaceLoadingPathsRef = useLatest(workspaceLoadingPaths)

  const fileContents = useMemo(
    () => workspaceFileContents[workspaceKey] ?? EMPTY_FILE_CONTENTS,
    [workspaceFileContents, workspaceKey],
  )
  const dirtyPaths = useMemo(
    () => workspaceDirtyPaths[workspaceKey] ?? EMPTY_DIRTY_PATHS,
    [workspaceDirtyPaths, workspaceKey],
  )
  const loadingPaths = useMemo(
    () => workspaceLoadingPaths[workspaceKey] ?? EMPTY_LOADING_PATHS,
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
    workspaceFileContentsRef,
    workspaceLoadingPathsRef,
  }
}
