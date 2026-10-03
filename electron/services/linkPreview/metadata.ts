import type { LinkPreviewWebpage } from '@/types/linkPreview.js'

type ParsedHtmlMetadata = Omit<LinkPreviewWebpage, 'kind' | 'url'>

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
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

const collectTags = (html: string, tagName: string): string[] =>
  Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')), (match) => match[0])

const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {}
  const body = tag.replace(/^<\s*\/?\s*[\w:-]+/i, '').replace(/\/?\s*>$/i, '')
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of body.matchAll(pattern)) {
    const name = match[1]?.toLowerCase()
    if (name) attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

const metaContent = (tags: Array<Record<string, string>>, keys: string[]): string | null => {
  const allowed = new Set(keys.map((key) => key.toLowerCase()))
  for (const attributes of tags) {
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
  tags: Array<Record<string, string>>,
  matchesRel: (tokens: string[]) => boolean,
  baseUrl: string,
): string | null => {
  for (const attributes of tags) {
    if (!matchesRel(relTokens(attributes.rel))) continue
    const href = resolvePreviewUrl(attributes.href, baseUrl)
    if (href) return href
  }
  return null
}

const faviconUrl = (tags: Array<Record<string, string>>, baseUrl: string): string | null => {
  const candidates = tags
    .map((attributes) => {
      const href = resolvePreviewUrl(attributes.href, baseUrl)
      return href ? { href, score: iconRelScore(relTokens(attributes.rel)) } : null
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

const relTokens = (rel: string | undefined): string[] =>
  (rel ?? '')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)

const resolvePreviewUrl = (value: string | null | undefined, baseUrl: string): string | null => {
  const cleaned = normalizeAttribute(value)
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned, baseUrl)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

const normalizeAttribute = (value: string | null | undefined): string | null => {
  const cleaned = decodeHtmlEntities(value ?? '').trim()
  return cleaned || null
}

const normalizeText = (value: string | null | undefined): string | null => {
  const cleaned = decodeHtmlEntities(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || null
}

const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase()
    if (normalized.startsWith('#x')) {
      const point = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    if (normalized.startsWith('#')) {
      const point = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return HTML_ENTITY_MAP[normalized] ?? entity
  })
