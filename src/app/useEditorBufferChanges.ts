import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { produce } from 'immer'
import { toast } from 'sonner'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import {
  editorBufferIdentity,
  type createEditorBufferPersistence,
  type SaveState,
} from '@/app/useEditorBufferState'

type WorkspaceContents = Record<string, Record<string, string>>
type WorkspaceLoadingPaths = Record<string, Record<string, true>>
export type EditorWorkspaceBinding = { workspace: string }

type EditorBufferChangesOptions = {
  activePath: string | null
  binding: EditorWorkspaceBinding
  currentBindingRef: RefObject<EditorWorkspaceBinding>
  workspaceFileContentsRef: RefObject<WorkspaceContents>
  workspaceLoadingPathsRef: RefObject<WorkspaceLoadingPaths>
  latestContentsRef: RefObject<Record<string, string>>
  changeVersionRef: RefObject<Record<string, number>>
  setWorkspaceFileContents: Dispatch<SetStateAction<WorkspaceContents>>
  markPathDirty: (workspace: string, path: string, state: SaveState) => void
  markPathClean: (workspace: string, path: string, content: string) => void
  persistence: ReturnType<typeof createEditorBufferPersistence>
  scheduleFlush: () => void
  updateErrorMessage: () => string
}

export const useEditorBufferChanges = ({
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
}: EditorBufferChangesOptions) =>
  useCallback(
    (value: string) => {
      // Delayed editor notifications belong to the document that produced them.
      const path = activePath
      const workspace = binding.workspace
      if (!path) return
      const contents = workspaceFileContentsRef.current[workspace]
      if (
        !contents ||
        workspaceLoadingPathsRef.current[workspace]?.[path] ||
        !Object.prototype.hasOwnProperty.call(contents, path)
      )
        return

      const identity = editorBufferIdentity(workspace, path)
      const isActiveBinding = currentBindingRef.current === binding
      const previous = isActiveBinding
        ? (latestContentsRef.current[identity] ?? contents[path])
        : contents[path]
      // Avoid state notifications and IPC for duplicate serialization results.
      if (previous === value) return

      setWorkspaceFileContents((prev) =>
        produce(prev, (draft) => {
          const files = draft[workspace] ?? (draft[workspace] = {})
          if (files[path] !== value) files[path] = value
        }),
      )

      if (!isActiveBinding) {
        const message =
          'Workspace changed before this edit could be saved. The unsaved text is retained in its original workspace buffer.'
        markPathDirty(workspace, path, { status: 'error', message })
        toast.error(updateErrorMessage(), {
          id: 'editor-buffer-error:stale:' + identity,
          description: message,
        })
        return
      }

      const version = (changeVersionRef.current[identity] ?? 0) + 1
      changeVersionRef.current[identity] = version
      latestContentsRef.current[identity] = value
      // Even an undo to the saved text must be acknowledged by the backend.
      markPathDirty(workspace, path, { status: 'unsaved' })
      if (!isDesktopRuntime()) return

      const isCurrent = () =>
        currentBindingRef.current === binding &&
        changeVersionRef.current[identity] === version &&
        latestContentsRef.current[identity] === value

      const operation = fsApi
        .updateBuffer(path, value)
        .then((status) => {
          if (!isCurrent()) return
          persistence.setRevision({
            identity,
            path,
            revision: status.revision,
            version,
            workspace,
          })
          if (status.dirty) {
            markPathDirty(workspace, path, { status: 'saving' })
            return
          }
          persistence.deleteRevision(identity, status.revision)
          markPathClean(workspace, path, value)
        })
        .catch((error: unknown) => {
          if (!isCurrent()) return
          toast.error(updateErrorMessage(), {
            id: 'editor-buffer-error:update:' + identity,
            description: String(error),
          })
          markPathDirty(workspace, path, { status: 'error', message: String(error) })
        })

      persistence.trackUpdate(operation)
      scheduleFlush()
    },
    [
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
    ],
  )
