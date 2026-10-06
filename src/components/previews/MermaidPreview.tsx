import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { Maximize2 } from 'lucide-react'
import { createSafeMermaidSvgNode } from '@/components/plate/code/mermaidSvg'
import { useMermaidPreview } from '@/components/plate/code/useMermaidPreview'
import { DiagramPreviewDialog } from '@/components/previews/DiagramPreviewDialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type MermaidPreviewProps = {
  source: string
}

const MermaidPreview = memo(({ source }: MermaidPreviewProps) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLElement | null>(null)
  const expandButtonRef = useRef<HTMLButtonElement | null>(null)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const previousSourceRef = useRef(source)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const expanded = expandedSource === source
  const state = useMermaidPreview(source, containerRef)
  const safeSvg = useMemo(
    () => (state.status === 'ready' ? createSafeMermaidSvgNode(state.svg) : null),
    [state],
  )

  useEffect(() => {
    if (previousSourceRef.current === source) return
    previousSourceRef.current = source
    setExpandedSource(null)
  }, [source])

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.replaceChildren()
    if (safeSvg) output.append(document.importNode(safeSvg, true))
  }, [safeSvg])

  const stopButtonPointerEvent = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }
  const stopButtonMouseEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }
  const handleExpand = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setExpandedSource(source)
  }
  const handleExpandedOpenChange = (open: boolean) => setExpandedSource(open ? source : null)

  return (
    <aside
      ref={containerRef}
      aria-label={t('slash.mermaid')}
      aria-busy={state.status === 'loading'}
      className="mt-3 overflow-hidden rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground"
      contentEditable={false}
      data-plate-preview="mermaid"
    >
      {state.status === 'loading' ? <div>{t('preview.mermaidLoading')}</div> : null}
      {state.status === 'error' ? (
        <pre role="alert" className="whitespace-pre-wrap text-destructive">
          {state.error}
        </pre>
      ) : null}
      {state.status === 'ready' && !safeSvg ? (
        <div role="alert" className="text-destructive">
          {t('preview.mermaidInvalidSvg')}
        </div>
      ) : null}
      {state.status === 'ready' && safeSvg ? (
        <div className="flex justify-end pb-2">
          <Button
            ref={expandButtonRef}
            onClick={handleExpand}
            onMouseDown={stopButtonMouseEvent}
            onPointerDown={stopButtonPointerEvent}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Maximize2 data-icon="inline-start" />
            {t('preview.mermaidExpand')}
          </Button>
        </div>
      ) : null}
      <div
        ref={outputRef}
        className="overflow-auto [&_svg]:mx-auto [&_svg]:max-w-full"
        data-plate-mermaid-output
      />
      {safeSvg ? (
        <DiagramPreviewDialog
          labels={{
            resetZoom: t('preview.mermaidResetZoom'),
            title: t('preview.mermaidDialogTitle'),
            zoomIn: t('preview.mermaidZoomIn'),
            zoomLevel: t('preview.mermaidZoomLevel'),
            zoomOut: t('preview.mermaidZoomOut'),
          }}
          onOpenChange={handleExpandedOpenChange}
          open={expanded}
          returnFocusRef={expandButtonRef}
          visual={{ kind: 'svg', node: safeSvg }}
        />
      ) : null}
    </aside>
  )
})

MermaidPreview.displayName = 'MermaidPreview'

export default MermaidPreview
