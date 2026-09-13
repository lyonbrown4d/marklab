import fs from 'node:fs/promises'
import path from 'node:path'

const CASE_FOLDED_PLATFORM = process.platform === 'win32' || process.platform === 'darwin'

export type CanonicalWriteIdentity = { key: string; writePath: string }

const foldPath = (value: string): string => {
  const normalized = value.normalize('NFC').replaceAll('\\', '/')
  return CASE_FOLDED_PLATFORM ? normalized.toLowerCase() : normalized
}

export const isMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}

const statKey = (stats: { dev: number | bigint; ino: number | bigint }): string =>
  String(stats.dev) + ':' + String(stats.ino)

export const canonicalWorkspaceRelativeKey = (relativePath: string): string => {
  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/')).replace(/^\.\//, '')
  if (
    normalized === '' ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new Error('Invalid workspace-relative path: ' + relativePath)
  }
  return normalized
}

export const canonicalWorkspaceAbsoluteKey = (absolutePath: string): string =>
  foldPath(path.resolve(absolutePath))

const missingWriteIdentity = async (absolutePath: string): Promise<CanonicalWriteIdentity> => {
  let parent = path.dirname(absolutePath)
  const suffix = [path.basename(absolutePath)]

  while (true) {
    try {
      const realParent = await fs.realpath(parent)
      const parentStats = await fs.stat(realParent)
      const relativeSuffix = foldPath(suffix.join('/'))
      return {
        key: 'missing:' + statKey(parentStats) + ':' + relativeSuffix,
        writePath: path.join(realParent, ...suffix),
      }
    } catch (error) {
      if (!isMissingError(error)) throw error
      const nextParent = path.dirname(parent)
      if (nextParent === parent) throw error
      suffix.unshift(path.basename(parent))
      parent = nextParent
    }
  }
}

export const canonicalWorkspaceWriteIdentity = async (
  absolutePath: string,
): Promise<CanonicalWriteIdentity> => {
  const resolvedPath = path.resolve(absolutePath)
  try {
    const realPath = await fs.realpath(resolvedPath)
    const stats = await fs.stat(realPath)
    const identity = statKey(stats)
    return {
      key: identity === '0:0' ? 'path:' + foldPath(realPath) : 'entry:' + identity,
      writePath: realPath,
    }
  } catch (error) {
    if (!isMissingError(error)) throw error
    return missingWriteIdentity(resolvedPath)
  }
}
