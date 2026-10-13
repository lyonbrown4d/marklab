import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import type { ParsedWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'
import type { LoadWorkspace, RestoreResult } from '@/app/workspaceRestoreTypes'
import type { RootKind } from '@/store/appTypes'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'

export const restoreDefaultWorkspace = async ({
  isCurrent,
  loadWorkspace,
  rootKind,
  rootPath,
}: {
  isCurrent: () => boolean
  loadWorkspace: LoadWorkspace
  rootKind: RootKind
  rootPath: string
}): Promise<RestoreResult> => {
  if (isDesktopRuntime() && rootPath) {
    try {
      await flushEditorChanges()
      if (!isCurrent()) return { ok: true }
      if (rootKind === 'single') await fsApi.setSingleFile(rootPath)
      else if (rootKind === 'external') await fsApi.setRoot(rootPath)
    } catch (error) {
      return { error, failure: 'root', ok: false }
    }
  }
  if (!isCurrent()) return { ok: true }
  try {
    await loadWorkspace()
    return { ok: true }
  } catch (error) {
    return { error, failure: 'session', ok: false }
  }
}

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
