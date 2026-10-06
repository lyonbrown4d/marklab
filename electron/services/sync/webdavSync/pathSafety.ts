import fs from 'node:fs/promises'
import path from 'node:path'

import { WorkspaceSyncError } from '@electron/services/sync/core/types'

const PROTECTED_SEGMENTS = new Set(['.git', '.marklab-sync', 'node_modules'])
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const WINDOWS_INVALID_CHARACTER = /[<>:"|?*]/u
const CASE_FOLDED_PLATFORM = process.platform === 'win32' || process.platform === 'darwin'

const portableSegmentKey = (segment: string): string =>
  segment
    .normalize('NFC')
    .replace(/[ .]+$/u, '')
    .toLowerCase()

export const isProtectedSyncSegment = (segment: string): boolean =>
  PROTECTED_SEGMENTS.has(portableSegmentKey(segment))

const assertPortableSegment = (segment: string): void => {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    /[ .]$/u.test(segment) ||
    WINDOWS_INVALID_CHARACTER.test(segment) ||
    [...segment].some((character) => character.charCodeAt(0) < 32) ||
    WINDOWS_RESERVED_NAME.test(segment) ||
    isProtectedSyncSegment(segment)
  ) {
    throw new Error('Invalid or non-portable sync path')
  }
}

export const normalizeSyncPath = (value: string): string => {
  if (!value || value.includes('\0') || path.win32.isAbsolute(value) || value.startsWith('/')) {
    throw new Error('Invalid sync path')
  }
  const slashPath = value.replaceAll('\\', '/').normalize('NFC')
  const rawSegments = slashPath.split('/')
  if (rawSegments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Invalid sync path')
  }
  rawSegments.forEach(assertPortableSegment)
  return rawSegments.join('/')
}

export const portableSyncPathKey = (value: string): string =>
  normalizeSyncPath(value)
    .split('/')
    .map((segment) => portableSegmentKey(segment))
    .join('/')

export const resolveWorkspaceSyncPath = (root: string, relativePath: string): string => {
  const normalized = normalizeSyncPath(relativePath)
  const absoluteRoot = path.resolve(root)
  const candidate = path.resolve(absoluteRoot, ...normalized.split('/'))
  if (!isContainedPath(absoluteRoot, candidate)) throw new Error('Sync path escapes workspace')
  return candidate
}

export const assertWorkspaceRealPathContained = async (
  root: string,
  target: string,
): Promise<void> => {
  const absoluteRoot = path.resolve(root)
  const absoluteTarget = path.resolve(target)
  if (!isContainedPath(absoluteRoot, absoluteTarget)) {
    throw new WorkspaceSyncError('validation', 'Sync target escapes workspace')
  }
  const [realRoot, realExistingTarget] = await Promise.all([
    fs.realpath(absoluteRoot),
    nearestExistingRealPath(absoluteTarget),
  ])
  if (!isContainedPath(realRoot, realExistingTarget)) {
    throw new WorkspaceSyncError('validation', 'Sync target is not contained by workspace')
  }
}

export const resolveSafeWorkspaceTarget = async (
  root: string,
  relativePath: string,
): Promise<string> => {
  const normalized = normalizeSyncPath(relativePath)
  const destination = resolveWorkspaceSyncPath(root, normalized)
  let current = path.resolve(root)
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current).catch((error: unknown) => {
      if (isMissing(error)) return null
      throw error
    })
    if (!stats) break
    if (stats.isSymbolicLink()) {
      throw new WorkspaceSyncError('validation', 'Sync target path is a symbolic link')
    }
    if (current !== destination && !stats.isDirectory()) {
      throw new WorkspaceSyncError('validation', 'Sync target parent is not a directory')
    }
  }
  await assertWorkspaceRealPathContained(root, destination)
  return destination
}

const nearestExistingRealPath = async (target: string): Promise<string> => {
  let candidate = target
  while (true) {
    try {
      return await fs.realpath(candidate)
    } catch (error) {
      if (!isMissing(error)) throw error
      const parent = path.dirname(candidate)
      if (parent === candidate) throw error
      candidate = parent
    }
  }
}

const comparableAbsolutePath = (value: string): string => {
  const normalized = path.resolve(value).normalize('NFC')
  return CASE_FOLDED_PLATFORM ? normalized.toLowerCase() : normalized
}

const isContainedPath = (root: string, candidate: string): boolean => {
  const rootKey = comparableAbsolutePath(root)
  const candidateKey = comparableAbsolutePath(candidate)
  return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}${path.sep}`)
}

const isMissing = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR'),
  )
