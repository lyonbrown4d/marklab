import { fsApi } from '@/services/fsApi'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'

const localProtocolPattern = /^(https?:|data:|blob:|asset:|file:)/i
const resolvedPdfSourceCache = new Map<string, string>()

const pdfSourceCacheKey = (documentPath: string, target: string) => {
  return `${documentPath}\u0000${target.trim()}`
}

const cleanTargetPath = (target: string) => {
  return target.trim().split('#')[0]?.split('?')[0] ?? target.trim()
}

const targetSuffix = (target: string) => {
  const cleanPath = cleanTargetPath(target)
  return target.trim().slice(cleanPath.length)
}

export const isMarkdownPdfTarget = (target: string) => {
  return /\.pdf$/i.test(cleanTargetPath(target))
}

const isExternalPdfTarget = (target: string) => {
  return localProtocolPattern.test(target.trim())
}

export const resolveMarkdownPdfSource = async (documentPath: string | null, target: string) => {
  const trimmed = target.trim()
  if (!trimmed || !isMarkdownPdfTarget(trimmed)) return target
  if (!documentPath || !isDesktopRuntime() || isExternalPdfTarget(trimmed)) return trimmed

  const cached = resolvedPdfSourceCache.get(pdfSourceCacheKey(documentPath, trimmed))
  if (cached) return cached

  try {
    const resolved = await fsApi.resolveMarkdownAsset({
      documentPath,
      target: trimmed,
    })
    if (
      resolved.is_external ||
      !resolved.exists ||
      !resolved.absolute_path ||
      resolved.media_type !== 'application/pdf'
    ) {
      return trimmed
    }

    const resolvedSrc = `${convertAssetFileSrc(resolved.absolute_path)}${targetSuffix(trimmed)}`
    resolvedPdfSourceCache.set(pdfSourceCacheKey(documentPath, trimmed), resolvedSrc)
    return resolvedSrc
  } catch (error) {
    console.warn('Failed to resolve Markdown PDF source', error)
    return trimmed
  }
}
