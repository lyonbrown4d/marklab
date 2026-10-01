import fs from 'node:fs/promises'
import path from 'node:path'

export const normalizeCustomModelDirectory = (input: string | undefined): string => {
  if (!input || !path.isAbsolute(input)) {
    throw new Error('Custom model directory must be an absolute path')
  }
  const normalized = path.normalize(path.resolve(input))
  if (samePath(normalized, path.parse(normalized).root)) {
    throw new Error('Custom model directory must not be a filesystem root')
  }
  return normalized
}

export const prepareModelDirectoryTarget = async (
  from: string,
  target: string,
  forbiddenDirectories: readonly string[],
  allowCreateFrom: boolean,
  allowCreateTarget: boolean,
): Promise<{ from: string; to: string; same: boolean; fromDeviceId: string }> => {
  await ensureDirectory(from, allowCreateFrom)
  await ensureDirectory(target, allowCreateTarget)
  const canonicalFrom = await fs.realpath(from)
  const canonicalTarget = await fs.realpath(target)
  const fromDeviceId = (await fs.stat(canonicalFrom)).dev.toString()
  if (samePath(canonicalFrom, canonicalTarget)) {
    return { from: canonicalFrom, to: canonicalTarget, same: true, fromDeviceId }
  }
  if (
    containsPath(canonicalFrom, canonicalTarget) ||
    containsPath(canonicalTarget, canonicalFrom)
  ) {
    throw new Error('Custom model directory must not overlap the current model directory')
  }
  for (const forbidden of forbiddenDirectories) {
    const canonicalForbidden = await fs.realpath(forbidden).catch(() => path.resolve(forbidden))
    if (containsPath(canonicalForbidden, canonicalTarget)) {
      throw new Error('Custom model directory must not be inside the application directory')
    }
  }
  return { from: canonicalFrom, to: canonicalTarget, same: false, fromDeviceId }
}

const ensureDirectory = async (directory: string, allowCreate: boolean): Promise<void> => {
  if (allowCreate) await fs.mkdir(directory, { recursive: true })
  const stats = await fs.stat(directory).catch(() => null)
  if (!stats?.isDirectory()) throw new Error('Custom model directory is unavailable')
}

export const hasCanonicalDirectoryIdentity = async (
  directory: string,
  expectedCanonicalPath: string,
  expectedDeviceId?: string,
): Promise<boolean> => {
  const current = await fs.realpath(directory).catch(() => null)
  if (current === null || !samePath(current, expectedCanonicalPath)) return false
  if (!expectedDeviceId) return true
  const stats = await fs.stat(current).catch(() => null)
  return stats?.dev.toString() === expectedDeviceId
}

export const validateExistingModelDirectory = async (
  directory: string,
  forbiddenDirectories: readonly string[],
): Promise<{ canonicalPath: string; deviceId: string }> => {
  const stats = await fs.stat(directory).catch(() => null)
  if (!stats?.isDirectory()) throw new Error('Custom model directory is unavailable')
  const canonicalPath = await fs.realpath(directory)
  if (samePath(canonicalPath, path.parse(canonicalPath).root)) {
    throw new Error('Custom model directory must not be a filesystem root')
  }
  for (const forbidden of forbiddenDirectories) {
    const canonicalForbidden = await fs.realpath(forbidden).catch(() => path.resolve(forbidden))
    if (containsPath(canonicalForbidden, canonicalPath)) {
      throw new Error('Custom model directory must not be inside the application directory')
    }
  }
  return { canonicalPath, deviceId: stats.dev.toString() }
}

const containsPath = (parent: string, candidate: string): boolean => {
  const relative = path.relative(fold(parent), fold(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const samePath = (left: string, right: string): boolean => fold(left) === fold(right)
const fold = (value: string): string =>
  process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
