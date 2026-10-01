import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

type PathIdentity = { dev: number | bigint; ino: number | bigint }

const containsControlCharacter = (value: string): boolean => {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export type CloneDestination = {
  stagingPath: string
  targetPath: string
  cleanup: () => Promise<void>
  publish: () => Promise<void>
}

const sameIdentity = (left: PathIdentity, right: PathIdentity): boolean => {
  return left.dev === right.dev && left.ino === right.ino
}

const readDirectoryIdentity = async (directory: string): Promise<PathIdentity> => {
  const stat = await fs.stat(directory, { bigint: true })
  if (!stat.isDirectory()) throw new Error(`Git clone parent is not a directory: ${directory}`)
  return { dev: stat.dev, ino: stat.ino }
}

const targetIdentity = async (target: string): Promise<PathIdentity | null> => {
  const stat = await fs.lstat(target, { bigint: true }).catch(() => null)
  if (!stat) return null
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Git clone target must be a non-symbolic directory')
  }
  if ((await fs.readdir(target)).length > 0) {
    throw new Error('Git clone target directory must be empty')
  }
  return { dev: stat.dev, ino: stat.ino }
}

export const prepareCloneDestination = async (value: unknown): Promise<CloneDestination> => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Git clone target path is required')
  }
  if (containsControlCharacter(value)) {
    throw new Error('Git clone target path contains invalid characters')
  }
  const requestedTarget = path.resolve(value)
  const requestedParent = path.dirname(requestedTarget)
  const parentPath = await fs.realpath(requestedParent)
  const parentIdentity = await readDirectoryIdentity(parentPath)
  const targetPath = path.join(parentPath, path.basename(requestedTarget))
  const initialTargetIdentity = await targetIdentity(targetPath)
  const stagingPath = path.join(
    parentPath,
    `.${path.basename(targetPath)}.marklab-clone-${randomUUID()}`,
  )
  await fs.mkdir(stagingPath, { mode: 0o700 })
  const stagingIdentity = await readDirectoryIdentity(stagingPath)
  let published = false

  const hasOriginalStagingIdentity = async (): Promise<boolean> => {
    const current = await fs.lstat(stagingPath, { bigint: true }).catch(() => null)
    return Boolean(
      current &&
      current.isDirectory() &&
      !current.isSymbolicLink() &&
      sameIdentity(current, stagingIdentity),
    )
  }

  const revalidate = async (): Promise<void> => {
    const currentParent = await fs.realpath(requestedParent).catch(() => null)
    if (!currentParent || path.resolve(currentParent) !== path.resolve(parentPath)) {
      throw new Error('Git clone parent changed during the operation')
    }
    if (!sameIdentity(await readDirectoryIdentity(currentParent), parentIdentity)) {
      throw new Error('Git clone parent changed during the operation')
    }
    const currentTargetIdentity = await targetIdentity(targetPath)
    if (
      (initialTargetIdentity === null) !== (currentTargetIdentity === null) ||
      (initialTargetIdentity &&
        currentTargetIdentity &&
        !sameIdentity(initialTargetIdentity, currentTargetIdentity))
    ) {
      throw new Error('Git clone target changed during the operation')
    }
  }

  const cleanup = async (): Promise<void> => {
    if (published) return
    if (
      path.dirname(stagingPath) !== parentPath ||
      !path.basename(stagingPath).startsWith(`.${path.basename(targetPath)}.marklab-clone-`)
    ) {
      throw new Error('Refusing to clean an invalid Git clone staging path')
    }
    const currentParent = await fs.realpath(parentPath).catch(() => null)
    if (
      !currentParent ||
      path.resolve(currentParent) !== path.resolve(parentPath) ||
      !sameIdentity(await readDirectoryIdentity(currentParent), parentIdentity)
    ) {
      throw new Error('Refusing to clean after the Git clone parent changed')
    }
    const exists = await fs.lstat(stagingPath, { bigint: true }).catch(() => null)
    if (!exists) return
    if (!(await hasOriginalStagingIdentity())) {
      throw new Error('Refusing to clean because the Git clone staging directory changed')
    }
    await fs.rm(stagingPath, { force: true, recursive: true })
  }

  const publish = async (): Promise<void> => {
    await revalidate()
    if (!(await hasOriginalStagingIdentity())) {
      throw new Error('Git clone staging directory changed during the operation')
    }
    if (!initialTargetIdentity) {
      await fs.rename(stagingPath, targetPath)
      published = true
      return
    }
    const reservation = path.join(parentPath, `.${path.basename(targetPath)}.empty-${randomUUID()}`)
    await fs.rename(targetPath, reservation)
    try {
      await fs.rename(stagingPath, targetPath)
      published = true
      await fs.rmdir(reservation)
    } catch (error) {
      await fs.rename(reservation, targetPath).catch(() => undefined)
      throw error
    }
  }

  return { cleanup, publish, stagingPath, targetPath }
}
