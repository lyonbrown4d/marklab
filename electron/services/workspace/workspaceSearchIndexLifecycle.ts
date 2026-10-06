import { createHash } from 'node:crypto'
import path from 'node:path'

import { isSearchIndexablePath } from '@electron/services/workspace/path'
import type { FsStateData } from '@electron/services/workspace/types'
import type { WatchEventName } from '@electron/services/workspace/workspaceUtils'

export const workspaceSearchKey = (state: FsStateData): string => {
  const raw = `${state.rootKind}|${state.rootPath}|${state.singleFile ?? ''}`
  return createHash('sha256').update(raw).digest('hex')
}

export const workspaceSearchIndexPath = (userDataPath: string, searchKey: string): string =>
  path.join(userDataPath, 'cache', 'search-index', searchKey)

export const workspaceChangeAffectsSearch = (
  pathValue: string | null,
  event?: WatchEventName,
): boolean => {
  if (!pathValue || !event) return true
  if (event === 'addDir') return false
  return event === 'unlinkDir' || isSearchIndexablePath(pathValue)
}
