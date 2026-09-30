import type { BigIntStats } from 'node:fs'
import fs, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'

type FileIdentity = {
  birthtimeNs: bigint
  ctimeNs: bigint
  dev: bigint
  ino: bigint
  mode: bigint
  mtimeNs: bigint
  size: bigint
}

export type SavePathCapability = {
  expirationTimer?: NodeJS.Timeout
  expiresAt: number
  handle: FileHandle
  outputPath: string
  parentRealPath: string
  released: boolean
  targetIdentity: FileIdentity
}

const capabilityLifetimeMs = 5 * 60 * 1000
const capabilitiesByRenderer = new Map<number, Map<string, SavePathCapability>>()
const capabilityKey = (value: string): string => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export const issueSavePathCapability = async (rendererId: number, value: string): Promise<void> => {
  const outputPath = path.resolve(value)
  const parentRealPath = await fs.realpath(path.dirname(outputPath))
  const initialIdentity = await readTargetIdentity(outputPath)
  const handle = await fs.open(outputPath, initialIdentity ? 'r+' : 'wx+')
  try {
    const handleIdentity = await readHandleIdentity(handle)
    if (initialIdentity && !sameIdentity(initialIdentity, handleIdentity)) {
      throw unauthorizedPathError()
    }
    const capability: SavePathCapability = {
      expiresAt: Date.now() + capabilityLifetimeMs,
      handle,
      outputPath,
      parentRealPath,
      released: false,
      targetIdentity: handleIdentity,
    }
    await verifySavePathCapability(capability)
    const capabilities = capabilitiesByRenderer.get(rendererId) ?? new Map()
    const key = capabilityKey(outputPath)
    const existing = capabilities.get(key)
    if (existing) await releaseSavePathCapability(existing)
    capabilities.set(key, capability)
    capabilitiesByRenderer.set(rendererId, capabilities)
    capability.expirationTimer = setTimeout(() => {
      if (capabilities.get(key) !== capability) return
      capabilities.delete(key)
      if (capabilities.size === 0) capabilitiesByRenderer.delete(rendererId)
      void releaseSavePathCapability(capability)
    }, capabilityLifetimeMs)
    capability.expirationTimer.unref()
  } catch (error) {
    await handle.close().catch(() => undefined)
    throw error
  }
}

export const consumeSavePathCapability = async (
  rendererId: number,
  value: string,
): Promise<SavePathCapability> => {
  const resolved = path.resolve(value)
  const capabilities = capabilitiesByRenderer.get(rendererId)
  const capability = capabilities?.get(capabilityKey(resolved))
  capabilities?.delete(capabilityKey(resolved))
  if (capabilities?.size === 0) capabilitiesByRenderer.delete(rendererId)
  if (!capability || capability.expiresAt < Date.now()) {
    if (capability) await releaseSavePathCapability(capability)
    throw unauthorizedPathError()
  }
  try {
    await verifySavePathCapability(capability)
    return capability
  } catch (error) {
    await releaseSavePathCapability(capability)
    throw error
  }
}

export const verifySavePathCapability = async (capability: SavePathCapability): Promise<void> => {
  if (capability.released) throw unauthorizedPathError()
  const parentRealPath = await fs.realpath(path.dirname(capability.outputPath))
  if (capabilityKey(parentRealPath) !== capabilityKey(capability.parentRealPath)) {
    throw unauthorizedPathError()
  }
  const [pathIdentity, handleIdentity] = await Promise.all([
    readTargetIdentity(capability.outputPath),
    readHandleIdentity(capability.handle),
  ])
  if (
    !pathIdentity ||
    !sameIdentity(capability.targetIdentity, pathIdentity) ||
    !sameIdentity(capability.targetIdentity, handleIdentity)
  ) {
    throw unauthorizedPathError()
  }
}

export const commitSavePathCapability = async (
  capability: SavePathCapability,
  data: string | NodeJS.ArrayBufferView,
): Promise<void> => {
  try {
    await verifySavePathCapability(capability)
    await capability.handle.truncate(0)
    await capability.handle.writeFile(data)
    await capability.handle.sync()
    await verifyStablePathIdentity(capability)
  } finally {
    await releaseSavePathCapability(capability)
  }
}

export const releaseSavePathCapability = async (capability: SavePathCapability): Promise<void> => {
  if (capability.released) return
  capability.released = true
  if (capability.expirationTimer) clearTimeout(capability.expirationTimer)
  await capability.handle.close().catch(() => undefined)
}

const verifyStablePathIdentity = async (capability: SavePathCapability): Promise<void> => {
  const parentRealPath = await fs.realpath(path.dirname(capability.outputPath))
  const pathIdentity = await readTargetIdentity(capability.outputPath)
  if (
    capabilityKey(parentRealPath) !== capabilityKey(capability.parentRealPath) ||
    !pathIdentity ||
    !sameFileObject(capability.targetIdentity, pathIdentity)
  ) {
    throw unauthorizedPathError()
  }
}

const readTargetIdentity = async (outputPath: string): Promise<FileIdentity | null> => {
  const stat = await fs
    .lstat(outputPath, { bigint: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  if (!stat) return null
  if (stat.isSymbolicLink() || !stat.isFile()) throw unauthorizedPathError()
  return fileIdentity(stat)
}

const readHandleIdentity = async (handle: FileHandle): Promise<FileIdentity> =>
  fileIdentity(await handle.stat({ bigint: true }))

const fileIdentity = (stat: BigIntStats): FileIdentity => ({
  birthtimeNs: stat.birthtimeNs,
  ctimeNs: stat.ctimeNs,
  dev: stat.dev,
  ino: stat.ino,
  mode: stat.mode,
  mtimeNs: stat.mtimeNs,
  size: stat.size,
})

const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean =>
  Object.keys(left).every(
    (key) => left[key as keyof FileIdentity] === right[key as keyof FileIdentity],
  )

const sameFileObject = (left: FileIdentity, right: FileIdentity): boolean =>
  left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs

const unauthorizedPathError = (): Error =>
  new Error('Export output path is not authorized by a save dialog')

export const clearSavePathCapabilitiesForTest = async (): Promise<void> => {
  const capabilities = Array.from(capabilitiesByRenderer.values()).flatMap((items) => [
    ...items.values(),
  ])
  capabilitiesByRenderer.clear()
  await Promise.all(capabilities.map(releaseSavePathCapability))
}
