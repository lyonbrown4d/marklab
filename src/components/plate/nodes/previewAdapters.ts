import { embeddedPreviewKindForTarget } from '@/components/previews/embeddedPreviewSource'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { linkPreviewApi } from '@/services/linkPreviewApi'

const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])
const SAFE_PREVIEW_PROTOCOLS = new Set(['blob:', 'marklab-asset:'])
const REMOTE_IMAGE_PROTOCOLS = new Set(['http:', 'https:'])
const SAFE_DATA_IMAGE = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i
const SCHEME = /^([a-z][a-z\d+.-]*):/i

export const isMermaidLanguage = (language: string) =>
  MERMAID_LANGUAGES.has(language.trim().toLowerCase())

export const platePreviewKindForTarget = (target: string) => embeddedPreviewKindForTarget(target)

export type PlateEmbeddedPreviewLink = {
  kind: PreviewFileKind
  target: string
  title: string
}

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(nodeText).join('')
}

export const embeddedPreviewLinksInElement = (element: unknown) => {
  const links: PlateEmbeddedPreviewLink[] = []
  const seen = new Set<string>()

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if ('type' in node && node.type === 'a' && 'url' in node && typeof node.url === 'string') {
      const kind = platePreviewKindForTarget(node.url)
      if (kind && !seen.has(node.url)) {
        seen.add(node.url)
        links.push({ kind, target: node.url, title: nodeText(node).trim() || node.url })
      }
    }
    if ('children' in node && Array.isArray(node.children)) node.children.forEach(visit)
  }

  visit(element)
  return links
}

export const safePreviewUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (SAFE_DATA_IMAGE.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return ''

  const scheme = trimmed.match(SCHEME)?.[1]
  if (!scheme) return trimmed

  return SAFE_PREVIEW_PROTOCOLS.has(`${scheme.toLowerCase()}:`) ? trimmed : ''
}

export const safeExternalLinkUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('//')) return undefined

  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined
  } catch {
    return undefined
  }
}

export const isLocalEmbeddedPreviewTarget = (target: string) => {
  const trimmed = target.trim()
  return Boolean(trimmed) && !trimmed.startsWith('//') && !SCHEME.test(trimmed)
}

const targetFragment = (target: string) => {
  const index = target.indexOf('#')
  return index >= 0 ? target.slice(index) : ''
}

const withoutFragment = (value: string) => value.split('#')[0] ?? value

export const resolvePlateImageSource = async (documentPath: string | null, source: string) => {
  const target = source.trim()
  if (!target) return ''
  if (SAFE_DATA_IMAGE.test(target)) return target

  const scheme = target.match(SCHEME)?.[1]?.toLowerCase()
  if (scheme && REMOTE_IMAGE_PROTOCOLS.has(`${scheme}:`)) {
    if (!isDesktopRuntime()) return ''
    try {
      const preview = await linkPreviewApi.fetch(target)
      return preview.kind === 'image' ? preview.src : ''
    } catch {
      return ''
    }
  }

  const safeSource = safePreviewUrl(target)
  if (safeSource && scheme) return safeSource
  if (!documentPath || !isDesktopRuntime() || SCHEME.test(target) || target.startsWith('//')) {
    return ''
  }

  try {
    const resolved = await fsApi.resolveMarkdownAsset({ documentPath, target })
    const relativePath = resolved.relative_path
    if (
      resolved.is_external ||
      !resolved.exists ||
      !relativePath ||
      (resolved.media_type && !resolved.media_type.startsWith('image/'))
    ) {
      return ''
    }

    const capability = await fsApi.toAssetUrl(withoutFragment(relativePath))
    return `${capability.url}${targetFragment(target)}`
  } catch {
    return ''
  }
}
