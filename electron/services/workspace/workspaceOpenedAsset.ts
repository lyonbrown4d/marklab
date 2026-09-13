import type { BigIntStats, ReadStream } from 'node:fs'
import fs, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { assetMediaTypeForExtension } from '@electron/services/mediaTypes.js'
import { isNativePathInsideOrEqual } from '@electron/services/nativePath.js'
import { resolveWorkspaceAssetPath } from '@electron/services/workspace/path.js'
import type { FsStateData } from '@electron/services/workspace/types.js'

const MAX_SAFE_FILE_SIZE = BigInt(Number.MAX_SAFE_INTEGER)

export type WorkspaceAssetFileIdentity = {
  birthtimeNs: bigint
  ctimeNs: bigint
  dev: bigint
  ino: bigint
  mode: bigint
  mtimeNs: bigint
  size: bigint
}

export type WorkspaceAssetTarget = {
  absolutePath: string
  identity: WorkspaceAssetFileIdentity
  relativePath: string
}

export type WorkspaceAssetByteRange = {
  end: number
  start: number
}

type AssetUse = 'idle' | 'bytes' | 'stream' | 'closed'

export class WorkspaceOpenedAsset {
  readonly mediaType: string | null
  readonly sizeBytes: number

  private activeStream: ReadStream | null = null
  private closePromise: Promise<void> | null = null
  private readonly closedListeners = new Set<() => void>()
  private use: AssetUse = 'idle'

  constructor(
    private readonly handle: FileHandle,
    sizeBytes: number,
    mediaType: string | null,
  ) {
    this.sizeBytes = sizeBytes
    this.mediaType = mediaType
  }

  onClosed(listener: () => void): void {
    if (this.closePromise) {
      void this.closePromise.then(listener, listener)
      return
    }
    this.closedListeners.add(listener)
  }

  async readChunk(buffer: Uint8Array, position: number): Promise<number> {
    this.claimUse('bytes')
    const result = await this.handle.read(buffer, 0, buffer.byteLength, position)
    return result.bytesRead
  }

  createWebStream(range: WorkspaceAssetByteRange | null): ReadableStream<Uint8Array> {
    this.claimUse('stream')
    if (this.sizeBytes === 0) {
      void this.close().catch(() => undefined)
      return new ReadableStream<Uint8Array>({
        start: (controller) => controller.close(),
      })
    }

    const stream = this.handle.createReadStream({
      autoClose: false,
      start: range?.start ?? 0,
      end: range?.end ?? this.sizeBytes - 1,
    })
    this.activeStream = stream
    const finish = (): void => {
      if (this.activeStream === stream) this.activeStream = null
      void this.closeHandle().catch(() => undefined)
    }
    stream.once('end', finish)
    stream.once('error', finish)
    stream.once('close', finish)
    try {
      return Readable.toWeb(stream) as ReadableStream<Uint8Array>
    } catch (error) {
      stream.destroy()
      void this.closeHandle().catch(() => undefined)
      throw error
    }
  }

  close(): Promise<void> {
    const stream = this.activeStream
    this.activeStream = null
    if (stream && !stream.destroyed) stream.destroy()
    return this.closeHandle()
  }

  private claimUse(nextUse: Exclude<AssetUse, 'idle' | 'closed'>): void {
    if (this.use === 'idle') {
      this.use = nextUse
      return
    }
    if (this.use !== nextUse || this.closePromise) {
      throw new Error('Asset handle is no longer available')
    }
  }

  private closeHandle(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.use = 'closed'
    this.closePromise = Promise.resolve()
      .then(() => this.handle.close())
      .then(
        () => this.notifyClosed(),
        (error) => {
          this.notifyClosed()
          throw error
        },
      )
    return this.closePromise
  }

  private notifyClosed(): void {
    for (const listener of this.closedListeners) listener()
    this.closedListeners.clear()
  }
}

export const validateWorkspaceAssetTarget = async (
  state: FsStateData,
  relativePath: string,
): Promise<WorkspaceAssetTarget | null> => {
  try {
    const lexical = resolveWorkspaceAssetPath(state, relativePath)
    const [realRoot, realTarget] = await Promise.all([
      fs.realpath(lexical.rootPath),
      fs.realpath(lexical.absolutePath),
    ])
    if (!isNativePathInsideOrEqual(realRoot, realTarget)) return null

    const stat = await fs.stat(realTarget, { bigint: true })
    if (!stat.isFile() || stat.size > MAX_SAFE_FILE_SIZE) return null
    return {
      absolutePath: realTarget,
      identity: fileIdentity(stat),
      relativePath: lexical.relativePath,
    }
  } catch {
    return null
  }
}

export const openWorkspaceAsset = async (
  target: WorkspaceAssetTarget,
): Promise<WorkspaceOpenedAsset | null> => {
  const handle = await fs.open(target.absolutePath, 'r').catch(() => null)
  if (!handle) return null

  try {
    const stat = await handle.stat({ bigint: true })
    if (
      !stat.isFile() ||
      stat.size > MAX_SAFE_FILE_SIZE ||
      !sameFileIdentity(target.identity, fileIdentity(stat))
    ) {
      await handle.close().catch(() => undefined)
      return null
    }
    return new WorkspaceOpenedAsset(
      handle,
      Number(stat.size),
      assetMediaTypeForExtension(path.extname(target.absolutePath)),
    )
  } catch {
    await handle.close().catch(() => undefined)
    return null
  }
}

const fileIdentity = (stat: BigIntStats): WorkspaceAssetFileIdentity => {
  return {
    birthtimeNs: stat.birthtimeNs,
    ctimeNs: stat.ctimeNs,
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    mtimeNs: stat.mtimeNs,
    size: stat.size,
  }
}

const sameFileIdentity = (
  expected: WorkspaceAssetFileIdentity,
  actual: WorkspaceAssetFileIdentity,
): boolean => {
  return (
    expected.dev === actual.dev &&
    expected.ino === actual.ino &&
    expected.mode === actual.mode &&
    expected.size === actual.size &&
    expected.mtimeNs === actual.mtimeNs &&
    expected.ctimeNs === actual.ctimeNs &&
    expected.birthtimeNs === actual.birthtimeNs
  )
}
