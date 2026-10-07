import type { FsBufferStatus } from '@electron/services/workspace/types'
import {
  applyWorkspaceBufferChanges,
  parseWorkspaceBufferUpdate,
  type WorkspaceBufferUpdateResult,
} from '@electron/services/workspace/workspaceBufferPatch'

type BufferStore = {
  getStatus(path: string): FsBufferStatus | null
  readCached(path: string): string | null
}

export const createWorkspaceBufferUpdateHandler =
  (
    store: BufferStore,
    validatePath: (path: string) => void,
    update: (path: string, content: string) => FsBufferStatus,
    getSessionGeneration: () => number,
  ) =>
  (value: unknown): WorkspaceBufferUpdateResult => {
    const request = parseWorkspaceBufferUpdate(value)
    const sessionGeneration = getSessionGeneration()
    if (request.session_generation !== sessionGeneration) {
      return {
        kind: 'session_mismatch',
        path: request.path,
        session_generation: sessionGeneration,
      }
    }
    validatePath(request.path)
    const current = store.readCached(request.path)
    const revision = store.getStatus(request.path)?.revision ?? 0
    if (
      request.base_revision !== revision ||
      (request.update.kind === 'patch' && current === null)
    ) {
      return {
        kind: 'resync_required',
        path: request.path,
        revision,
        session_generation: sessionGeneration,
      }
    }
    const content =
      request.update.kind === 'snapshot'
        ? request.update.content
        : applyWorkspaceBufferChanges(current!, request.update.changes)
    return {
      kind: 'applied',
      ...update(request.path, content),
      session_generation: sessionGeneration,
    }
  }
