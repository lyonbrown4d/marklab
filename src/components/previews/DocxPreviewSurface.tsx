import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'

type DocxPreviewSurfaceProps = {
  src: string
  title: string
}

type RenderState = {
  key: string
  status: 'ready' | 'error'
  message?: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const DocxPreviewSurface = ({ src, title }: DocxPreviewSurfaceProps) => {
  const { t } = useI18n()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const styleRef = useRef<HTMLDivElement | null>(null)
  const [renderState, setRenderState] = useState<RenderState>({
    key: '',
    status: 'ready',
  })
  const status = renderState.key === src ? renderState.status : 'ready'
  const loading = renderState.key !== src
  const failed = !loading && status === 'error'

  useEffect(() => {
    const body = bodyRef.current
    const style = styleRef.current
    if (!body || !style) return

    let cancelled = false
    body.replaceChildren()
    style.replaceChildren()

    void (async () => {
      const [{ renderAsync }, blob] = await Promise.all([
        import('docx-preview'),
        fetchPreviewAssetBlob(
          src,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ])

      const data = await blob.arrayBuffer()
      if (cancelled) return

      await renderAsync(data, body, style, {
        breakPages: true,
        className: 'marklab-docx',
        experimental: false,
        ignoreFonts: false,
        inWrapper: true,
        renderComments: false,
        useBase64URL: false,
      })

      if (!cancelled) {
        setRenderState({ key: src, status: 'ready' })
      }
    })().catch((error) => {
      if (!cancelled) {
        setRenderState({ key: src, status: 'error', message: errorMessage(error) })
      }
    })

    return () => {
      cancelled = true
      body.replaceChildren()
      style.replaceChildren()
    }
  }, [src])

  return (
    <div className="relative min-h-full rounded-xl border border-border bg-muted/40 p-3">
      <div ref={styleRef} />
      <div
        ref={bodyRef}
        aria-label={t('preview.docxLabel', { name: title })}
        className="marklab-docx-preview min-h-[320px] overflow-auto"
      />
      {loading ? (
        <div className="absolute inset-0 rounded-xl bg-background/80 backdrop-blur-sm">
          <PreviewLoadingFallback label={t('preview.docxLoading')} />
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/90 p-6 text-center text-sm text-muted-foreground">
          <div>
            <div>{t('preview.docxFailed')}</div>
            {renderState.message ? (
              <div className="mt-2 max-w-md break-words text-xs">{renderState.message}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default DocxPreviewSurface
