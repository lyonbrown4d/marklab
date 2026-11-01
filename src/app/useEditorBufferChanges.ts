import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { produce } from 'immer'
import { toast } from 'sonner'
import { isDesktopRuntime } from '@/runtime/environment'
import {
  editorBufferIdentity,
  type createEditorBufferPersistence,
  type SaveState,
} from '@/app/useEditorBufferState'
import type { EditorChangeHandler, EditorTextChange } from '@/types/editorChanges'
import type { createEditorBufferSync, LoadedEditorRevision } from '@/app/editorBufferSync'

type WorkspaceContents = Record<string, Record<string, string>>
type WorkspaceLoadingPaths = Record<string, Record<string, true>>
export type EditorWorkspaceBinding = { workspace: string }

type EditorBufferChangesOptions = {
  activePath: string | null
  fileContents: Record<string, string>
  loadedVersions: Record<string, number>
  writersRef: RefObject<Record<string, { ownerId: string; version: number }>>
  loadedVersionsRef: RefObject<Record<string, number>>
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
  bufferSync: ReturnType<typeof createEditorBufferSync>
  isPathBlocked: (workspace: string, path: string) => boolean
}

type CapturedDocument = {
  capturedPath: string | null
  loadedContent: string | undefined
  loadedRevision: LoadedEditorRevision | undefined
  loadedVersion: number | undefined
  observedVersion: number
  ownerId?: string
  onRejected?: (attempted: string, current: string) => void
}

const createChangeHandler = (
  options: EditorBufferChangesOptions,
  captured: CapturedDocument,
): EditorChangeHandler => {
  const {
    loadedVersionsRef,
    binding,
    currentBindingRef,
    workspaceFileContentsRef,
    workspaceLoadingPathsRef,
    latestContentsRef,
    changeVersionRef,
    writersRef,
    setWorkspaceFileContents,
    markPathDirty,
    markPathClean,
    persistence,
    scheduleFlush,
    updateErrorMessage,
    bufferSync,
    isPathBlocked,
  } = options
  const {
    capturedPath,
    loadedContent,
    loadedRevision,
    loadedVersion,
    observedVersion,
    ownerId,
    onRejected,
  } = captured
  return (value: string, changes?: EditorTextChange[]) => {
    // Delayed editor notifications belong to the document that produced them.
    const path = capturedPath
    const workspace = binding.workspace
    if (!path || isPathBlocked(workspace, path)) return
    const contents = workspaceFileContentsRef.current[workspace]
    if (
      workspaceLoadingPathsRef.current[workspace]?.[path] ||
      ((!contents || !Object.prototype.hasOwnProperty.call(contents, path)) &&
        loadedContent === undefined)
    )
      return

    const identity = editorBufferIdentity(workspace, path)
    // Cached text at a renamed path is not editable until a versioned
    // snapshot has loaded. Delayed editor notifications must honor that too.
    if (!loadedRevision && !bufferSync.revisionFor(identity)) return
    const currentLoadedVersion = loadedVersionsRef.current[identity]
    const isActiveBinding = currentBindingRef.current === binding
    const previous = isActiveBinding
      ? (latestContentsRef.current[identity] ?? contents?.[path] ?? loadedContent!)
      : (contents?.[path] ?? loadedContent!)
    // A new disk snapshot invalidates every older pane, including the latest writer.
    if (currentLoadedVersion !== undefined && currentLoadedVersion !== loadedVersion) {
      if (isActiveBinding) onRejected?.(value, previous)
      return
    }
    const currentVersion = changeVersionRef.current[identity] ?? 0
    const writer = writersRef.current[identity]
    if (
      isActiveBinding &&
      ownerId !== undefined &&
      observedVersion !== currentVersion &&
      !(writer?.ownerId === ownerId && writer.version === currentVersion)
    ) {
      onRejected?.(value, previous)
      return
    }
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
    if (ownerId !== undefined) writersRef.current[identity] = { ownerId, version }
    else delete writersRef.current[identity]
    latestContentsRef.current[identity] = value
    // Even an undo to the saved text must be acknowledged by the backend.
    markPathDirty(workspace, path, { status: 'unsaved' })
    if (!isDesktopRuntime()) return

    const isCurrent = () =>
      currentBindingRef.current === binding &&
      changeVersionRef.current[identity] === version &&
      latestContentsRef.current[identity] === value

    const operation = bufferSync.enqueue({
      identity,
      path,
      previous,
      loadedRevision,
      content: value,
      changes,
      shouldApply: () => currentBindingRef.current === binding,
      onApplied: (status) => {
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
      },
    })
    void operation.catch((error: unknown) => {
      if (!isCurrent()) return
      toast.error(updateErrorMessage(), {
        id: 'editor-buffer-error:update:' + identity,
        description: String(error),
      })
      markPathDirty(workspace, path, { status: 'error', message: String(error) })
    })

    persistence.trackUpdate(operation, identity)
    scheduleFlush()
  }
}

export const useEditorBufferChanges = (options: EditorBufferChangesOptions) => {
  const { activePath, binding, bufferSync, fileContents, loadedVersions, changeVersionRef } =
    options
  const bindDocument = useCallback(
    (path: string, ownerId: string, onRejected?: (attempted: string, current: string) => void) => {
      const identity = editorBufferIdentity(binding.workspace, path)
      return createChangeHandler(options, {
        capturedPath: path,
        loadedContent: fileContents[path],
        loadedRevision: bufferSync.revisionFor(identity),
        loadedVersion: loadedVersions[identity],
        observedVersion: changeVersionRef.current[identity] ?? 0,
        ownerId,
        onRejected,
      })
    },
    [options, binding, bufferSync, fileContents, loadedVersions, changeVersionRef],
  )
  const activeIdentity = activePath ? editorBufferIdentity(binding.workspace, activePath) : ''
  return {
    bindDocument,
    // The compatibility callback has no pane owner and needs no observed edit generation.
    onEditorChange: createChangeHandler(options, {
      capturedPath: activePath,
      loadedContent: activePath ? fileContents[activePath] : undefined,
      loadedRevision: bufferSync.revisionFor(activeIdentity),
      loadedVersion: loadedVersions[activeIdentity],
      observedVersion: 0,
    }),
  }
}
