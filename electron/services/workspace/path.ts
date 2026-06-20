import path from 'node:path'
import type { FsStateData } from '@electron/services/workspace/types.js'
const schemePattern = /^[a-z][a-z\d+.-]*:/i
export const normalizeRelativePath = (value: string): string => {
  return value.replace(/\\/g, '/')
}
export const toWorkspaceRelative = (root: string, absolutePath: string): string | null => {
  const relative = normalizeRelativePath(
    path.relative(path.resolve(root), path.resolve(absolutePath)),
  )
  if (!relative || relative === '.') return null
  if (relative === '..' || relative.startsWith('../')) return null
  return relative
}
export const resolveWorkspacePath = (data: FsStateData, relative: string): string => {
  if (typeof relative !== 'string' || relative.trim() === '') {
    throw new Error('Path must not be empty')
  }
  if (relative.includes('\0')) {
    throw new Error('Path contains invalid characters')
  }
  if (
    path.isAbsolute(relative) ||
    (schemePattern.test(relative) && !path.win32.isAbsolute(relative))
  ) {
    throw new Error('Path must be relative')
  }
  const normalized = normalizeRelativePath(path.normalize(relative))
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Parent paths are not allowed')
  }
  if (data.rootKind === 'single') {
    if (!data.singleFile) throw new Error('Single-file path is not set')
    const fileName = path.basename(data.singleFile)
    if (normalized !== fileName) {
      throw new Error('Single-file mode only allows operations on the opened file')
    }
    return path.resolve(data.singleFile)
  }
  const root = path.resolve(data.rootPath)
  const resolved = path.resolve(root, normalized)
  const relativeToRoot = normalizeRelativePath(path.relative(root, resolved))
  if (
    relativeToRoot === '..' ||
    relativeToRoot.startsWith('../') ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error('Path must stay inside the current workspace')
  }
  return resolved
}
export const workspaceRootForAssets = (data: FsStateData): string => {
  if (data.rootKind === 'single') {
    return data.singleFile ? path.dirname(data.singleFile) : data.rootPath
  }
  return data.rootPath
}
export const isMarkdownPath = (value: string): boolean => {
  const ext = path.extname(value).toLowerCase()
  return ext === '.md' || ext === '.markdown'
}
export const isCalendarPath = (value: string): boolean => {
  return path.extname(value).toLowerCase() === '.ics'
}
export const isWorkspaceDocumentPath = (value: string): boolean => {
  return isMarkdownPath(value) || isCalendarPath(value)
}
export const isExternalTarget = (target: string): boolean => {
  try {
    const url = new URL(target)
    return ['http:', 'https:', 'data:', 'blob:', 'asset:', 'file:'].includes(url.protocol)
  } catch {
    return false
  }
}
export const stripAssetQueryAndHash = (target: string): string => {
  return target.split('#')[0]?.split('?')[0] ?? target
}
