import path from 'node:path'

import {
  ASSET_MEDIA_EXTENSIONS,
  ASSET_MEDIA_TYPES_BY_EXTENSION,
} from '@electron/services/mediaTypes.js'
import { stripAssetQueryAndHash } from '@electron/services/workspace/path.js'
import { decodeURIComponentSafe } from '@electron/services/workspace/markdown/text.js'
import { unwrapLinkDestination } from '@electron/services/workspace/markdown/utils.js'

const assetMediaTypes = ASSET_MEDIA_TYPES_BY_EXTENSION
const assetExtensions = ASSET_MEDIA_EXTENSIONS

export const guessMediaType = (target: string): string | null => {
  const dataType = dataUriMediaType(target)
  if (dataType) return dataType

  const ext = path.posix
    .extname(decodeURIComponentSafe(stripAssetQueryAndHash(target)))
    .toLowerCase()
  return assetMediaTypes[ext] ?? null
}

export const looksLikeAssetTarget = (target: string): boolean => {
  const cleanTarget = decodeURIComponentSafe(
    stripAssetQueryAndHash(unwrapLinkDestination(target.trim())),
  )
  return assetExtensions.has(path.posix.extname(cleanTarget).toLowerCase())
}

const dataUriMediaType = (target: string): string | null => {
  const match = /^data:([^;,]+)/i.exec(target.trim())
  return match?.[1]?.toLowerCase() ?? null
}
