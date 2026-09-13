import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

const externalProtocolPattern = /^(https?:|data:|blob:)/i
const targetFragment = (target: string) => {
  const index = target.indexOf('#')
  return index >= 0 ? target.slice(index) : ''
}
const withoutFragment = (path: string) => path.split('#')[0] ?? path
const issueAssetSource = async (relativePath: string, target: string) => {
  const capability = await fsApi.toAssetUrl(withoutFragment(relativePath))
  return `${capability.url}${targetFragment(target)}`
}
export const isExternalMarkdownImageSource = (src: string) =>
  externalProtocolPattern.test(src.trim())

export const resolveMarkdownImageSource = async (documentPath: string | null, src: string) => {
  const target = src.trim()
  if (!target) return src
  if (isExternalMarkdownImageSource(target)) return target
  if (!documentPath || !isDesktopRuntime()) return ''

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
    return await issueAssetSource(relativePath, target)
  } catch (error) {
    console.warn('Failed to resolve Markdown image source', error)
    return ''
  }
}
