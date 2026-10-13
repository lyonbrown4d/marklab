import type { applyWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'
import type { WorkspaceRestoreBackendBarrier } from '@/app/workspaceRestoreBackend'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import type { FsSnapshot } from '@/services/fsApi'
import type { RefObject } from 'react'

export type UseWorkspaceRestoreArgs = {
  rootSwitchingRef?: RefObject<boolean>
  hasHydrated: boolean
  rootPath: string
  rootKind: RootKind
  loadWorkspace: LoadWorkspace
  dirtyPaths?: Record<string, true>
  onTreeActiveTabChanged?: (tab: WorkspaceTab | null) => void
}

export type UseWorkspaceRestoreResult = {
  isSessionRestored: boolean
  restoreStatusMessage: string | null
  isRestoringSession: boolean
  restoreWorkspaceSession: () => Promise<boolean>
  restoreFailure: WorkspaceRestoreFailure | null
  completeWorkspaceRecovery: () => Promise<void>
  waitForWorkspaceRestore: () => Promise<void>
}

export type LoadWorkspace = (options?: {
  activeTabId?: string | null
  preserveCurrentRoute?: boolean
  snapshot?: FsSnapshot
  tabs?: WorkspaceTab[]
}) => Promise<void>

export type WorkspaceRestoreFailure = {
  phase: 'root' | 'session'
  rootPath: string
  rootKind: RootKind
  message: string
  detail: string
}

export type RestoreResult =
  { ok: true } | { error: unknown; failure: 'root' | 'session'; ok: false }

export type RestoreOperation = {
  backendAlignment?: WorkspaceRestoreBackendBarrier
  generation: number
  kind: 'default' | 'seed'
  rootPath: string
  rootKind: RootKind
  payload?: Parameters<typeof applyWorkspaceSessionSeed>[0]
  promise: Promise<RestoreResult>
  settled: boolean
}

export type QueuedSeed = {
  generation: number
  payload: Parameters<typeof applyWorkspaceSessionSeed>[0]
}
