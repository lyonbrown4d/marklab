import axios from 'axios'

export const LINK_PREVIEW_TIMEOUT_MS = 5000
export const LINK_PREVIEW_MAX_RESPONSE_BYTES = 256 * 1024

export type LinkPreviewMetadata = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  canonical: string | null
  site_name: string | null
}

export type LinkPreviewRequest = {
  url: string
}

type LinkPreviewHttpResponse<T> = {
  data: T
  headers?: unknown
  request?: unknown
}

export type LinkPreviewHttpClient = {
  get<T = unknown>(
    url: string,
    config: Record<string, unknown>,
  ): Promise<LinkPreviewHttpResponse<T>>
}

type ParsedHtmlMetadata = Omit<LinkPreviewMetadata, 'url'>

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

export class LinkPreviewService {
  constructor(private readonly httpClient: LinkPreviewHttpClient = axios) {}

  async fetch(payload: unknown): Promise<LinkPreviewMetadata> {
    const request = parseLinkPreviewRequest(payload)
    const response = await this.httpClient.get<string>(request.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'Marklab/0.2 link-preview',
      },
      maxBodyLength: LINK_PREVIEW_MAX_RESPONSE_BYTES,
      maxContentLength: LINK_PREVIEW_MAX_RESPONSE_BYTES,
      maxRedirects: 5,
      responseType: 'text',
      timeout: LINK_PREVIEW_TIMEOUT_MS,
      transformResponse: [(data: unknown) => data],
      validateStatus: (status: number) => status >= 200 && status < 400,
    })

    const contentType = headerValue(response.headers, 'content-type')
    if (contentType && !isHtmlContentType(contentType)) {
      throw new Error('Link preview response is not HTML')
    }

    const html = responseDataToString(response.data)
    if (new TextEncoder().encode(html).byteLength > LINK_PREVIEW_MAX_RESPONSE_BYTES) {
      throw new Error('Link preview response exceeded maximum size')
    }

    const finalUrl = normalizeHttpUrl(responseUrlFromRequest(response.request) ?? request.url)
    return {
      url: finalUrl,
      ...parseLinkPreviewHtml(html, finalUrl),
    }
  }
}

export const parseLinkPreviewRequest = (payload: unknown): LinkPreviewRequest => {
  const rawUrl =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && 'url' in payload
        ? (payload as Record<string, unknown>).url
        : null

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Link preview URL must be a string')
  }

  return {
    url: normalizeHttpUrl(rawUrl),
  }
}

export const parseLinkPreviewHtml = (html: string, baseUrl: string): ParsedHtmlMetadata => {
  const metaTags = collectTags(html, 'meta').map(parseAttributes)
  const linkTags = collectTags(html, 'link').map(parseAttributes)

  return {
    title:
      metaContent(metaTags, ['og:title']) ??
      metaContent(metaTags, ['twitter:title']) ??
      titleContent(html),
    description:
      metaContent(metaTags, ['og:description']) ??
      metaContent(metaTags, ['twitter:description']) ??
      metaContent(metaTags, ['description']),
    image: resolvePreviewUrl(
      metaContent(metaTags, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']),
      baseUrl,
    ),
    favicon: faviconUrl(linkTags, baseUrl),
    canonical: firstLinkHref(linkTags, (tokens) => tokens.includes('canonical'), baseUrl),
    site_name: metaContent(metaTags, ['og:site_name']),
  }
}

const normalizeHttpUrl = (value: string): string => {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Link preview URL must be absolute')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }

  return parsed.toString()
}

const collectTags = (html: string, tagName: string): string[] => {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')), (match) => match[0])
}

const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {}
  const body = tag.replace(/^<\s*\/?\s*[\w:-]+/i, '').replace(/\/?\s*>$/i, '')
  const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

  for (const match of body.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase()
    if (!name) continue
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }

  return attributes
}

const metaContent = (metaTags: Array<Record<string, string>>, keys: string[]): string | null => {
  const allowed = new Set(keys.map((key) => key.toLowerCase()))

  for (const attributes of metaTags) {
    const key = (attributes.property ?? attributes.name ?? '').trim().toLowerCase()
    if (!allowed.has(key)) continue

    const content = normalizeText(attributes.content)
    if (content) return content
  }

  return null
}

const titleContent = (html: string): string | null => {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return normalizeText(match?.[1])
}

const firstLinkHref = (
  linkTags: Array<Record<string, string>>,
  matchesRel: (tokens: string[]) => boolean,
  baseUrl: string,
): string | null => {
  for (const attributes of linkTags) {
    const tokens = relTokens(attributes.rel)
    if (!matchesRel(tokens)) continue

    const href = resolvePreviewUrl(attributes.href, baseUrl)
    if (href) return href
  }

  return null
}

const faviconUrl = (linkTags: Array<Record<string, string>>, baseUrl: string): string | null => {
  const candidates = linkTags
    .map((attributes) => {
      const tokens = relTokens(attributes.rel)
      const href = resolvePreviewUrl(attributes.href, baseUrl)
      if (!href) return null

      return {
        href,
        score: iconRelScore(tokens),
      }
    })
    .filter((candidate): candidate is { href: string; score: number } => Boolean(candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.href ?? null
}

const iconRelScore = (tokens: string[]): number => {
  if (tokens.includes('icon')) return 3
  if (tokens.includes('apple-touch-icon')) return 2
  if (tokens.includes('mask-icon')) return 1
  return 0
}

const relTokens = (rel: string | undefined): string[] => {
  return (rel ?? '')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

const resolvePreviewUrl = (value: string | null | undefined, baseUrl: string): string | null => {
  const cleaned = normalizeAttribute(value)
  if (!cleaned) return null

  try {
    const parsed = new URL(cleaned, baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

const normalizeAttribute = (value: string | null | undefined): string | null => {
  const cleaned = decodeHtmlEntities(value ?? '').trim()
  return cleaned ? cleaned : null
}

const normalizeText = (value: string | null | undefined): string | null => {
  const cleaned = decodeHtmlEntities(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned ? cleaned : null
}

const decodeHtmlEntities = (value: string): string => {
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase()
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }
    return HTML_ENTITY_MAP[normalized] ?? entity
  })
}

const responseDataToString = (data: unknown): string => {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return new TextDecoder('utf-8').decode(data)
  if (data instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(data)
  return String(data ?? '')
}

const headerValue = (headers: unknown, key: string): string | null => {
  if (!headers || typeof headers !== 'object') return null
  const get = (headers as Record<string, unknown>).get
  if (typeof get === 'function') {
    const value = get.call(headers, key)
    if (typeof value === 'string') return value
  }

  const record = headers as Record<string, unknown>
  const value = record[key] ?? record[key.toLowerCase()]

  if (typeof value === 'string') return value
  if (Array.isArray(value))
    return value.find((item): item is string => typeof item === 'string') ?? null
  return null
}

const isHtmlContentType = (contentType: string): boolean => {
  const normalized = contentType.toLowerCase()
  return normalized.includes('text/html') || normalized.includes('application/xhtml+xml')
}

const responseUrlFromRequest = (request: unknown): string | null => {
  if (!request || typeof request !== 'object') return null
  const response = (request as Record<string, unknown>).res
  if (!response || typeof response !== 'object') return null
  const responseUrl = (response as Record<string, unknown>).responseUrl
  return typeof responseUrl === 'string' && responseUrl.trim() ? responseUrl : null
}
