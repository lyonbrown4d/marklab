import path from 'node:path'

import { stripAssetQueryAndHash } from '@electron/services/workspace/path.js'
import { decodeURIComponentSafe } from '@electron/services/workspace/markdown/text.js'
import { unwrapLinkDestination } from '@electron/services/workspace/markdown/utils.js'

const assetMediaTypes: Record<string, string> = {
  '.aac': 'audio/aac',
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.opus': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.wmv': 'video/x-ms-wmv',
}

const assetExtensions = new Set(Object.keys(assetMediaTypes))

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
