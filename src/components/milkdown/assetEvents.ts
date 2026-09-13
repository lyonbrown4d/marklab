import type { ClipboardEvent, DragEvent } from 'react'
import {
  documentAdapterExtensionsForKind,
  documentAdapterForMarkdownEmbedPath,
} from '@/logic/documentAdapters'
import { MARKLAB_FILE_TREE_ITEM_MIME, readFileTreeDragPayload } from '@/logic/fileDragPayload'
import { extractHeadings } from '@/logic/paths'
import { readClipboardImagePng, readClipboardText } from '@/runtime/clipboard'
import { openDialog } from '@/runtime/dialog'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { beginMarkdownAssetSyncTask } from '@/store/useMarkdownAssetSyncStore'
import type { MarkdownAssetImportStrategy } from '@/store/appTypes'

type FileWithPath = File & { path?: unknown }
type ImportMarkdownAssetOptions = {
  activePath: string | null
  getDocumentPath: () => string | null
  getEditorIdentity: () => object | null
  markdown: string
  strategy: MarkdownAssetImportStrategy
  insertImage: (src: string, alt?: string) => boolean
  replaceImageSource: (from: string, to: string) => boolean
  subscribeDocumentPath: (listener: (path: string | null) => void) => () => void
}

const markdownImageDialogExtensions = [...documentAdapterExtensionsForKind('image')]

export type MarkdownImageImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'path'; path: string; name?: string }
  | { kind: 'url'; url: string; name?: string }

export const hasImageFiles = (files: FileList | null | undefined) =>
  Array.from(files ?? []).some(isImageFile)
export const hasImageDataTransfer = (dataTransfer: DataTransfer) => {
  if (hasImageFiles(dataTransfer.files)) return true
  const fileTreePayload = readFileTreeDragPayload(dataTransfer)
  if (fileTreePayload && isImagePath(fileTreePayload.name)) return true
  if (Array.from(dataTransfer.types).includes(MARKLAB_FILE_TREE_ITEM_MIME)) return true
  return Array.from(dataTransfer.items).some((item) => {
    if (item.kind !== 'file') return false
    if (item.type.startsWith('image/')) return true
    const file = item.getAsFile()
    return file ? isImageFile(file) : true
  })
}
export const importMarkdownImageFiles = async (
  files: File[],
  options: ImportMarkdownAssetOptions,
) =>
  importMarkdownImageSources(
    files.map((file) => ({ kind: 'file', file })),
    options,
  )

export const importMarkdownImageSources = async (
  sources: MarkdownImageImportSource[],
  {
    activePath,
    getDocumentPath,
    getEditorIdentity,
    insertImage,
    markdown,
    strategy,
    subscribeDocumentPath,
  }: ImportMarkdownAssetOptions,
) => {
  if (!activePath) return false
  const editorIdentity = getEditorIdentity()
  const documentPath = getDocumentPath()
  let documentGenerationCurrent = editorIdentity !== null && documentPath === activePath
  const unsubscribeDocumentPath = subscribeDocumentPath(() => {
    documentGenerationCurrent = false
  })
  const isCurrentDocument = () =>
    documentGenerationCurrent &&
    getEditorIdentity() === editorIdentity &&
    getDocumentPath() === documentPath
  const insertImageIfCurrent = (src: string, alt?: string) =>
    isCurrentDocument() ? insertImage(src, alt) : false

  try {
    if (!isCurrentDocument()) return false
    const title = extractHeadings(markdown)[0]?.text ?? null
    let imported = false
    for (const source of sources.filter(isImageImportSource)) {
      if (!isCurrentDocument()) return imported
      const alt = cleanAltText(
        source.kind === 'file'
          ? source.file.name
          : source.kind === 'url'
            ? source.name || source.url
            : source.name || source.path,
      )
      if (source.kind === 'url') {
        imported = insertImageIfCurrent(source.url, alt) || imported
        continue
      }
      const inserted = await importAndInsertMarkdownAsset({
        activePath,
        alt,
        insertImage: insertImageIfCurrent,
        isCurrentDocument,
        source,
        strategy,
        title,
      })
      imported = inserted || imported
    }
    return imported
  } finally {
    unsubscribeDocumentPath()
  }
}

export const filesFromPasteEvent = (event: ClipboardEvent<HTMLElement>) =>
  Array.from(event.clipboardData.files).filter(isImageFile)
export const imageSourcesFromFiles = (files: File[]) =>
  files.filter(isImageFile).map((file) => ({ kind: 'file' as const, file }))
export const imageSourcesFromPasteEvent = (event: ClipboardEvent<HTMLElement>) => [
  ...imageSourcesFromFiles(filesFromPasteEvent(event)),
  ...imageSourcesFromClipboardText(event.clipboardData.getData('text/plain')),
]
export const filesFromDropEvent = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer.files).filter(isImageFile)
export const imageSourcesFromDropEvent = (event: DragEvent<HTMLElement>) => [
  ...imageSourcesFromFiles(filesFromDropEvent(event)),
  ...pathSourcesFromDataTransfer(event.dataTransfer),
]
export const imagePathSourcesFromDropEvent = (event: DragEvent<HTMLElement>) =>
  pathSourcesFromDataTransfer(event.dataTransfer)
export const imageSourcesFromRuntimeDropPaths = (paths: string[]) =>
  paths.filter(isImagePath).map((path) => ({
    kind: 'path' as const,
    name: fileNameFromPath(path),
    path,
  }))

