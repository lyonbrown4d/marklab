import type { FileViewKind } from '@/store/appTypes'

export type PreviewFileKind = 'audio' | 'docx' | 'drawio' | 'image' | 'pdf' | 'video'

export const MARKDOWN_FILE_EXTENSIONS = ['md', 'markdown'] as const
export const IMAGE_FILE_EXTENSIONS = [
  'apng',
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
] as const
export const AUDIO_FILE_EXTENSIONS = [
  'aac',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
] as const
export const VIDEO_FILE_EXTENSIONS = ['m4v', 'mov', 'mp4', 'ogv', 'webm'] as const
export const MARKLAB_DOCUMENT_EXTENSIONS = [
  ...MARKDOWN_FILE_EXTENSIONS,
  'dio',
  'docx',
  'drawio',
  'pdf',
  ...IMAGE_FILE_EXTENSIONS,
  ...AUDIO_FILE_EXTENSIONS,
  ...VIDEO_FILE_EXTENSIONS,
]

const MARKDOWN_EXTENSIONS = new Set<string>(MARKDOWN_FILE_EXTENSIONS)
const IMAGE_EXTENSIONS = new Set<string>(IMAGE_FILE_EXTENSIONS)
const AUDIO_EXTENSIONS = new Set<string>(AUDIO_FILE_EXTENSIONS)
const VIDEO_EXTENSIONS = new Set<string>(VIDEO_FILE_EXTENSIONS)

const cleanPath = (value: string) => value.trim().split('#')[0]?.split('?')[0] ?? value.trim()

export const fileExtension = (value: string): string => {
  const name = cleanPath(value).split(/[\\/]/).filter(Boolean).pop() ?? ''
  const index = name.lastIndexOf('.')
  if (index <= 0 || index === name.length - 1) return ''
  return name.slice(index + 1).toLowerCase()
}

export const isMarkdownFilePath = (value: string): boolean =>
  MARKDOWN_EXTENSIONS.has(fileExtension(value))

export const isPdfFilePath = (value: string): boolean => fileExtension(value) === 'pdf'

export const isDocxFilePath = (value: string): boolean => fileExtension(value) === 'docx'

export const isDrawioFilePath = (value: string): boolean =>
  fileExtension(value) === 'drawio' || fileExtension(value) === 'dio'

export const isImageFilePath = (value: string): boolean =>
  IMAGE_EXTENSIONS.has(fileExtension(value))

export const isAudioFilePath = (value: string): boolean =>
  AUDIO_EXTENSIONS.has(fileExtension(value))

export const isVideoFilePath = (value: string): boolean =>
  VIDEO_EXTENSIONS.has(fileExtension(value))

export const getPreviewFileKind = (value: string): PreviewFileKind | null => {
  if (isDocxFilePath(value)) return 'docx'
  if (isDrawioFilePath(value)) return 'drawio'
  if (isPdfFilePath(value)) return 'pdf'
  if (isImageFilePath(value)) return 'image'
  if (isAudioFilePath(value)) return 'audio'
  if (isVideoFilePath(value)) return 'video'
  return null
}

export const isPreviewableFilePath = (value: string): boolean => getPreviewFileKind(value) !== null

export const isTextFileViewPath = (value: string): boolean => !isPreviewableFilePath(value)

export const fileViewForOpenPath = (path: string, preferredView: FileViewKind): FileViewKind => {
  if (isPreviewableFilePath(path)) return 'preview'
  return preferredView === 'preview' ? 'edit' : preferredView
}
