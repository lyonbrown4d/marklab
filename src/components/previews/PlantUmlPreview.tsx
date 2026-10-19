import { memo, useRef, useState } from 'react'
import { Maximize2, Pencil } from 'lucide-react'
import { DiagramPreviewDialog } from '@/components/previews/DiagramPreviewDialog'
import { usePlantUmlPreview } from '@/components/previews/usePlantUmlPreview'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { toWebviewAssetUrl } from '@/runtime/assetUrl'

type PlantUmlPreviewProps = {
  source: string
  onActivateEdit?: () => void
}

const PlantUmlPreview = memo(({ source, onActivateEdit }: PlantUmlPreviewProps) => {
  const { t } = useI18n()
  const target = useRef<HTMLElement | null>(null)
  const expandButton = useRef<HTMLButtonElement | null>(null)
  const [expanded, setExpanded] = useState<{ source: string; url: string } | null>(null)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const query = usePlantUmlPreview(source, target)
  const data = query.waiting ? undefined : query.data
  const [selectedPage, setSelectedPage] = useState({ source, index: 0 })
  const pageIndex = selectedPage.source === source ? selectedPage.index : 0
  const page = data?.pages[Math.min(pageIndex, data.pages.length - 1)]
  const labels = {
    resetZoom: t('preview.mermaidResetZoom'),
    title: t('preview.plantumlTitle'),
    zoomIn: t('preview.mermaidZoomIn'),
    zoomLevel: t('preview.mermaidZoomLevel'),
    zoomOut: t('preview.mermaidZoomOut'),
  }
  const expand = async () => {
    if (!page) return
    // Long-lived editor tabs may outlive the native resource permission.
    const fresh =
      page.expires_at_ms > Date.now() ? page : (await query.refetch()).data?.pages[pageIndex]
    if (fresh && fresh.expires_at_ms > Date.now()) setExpanded({ source, url: fresh.url })
  }
  return (
    <aside
      ref={target}
      aria-label="PlantUML"
      aria-busy={Boolean(source.trim()) && (query.isFetching || query.waiting)}
      className="my-3 overflow-hidden rounded-lg border border-border bg-background text-sm"
      contentEditable={false}
      data-plate-preview="plantuml"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-end gap-1 border-b border-border px-2 py-1">
        <span className="mr-auto text-xs text-muted-foreground">PlantUML</span>
        {data && data.pages.length > 1 ? (
          <select
            aria-label={t('preview.plantumlPage')}
            className="rounded border border-input bg-background px-2 py-1 text-xs"
            onChange={(event) => setSelectedPage({ source, index: Number(event.target.value) })}
            value={pageIndex}
          >
            {data.pages.map((_, index) => (
              <option key={index} value={index}>
                {index + 1} / {data.pages.length}
              </option>
            ))}
          </select>
        ) : null}
        {onActivateEdit ? (
          <Button onClick={onActivateEdit} size="sm" variant="ghost" type="button">
            <Pencil aria-hidden="true" />
            {t('preview.plantumlEditSource')}
          </Button>
        ) : null}
        {page ? (
          <Button
            ref={expandButton}
            disabled={query.isFetching}
            onClick={() => void expand()}
            size="sm"
            variant="ghost"
            type="button"
          >
            <Maximize2 aria-hidden="true" />
            {t('preview.mermaidExpand')}
          </Button>
        ) : null}
      </div>
      {!source.trim() ? (
        <p className="p-4 text-muted-foreground">{t('preview.plantumlEmpty')}</p>
      ) : null}
      {source.trim() && (query.isPending || query.waiting) ? (
        <p className="p-4 text-muted-foreground" role="status">
          {t('preview.mermaidLoading')}
        </p>
      ) : null}
      {query.isError && !query.waiting ? (
        <div className="p-4">
          <pre className="whitespace-pre-wrap break-words text-destructive" role="alert">
            {query.error.message}
          </pre>
          <Button onClick={() => void query.refetch()} size="sm" variant="ghost" type="button">
            {t('preview.plantumlRetry')}
          </Button>
        </div>
      ) : null}
      {page ? (
        <div className="overflow-auto bg-white p-4">
          <img
            alt={t('preview.plantumlTitle')}
            className="mx-auto max-h-[32rem] max-w-full object-contain"
            draggable={false}
            onError={() => setFailedImage(page.url)}
            src={toWebviewAssetUrl(page.url)}
          />
        </div>
      ) : null}
      {page && failedImage === page.url ? (
        <div className="p-4">
          <p className="text-destructive" role="alert">
            {t('preview.plantumlImageFailed')}
          </p>
          <Button onClick={() => void query.refetch()} size="sm" variant="ghost" type="button">
            {t('preview.plantumlRetry')}
          </Button>
        </div>
      ) : null}
      {data?.warnings.length ? (
        <details className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t('preview.plantumlWarnings')}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{data.warnings.join('\n')}</pre>
        </details>
      ) : null}
      {expanded?.source === source && page && expanded.url === page.url ? (
        <DiagramPreviewDialog
          labels={labels}
          onOpenChange={(open) => {
            if (!open) setExpanded(null)
          }}
          open
          returnFocusRef={expandButton}
          visual={{ alt: t('preview.plantumlTitle'), kind: 'image', src: page.url }}
        />
      ) : null}
    </aside>
  )
})

PlantUmlPreview.displayName = 'PlantUmlPreview'
export default PlantUmlPreview
