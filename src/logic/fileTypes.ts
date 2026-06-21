import type { FileViewKind } from '@/store/appTypes'
import {
  DOCUMENT_ADAPTER_EXTENSIONS,
  documentAdapterForPath,
  fileExtension,
  type DocumentAdapterKind,
} from '@/logic/documentAdapters'

export type PreviewFileKind = DocumentAdapterKind

export const MARKDOWN_FILE_EXTENSIONS = ['md', 'markdown'] as const
export const MARKLAB_DOCUMENT_EXTENSIONS = [
  ...MARKDOWN_FILE_EXTENSIONS,
  ...DOCUMENT_ADAPTER_EXTENSIONS,
]

const MARKDOWN_EXTENSIONS = new Set<string>(MARKDOWN_FILE_EXTENSIONS)

export const isMarkdownFilePath = (value: string): boolean =>
  MARKDOWN_EXTENSIONS.has(fileExtension(value))

export { fileExtension }

export const isPdfFilePath = (value: string): boolean => getPreviewFileKind(value) === 'pdf'

export const isDocxFilePath = (value: string): boolean => getPreviewFileKind(value) === 'docx'

export const isDrawioFilePath = (value: string): boolean => getPreviewFileKind(value) === 'drawio'

export const isImageFilePath = (value: string): boolean => getPreviewFileKind(value) === 'image'

export const isAudioFilePath = (value: string): boolean => getPreviewFileKind(value) === 'audio'

export const isVideoFilePath = (value: string): boolean => getPreviewFileKind(value) === 'video'

export const getPreviewFileKind = (value: string): PreviewFileKind | null => {
  return documentAdapterForPath(value)?.kind ?? null
}

export const isPreviewableFilePath = (value: string): boolean => getPreviewFileKind(value) !== null

export const isTextFileViewPath = (value: string): boolean => !isPreviewableFilePath(value)

export const fileViewForOpenPath = (path: string, preferredView: FileViewKind): FileViewKind => {
  if (isPreviewableFilePath(path)) return 'preview'
  return preferredView === 'preview' ? 'edit' : preferredView
}
