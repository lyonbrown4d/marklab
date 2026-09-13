import path from 'node:path'

import type { FsStateData } from '@electron/services/workspace/types.js'

export const workspaceTerminalCwd = (state: FsStateData): string => {
  if (state.rootKind === 'single' && state.singleFile) return path.dirname(state.singleFile)
  return state.rootPath
}
