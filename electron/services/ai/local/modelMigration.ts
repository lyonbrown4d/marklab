import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { fileExistsWithSize, sha256File } from '@electron/services/ai/local/modelFiles.js'
import { atomicInstallFile } from '@electron/services/ai/local/atomicFile.js'
import type {
  LocalAiCatalogEntry,
  LocalAiDirectoryMigration,
} from '@electron/services/ai/local/types.js'

type CopyModelsOptions = {
  activeModelId: string | null
  entries: readonly LocalAiCatalogEntry[]
  from: string
  migrationId: string
  onProgress: (
    progress: Pick<LocalAiDirectoryMigration, 'state' | 'copiedBytes' | 'totalBytes'>,
  ) => void
  to: string
}

export const copyInstalledModels = async (options: CopyModelsOptions): Promise<string[]> => {
  const installed: LocalAiCatalogEntry[] = []
  for (const entry of options.entries) {
    if (await fileExistsWithSize(path.join(options.from, entry.fileName), entry.sizeBytes)) {
      installed.push(entry)
    }
  }
  const totalBytes = installed.reduce((total, entry) => total + entry.sizeBytes, 0)
  let copiedBytes = 0
  await fsPromises.mkdir(options.to, { recursive: true })
  const stagingDirectory = path.join(options.to, `.marklab-migration-${options.migrationId}`)
  await fsPromises.mkdir(stagingDirectory, { recursive: true })
  try {
    const reusable = await findReusableModels(options.to, installed)
    await assertFreeSpace(options.to, installed, reusable)
    options.onProgress({ state: 'copying', copiedBytes, totalBytes })
    for (const entry of installed) {
      if (reusable.has(entry.id)) {
        copiedBytes += entry.sizeBytes
        options.onProgress({ state: 'copying', copiedBytes, totalBytes })
        continue
      }
      const sourcePath = path.join(options.from, entry.fileName)
      const finalPath = path.join(options.to, entry.fileName)
      const temporaryPath = path.join(stagingDirectory, `${entry.fileName}.part`)
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          copiedBytes += chunk.byteLength
          options.onProgress({ state: 'copying', copiedBytes, totalBytes })
          callback(null, chunk)
        },
      })
      await pipeline(
        fs.createReadStream(sourcePath),
        meter,
        fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
      )
      options.onProgress({ state: 'verifying', copiedBytes, totalBytes })
      if (
        !(await fileExistsWithSize(temporaryPath, entry.sizeBytes)) ||
        (await sha256File(temporaryPath)) !== entry.sha256
      ) {
        throw new Error('Model migration integrity verification failed')
      }
      if (await exists(finalPath)) {
        throw new Error('Target model directory changed during migration')
      }
      await atomicInstallFile(temporaryPath, finalPath)
    }
    await writeActiveModelId(
      options.to,
      options.activeModelId && installed.some((entry) => entry.id === options.activeModelId)
        ? options.activeModelId
        : null,
    )
    await fsPromises.rm(stagingDirectory, { force: true, recursive: true })
    return installed.map((entry) => entry.fileName)
  } catch (error) {
    await fsPromises.rm(stagingDirectory, { force: true, recursive: true }).catch(() => undefined)
    throw error
  }
}

const findReusableModels = async (
  directory: string,
  entries: LocalAiCatalogEntry[],
): Promise<Set<string>> => {
  const reusable = new Set<string>()
  for (const entry of entries) {
    const target = path.join(directory, entry.fileName)
    if (!(await exists(target))) continue
    if (
      (await fileExistsWithSize(target, entry.sizeBytes)) &&
      (await sha256File(target)) === entry.sha256
    ) {
      reusable.add(entry.id)
      continue
    }
    throw new Error('Target model directory contains a conflicting model file')
  }
  return reusable
}

const assertFreeSpace = async (
  directory: string,
  entries: LocalAiCatalogEntry[],
  reusable: Set<string>,
): Promise<void> => {
  const requiredBytes = entries
    .filter((entry) => !reusable.has(entry.id))
    .reduce((total, entry) => total + entry.sizeBytes, 0)
  const stats = await fsPromises.statfs(directory, { bigint: true })
  if (Number(stats.bavail) * Number(stats.bsize) < requiredBytes + 64 * 1024 * 1024) {
    throw new Error('Not enough free disk space to migrate local AI models')
  }
}

export const writeActiveModelId = async (
  directory: string,
  activeModelId: string | null,
): Promise<void> => {
  const statePath = path.join(directory, '.marklab-local-ai.json')
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`
  await fsPromises.writeFile(temporaryPath, JSON.stringify({ activeModelId }), {
    flag: 'wx',
    mode: 0o600,
  })
  await atomicInstallFile(temporaryPath, statePath)
}

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fsPromises.access(filePath)
    return true
  } catch {
    return false
  }
}
