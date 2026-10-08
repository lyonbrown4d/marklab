import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import type { ParsedWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'

export type WorkspaceRestoreBackendBarrier = {
  promise: Promise<void>
  settle: () => void
  settled: boolean
}

export const createWorkspaceRestoreBackendBarrier = (): WorkspaceRestoreBackendBarrier => {
  let resolve!: () => void
  const barrier: WorkspaceRestoreBackendBarrier = {
    promise: new Promise<void>((next) => {
      resolve = next
    }),
    settle: () => {
      if (barrier.settled) return
      barrier.settled = true
      resolve()
    },
    settled: false,
  }
  return barrier
}

export const alignWorkspaceSessionBackendRoot = async (
  seed: ParsedWorkspaceSessionSeed,
): Promise<void> => {
  if (!isDesktopRuntime() || !seed.rootKind) return
  if (seed.rootKind === 'single' && seed.rootPath) {
    await fsApi.setSingleFile(seed.rootPath)
  } else if (seed.rootKind === 'external' && seed.rootPath) {
    await fsApi.setRoot(seed.rootPath)
  } else if (seed.rootKind === 'internal') {
    await fsApi.setRoot(null)
  }
}
