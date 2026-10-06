import type { LinkPreviewRequest } from '@/types/linkPreview'

export const parseLinkPreviewRequest = (payload: unknown): LinkPreviewRequest => {
  const rawUrl = readRawUrl(payload)
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Link preview URL must be a string')
  }
  return { url: normalizeHttpUrl(rawUrl) }
}

export const normalizeHttpUrl = (value: string): string => {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Link preview URL must be absolute')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Link preview URLs cannot include credentials')
  }
  return parsed.toString()
}

const readRawUrl = (payload: unknown): unknown => {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object' && 'url' in payload) {
    return (payload as Record<string, unknown>).url
  }
  return null
}
