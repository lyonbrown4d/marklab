import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type MarkdownPdfPreviewProps = {
  documentPath: string | null
  href: string
  title: string
  resolvePdfSrc: (documentPath: string | null, target: string) => Promise<string>
}

type PdfViewerSurfaceProps = {
  fileUrl: string
  mode: 'inline' | 'modal'
}

const useMeasuredWidth = (fallback: number) => {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width
      if (nextWidth && Number.isFinite(nextWidth)) {
        setWidth(Math.max(240, Math.floor(nextWidth)))
      }
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return [elementRef, width] as const
}

const PdfViewerSurface = ({ fileUrl, mode }: PdfViewerSurfaceProps) => {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [documentRef, documentWidth] = useMeasuredWidth(mode === 'modal' ? 920 : 680)
  const pageWidth = Math.max(240, Math.min(documentWidth - 24, mode === 'modal' ? 960 : 720))
  const pages = Array.from({ length: numPages }, (_, index) => index + 1)
  const handleLoadSuccess = useCallback(({ numPages: nextNumPages }: { numPages: number }) => {
    setNumPages(nextNumPages)
    setPageNumber((current) => Math.min(Math.max(1, current), nextNumPages))
  }, [])

  return (
    <div className={`marklab-pdf-viewer marklab-pdf-viewer--${mode}`}>
      <div className="marklab-pdf-viewer__thumbs" aria-label="PDF pages">
        {pages.map((page) => (
          <button
            key={page}
            className="marklab-pdf-viewer__thumb"
            data-active={page === pageNumber}
            onClick={() => setPageNumber(page)}
            type="button"
          >
            <Document file={fileUrl} loading={null} error={null}>
              <Page
                pageNumber={page}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                width={92}
              />
            </Document>
            <span>{page}</span>
          </button>
        ))}
      </div>
      <div className="marklab-pdf-viewer__document" ref={documentRef}>
        <Document
          file={fileUrl}
          loading={<div className="marklab-pdf-preview__status">正在读取 PDF...</div>}
          error={<div className="marklab-pdf-preview__status">PDF 预览不可用</div>}
          onLoadSuccess={handleLoadSuccess}
        >
          <Page pageNumber={pageNumber} width={pageWidth} />
        </Document>
      </div>
    </div>
  )
}

const MarkdownPdfPreview = ({
  documentPath,
  href,
  resolvePdfSrc,
  title,
}: MarkdownPdfPreviewProps) => {
  const sourceKey = `${documentPath ?? ''}\u0000${href}`
  const [resolvedSource, setResolvedSource] = useState<{
    failed: boolean
    fileUrl: string | null
    key: string
  }>({
    failed: false,
    fileUrl: null,
    key: '',
  })
  const [expanded, setExpanded] = useState(false)
  const fileUrl = resolvedSource.key === sourceKey ? resolvedSource.fileUrl : null
  const failed = resolvedSource.key === sourceKey ? resolvedSource.failed : false

  useEffect(() => {
    let cancelled = false

    void resolvePdfSrc(documentPath, href)
      .then((src) => {
        if (!cancelled) {
          setResolvedSource({ failed: false, fileUrl: src, key: sourceKey })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSource({ failed: true, fileUrl: null, key: sourceKey })
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentPath, href, resolvePdfSrc, sourceKey])

  return (
    <div className="marklab-pdf-preview" contentEditable={false}>
      <div className="marklab-pdf-preview__header">
        <div className="marklab-pdf-preview__meta">
          <span className="marklab-pdf-preview__badge">PDF</span>
          <span className="marklab-pdf-preview__title">{title}</span>
        </div>
        <Button
          className="marklab-pdf-preview__expand"
          size="sm"
          variant="secondary"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          放大查看
        </Button>
      </div>

      <div className="marklab-pdf-preview__body">
        {fileUrl ? (
          <PdfViewerSurface fileUrl={fileUrl} mode="inline" />
        ) : (
          <div className="marklab-pdf-preview__status">
            {failed ? 'PDF 预览不可用' : '正在加载 PDF 预览...'}
          </div>
        )}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="truncate text-sm">{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {fileUrl ? (
              <PdfViewerSurface fileUrl={fileUrl} mode="modal" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {failed ? 'PDF 预览不可用' : '正在加载 PDF 预览...'}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MarkdownPdfPreview
