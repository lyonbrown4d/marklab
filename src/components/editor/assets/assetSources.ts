import type { ClipboardEvent, DragEvent } from 'react'
import {
  documentAdapterExtensionsForKind,
  documentAdapterForMarkdownEmbedPath,
} from '@/logic/documentAdapters'
import { MARKLAB_FILE_TREE_ITEM_MIME, readFileTreeDragPayload } from '@/logic/fileDragPayload'
import { openDialog } from '@/runtime/dialog'
import { isDesktopRuntime } from '@/runtime/environment'
import { readClipboardImagePng, readClipboardText } from '@/runtime/clipboard'

type FileWithPath = File & { path?: unknown }
type ClipboardData = {
  files: ArrayLike<File>
  getData: (format: string) => string
}

export type MarkdownImageImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'path'; path: string; name?: string }
  | { kind: 'url'; url: string; name?: string }

const imageExtensions = [...documentAdapterExtensionsForKind('image')]

export const isImagePath = (value: string) => {
  const path = value.split(/[?#]/)[0] ?? value
  return documentAdapterForMarkdownEmbedPath(path)?.kind === 'image'
}

export const isImageFile = (file: File) =>
  isImagePath(file.name) || (!file.name.trim() && file.type.startsWith('image/'))

export const normalizeImageSourceUrl = (value: string) => {
  const text = value.trim()
  if (!text || hasControlCharacters(text)) return null
  try {
    const parsed = new URL(text)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return isImagePath(parsed.href) ? parsed.href : null
  } catch {
    return null
  }
}

export const isSafeAbsolutePath = (value: string) => {
  const path = value.trim()
  const isWindowsDrivePath = /^[A-Za-z]:[\\/]/u.test(path)
  if (
    !path ||
    hasControlCharacters(path) ||
    (!isWindowsDrivePath && /^[a-z][a-z\d+.-]*:/iu.test(path))
  ) {
    return false
  }
  return /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/]|\/(?!\/))/u.test(path)
}

export const isSafeWorkspaceRelativePath = (value: string) => {
  const path = value.trim().replaceAll('\\', '/')
  if (!path || hasControlCharacters(path) || path.startsWith('/') || /^[A-Za-z]:/u.test(path)) {
    return false
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(path)) return false
  return path.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..')
}

export const isSafeAssetPath = (value: string) =>
  isSafeAbsolutePath(value) || isSafeWorkspaceRelativePath(value)

export const imageSourcesFromFiles = (files: readonly File[]) =>
  files.filter(isImageFile).map((file) => ({ kind: 'file' as const, file }))

export const imageSourcesFromRuntimeDropPaths = (paths: readonly string[]) =>
  paths.filter(isSafeImagePath).map((path) => ({
    kind: 'path' as const,
    name: fileNameFromPath(path),
    path,
  }))

export const imageSourcesFromClipboardData = (clipboard: ClipboardData) => {
  const files = imageSourcesFromFiles(Array.from(clipboard.files))
  if (files.length > 0) return files
  const url = normalizeImageSourceUrl(clipboard.getData('text/plain'))
  return url ? [{ kind: 'url' as const, name: fileNameFromPath(url), url }] : []
}

export const imageSourcesFromPasteEvent = (event: ClipboardEvent<HTMLElement>) =>
  imageSourcesFromClipboardData(event.clipboardData)

export const imageSourcesFromDropEvent = (event: DragEvent<HTMLElement>) => [
  ...imageSourcesFromFiles(Array.from(event.dataTransfer.files)),
  ...pathSourcesFromDataTransfer(event.dataTransfer),
]
export const imagePathSourcesFromDropEvent = (event: DragEvent<HTMLElement>) =>
  pathSourcesFromDataTransfer(event.dataTransfer)

export const hasImageDataTransfer = (dataTransfer: DataTransfer) => {
  if (imageSourcesFromFiles(Array.from(dataTransfer.files)).length > 0) return true
  const fileTreePayload = readFileTreeDragPayload(dataTransfer)
  if (fileTreePayload && isImagePath(fileTreePayload.name)) return true
  if (Array.from(dataTransfer.types).includes(MARKLAB_FILE_TREE_ITEM_MIME)) return true
  return Array.from(dataTransfer.items).some(
    (item) =>
      item.kind === 'file' && (item.type.startsWith('image/') || Boolean(item.getAsFile()?.name)),
  )
}

export const getFileSourcePath = (file: File) => {
  const value = (file as FileWithPath).path
  return typeof value === 'string' && isSafeAbsolutePath(value) ? value : null
}

export const pickMarkdownImageSource = async (): Promise<MarkdownImageImportSource | null> => {
  if (!isDesktopRuntime()) return null
  const selectedPath = await openDialog({
    multiple: false,
    filters: [{ name: 'Images', extensions: imageExtensions }],
  })
  return typeof selectedPath === 'string' && isSafeImagePath(selectedPath)
    ? { kind: 'path', name: fileNameFromPath(selectedPath), path: selectedPath }
    : null
}

export const readNativeClipboardImageSource =
  async (): Promise<MarkdownImageImportSource | null> => {
    if (!isDesktopRuntime()) return null
    const png = await readClipboardImagePng().catch(() => null)
    if (png) {
      return {
        kind: 'file',
        file: new File([png], `clipboard-${Date.now()}.png`, { type: 'image/png' }),
      }
    }
    const url = normalizeImageSourceUrl(await readClipboardText().catch(() => ''))
    return url ? { kind: 'url', name: fileNameFromPath(url), url } : null
  }

const pathSourcesFromDataTransfer = (dataTransfer: DataTransfer) => {
  const payload = readFileTreeDragPayload(dataTransfer)
  const workspaceSource =
    payload && isSafeAssetPath(payload.path) && isImagePath(payload.name)
      ? [{ kind: 'path' as const, name: payload.name, path: payload.path }]
      : []
  return [
    ...workspaceSource,
    ...imageSourcesFromRuntimeDropPaths(fileUriListToPaths(dataTransfer.getData('text/uri-list'))),
  ]
}

const fileUriListToPaths = (value: string) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(fileUriToPath)
    .filter((path): path is string => Boolean(path))

const fileUriToPath = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    const pathname = decodeURIComponent(url.pathname)
    const path = url.hostname
      ? `\\\\${url.hostname}${pathname.replaceAll('/', '\\')}`
      : /^\/[A-Za-z]:\//u.test(pathname)
        ? pathname.slice(1).replaceAll('/', '\\')
        : pathname
    return isSafeAbsolutePath(path) ? path : null
  } catch {
    return null
  }
}

const isSafeImagePath = (path: string) => isSafeAbsolutePath(path) && isImagePath(path)
export const fileNameFromPath = (path: string) =>
  path.split(/[\\/]/u).filter(Boolean).pop()?.split(/[?#]/u)[0] ?? path
const hasControlCharacters = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
