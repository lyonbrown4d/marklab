import { workspaceAssetNotFoundError } from '@electron/services/workspace/workspaceAssetCapabilities.js'
import type { FsAssetBytes } from '@electron/services/workspace/types.js'
import type { WorkspaceOpenedAsset } from '@electron/services/workspace/workspaceOpenedAsset.js'

const ASSET_READ_CONCURRENCY = 2
const ASSET_READ_CHUNK_BYTES = 1024 * 1024
const MAX_PREVIEW_ASSET_BYTES = 64 * 1024 * 1024
const assetReadWaiters: Array<(release: () => void) => void> = []
let activeAssetReads = 0

type ReadWorkspaceAssetBytesOptions = {
  resolveAssetUrl: (assetUrl: string) => Promise<WorkspaceOpenedAsset | null>
}

export const readWorkspaceAssetBytes = async (
  value: unknown,
  options: ReadWorkspaceAssetBytesOptions,
): Promise<FsAssetBytes> => {
  const assetUrl = exactAssetUrl(value)
  if (!assetUrl) throw workspaceAssetNotFoundError()

  const releaseSlot = await acquireAssetReadSlot()
  let asset: WorkspaceOpenedAsset | null = null
  try {
    asset = await options.resolveAssetUrl(assetUrl)
    if (!asset) throw workspaceAssetNotFoundError()
    if (asset.sizeBytes > MAX_PREVIEW_ASSET_BYTES) {
      throw new Error('Asset is too large to preview')
    }

    const chunks: Buffer[] = []
    let position = 0
    while (position <= MAX_PREVIEW_ASSET_BYTES) {
      const chunkLength = Math.min(ASSET_READ_CHUNK_BYTES, MAX_PREVIEW_ASSET_BYTES + 1 - position)
      const chunk = Buffer.allocUnsafe(chunkLength)
      const bytesRead = await asset.readChunk(chunk, position).catch(() => {
        throw workspaceAssetNotFoundError()
      })
      if (bytesRead === 0) break
      position += bytesRead
      if (position > MAX_PREVIEW_ASSET_BYTES) {
        throw new Error('Asset is too large to preview')
      }
      chunks.push(chunk.subarray(0, bytesRead))
    }

    const bytes = Buffer.concat(chunks, position)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return {
      bytes: arrayBuffer,
      media_type: asset.mediaType,
      size_bytes: bytes.byteLength,
    }
  } finally {
    await asset?.close().catch(() => undefined)
    releaseSlot()
  }
}

const acquireAssetReadSlot = (): Promise<() => void> => {
  if (activeAssetReads < ASSET_READ_CONCURRENCY) {
    activeAssetReads += 1
    return Promise.resolve(createAssetReadRelease())
  }
  return new Promise((resolve) => assetReadWaiters.push(resolve))
}

const createAssetReadRelease = (): (() => void) => {
  let released = false
  return () => {
    if (released) return
    released = true
    const next = assetReadWaiters.shift()
    if (next) {
      next(createAssetReadRelease())
      return
    }
    activeAssetReads -= 1
  }
}

const exactAssetUrl = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record.asset_url !== 'string') return null
  return record.asset_url
}
