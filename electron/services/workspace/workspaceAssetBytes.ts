import fs from 'node:fs/promises'
import path from 'node:path'

import { assetMediaTypeForExtension } from '@electron/services/mediaTypes.js'
import { normalizeNativePath } from '@electron/services/nativePath.js'
import type { FsAssetBytes } from '@electron/services/workspace/types.js'

const MAX_PREVIEW_ASSET_BYTES = 64 * 1024 * 1024

type ReadWorkspaceAssetBytesOptions = {
  isAllowedPath: (absolutePath: string) => boolean
  resolveRelativePath: (relativePath: string) => string
}

export const readWorkspaceAssetBytes = async (
  value: unknown,
  options: ReadWorkspaceAssetBytesOptions,
): Promise<FsAssetBytes> => {
  const rawPath = stringArg(value, 'path')
  const absolutePath = path.isAbsolute(rawPath)
    ? normalizeNativePath(rawPath)
    : options.resolveRelativePath(rawPath)
  if (!options.isAllowedPath(absolutePath)) throw new Error('Asset path is not allowed')

  const stat = await fs.stat(absolutePath)
  if (!stat.isFile()) throw new Error('Asset path must be a file')
  if (stat.size > MAX_PREVIEW_ASSET_BYTES) throw new Error('Asset is too large to preview')

  const bytes = await fs.readFile(absolutePath)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return {
    bytes: arrayBuffer,
    media_type: assetMediaTypeForExtension(path.extname(absolutePath)),
    size_bytes: stat.size,
  }
}

const stringArg = (value: unknown, key: string): string => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}
