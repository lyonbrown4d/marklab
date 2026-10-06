import { StringDecoder } from 'node:string_decoder'

import {
  openWorkspaceAsset,
  validateWorkspaceAssetTarget,
} from '@electron/services/workspace/workspaceOpenedAsset'
import { stringArg } from '@electron/services/workspace/workspaceUtils'
import type { FsStateData } from '@electron/services/workspace/types'
import {
  MAX_WORKSPACE_TEXT_PREVIEW_BYTES,
  type WorkspaceTextPreview,
} from '@/types/workspaceTextPreview'

const previewLimit = (value: unknown): number => {
  if (!value || typeof value !== 'object' || !('limit_bytes' in value)) {
    throw new Error('limit_bytes must be provided')
  }
  const limit = (value as Record<string, unknown>).limit_bytes
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_WORKSPACE_TEXT_PREVIEW_BYTES
  ) {
    throw new Error(
      `limit_bytes must be an integer from 1 through ${MAX_WORKSPACE_TEXT_PREVIEW_BYTES}`,
    )
  }
  return limit
}

const decodePreview = (bytes: Uint8Array, truncated: boolean): string => {
  if (!truncated) return Buffer.from(bytes).toString('utf8')
  return new StringDecoder('utf8').write(Buffer.from(bytes))
}

export const readWorkspaceTextPreview = async (
  state: FsStateData,
  value: unknown,
): Promise<WorkspaceTextPreview> => {
  const relativePath = stringArg(value, 'path')
  const limit = previewLimit(value)
  const target = await validateWorkspaceAssetTarget(state, relativePath)
  if (!target) throw new Error('Text preview target is unavailable')

  const asset = await openWorkspaceAsset(target)
  if (!asset) throw new Error('Text preview target changed before it could be opened')

  try {
    const bytes = Buffer.allocUnsafe(limit + 1)
    let bytesRead = 0
    while (bytesRead < bytes.byteLength) {
      const read = await asset.readChunk(bytes.subarray(bytesRead), bytesRead)
      if (read === 0) break
      bytesRead += read
    }
    const truncated = bytesRead > limit
    return {
      content: decodePreview(bytes.subarray(0, Math.min(bytesRead, limit)), truncated),
      truncated,
    }
  } finally {
    await asset.close()
  }
}
