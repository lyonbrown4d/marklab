import path from 'node:path'

import { workspaceRootForAssets } from '@electron/services/workspace/path.js'
import type { FsStateData } from '@electron/services/workspace/types.js'
import { isPathInsideOrEqual } from '@electron/services/workspace/workspaceUtils.js'

export const workspaceTerminalCwd = (state: FsStateData): string => {
  if (state.rootKind === 'single' && state.singleFile) return path.dirname(state.singleFile)
  return state.rootPath
}

export const isWorkspaceAssetPathAllowed = (state: FsStateData, value: string): boolean => {
  if (typeof value !== 'string' || !value || value.includes('\0')) return false
  return isPathInsideOrEqual(workspaceRootForAssets(state), path.resolve(value))
}
