import fs from 'node:fs'
import path from 'node:path'
import { isWorkspaceDocumentPath } from '@electron/services/workspace/path.js'
import type { FsStateData } from '@electron/services/workspace/types.js'
import {
  isSameExternalRoot,
  isSameInternalRoot,
  isSameSingleFileRoot,
} from '@electron/services/workspace/workspaceRootState.js'
import { ensureDefaultFile, stringArg } from '@electron/services/workspace/workspaceUtils.js'

export const selectWorkspaceRoot = async (
  state: FsStateData,
  value: unknown,
): Promise<FsStateData | null> => {
  const rootPath = typeof value === 'object' && value && 'path' in value ? value.path : value
  if (rootPath != null && typeof rootPath !== 'string') {
    throw new Error('fs_set_root requires path to be a string or null')
  }
  if (rootPath) {
    const stat = await fs.promises.stat(rootPath).catch(() => null)
    if (!stat?.isDirectory()) throw new Error('Selected path is not a directory')
    const resolved = path.resolve(rootPath)
    return isSameExternalRoot(state, resolved)
      ? null
      : { ...state, rootKind: 'external', rootPath: resolved, singleFile: null }
  }
  if (isSameInternalRoot(state)) return null
  fs.mkdirSync(state.internalRoot, { recursive: true })
  ensureDefaultFile(state.internalRoot)
  return { ...state, rootKind: 'internal', rootPath: state.internalRoot, singleFile: null }
}

export const selectSingleFileWorkspace = async (
  state: FsStateData,
  value: unknown,
): Promise<FsStateData | null> => {
  const filePath = stringArg(value, 'path')
  const stat = await fs.promises.stat(filePath).catch(() => null)
  if (!stat?.isFile()) throw new Error('Selected path is not a file')
  if (!isWorkspaceDocumentPath(filePath)) {
    throw new Error('Selected file is not supported by this workspace')
  }
  const resolved = path.resolve(filePath)
  return isSameSingleFileRoot(state, resolved)
    ? null
    : { ...state, rootKind: 'single', rootPath: resolved, singleFile: resolved }
}
