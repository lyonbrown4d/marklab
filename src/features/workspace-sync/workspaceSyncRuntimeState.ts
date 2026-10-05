import type { WorkspaceSyncProgress, WorkspaceSyncResult } from '@/types/workspaceSync'

export type RootSyncState = {
  requestId: string | null
  phase: 'idle' | 'syncing' | 'completed' | 'error'
  progress: WorkspaceSyncProgress | null
  result: WorkspaceSyncResult | null
  error: string | null
  cancelPending: boolean
  cancelError: string | null
}

export const createRootSyncState = (): RootSyncState => ({
  requestId: null,
  phase: 'idle',
  progress: null,
  result: null,
  error: null,
  cancelPending: false,
  cancelError: null,
})

export const normalizeSyncRoot = (rootPath: string): string => {
  const normalized = rootPath.trim().normalize('NFC').replaceAll('\\', '/')
  const withoutTrailingSeparator = normalized.replace(/\/+$/, '') || '/'
  const isWindowsPath = /^[a-z]:($|\/)/i.test(withoutTrailingSeparator)
  const isUncPath = withoutTrailingSeparator.startsWith('//')
  return isWindowsPath || isUncPath
    ? withoutTrailingSeparator.toLocaleLowerCase('en-US')
    : withoutTrailingSeparator
}

export const updateRootSyncState = (
  states: Map<string, RootSyncState>,
  rootKey: string,
  update: (state: RootSyncState) => RootSyncState,
): Map<string, RootSyncState> => {
  const current = states.get(rootKey) ?? createRootSyncState()
  const next = update(current)
  if (next === current) return states
  const updated = new Map(states)
  updated.set(rootKey, next)
  return updated
}
