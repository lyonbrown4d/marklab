import { parseLinkPreviewHtml } from '@electron/services/linkPreview/metadata'
import type { LinkPreviewResult } from '@/types/linkPreview'

const RASTER_MEDIA_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

type PreviewResponse = {
  data: unknown
  headers?: unknown
}

type ParsePreviewResponseOptions = {
  htmlLimitBytes: number
  imageLimitBytes: number
  issueImage: (bytes: Uint8Array, mediaType: string) => string
  response: PreviewResponse
  url: string
}

export const parseLinkPreviewResponse = ({
  htmlLimitBytes,
  imageLimitBytes,
  issueImage,
  response,
  url,
}: ParsePreviewResponseOptions): LinkPreviewResult => {
  const bytes = responseBytes(response.data)
  const mediaType = (headerValue(response.headers, 'content-type') ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') {
    assertWithinLimit(bytes, htmlLimitBytes)
    const html = new TextDecoder('utf-8').decode(bytes)
    return { kind: 'webpage', url, ...parseLinkPreviewHtml(html, url) }
  }
  if (mediaType && RASTER_MEDIA_TYPES.has(mediaType)) {
    assertWithinLimit(bytes, imageLimitBytes)
    return {
      kind: 'image',
      media_type: mediaType as Extract<LinkPreviewResult, { kind: 'image' }>['media_type'],
      src: issueImage(bytes, mediaType),
      url,
    }
  }
  throw new Error('Link preview response has an unsupported content type')
}

export const headerValue = (headers: unknown, key: string): string | null => {
  if (!headers || typeof headers !== 'object') return null
  const get = (headers as Record<string, unknown>).get
  if (typeof get === 'function') {
    const value = get.call(headers, key)
    if (typeof value === 'string') return value
  }
  const value = (headers as Record<string, unknown>)[key.toLowerCase()]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item) => typeof item === 'string') ?? null
  return null
}

const responseBytes = (data: unknown): Uint8Array => {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new Error('Link preview response body is invalid')
}

const assertWithinLimit = (bytes: Uint8Array, limit: number): void => {
  if (bytes.byteLength > limit) throw new Error('Link preview response exceeded maximum size')
}
