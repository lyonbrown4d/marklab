import type {
  WorkspacePublicationChapter,
  WorkspacePublicationOptions,
} from '@/types/workspacePublication'

export type PublicationChapterSelection = WorkspacePublicationChapter & { included: boolean }

export type PublicationPreviewPage = {
  excerpt: string
  kind: 'cover' | 'contents' | 'chapter'
  number: number
  path?: string
  title: string
}

export const defaultPublicationOptions = (
  locale: WorkspacePublicationOptions['locale'] = 'zh-CN',
): WorkspacePublicationOptions => ({
  cover: true,
  format: 'pdf',
  includeLinkedSpreadsheets: false,
  locale,
  margin: 'normal',
  orientation: 'portrait',
  pageBreaks: true,
  pageNumbers: true,
  pageSize: 'a4',
  tableOfContents: true,
  title: '',
})

export const createPreviewPages = (
  chapters: PublicationChapterSelection[],
  options: WorkspacePublicationOptions,
): PublicationPreviewPage[] => {
  const included = chapters.filter((chapter) => chapter.included)
  const pages: PublicationPreviewPage[] = []
  if (options.cover) {
    pages.push({ excerpt: '', kind: 'cover', number: 1, title: options.title })
  }
  if (options.tableOfContents) {
    pages.push({
      excerpt: included.map((chapter) => chapter.title).join('\n'),
      kind: 'contents',
      number: pages.length + 1,
      title: options.locale === 'zh-CN' ? '目录' : 'Contents',
    })
  }
  included.forEach((chapter) => {
    pages.push({
      excerpt: chapter.excerpt,
      kind: 'chapter',
      number: pages.length + 1,
      path: chapter.path,
      title: chapter.title,
    })
  })
  return pages
}
