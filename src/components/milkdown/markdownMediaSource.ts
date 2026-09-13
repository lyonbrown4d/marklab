import { documentAdapterForMarkdownEmbedPath } from '@/logic/documentAdapters'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

const externalProtocolPattern = /^(https?:|data:|blob:)/i
const cleanTargetPath = (target: string) =>
  target.trim().split('#')[0]?.split('?')[0] ?? target.trim()
const targetFragment = (target: string) => {
  const index = target.indexOf('#')
  return index >= 0 ? target.slice(index) : ''
}
const withoutFragment = (path: string) => path.split('#')[0] ?? path
const issueAssetSource = async (relativePath: string, target: string) => {
  const capability = await fsApi.toAssetUrl(withoutFragment(relativePath))
  return `${capability.url}${targetFragment(target)}`
}
export const markdownMediaKindForTarget = (
  target: string,
): Extract<PreviewFileKind, 'audio' | 'video'> | null => {
  const adapter = documentAdapterForMarkdownEmbedPath(cleanTargetPath(target))
  return adapter?.kind === 'audio' || adapter?.kind === 'video' ? adapter.kind : null
}
export const isMarkdownMediaTarget = (target: string) => markdownMediaKindForTarget(target) !== null
const isExternalMediaTarget = (target: string) => externalProtocolPattern.test(target.trim())

export const resolveMarkdownMediaSource = async (documentPath: string | null, target: string) => {
  const trimmed = target.trim()
  const kind = markdownMediaKindForTarget(trimmed)
  if (!trimmed || !kind) return target
  if (isExternalMediaTarget(trimmed)) return trimmed
  if (!documentPath || !isDesktopRuntime()) return ''

  try {
    const resolved = await fsApi.resolveMarkdownAsset({ documentPath, target: trimmed })
    const relativePath = resolved.relative_path
    if (
      resolved.is_external ||
      !resolved.exists ||
      !relativePath ||
      (resolved.media_type && !resolved.media_type.startsWith(`${kind}/`))
    ) {
      return ''
    }
    return await issueAssetSource(relativePath, trimmed)
  } catch (error) {
    console.warn('Failed to resolve Markdown media source', error)
    return ''
  }
}
