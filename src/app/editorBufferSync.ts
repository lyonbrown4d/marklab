import type {
  FsBufferSyncStatus,
  FsBufferTextChange,
  FsBufferUpdateRequest,
  FsBufferUpdateResult,
} from '@/services/fsApiSchemas'
import { createEditorTextPatchAsync } from '@/components/editorTextPatchWorkerClient'

type EditorBufferSyncApi = {
  applyBufferUpdate: (request: FsBufferUpdateRequest) => Promise<FsBufferUpdateResult>
  getBufferStatus: (path: string) => Promise<FsBufferSyncStatus | null>
}

type EditorBufferSyncUpdate = {
  identity: string
  path: string
  previous: string
  content: string
  changes?: FsBufferTextChange[]
  onApplied?: (status: FsBufferSyncStatus) => void
  shouldApply?: () => boolean
}

type DocumentSyncState = {
  acknowledgedContent: string | null
  forceCheckpoint: boolean
  generation: number
  revision: number | null
  sessionGeneration: number | null
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

  const stateFor = (identity: string): DocumentSyncState => {
    const existing = documents.get(identity)
    if (existing) return existing
    const created = {
      acknowledgedContent: null,
      forceCheckpoint: false,
      generation: 0,
      revision: null,
      sessionGeneration: null,
      tail: Promise.resolve(),
    }
    documents.set(identity, created)
    return created
  }

  const enqueue = (update: EditorBufferSyncUpdate): Promise<void> => {
    const state = stateFor(update.identity)
    state.generation += 1
    const generation = state.generation

    const run = async () => {
      const ensureActive = () => {
        if (update.shouldApply && !update.shouldApply()) {
          throw new Error('Editor buffer update cancelled because its workspace changed')
        }
      }
      ensureActive()
      if (state.revision === null) {
        const status = await api.getBufferStatus(update.path)
        if (!status) throw new Error('Workspace buffer status is unavailable')
        state.revision = status.revision
        state.sessionGeneration = status.session_generation
        if (!state.forceCheckpoint) state.acknowledgedContent = update.previous
      }
      ensureActive()
      const canPatch = !state.forceCheckpoint && state.acknowledgedContent === update.previous
      const changes = canPatch
        ? (update.changes ?? (await createEditorTextPatchAsync(update.previous, update.content)))
        : null
      const usePatch =
        changes != null &&
        changes.length > 0 &&
        changesProduceContent(update.previous, update.content, changes)
      const request: FsBufferUpdateRequest = {
        path: update.path,
        base_revision: state.revision,
        session_generation: state.sessionGeneration!,
        update: usePatch
          ? { kind: 'patch', changes }
          : { kind: 'snapshot', content: update.content },
      }
      ensureActive()
      let result = await api.applyBufferUpdate(request)
      if (result.kind === 'resync_required') {
        result = await api.applyBufferUpdate({
          path: update.path,
          base_revision: result.revision,
          session_generation: result.session_generation,
          update: { kind: 'snapshot', content: update.content },
        })
      }
      if (result.kind === 'session_mismatch') {
        throw new Error('Workspace changed before the editor buffer update was applied')
      }
      if (result.kind === 'resync_required') {
        throw new Error('Workspace buffer resynchronization was rejected')
      }
      state.revision = result.revision
      state.sessionGeneration = result.session_generation
      state.acknowledgedContent = update.content
      state.forceCheckpoint = false
      if (state.generation === generation) update.onApplied?.(result)
    }

    const recoverUncertainState = async () => {
      try {
        await run()
      } catch (error) {
        state.acknowledgedContent = null
        state.forceCheckpoint = true
        state.revision = null
        state.sessionGeneration = null
        throw error
      }
    }
    const operation = state.tail.then(recoverUncertainState, recoverUncertainState)
    state.tail = operation.catch(() => undefined)
    return operation
  }

  return {
    clear: () => documents.clear(),
    enqueue,
  }
}
