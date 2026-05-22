import path from 'node:path'

import { toWorkspaceRelative, workspaceRootForAssets } from '@electron/services/workspace/path.js'
import type { FsStateData } from '@electron/services/workspace/types.js'
import { samePath } from '@electron/services/workspace/workspaceUtils.js'

export const currentSingleFileName = (state: FsStateData): string | null => {
  return state.singleFile ? path.basename(state.singleFile) : null
}

export const isCurrentSingleFilePath = (state: FsStateData, absolutePath: string): boolean => {
  return Boolean(state.singleFile && samePath(state.singleFile, absolutePath))
}

export const relativePathsForAbsolutePaths = (
  state: FsStateData,
  absolutePaths: string[],
): string[] => {
  const root = workspaceRootForAssets(state)
  const relativePaths: string[] = []
  for (const absolutePath of absolutePaths) {
    const relativePath = toWorkspaceRelative(root, absolutePath)
    if (relativePath) relativePaths.push(relativePath)
  }
  return relativePaths
}
