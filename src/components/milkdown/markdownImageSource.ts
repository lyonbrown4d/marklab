import { fsApi } from '@/services/fsApi'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'

const localProtocolPattern = /^(https?:|data:|blob:|asset:|file:)/i
const resolvedImageSourceCache = new Map<string, string>()

const imageSourceCacheKey = (documentPath: string, src: string) => {
  return `${documentPath}\u0000${src.trim()}`
}

export const isExternalMarkdownImageSource = (src: string) => {
  return localProtocolPattern.test(src.trim())
}

export const rememberResolvedMarkdownImageSource = (
  documentPath: string | null,
  src: string,
  resolvedSrc: string,
) => {
  const target = src.trim()
  if (!documentPath || !target || !resolvedSrc) return
  resolvedImageSourceCache.set(imageSourceCacheKey(documentPath, target), resolvedSrc)
}

export const resolveMarkdownImageSource = async (documentPath: string | null, src: string) => {
  const target = src.trim()
  if (!target || isExternalMarkdownImageSource(target) || !documentPath || !isDesktopRuntime()) {
    return src
  }

  const cached = resolvedImageSourceCache.get(imageSourceCacheKey(documentPath, target))
  if (cached) return cached

  try {
    const resolved = await fsApi.resolveMarkdownAsset({
      documentPath,
      target,
    })
    if (
      resolved.is_external ||
      !resolved.exists ||
      !resolved.absolute_path ||
      (resolved.media_type && !resolved.media_type.startsWith('image/'))
    ) {
      return src
    }
    const resolvedSrc = await convertAssetFileSrc(resolved.absolute_path)
    rememberResolvedMarkdownImageSource(documentPath, target, resolvedSrc)
    return resolvedSrc
  } catch (error) {
    console.warn('Failed to resolve Markdown image source', error)
    return src
  }
}
