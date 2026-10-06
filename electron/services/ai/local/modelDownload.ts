import fs from 'node:fs/promises'
import { constants } from 'node:fs'

import { atomicInstallFile } from '@electron/services/ai/local/atomicFile'
import { fileExistsWithSize, sha256File } from '@electron/services/ai/local/modelFiles'
import type { LocalAiCatalogEntry, LocalAiProgressHandler } from '@electron/services/ai/local/types'

type DownloadModelOptions = {
  entry: LocalAiCatalogEntry
  finalPath: string
  partPath: string
  taskId: string
  signal: AbortSignal
  fetch: typeof fetch
  onProgress: LocalAiProgressHandler
}

export const downloadModel = async (options: DownloadModelOptions): Promise<void> => {
  const existingBytes = await partSize(options.partPath, options.entry.sizeBytes)
  if (existingBytes === options.entry.sizeBytes) {
    await verifyAndInstall(options, existingBytes)
    return
  }
  const headers = existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : undefined
  const response = await options.fetch(options.entry.url, {
    headers,
    redirect: 'follow',
    signal: options.signal,
  })
  const isResume = existingBytes > 0 && response.status === 206
  if (!response.ok || !response.body) throw new Error('Model download failed')

  const startBytes = isResume ? existingBytes : 0
  const noFollow = constants.O_NOFOLLOW ?? 0
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    noFollow |
    (isResume ? constants.O_APPEND : constants.O_TRUNC)
  const file = await fs.open(options.partPath, flags, 0o600)
  let downloadedBytes = startBytes
  try {
    if (!(await file.stat()).isFile()) throw new Error('Model partial path is not a regular file')
    const reader = response.body.getReader()
    while (true) {
      options.signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      downloadedBytes += value.byteLength
      if (downloadedBytes > options.entry.sizeBytes) {
        throw new Error('Model download exceeded the manifest size')
      }
      await file.write(value)
      options.onProgress(progress(options, 'downloading', downloadedBytes))
    }
  } finally {
    await file.close()
  }

  await verifyAndInstall(options, downloadedBytes)
}

const verifyAndInstall = async (
  options: DownloadModelOptions,
  downloadedBytes: number,
): Promise<void> => {
  if (!(await fileExistsWithSize(options.partPath, options.entry.sizeBytes))) {
    throw new Error('Model download size did not match the manifest')
  }
  options.onProgress(progress(options, 'verifying', downloadedBytes))
  if ((await sha256File(options.partPath)) !== options.entry.sha256) {
    await fs.rm(options.partPath, { force: true })
    throw new Error('Model integrity verification failed')
  }
  await atomicInstallFile(options.partPath, options.finalPath)
}

const partSize = async (partPath: string, totalBytes: number): Promise<number> => {
  try {
    const stats = await fs.lstat(partPath)
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error('Model partial path is not a regular file')
    }
    const size = stats.size
    if (size > totalBytes) {
      await fs.rm(partPath, { force: true })
      return 0
    }
    return size
  } catch {
    return 0
  }
}

const progress = (
  options: DownloadModelOptions,
  state: 'downloading' | 'verifying',
  downloadedBytes: number,
) => ({
  taskId: options.taskId,
  modelId: options.entry.id,
  state,
  downloadedBytes,
  totalBytes: options.entry.sizeBytes,
  percent: Math.min(100, (downloadedBytes / options.entry.sizeBytes) * 100),
})
