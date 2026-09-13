import { documentAdapterForMarkdownEmbedPath } from '@/logic/documentAdapters'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

const externalProtocolPattern = /^(https?:|data:|blob:)/i
const blockedExternalPdfPattern = /^(https?:|data:)/i
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
export const isMarkdownPdfTarget = (target: string) =>
  documentAdapterForMarkdownEmbedPath(cleanTargetPath(target))?.kind === 'pdf'
const isExternalPdfTarget = (target: string) => externalProtocolPattern.test(target.trim())

export const resolveMarkdownPdfSource = async (documentPath: string | null, target: string) => {
  const trimmed = target.trim()
  if (!trimmed) return target
  if (blockedExternalPdfPattern.test(trimmed)) return ''
  if (!isMarkdownPdfTarget(trimmed)) return target
  if (isExternalPdfTarget(trimmed)) return trimmed
  if (!documentPath || !isDesktopRuntime()) return ''

  try {
    const resolved = await fsApi.resolveMarkdownAsset({ documentPath, target: trimmed })
    const relativePath = resolved.relative_path
    const supportedMediaType = resolved.media_type
      ? resolved.media_type === 'application/pdf'
      : Boolean(relativePath && isMarkdownPdfTarget(relativePath))
    if (resolved.is_external || !resolved.exists || !relativePath || !supportedMediaType) return ''
    return await issueAssetSource(relativePath, trimmed)
  } catch (error) {
    console.warn('Failed to resolve Markdown PDF source', error)
    return ''
  }
}
