import type { FsStateData } from '@electron/services/workspace/types.js'

export const isSameExternalRoot = (state: FsStateData, rootPath: string): boolean => {
  return state.rootKind === 'external' && state.rootPath === rootPath && !state.singleFile
}

export const isSameInternalRoot = (state: FsStateData): boolean => {
  return state.rootKind === 'internal' && state.rootPath === state.internalRoot && !state.singleFile
}

export const isSameSingleFileRoot = (state: FsStateData, filePath: string): boolean => {
  return state.rootKind === 'single' && state.rootPath === filePath && state.singleFile === filePath
}
