import { isAudioFilePath, isVideoFilePath, type PreviewFileKind } from '@/logic/fileTypes'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

const localProtocolPattern = /^(https?:|data:|blob:|asset:|file:)/i
const resolvedMediaSourceCache = new Map<string, string>()

const mediaSourceCacheKey = (documentPath: string, target: string) => {
  return `${documentPath}\u0000${target.trim()}`
}

const cleanTargetPath = (target: string) => {
  return target.trim().split('#')[0]?.split('?')[0] ?? target.trim()
}

const targetSuffix = (target: string) => {
  const cleanPath = cleanTargetPath(target)
  return target.trim().slice(cleanPath.length)
}

export const markdownMediaKindForTarget = (
  target: string,
): Extract<PreviewFileKind, 'audio' | 'video'> | null => {
  const cleanPath = cleanTargetPath(target)
  if (isAudioFilePath(cleanPath)) return 'audio'
  if (isVideoFilePath(cleanPath)) return 'video'
  return null
}

export const isMarkdownMediaTarget = (target: string) => markdownMediaKindForTarget(target) !== null

const isExternalMediaTarget = (target: string) => {
  return localProtocolPattern.test(target.trim())
}

export const resolveMarkdownMediaSource = async (documentPath: string | null, target: string) => {
  const trimmed = target.trim()
  if (!trimmed || !isMarkdownMediaTarget(trimmed)) return target
  if (!documentPath || !isDesktopRuntime() || isExternalMediaTarget(trimmed)) return trimmed

  const cached = resolvedMediaSourceCache.get(mediaSourceCacheKey(documentPath, trimmed))
  if (cached) return cached

  try {
    const resolved = await fsApi.resolveMarkdownAsset({
      documentPath,
      target: trimmed,
    })
    if (resolved.is_external || !resolved.exists || !resolved.absolute_path) {
      return trimmed
    }

    const resolvedSrc = `${convertAssetFileSrc(resolved.absolute_path)}${targetSuffix(trimmed)}`
    resolvedMediaSourceCache.set(mediaSourceCacheKey(documentPath, trimmed), resolvedSrc)
    return resolvedSrc
  } catch (error) {
    console.warn('Failed to resolve Markdown media source', error)
    return trimmed
  }
}
