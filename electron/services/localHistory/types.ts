import type { FsRootKind } from '@electron/services/workspace/types'

export type LocalHistoryWorkspace = {
  kind: FsRootKind
  path: string
}

export type LocalHistoryEntry = {
  id: string
  path: string
  created_at: string
  size_bytes: number
  content_hash: string
  source: 'save'
}

export type LocalHistorySnapshot = LocalHistoryEntry & {
  content: string
}

export type LocalHistoryCaptureResult =
  | { status: 'created' | 'merged'; entry: LocalHistoryEntry }
  | { status: 'skipped'; reason: 'duplicate' | 'file-too-large' }

export type LocalHistoryServiceOptions = {
  userDataPath: string
  maxEntriesPerFile?: number
  maxFileSizeBytes?: number
  mergeWindowMs?: number
  now?: () => number
}

export type LocalHistoryServiceContract = {
  initialize?: () => Promise<void>
  dispose?: () => Promise<void>
  capture: (
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    content: string,
  ) => Promise<LocalHistoryCaptureResult>
  list: (workspace: LocalHistoryWorkspace, filePath: unknown) => Promise<LocalHistoryEntry[]>
  read: (
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
  ) => Promise<LocalHistorySnapshot>
  restore: (
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
    write: (content: string) => Promise<void>,
  ) => Promise<LocalHistorySnapshot>
  delete: (
    workspace: LocalHistoryWorkspace,
    filePath: unknown,
    entryId: unknown,
  ) => Promise<{ ok: true }>
  clear: (workspace: LocalHistoryWorkspace, filePath: unknown) => Promise<{ deleted: number }>
}