export const pickMarkdownImageSource = async (): Promise<MarkdownImageImportSource | null> => {
  if (!isDesktopRuntime()) return null
  const selectedPath = await openDialog({
    multiple: false,
    filters: [{ name: 'Images', extensions: markdownImageDialogExtensions }],
  })
  return typeof selectedPath === 'string'
    ? { kind: 'path', name: fileNameFromPath(selectedPath), path: selectedPath }
    : null
}
export const readNativeClipboardImageSource =
  async (): Promise<MarkdownImageImportSource | null> => {
    if (!isDesktopRuntime()) return null
    const imageSource = await readNativeClipboardImage().catch(() => null)
    if (imageSource) return imageSource
    const text = await readClipboardText().catch(() => '')
    return imageSourcesFromClipboardText(text)[0] ?? null
  }

type ImportAndInsertOptions = {
  activePath: string
  alt: string
  insertImage: (src: string, alt?: string) => boolean
  isCurrentDocument: () => boolean
  source: Exclude<MarkdownImageImportSource, { kind: 'url' }>
  strategy: MarkdownAssetImportStrategy
  title: string | null
}
const importAndInsertMarkdownAsset = async ({
  activePath,
  alt,
  insertImage,
  isCurrentDocument,
  source,
  strategy,
  title,
}: ImportAndInsertOptions) => {
  const finishSync = beginMarkdownAssetSyncTask()
  try {
    const result = await importMarkdownAsset(source, activePath, strategy, title)
    if (!isCurrentDocument()) {
      finishSync()
      return false
    }
    if (!result.relative_path) {
      const error = new Error('Imported image is outside the workspace preview boundary')
      console.error('imported markdown image is not previewable', error)
      finishSync(error)
      return false
    }
    const inserted = insertImage(result.markdown_target, alt)
    if (!inserted) {
      const error = new Error('Imported image target could not be inserted')
      finishSync(error)
      return false
    }
    finishSync()
    return true
  } catch (error) {
    console.error('import markdown image asset failed', error)
    finishSync(error)
    return false
  }
}

const importMarkdownAsset = async (
  source: Exclude<MarkdownImageImportSource, { kind: 'url' }>,
  activePath: string,
  strategy: MarkdownAssetImportStrategy,
  title: string | null,
) => {
  const sourcePath =
    source.kind === 'path'
      ? (fileUriToPath(source.path) ?? source.path)
      : getFileSourcePath(source.file)
  if (sourcePath) {
    return fsApi.importMarkdownAsset({ sourcePath, documentPath: activePath, strategy, title })
  }
  if (source.kind === 'path') throw new Error('Missing image source path')
  return fsApi.importMarkdownAssetBase64({
    fileName: source.file.name || `image-${Date.now()}.${extensionFromMimeType(source.file.type)}`,
    base64Data: await blobToBase64(source.file),
    documentPath: activePath,
    title,
  })
}
const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image asset'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
const getFileSourcePath = (file: File) => {
  const value = (file as FileWithPath).path
  return typeof value === 'string' && value.length > 0 ? value : null
}
const isImageFile = (file: File) => file.type.startsWith('image/') || isImagePath(file.name)
const isImageImportSource = (source: MarkdownImageImportSource) => {
  if (source.kind === 'file') return isImageFile(source.file)
  if (source.kind === 'url') return isImagePath(source.url)
  return isImagePath(source.name || source.path)
}
const isImagePath = (path: string) =>
  documentAdapterForMarkdownEmbedPath(path.split(/[?#]/)[0] ?? path)?.kind === 'image'
const cleanAltText = (fileName: string) =>
  fileNameFromPath(fileName)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
const extensionFromMimeType = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/svg+xml') return 'svg'
  const subtype = mimeType.split('/')[1]
  return subtype && /^[a-z0-9.+-]+$/i.test(subtype) ? subtype.replace('+xml', '') : 'png'
}

const pathSourcesFromDataTransfer = (dataTransfer: DataTransfer) => {
  const fileTreePayload = readFileTreeDragPayload(dataTransfer)
  const paths = [
    ...(fileTreePayload ? [{ path: fileTreePayload.path, name: fileTreePayload.name }] : []),
    ...fileUriListToPaths(dataTransfer.getData('text/uri-list')).map((path) => ({
      path,
      name: fileNameFromPath(path),
    })),
  ]
  const seen = new Set<string>()
  return paths
    .filter(({ name, path }) => isImagePath(name || path))
    .filter(({ path }) => {
      if (seen.has(path)) return false
      seen.add(path)
      return true
    })
    .map(({ name, path }) => ({ kind: 'path' as const, name, path }))
}
const imageSourcesFromClipboardText = (value: string) => {
  const text = value.trim()
  if (!text) return []
  const filePaths = fileUriListToPaths(text)
  if (filePaths.length > 0) {
    return filePaths
      .filter(isImagePath)
      .map((path) => ({ kind: 'path' as const, name: fileNameFromPath(path), path }))
  }
  if (/^https?:\/\//i.test(text) && isImagePath(text)) {
    return [{ kind: 'url' as const, name: fileNameFromPath(text), url: text }]
  }
  if (isImagePath(text)) {
    return [{ kind: 'path' as const, name: fileNameFromPath(text), path: text }]
  }
  return []
}
const fileUriToPath = (value: string) => {
  if (!value.startsWith('file://')) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    const pathname = decodeURIComponent(url.pathname)
    if (url.hostname) return `//${url.hostname}${pathname}`
    return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname
  } catch {
    return null
  }
}
const fileUriListToPaths = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith('file://'))
    .map((line) => fileUriToPath(line) ?? '')
    .filter(Boolean)
const readNativeClipboardImage = async (): Promise<MarkdownImageImportSource | null> => {
  const png = await readClipboardImagePng()
  if (!png) return null
  return {
    kind: 'file',
    file: new File([png], `clipboard-${Date.now()}.png`, { type: 'image/png' }),
  }
}
const fileNameFromPath = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
