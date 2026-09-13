import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import AppAlert from '@/components/AppAlert'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePdfDocumentData } from '@/components/milkdown/usePdfDocumentData'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'

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

const PdfPreviewStatus = ({ failed, label }: { failed: boolean; label: string }) => (
  <div className="marklab-pdf-preview__status p-4">
    {failed ? (
      <AppAlert tone="destructive" title={label} className="max-w-md" />
    ) : (
      <PreviewLoadingFallback label={label} />
    )}
  </div>
)

const useMeasuredWidth = (fallback: number, ready: boolean) => {
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
  }, [ready])

  return [elementRef, width] as const
}

export const PdfPreviewSurface = ({ fileUrl, mode }: PdfViewerSurfaceProps) => {
  const { t } = useI18n()
  const { error, loading, file } = usePdfDocumentData(fileUrl)
  const failed = error !== null
  const [pageState, setPageState] = useState({ key: '', numPages: 0, pageNumber: 1 })
  const [documentRef, documentWidth] = useMeasuredWidth(mode === 'modal' ? 920 : 680, Boolean(file))
  const pageWidth = Math.max(240, Math.min(documentWidth - 24, mode === 'modal' ? 960 : 720))
  const currentPageState =
    pageState.key === fileUrl ? pageState : { key: fileUrl, numPages: 0, pageNumber: 1 }
  const { numPages, pageNumber } = currentPageState
  const pages = Array.from({ length: numPages }, (_, index) => index + 1)
  const handleLoadSuccess = useCallback(
    ({ numPages: nextNumPages }: { numPages: number }) => {
      const key = fileUrl
      setPageState((current) => {
        const currentPageNumber = current.key === key ? current.pageNumber : 1
        return {
          key,
          numPages: nextNumPages,
          pageNumber: Math.min(Math.max(1, currentPageNumber), nextNumPages),
        }
      })
    },
    [fileUrl],
  )
  const selectPage = useCallback(
    (page: number) => {
      const key = fileUrl
      setPageState((current) => (current.key === key ? { ...current, pageNumber: page } : current))
    },
    [fileUrl],
  )

  if (loading || failed || !file) {
    return (
      <div className={`marklab-pdf-viewer marklab-pdf-viewer--${mode}`}>
        <div className="marklab-pdf-viewer__document" ref={documentRef}>
          <PdfPreviewStatus
            failed={failed}
            label={failed ? t('preview.pdfFailed') : t('preview.pdfReading')}
          />
        </div>
      </div>
    )
  }

  return (
    <Document
      className={`marklab-pdf-viewer marklab-pdf-viewer--${mode}`}
      file={file}
      suspense={false}
      loading={<PdfPreviewStatus failed={false} label={t('preview.pdfReading')} />}
      error={<PdfPreviewStatus failed label={t('preview.pdfFailed')} />}
      onLoadSuccess={handleLoadSuccess}
    >
      <nav className="marklab-pdf-viewer__thumbs" aria-label={t('preview.pdfPages')}>
        {pages.map((page) => (
          <button
            key={page}
            className="marklab-pdf-viewer__thumb"
            data-active={page === pageNumber}
            onClick={() => selectPage(page)}
            type="button"
          >
            <Page
              pageNumber={page}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              width={92}
            />
            <span>{page}</span>
          </button>
        ))}
      </nav>
      <div className="marklab-pdf-viewer__document" ref={documentRef}>
        <Page pageNumber={pageNumber} width={pageWidth} />
      </div>
    </Document>
  )
}

const MarkdownPdfPreview = ({
  documentPath,
  href,
  resolvePdfSrc,
  title,
}: MarkdownPdfPreviewProps) => {
  const { t } = useI18n()
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
  const expandedContentReady = useDeferredOpenContent(expanded)
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
          <Badge variant="secondary" className="shrink-0 rounded px-2 py-0.5 text-[10px]">
            PDF
          </Badge>
          <span className="marklab-pdf-preview__title">{title}</span>
        </div>
        <Button
          className="marklab-pdf-preview__expand"
          size="sm"
          variant="secondary"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 data-icon="inline-start" />
          {t('preview.pdfExpand')}
        </Button>
      </div>

      <div className="marklab-pdf-preview__body">
        {fileUrl ? (
          <PdfPreviewSurface fileUrl={fileUrl} mode="inline" />
        ) : (
          <PdfPreviewStatus
            failed={failed}
            label={failed ? t('preview.pdfFailed') : t('preview.pdfLoading')}
          />
        )}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="truncate text-sm">{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {fileUrl && expandedContentReady ? (
              <PdfPreviewSurface fileUrl={fileUrl} mode="modal" />
            ) : (
              <div className="relative h-full">
                <PdfPreviewStatus
                  failed={failed}
                  label={failed ? t('preview.pdfFailed') : t('preview.pdfLoading')}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MarkdownPdfPreview
