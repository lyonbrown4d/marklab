import path from 'node:path'

import type { FsRootInfo } from '@electron/services/workspace/types'

export const canonicalWorkspacePath = (
  value: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error('Workspace path must be an absolute path')
  }
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  if (!pathApi.isAbsolute(value)) throw new Error('Workspace path must be absolute')
  const portable = pathApi.resolve(value).normalize('NFC').replaceAll('\\', '/')
  const canonical =
    platform === 'win32' || platform === 'darwin' ? portable.toLowerCase() : portable
  return stripTrailingSeparator(canonical)
}

export const createWorkspaceStorageKey = (
  root: Pick<FsRootInfo, 'kind' | 'path'>,
  platform: NodeJS.Platform = process.platform,
): string => `${root.kind}:${canonicalWorkspacePath(root.path, platform)}`

const stripTrailingSeparator = (value: string): string => {
  if (value === '/' || /^[a-z]:\/$/i.test(value)) return value
  return value.replace(/\/+$/, '')
}
