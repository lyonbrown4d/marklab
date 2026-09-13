import { documentAdapterForMarkdownEmbedPath } from '@/logic/documentAdapters'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

export type EmbeddedPreviewResolvedTarget = {
  external: boolean
  kind: PreviewFileKind
  path: string | null
  readonly: boolean
  src: string
}

const externalProtocolPattern = /^(https?:|data:|blob:)/i
const blockedExternalPdfPattern = /^(https?:|data:)/i

export const cleanEmbeddedPreviewTarget = (target: string) =>
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
const isExternalTarget = (target: string) => externalProtocolPattern.test(target.trim())
const isBlockedExternalPdf = (kind: PreviewFileKind, target: string) =>
  kind === 'pdf' && blockedExternalPdfPattern.test(target.trim())

export const embeddedPreviewKindForTarget = (target: string): PreviewFileKind | null =>
  documentAdapterForMarkdownEmbedPath(cleanEmbeddedPreviewTarget(target))?.kind ?? null

export const resolveEmbeddedPreviewTarget = async (
  documentPath: string | null,
  target: string,
): Promise<EmbeddedPreviewResolvedTarget | null> => {
  const trimmed = target.trim()
  const kind = embeddedPreviewKindForTarget(trimmed)
  if (!trimmed || !kind) return null
  if (isExternalTarget(trimmed)) {
    if (isBlockedExternalPdf(kind, trimmed)) return null
    return { external: true, kind, path: null, readonly: true, src: trimmed }
  }
  if (!isDesktopRuntime()) return null

  if (!documentPath) {
    const metadata = await fsApi.getPathMetadata(cleanEmbeddedPreviewTarget(trimmed))
    return {
      external: false,
      kind,
      path: metadata.path,
      readonly: metadata.readonly,
      src: await issueAssetSource(metadata.path, trimmed),
    }
  }

  const asset = await fsApi.resolveMarkdownAsset({ documentPath, target: trimmed })
  const relativePath = asset.relative_path
  if (asset.is_external || !asset.exists || !relativePath) return null
  return {
    external: false,
    kind,
    path: withoutFragment(relativePath),
    readonly: false,
    src: await issueAssetSource(relativePath, trimmed),
  }
}
