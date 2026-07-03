import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchPdfObjectUrl } from '@/components/milkdown/pdfObjectUrlSource'
import { useI18n } from '@/i18n/useI18n'

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

type PdfObjectUrlState = {
  failed: boolean
  key: string
  objectUrl: string | null
}

const isAbortError = (error: unknown) => {
  return error instanceof Error && error.name === 'AbortError'
}

const usePdfObjectUrl = (fileUrl: string) => {
  const [state, setState] = useState<PdfObjectUrlState>({
    failed: false,
    key: '',
    objectUrl: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    void fetchPdfObjectUrl(fileUrl, controller.signal)
      .then((objectUrl) => {
        setState({ failed: false, key: fileUrl, objectUrl })
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setState({ failed: true, key: fileUrl, objectUrl: null })
      })

    return () => {
      controller.abort()
    }
  }, [fileUrl])

  useEffect(() => {
    const objectUrl = state.objectUrl
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [state.objectUrl])

  const current = state.key === fileUrl ? state : { failed: false, key: fileUrl, objectUrl: null }
  return {
    failed: current.failed,
    loading: !current.failed && !current.objectUrl,
    objectUrl: current.objectUrl,
  }
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

export const PdfPreviewSurface = ({ fileUrl, mode }: PdfViewerSurfaceProps) => {
  const { t } = useI18n()
  const { failed, loading, objectUrl } = usePdfObjectUrl(fileUrl)
  const [pageState, setPageState] = useState({ key: '', numPages: 0, pageNumber: 1 })
  const [documentRef, documentWidth] = useMeasuredWidth(mode === 'modal' ? 920 : 680)
  const pageWidth = Math.max(240, Math.min(documentWidth - 24, mode === 'modal' ? 960 : 720))
  const currentPageState =
    pageState.key === objectUrl ? pageState : { key: objectUrl ?? '', numPages: 0, pageNumber: 1 }
  const { numPages, pageNumber } = currentPageState
  const pages = Array.from({ length: numPages }, (_, index) => index + 1)
  const handleLoadSuccess = useCallback(
    ({ numPages: nextNumPages }: { numPages: number }) => {
      const key = objectUrl ?? ''
      setPageState((current) => {
        const currentPageNumber = current.key === key ? current.pageNumber : 1
        return {
          key,
          numPages: nextNumPages,
          pageNumber: Math.min(Math.max(1, currentPageNumber), nextNumPages),
        }
      })
    },
    [objectUrl],
  )
  const selectPage = useCallback(
    (page: number) => {
      const key = objectUrl ?? ''
      setPageState((current) => (current.key === key ? { ...current, pageNumber: page } : current))
    },
    [objectUrl],
  )

  if (loading || failed || !objectUrl) {
    return (
      <div className={`marklab-pdf-viewer marklab-pdf-viewer--${mode}`}>
        <div className="marklab-pdf-viewer__document" ref={documentRef}>
          <div className="marklab-pdf-preview__status">
            {failed ? t('preview.pdfFailed') : t('preview.pdfReading')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`marklab-pdf-viewer marklab-pdf-viewer--${mode}`}>
      <nav className="marklab-pdf-viewer__thumbs" aria-label={t('preview.pdfPages')}>
        {pages.map((page) => (
          <button
            key={page}
            className="marklab-pdf-viewer__thumb"
            data-active={page === pageNumber}
            onClick={() => selectPage(page)}
            type="button"
          >
            <Document file={objectUrl} loading={null} error={null}>
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
      </nav>
      <div className="marklab-pdf-viewer__document" ref={documentRef}>
        <Document
          file={objectUrl}
          loading={<div className="marklab-pdf-preview__status">{t('preview.pdfReading')}</div>}
          error={<div className="marklab-pdf-preview__status">{t('preview.pdfFailed')}</div>}
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
          <Maximize2 data-icon="inline-start" />
          {t('preview.pdfExpand')}
        </Button>
      </div>

      <div className="marklab-pdf-preview__body">
        {fileUrl ? (
          <PdfPreviewSurface fileUrl={fileUrl} mode="inline" />
        ) : (
          <div className="marklab-pdf-preview__status">
            {failed ? t('preview.pdfFailed') : t('preview.pdfLoading')}
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
              <PdfPreviewSurface fileUrl={fileUrl} mode="modal" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {failed ? t('preview.pdfFailed') : t('preview.pdfLoading')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MarkdownPdfPreview
