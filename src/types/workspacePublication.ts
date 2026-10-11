export type WorkspacePublicationFormat = 'pdf' | 'docx'
export type WorkspacePublicationPageSize = 'a4' | 'a5' | 'letter'
export type WorkspacePublicationOrientation = 'portrait' | 'landscape'
export type WorkspacePublicationMargin = 'normal' | 'narrow' | 'wide'
export type WorkspacePublicationLocale = 'en-US' | 'zh-CN'

export type WorkspacePublicationChapter = {
  depth: number
  estimatedPages: number
  excerpt: string
  orphaned: boolean
  path: string
  title: string
  wordCount: number
}

export type WorkspacePublicationPlan = {
  chapters: WorkspacePublicationChapter[]
  estimatedPages: number
  orphanCount: number
  title: string
  totalWords: number
}

export type WorkspacePublicationOptions = {
  cover: boolean
  format: WorkspacePublicationFormat
  locale: WorkspacePublicationLocale
  margin: WorkspacePublicationMargin
  orientation: WorkspacePublicationOrientation
  pageBreaks: boolean
  pageNumbers: boolean
  pageSize: WorkspacePublicationPageSize
  tableOfContents: boolean
  title: string
}

export type WorkspacePublicationRequest = {
  chapters: Array<{ path: string; title: string }>
  options: WorkspacePublicationOptions
  outputPath: string
}
