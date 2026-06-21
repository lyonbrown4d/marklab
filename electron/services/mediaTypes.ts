export const ASSET_MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.aac': 'audio/aac',
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.excalidraw': 'application/json',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.opus': 'audio/opus',
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

export const ASSET_MEDIA_EXTENSIONS = new Set(Object.keys(ASSET_MEDIA_TYPES_BY_EXTENSION))

const normalizeMediaExtension = (extension: string) => {
  if (!extension) {
    return ''
  }

  const normalized = extension.startsWith('.') ? extension : `.${extension}`
  return normalized.toLowerCase()
}

export const assetMediaTypeForExtension = (extension: string) =>
  ASSET_MEDIA_TYPES_BY_EXTENSION[normalizeMediaExtension(extension)] ?? null

export const isAssetMediaExtension = (extension: string) =>
  ASSET_MEDIA_EXTENSIONS.has(normalizeMediaExtension(extension))
