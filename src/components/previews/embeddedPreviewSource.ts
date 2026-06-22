import { documentAdapterForMarkdownEmbedPath } from '@/logic/documentAdapters'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'

export type EmbeddedPreviewResolvedTarget = {
  kind: PreviewFileKind
  path: string | null
  readonly: boolean
  src: string
}

const localProtocolPattern = /^(https?:|data:|blob:|asset:|file:)/i
const resolvedPreviewCache = new Map<string, EmbeddedPreviewResolvedTarget>()

const cacheKey = (documentPath: string | null, target: string) =>
  `${documentPath ?? ''}\u0000${target.trim()}`

export const cleanEmbeddedPreviewTarget = (target: string) =>
  target.trim().split('#')[0]?.split('?')[0] ?? target.trim()

const targetSuffix = (target: string) => {
  const cleanPath = cleanEmbeddedPreviewTarget(target)
  return target.trim().slice(cleanPath.length)
}

const isExternalTarget = (target: string) => localProtocolPattern.test(target.trim())

export const embeddedPreviewKindForTarget = (target: string): PreviewFileKind | null =>
  documentAdapterForMarkdownEmbedPath(cleanEmbeddedPreviewTarget(target))?.kind ?? null

export const resolveEmbeddedPreviewTarget = async (
  documentPath: string | null,
  target: string,
): Promise<EmbeddedPreviewResolvedTarget | null> => {
  const trimmed = target.trim()
  const kind = embeddedPreviewKindForTarget(trimmed)
  if (!trimmed || !kind) return null

  const key = cacheKey(documentPath, trimmed)
  const cached = resolvedPreviewCache.get(key)
  if (cached) return cached

  if (isExternalTarget(trimmed) || !isDesktopRuntime()) {
    const resolved = {
      kind,
      path: null,
      readonly: true,
      src: trimmed,
    } satisfies EmbeddedPreviewResolvedTarget
    resolvedPreviewCache.set(key, resolved)
    return resolved
  }

  if (!documentPath) {
    const metadata = await fsApi.getPathMetadata(cleanEmbeddedPreviewTarget(trimmed))
    const resolved = {
      kind,
      path: metadata.path,
      readonly: metadata.readonly,
      src: `${convertAssetFileSrc(metadata.absolute_path)}${targetSuffix(trimmed)}`,
    } satisfies EmbeddedPreviewResolvedTarget
    resolvedPreviewCache.set(key, resolved)
    return resolved
  }

  const asset = await fsApi.resolveMarkdownAsset({
    documentPath,
    target: trimmed,
  })
  if (asset.is_external || !asset.exists || !asset.absolute_path) {
    const unresolved = {
      kind,
      path: null,
      readonly: true,
      src: trimmed,
    } satisfies EmbeddedPreviewResolvedTarget
    resolvedPreviewCache.set(key, unresolved)
    return unresolved
  }

  const resolved = {
    kind,
    path: asset.relative_path ?? cleanEmbeddedPreviewTarget(trimmed),
    readonly: false,
    src: `${convertAssetFileSrc(asset.absolute_path)}${targetSuffix(trimmed)}`,
  } satisfies EmbeddedPreviewResolvedTarget
  resolvedPreviewCache.set(key, resolved)
  return resolved
}
