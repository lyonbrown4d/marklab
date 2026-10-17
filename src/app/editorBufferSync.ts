import type {
  FsBufferSyncStatus,
  FsBufferTextChange,
  FsBufferUpdateRequest,
  FsBufferUpdateResult,
} from '@/services/fsApiSchemas'
import { createEditorTextPatchAsync } from '@/components/editorTextPatchWorkerClient'

type EditorBufferSyncApi = {
  applyBufferUpdate: (request: FsBufferUpdateRequest) => Promise<FsBufferUpdateResult>
}

export type LoadedEditorRevision = Readonly<{ revision: number; session_generation: number }>

type EditorBufferSyncUpdate = {
  identity: string
  path: string
  previous: string
  loadedRevision?: LoadedEditorRevision
  content: string
  changes?: FsBufferTextChange[]
  onApplied?: (status: FsBufferSyncStatus) => void
  shouldApply?: () => boolean
}

type DocumentSyncState = {
  acknowledgedContent: string | null
  failure: Error | null
  generation: number
  loadedRevision: { revision: number; session_generation: number }
  tail: Promise<void>
}

const changesProduceContent = (
  previous: string,
  content: string,
  changes: readonly FsBufferTextChange[],
): boolean => {
  const parts: string[] = []
  let cursor = 0
  let previousEnd = 0
  for (const [index, change] of changes.entries()) {
    const end = change.offset + change.delete_length
    if (
      (index > 0 && change.offset < previousEnd) ||
      change.offset > previous.length ||
      end > previous.length
    ) {
      return false
    }
    parts.push(previous.slice(cursor, change.offset), change.insert_text)
    cursor = end
    previousEnd = end
  }
  parts.push(previous.slice(cursor))
  return parts.join('') === content
}

export const createEditorBufferSync = (api: EditorBufferSyncApi) => {
  const documents = new Map<string, DocumentSyncState>()

  const seed = (identity: string, content: string, status: FsBufferSyncStatus): void => {
    documents.set(identity, {
      acknowledgedContent: content,
      failure: null,
      generation: 0,
      loadedRevision: { revision: status.revision, session_generation: status.session_generation },
      tail: Promise.resolve(),
    })
  }

  const enqueue = (update: EditorBufferSyncUpdate): Promise<void> => {
    let state = documents.get(update.identity)
    // A disposed editor can emit its final snapshot after clean cache eviction.
    // Its captured revision remains a valid CAS precondition; never fetch a newer one.
    if (!state && update.loadedRevision) {
      state = {
        acknowledgedContent: update.previous,
        failure: null,
        generation: 0,
        loadedRevision: update.loadedRevision,
        tail: Promise.resolve(),
      }
      documents.set(update.identity, state)
    }
    if (!state)
      return Promise.reject(new Error('Load a versioned document snapshot before editing'))
    state.generation += 1
    const generation = state.generation

    const run = async () => {
      const ensureActive = () => {
        if (update.shouldApply && !update.shouldApply()) {
          throw new Error('Editor buffer update cancelled because its workspace changed')
        }
      }
      ensureActive()
      if (state.failure) throw state.failure
      if (state.acknowledgedContent !== update.previous)
        throw new Error(
          'Editor content no longer matches its loaded revision. Reload before saving; unsaved text is retained.',
        )
      const changes =
        update.changes ?? (await createEditorTextPatchAsync(update.previous, update.content))
      const usePatch =
        changes != null &&
        changes.length > 0 &&
        changesProduceContent(update.previous, update.content, changes)
      const request: FsBufferUpdateRequest = {
        path: update.path,
        base_revision: state.loadedRevision.revision,
        session_generation: state.loadedRevision.session_generation,
        update: usePatch
          ? { kind: 'patch', changes }
          : { kind: 'snapshot', content: update.content },
      }
      ensureActive()
      const result = await api.applyBufferUpdate(request)
      if (result.kind === 'session_mismatch') {
        throw new Error('Workspace changed before the editor buffer update was applied')
      }
      if (result.kind === 'resync_required') {
        throw new Error(
          'Document changed in another editor. Reload before saving; your unsaved text is retained.',
        )
      }
      state.loadedRevision.revision = result.revision
      state.loadedRevision.session_generation = result.session_generation
      state.acknowledgedContent = update.content
      state.failure = null
      if (state.generation === generation) update.onApplied?.(result)
    }

    const recoverUncertainState = async () => {
      try {
        await run()
      } catch (error) {
        state.failure = error instanceof Error ? error : new Error(String(error))
        throw error
      }
    }
    const operation = state.tail.then(recoverUncertainState, recoverUncertainState)
    state.tail = operation.catch(() => undefined)
    return operation
  }

  return {
    clear: () => documents.clear(),
    clearWorkspace: (workspace: string) => {
      const prefix = `${workspace.length}:${workspace}`
      for (const identity of documents.keys())
        if (identity.startsWith(prefix)) documents.delete(identity)
    },
    forget: (identity: string) => documents.delete(identity),
    revisionFor: (identity: string): LoadedEditorRevision | undefined =>
      documents.get(identity)?.loadedRevision,
    enqueue,
    seed,
  }
}
