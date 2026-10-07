import { extractHeadings } from '@/logic/paths'
import { fsApi } from '@/services/fsApi'
import { beginMarkdownAssetSyncTask } from '@/store/useMarkdownAssetSyncStore'
import type { MarkdownAssetImportStrategy } from '@/store/appTypes'
import {
  fileNameFromPath,
  getFileSourcePath,
  isImageFile,
  isImagePath,
  isSafeAssetPath,
  isSafeWorkspaceRelativePath,
  normalizeImageSourceUrl,
  type MarkdownImageImportSource,
} from '@/components/editor/assets/assetSources'

export type MarkdownImageImportOptions = {
  activePath: string | null
  getDocumentPath: () => string | null
  getEditorIdentity: () => object | null
  insertImage: (src: string, alt?: string) => boolean
  markdown: string
  signal?: AbortSignal
  strategy: MarkdownAssetImportStrategy
}

const MAX_IMPORTED_ASSET_BYTES = 32 * 1024 * 1024

export const importMarkdownImages = async (
  sources: readonly MarkdownImageImportSource[],
  options: MarkdownImageImportOptions,
) => {
  const { activePath, getDocumentPath, getEditorIdentity, insertImage, signal } = options
  if (!activePath || signal?.aborted) return false
  const editorIdentity = getEditorIdentity()
  const documentPath = getDocumentPath()
  const isCurrent = () =>
    !signal?.aborted &&
    editorIdentity !== null &&
    getEditorIdentity() === editorIdentity &&
    getDocumentPath() === documentPath
  if (!isCurrent()) return false

  const title = extractHeadings(options.markdown)[0]?.text ?? null
  let imported = false
  for (const source of sources.filter(isValidSource)) {
    if (!isCurrent()) break
    const alt = cleanAltText(sourceName(source))
    if (source.kind === 'url') {
      const url = normalizeImageSourceUrl(source.url)
      if (url) imported = insertImage(url, alt) || imported
      continue
    }
    const inserted = await importLocalImage(source, {
      ...options,
      activePath,
      alt,
      isCurrent,
      title,
    })
    imported = inserted || imported
  }
  return imported
}

type CurrentImportOptions = MarkdownImageImportOptions & {
  activePath: string
  alt: string
  isCurrent: () => boolean
  title: string | null
}

const importLocalImage = async (
  source: Exclude<MarkdownImageImportSource, { kind: 'url' }>,
  options: CurrentImportOptions,
) => {
  const finishSync = beginMarkdownAssetSyncTask()
  try {
    const result = await importAsset(source, options)
    if (!options.isCurrent()) {
      finishSync()
      return false
    }
    if (!result.relative_path) throw new Error('Imported image is outside the workspace boundary')
    const inserted = options.insertImage(result.markdown_target, options.alt)
    if (!inserted) throw new Error('Imported image target could not be inserted')
    finishSync()
    return true
  } catch (error) {
    finishSync(error)
    if (!isAbort(error)) console.error('import markdown image asset failed', error)
    return false
  }
}

const importAsset = async (
  source: Exclude<MarkdownImageImportSource, { kind: 'url' }>,
  options: CurrentImportOptions,
) => {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (source.kind === 'path' && isSafeWorkspaceRelativePath(source.path)) {
    return {
      copied: false,
      markdown_target: relativeMarkdownTarget(options.activePath, source.path),
      relative_path: source.path.replaceAll('\\', '/'),
    }
  }
  const sourcePath = source.kind === 'path' ? source.path : getFileSourcePath(source.file)
  if (sourcePath) {
    return fsApi.importMarkdownAsset({
      documentPath: options.activePath,
      sourcePath,
      strategy: options.strategy,
      title: options.title,
    })
  }
  if (source.kind === 'path') throw new Error('Invalid image source path')
  if (source.file.size > MAX_IMPORTED_ASSET_BYTES) {
    throw new Error('Image asset is too large to import')
  }
  return fsApi.importMarkdownAssetBytes({
    bytes: await blobToArrayBuffer(source.file, options.signal),
    documentPath: options.activePath,
    fileName: source.file.name || `image-${Date.now()}.${extensionFromMime(source.file.type)}`,
    title: options.title,
  })
}

const blobToArrayBuffer = (blob: Blob, signal?: AbortSignal) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => {
      reader.abort()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image asset'))
    reader.onload = () => {
      signal?.removeEventListener('abort', abort)
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('Failed to read binary image asset'))
    }
    reader.readAsArrayBuffer(blob)
  })

const isValidSource = (source: MarkdownImageImportSource) => {
  if (source.kind === 'file') return isImageFile(source.file)
  if (source.kind === 'url') return normalizeImageSourceUrl(source.url) !== null
  return isSafeAssetPath(source.path) && isImagePath(source.name || source.path)
}
const sourceName = (source: MarkdownImageImportSource) =>
  source.kind === 'file'
    ? source.file.name
    : source.name || ('url' in source ? source.url : source.path)
const cleanAltText = (name: string) =>
  fileNameFromPath(name)
    .replace(/\.[^.]+$/u, '')
    .replace(/[-_]+/gu, ' ')
    .trim()
const extensionFromMime = (mime: string) => {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/svg+xml') return 'svg'
  const subtype = mime.split('/')[1]
  return subtype && /^[a-z\d.+-]+$/iu.test(subtype) ? subtype.replace('+xml', '') : 'png'
}
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
const relativeMarkdownTarget = (documentPath: string, assetPath: string) => {
  const from = documentPath.replaceAll('\\', '/').split('/').slice(0, -1)
  const to = assetPath.replaceAll('\\', '/').split('/')
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1
  const target = [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/')
  return target || to.at(-1) || assetPath
}
