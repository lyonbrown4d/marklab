import type { Logger } from '@electron/services/logger.js'
import type { BackgroundTaskStatus, FsStateData } from '@electron/services/workspace/types.js'

export type WorkspaceBufferTarget = { absolutePath: string; state: FsStateData | null }
export type WorkspaceBufferWriteFile = (args: {
  absolutePath: string
  baselineContent: string | null | undefined
  content: string
  relativePath: string
  state: FsStateData | null
  writeWithNode: () => Promise<void>
}) => Promise<void>

export type BufferRecord = {
  baselineContent: string | null | undefined
  content: string
  dirty: boolean
  relativePath: string
  revision: number
  target: WorkspaceBufferTarget
}

export type WorkspaceBufferStoreOptions = {
  errorMessage: (error: unknown) => string
  logger: Logger
  markOwnWrite: (absolutePath: string) => void
  onBuffersFlushed: (relativePaths: string[]) => void
  resolvePath: (relativePath: string) => string
  scheduleSnapshotChanged: () => void
  setTask: (
    id: string,
    label: string,
    status: BackgroundTaskStatus['status'],
    message: string | null,
  ) => void
  writeFile: WorkspaceBufferWriteFile
}
