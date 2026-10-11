import type { BrowserWindow } from 'electron'
import { renderDocx } from '@electron/services/export/docx'
import { renderHtmlWithLocalImages } from '@electron/services/export/html'
import { renderPdfDocument, renderPdfHtmlDocument } from '@electron/services/export/pdf'
import type { ExportFormat, ExportResourceContext } from '@electron/services/export/exportRequest'
import {
  renderWorkspacePublicationHtml,
  type WorkspacePublicationSource,
} from '@electron/services/export/workspacePublicationHtml'
import { renderWorkspacePublicationDocx } from '@electron/services/export/workspacePublicationDocx'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'

type RenderProgress = (progress: number, message: string) => void

export const renderMarkdownExport = async (
  BrowserWindowClass: typeof BrowserWindow,
  format: ExportFormat,
  markdown: string,
  resources: ExportResourceContext,
  signal: AbortSignal,
  onProgress: RenderProgress,
): Promise<string | Buffer> => {
  const { resourceBasePath, workspaceRootPath } = resources
  if (format === 'html') {
    onProgress(0.45, 'Rendering HTML document')
    return renderHtmlWithLocalImages(markdown, {
      readImage: resources.readImage,
      resourceBasePath,
      resolveRelativeResources: true,
      workspaceRootPath,
    })
  }
  if (format === 'pdf') {
    return renderPdfDocument({
      BrowserWindowClass,
      markdown,
      onProgress,
      readImage: resources.readImage,
      resourceBasePath,
      signal,
      workspaceRootPath,
    })
  }
  if (format === 'docx') {
    onProgress(0.45, 'Rendering Word document')
    return renderDocx(markdown, { readImage: resources.readImage })
  }
  throw new Error(`Unsupported export format: ${format}`)
}

export const renderWorkspacePublicationExport = async (
  BrowserWindowClass: typeof BrowserWindow,
  chapters: WorkspacePublicationSource[],
  options: WorkspacePublicationOptions,
  signal: AbortSignal,
  onProgress: RenderProgress,
): Promise<Buffer> => {
  if (options.format === 'docx') {
    onProgress(0.45, 'Rendering Word publication')
    return renderWorkspacePublicationDocx(chapters, options)
  }
  onProgress(0.25, 'Composing workspace publication')
  const html = await renderWorkspacePublicationHtml(chapters, options)
  return renderPdfHtmlDocument({
    BrowserWindowClass,
    html,
    landscape: options.orientation === 'landscape',
    onProgress,
    pageSize:
      options.pageSize === 'letter' ? 'Letter' : (options.pageSize.toUpperCase() as 'A4' | 'A5'),
    signal,
  })
}
